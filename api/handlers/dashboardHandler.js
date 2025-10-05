import { sql } from '@vercel/postgres';

export default async function handleGetDashboardData({ payload, user, sql, response }) {
    const authorizedRoles = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'];
    if (!authorizedRoles.includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { schoolId, jurisdictionId, selectedDate } = payload;
    let schoolIdList = [];
    
    // --- NEW LOGIC: Handle unassigned school-level admins ---
    if (['KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(user.role) && !user.school_id) {
         return response.status(200).json({
            isUnassigned: true, // Flag for the frontend
            reportData: { summaryStats: { totalStudents: 0, totalPresent: 0, S: 0, I: 0, A: 0 }, absentStudentsByClass: {} },
            schoolInfo: { totalStudents: 0, allClasses: [], studentsPerClass: {} },
            allLogsForYear: [],
        });
    }
    // --- END NEW LOGIC ---

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
        if (!effectiveJurisdictionId) {
            return response.status(200).json({
                isUnassigned: true, // Flag for the frontend
                reportData: { summaryStats: { totalStudents: 0, totalPresent: 0, S: 0, I: 0, A: 0 }, absentStudentsByClass: {} },
                schoolInfo: { totalStudents: 0, allClasses: [], studentsPerClass: {} },
                allLogsForYear: [],
            });
        }
        
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

    const { rows } = await sql`
        WITH LatestStudentLists AS (
            SELECT DISTINCT ON (school_id, payload->>'class')
                school_id,
                payload->>'class' as class_name,
                jsonb_array_length(payload->'students') as student_count
            FROM change_log
            WHERE school_id = ANY(${schoolIds}) AND event_type = 'STUDENT_LIST_UPDATED'
            ORDER BY school_id, payload->>'class', id DESC
        ),
        SchoolInfo AS (
            SELECT
                COALESCE(SUM(student_count), 0)::int as "totalStudents",
                COALESCE(jsonb_agg(DISTINCT class_name ORDER BY class_name), '[]'::jsonb) as "allClasses",
                COALESCE(jsonb_object_agg(class_name, student_count), '{}'::jsonb) as "studentsPerClass"
            FROM LatestStudentLists
        ),
        DailyAttendanceEvents AS (
            SELECT
                cl.payload,
                u.name as "teacherName"
            FROM change_log cl
            JOIN users u ON cl.user_email = u.email
            WHERE cl.school_id = ANY(${schoolIds})
            AND cl.event_type = 'ATTENDANCE_UPDATED'
            AND cl.payload->>'date' = ${selectedDate}
        ),
        DailyAbsences AS (
            SELECT
                payload->>'class' as class,
                "teacherName",
                att.key as student_name,
                att.value as status
            FROM DailyAttendanceEvents
            CROSS JOIN jsonb_each_text(payload->'attendance') as att
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

    const { schoolInfo, dailyAbsentRows } = rows[0] || { schoolInfo: { totalStudents: 0, allClasses: [], studentsPerClass: {} }, dailyAbsentRows: [] };
    const { totalStudents = 0, allClasses = [], studentsPerClass = {} } = schoolInfo;

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
    
    const todayForYear = new Date(selectedDate + 'T00:00:00');
    let yearStart = new Date(todayForYear.getFullYear(), 6, 1); // 1 Juli
    if (todayForYear.getMonth() < 6) { yearStart.setFullYear(todayForYear.getFullYear() - 1); }
    const yearEnd = new Date(yearStart.getFullYear() + 1, 5, 30); // 30 Juni tahun berikutnya

    const { rows: allLogsRows } = await sql`
        SELECT payload as log
        FROM change_log
        WHERE school_id = ANY(${schoolIds})
        AND event_type = 'ATTENDANCE_UPDATED'
        AND (payload->>'date')::date BETWEEN ${yearStart.toISOString().split('T')[0]} AND ${yearEnd.toISOString().split('T')[0]};
    `;
    const allLogsForYear = allLogsRows.map(r => r.log);

    return response.status(200).json({
        reportData: {
            summaryStats: { totalStudents, totalPresent, ...absenceCounts },
            absentStudentsByClass
        },
        schoolInfo: { totalStudents, allClasses, studentsPerClass },
        allLogsForYear,
    });
}
