
export default async function handleGetDashboardData({ payload, user, sql, response }) {
    const authorizedRoles = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'];
    if (!authorizedRoles.includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { schoolId, jurisdictionId, selectedDate } = payload;
    let schoolIdList = [];
    
    // Determine the list of school IDs to query based on user role and context
    if (user.role === 'SUPER_ADMIN' && jurisdictionId) {
        const { rows } = await sql`
            WITH RECURSIVE subs AS (
                SELECT id FROM jurisdictions WHERE id = ${jurisdictionId}
                UNION ALL
                SELECT j.id FROM jurisdictions j JOIN subs s ON j.parent_id = s.id
            ) SELECT s.id FROM schools s WHERE s.jurisdiction_id IN (SELECT id FROM subs);
        `;
        schoolIdList = rows.map(r => r.id);
    } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(user.role)) {
        const effectiveJurisdictionId = jurisdictionId || user.jurisdiction_id;
        if (!effectiveJurisdictionId) return response.status(200).json({ allLogs: [] });
        
        const { rows } = await sql`
            WITH RECURSIVE subs AS (
                SELECT id FROM jurisdictions WHERE id = ${effectiveJurisdictionId}
                UNION ALL
                SELECT j.id FROM jurisdictions j JOIN subs s ON j.parent_id = s.id
            ) SELECT s.id FROM schools s WHERE s.jurisdiction_id IN (SELECT id FROM subs);
        `;
        schoolIdList = rows.map(r => r.id);
    } else {
        const effectiveSchoolId = schoolId || user.school_id;
        if (effectiveSchoolId) {
            schoolIdList.push(effectiveSchoolId);
        }
    }

    if (schoolIdList.length === 0) {
        // Return empty but valid structure if no schools are in scope
        return response.status(200).json({
            reportData: { summaryStats: { totalStudents: 0, totalPresent: 0, S: 0, I: 0, A: 0 }, absentStudentsByClass: {} },
            schoolInfo: { totalStudents: 0, allClasses: [], studentsPerClass: {} },
            allLogsForYear: [],
        });
    }
    
    const schoolIds = schoolIdList.map(id => Number(id));

    // --- QUERY 1: Gabungkan info sekolah dan absensi harian menjadi satu ---
    const { rows } = await sql`
        WITH SchoolInfo AS (
             SELECT
                COALESCE(SUM(student_count), 0)::int as "totalStudents",
                COALESCE(jsonb_agg(DISTINCT class_name ORDER BY class_name), '[]'::jsonb) as "allClasses",
                COALESCE(jsonb_object_agg(class_name, student_count), '{}'::jsonb) as "studentsPerClass"
            FROM (
                 SELECT
                    d.key as class_name,
                    jsonb_array_length(d.value -> 'students') as student_count
                FROM absensi_data ad, jsonb_each(ad.students_by_class) d
                WHERE ad.school_id = ANY(${schoolIds})
                GROUP BY d.key, d.value
            ) as unique_classes
        ),
        DailyAbsences AS (
            SELECT
                log_obj ->> 'class' as class,
                u.name as "teacherName",
                att.key as student_name,
                att.value as status
            FROM absensi_data ad
            CROSS JOIN jsonb_array_elements(ad.saved_logs) as log_obj
            JOIN users u on u.email = ad.user_email
            WHERE ad.school_id = ANY(${schoolIds}) AND log_obj ->> 'date' = ${selectedDate}
            CROSS JOIN jsonb_each_text(log_obj -> 'attendance') as att
            WHERE att.value <> 'H'
        )
        SELECT
            (SELECT to_jsonb(s) FROM SchoolInfo s) as "schoolInfo",
            COALESCE(
                (SELECT jsonb_agg(t) FROM (
                    SELECT
                        class,
                        "teacherName",
                        jsonb_agg(jsonb_build_object('name', student_name, 'status', status) ORDER BY student_name) as students
                    FROM DailyAbsences
                    GROUP BY class, "teacherName"
                    ORDER BY class
                ) t),
                '[]'::jsonb'
            ) as "dailyAbsentRows";
    `;

    const { schoolInfo, dailyAbsentRows } = rows[0] || { schoolInfo: {}, dailyAbsentRows: [] };
    const { totalStudents = 0, allClasses = [], studentsPerClass = {} } = schoolInfo;

    // --- Proses data laporan harian ---
    const absenceCounts = { S: 0, I: 0, A: 0 };
    const absentStudentsByClass = {};
    dailyAbsentRows.forEach(row => {
        absentStudentsByClass[row.class] = { students: row.students, teacherName: row.teacherName };
        row.students.forEach(student => {
            if (absenceCounts[student.status] !== undefined) {
                absenceCounts[student.status]++;
            }
        });
    });
    const totalAbsent = absenceCounts.S + absenceCounts.I + absenceCounts.A;
    const totalPresent = Math.max(0, totalStudents - totalAbsent);
    
    // Ambil semua log untuk tahun ajaran saat ini untuk perhitungan persentase
    const todayForYear = new Date(selectedDate + 'T00:00:00');
    let yearStart = new Date(todayForYear.getFullYear(), 6, 1); // 1 Juli
    if (todayForYear.getMonth() < 6) { yearStart.setFullYear(todayForYear.getFullYear() - 1); }
    const yearEnd = new Date(yearStart.getFullYear() + 1, 5, 30); // 30 Juni tahun berikutnya

    const { rows: allLogsRows } = await sql`
        SELECT log_obj as log
        FROM absensi_data, jsonb_array_elements(saved_logs) as log_obj
        WHERE school_id = ANY(${schoolIds}) AND (log_obj->>'date')::date BETWEEN ${yearStart.toISOString().split('T')[0]} AND ${yearEnd.toISOString().split('T')[0]};
    `;
    const allLogsForYear = allLogsRows.map(r => r.log);


    return response.status(200).json({
        reportData: {
            summaryStats: { totalStudents, totalPresent, ...absenceCounts },
            absentStudentsByClass
        },
        schoolInfo: { totalStudents, allClasses, studentsPerClass },
        allLogsForYear, // Kirim semua log mentah ke klien
    });
}
      
