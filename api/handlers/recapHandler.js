export default async function handleGetRecapData({ payload, user, sql, response }) {
    if (!['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'GURU'].includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { schoolId, classFilter } = payload;
    let effectiveSchoolId = schoolId;
    if (user.role !== 'SUPER_ADMIN') {
        effectiveSchoolId = user.school_id;
    }

    if (user.role === 'GURU') {
        const { rows } = await sql`SELECT students_by_class, saved_logs FROM absensi_data WHERE user_email = ${user.email}`;
        const studentsByClassToUse = rows[0]?.students_by_class || {};
        const logsToUse = rows[0]?.saved_logs || [];
        
        const recapData = {};
        const studentToClassMap = {};
        const studentOriginalIndex = {};

        for (const className in studentsByClassToUse) {
            if (classFilter && className !== classFilter) continue;
            if (studentsByClassToUse[className]?.students) {
                studentsByClassToUse[className].students.forEach((studentName, index) => {
                    recapData[studentName] = { S: 0, I: 0, A: 0 };
                    studentToClassMap[studentName] = className;
                    studentOriginalIndex[studentName] = index;
                });
            }
        }

        logsToUse.forEach(log => {
            if (classFilter && log.class !== classFilter) return;
            Object.entries(log.attendance).forEach(([studentName, status]) => {
                if (recapData[studentName] && status !== 'H') {
                    if (recapData[studentName][status] !== undefined) {
                        recapData[studentName][status]++;
                    }
                }
            });
        });
        
        const recapArray = Object.keys(recapData).map(name => {
            const data = recapData[name];
            return {
                name,
                class: studentToClassMap[name] || 'N/A',
                ...data,
                total: data.S + data.I + data.A,
                originalIndex: studentOriginalIndex[name] || 0
            };
        });
        return response.status(200).json({ recapArray });

    } else if (effectiveSchoolId) {
        const { rows: recapArray } = await sql`
            WITH all_students_by_class AS (
                SELECT jsonb_object_agg(key, value) as data
                FROM (
                    SELECT key, value
                    FROM absensi_data, jsonb_each(students_by_class)
                    WHERE school_id = ${effectiveSchoolId}
                ) as t
            ),
            students_flat AS (
                SELECT
                    class_info.key as class,
                    student_name.value as name,
                    row_number() over (partition by class_info.key order by student_name.value) as "originalIndex"
                FROM all_students_by_class,
                     jsonb_each(data) as class_info,
                     jsonb_array_elements_text(class_info.value -> 'students') as student_name
                WHERE ${classFilter} IS NULL OR class_info.key = ${classFilter}
            ),
            unnested_logs AS (
              SELECT
                log_obj -> 'attendance' as attendance
              FROM absensi_data ad
              CROSS JOIN jsonb_array_elements(ad.saved_logs) as log_obj
              WHERE ad.school_id = ${effectiveSchoolId}
              AND (${classFilter} IS NULL OR log_obj ->> 'class' = ${classFilter})
            ),
            absences AS (
              SELECT
                att.key as name,
                att.value as status
              FROM unnested_logs
              CROSS JOIN jsonb_each_text(attendance) as att
              WHERE att.value <> 'H'
            ),
            absence_counts AS (
                SELECT
                    name,
                    COUNT(*) FILTER (WHERE status = 'S') as "S",
                    COUNT(*) FILTER (WHERE status = 'I') as "I",
                    COUNT(*) FILTER (WHERE status = 'A') as "A"
                FROM absences
                GROUP BY name
            )
            SELECT
                s.name,
                s.class,
                s."originalIndex",
                COALESCE(ac."S", 0)::int as "S",
                COALESCE(ac."I", 0)::int as "I",
                COALESCE(ac."A", 0)::int as "A",
                (COALESCE(ac."S", 0) + COALESCE(ac."I", 0) + COALESCE(ac."A", 0))::int as total
            FROM students_flat s
            LEFT JOIN absence_counts ac ON s.name = ac.name;
        `;
        return response.status(200).json({ recapArray });
    }
    
    return response.status(200).json({ recapArray: [] });
}
