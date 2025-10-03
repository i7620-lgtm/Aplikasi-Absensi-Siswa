export default async function handleGetDashboardData({ payload, user, sql, response }) {
    if (!['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { schoolId, selectedDate, chartViewMode, chartClassFilter } = payload;
    if (!schoolId) {
        return response.status(400).json({ error: 'School ID is required' });
    }
    
    // --- QUERY 1: Get total students and all class names for the school ---
    const { rows: schoolInfoRows } = await sql`
        WITH merged_students AS (
            SELECT jsonb_object_agg(key, value) as all_classes
            FROM (
                SELECT key, value FROM absensi_data, jsonb_each(students_by_class)
                WHERE school_id = ${schoolId}
            ) as t
        )
        SELECT 
            (SELECT COALESCE(SUM(jsonb_array_length(class_data -> 'students')), 0)
             FROM merged_students, jsonb_each(all_classes) as class_each(class_name, class_data)) as "totalStudents",
            (SELECT COALESCE(jsonb_agg(class_name ORDER BY class_name), '[]'::jsonb) 
             FROM (SELECT DISTINCT jsonb_object_keys(all_classes) as class_name FROM merged_students) as c) as "allClasses";
    `;
    const totalStudents = schoolInfoRows[0]?.totalStudents || 0;
    const allClasses = schoolInfoRows[0]?.allClasses || [];

    // --- QUERY 2: Get absent students for the selected date for the daily report ---
    const { rows: dailyAbsentRows } = await sql`
        WITH unnested_logs AS (
          SELECT 
            log_obj,
            u.name as user_name
          FROM absensi_data ad
          CROSS JOIN jsonb_array_elements(ad.saved_logs) as log_obj
          JOIN users u on u.email = ad.user_email
          WHERE ad.school_id = ${schoolId}
        ),
        logs_for_date AS (
          SELECT 
            log_obj ->> 'class' as class,
            log_obj -> 'attendance' as attendance,
            user_name
          FROM unnested_logs
          WHERE log_obj ->> 'date' = ${selectedDate}
        ),
        absent_students AS (
          SELECT
            lfd.class,
            lfd.user_name,
            att.key as student_name,
            att.value as status
          FROM logs_for_date lfd
          CROSS JOIN jsonb_each_text(lfd.attendance) as att
          WHERE att.value <> 'H'
        )
        SELECT
          class,
          user_name as "teacherName",
          jsonb_agg(jsonb_build_object('name', student_name, 'status', status) ORDER BY student_name) as students
        FROM absent_students
        GROUP BY class, user_name
        ORDER BY class;
    `;

    // --- Process daily report data ---
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


    // --- QUERY 3: Calculate percentage data based on time/class filters ---
    const today = new Date(selectedDate + 'T00:00:00');
    let startDate, endDate;
    
    switch (chartViewMode) {
        case 'daily':
            startDate = endDate = selectedDate;
            break;
        case 'weekly': {
            const d = new Date(today);
            d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
            startDate = d.toISOString().split('T')[0];
            d.setDate(d.getDate() + 6);
            endDate = d.toISOString().split('T')[0];
            break;
        }
        case 'monthly': {
            const d = new Date(today);
            startDate = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
            endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
            break;
        }
        case 'semester1':
            startDate = new Date(today.getFullYear(), 6, 1).toISOString().split('T')[0];
            endDate = new Date(today.getFullYear(), 11, 31).toISOString().split('T')[0];
            break;
        case 'semester2':
            startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
            endDate = new Date(today.getFullYear(), 5, 30).toISOString().split('T')[0];
            break;
        case 'yearly':
            startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
            endDate = new Date(today.getFullYear(), 11, 31).toISOString().split('T')[0];
            break;
    }

    const { rows: periodAbsenceRows } = await sql`
        WITH RelevantLogs AS (
            SELECT log_obj
            FROM absensi_data, jsonb_array_elements(saved_logs) as log_obj
            WHERE school_id = ${schoolId}
            AND (log_obj->>'date')::date BETWEEN ${startDate} AND ${endDate}
            AND (${chartClassFilter} = 'all' OR log_obj->>'class' = ${chartClassFilter})
        ),
        Absences AS (
            SELECT (jsonb_each_text(log_obj->'attendance')).value as status
            FROM RelevantLogs
        )
        SELECT
            status,
            COUNT(*) as count
        FROM Absences
        WHERE status <> 'H'
        GROUP BY status;
    `;

    const { rows: periodDaysAndStudents } = await sql`
         WITH RelevantLogs AS (
            SELECT DISTINCT log_obj->>'date' as date
            FROM absensi_data, jsonb_array_elements(saved_logs) as log_obj
            WHERE school_id = ${schoolId}
            AND (log_obj->>'date')::date BETWEEN ${startDate} AND ${endDate}
            AND (${chartClassFilter} = 'all' OR log_obj->>'class' = ${chartClassFilter})
        ),
        StudentsInScope AS (
             SELECT COALESCE(SUM(jsonb_array_length(class_data -> 'students')), 0) as count
             FROM (SELECT jsonb_object_agg(key, value) as all_classes FROM (
                SELECT key, value FROM absensi_data, jsonb_each(students_by_class)
                WHERE school_id = ${schoolId}
             ) as t) as merged_students,
             jsonb_each(all_classes) as class_each(class_name, class_data)
             WHERE ${chartClassFilter} = 'all' OR class_name = ${chartClassFilter}
        )
        SELECT (SELECT COUNT(*) FROM RelevantLogs) as "numSchoolDays",
               (SELECT count FROM StudentsInScope) as "numStudents";
    `;

    const periodAbsenceCounts = { S: 0, I: 0, A: 0 };
    periodAbsenceRows.forEach(row => {
        if (periodAbsenceCounts[row.status] !== undefined) {
            periodAbsenceCounts[row.status] = parseInt(row.count, 10);
        }
    });
    
    const numSchoolDays = parseInt(periodDaysAndStudents[0]?.numSchoolDays || 0, 10);
    const numStudentsInScope = parseInt(periodDaysAndStudents[0]?.numStudents || 0, 10);
    const totalAttendanceOpportunities = numSchoolDays * numStudentsInScope;
    const periodTotalAbsent = periodAbsenceCounts.S + periodAbsenceCounts.I + periodAbsenceCounts.A;
    const periodTotalPresent = Math.max(0, totalAttendanceOpportunities - periodTotalAbsent);


    return response.status(200).json({
        reportData: {
            summaryStats: { totalStudents, totalPresent, ...absenceCounts },
            absentStudentsByClass
        },
        percentageData: {
            finalCounts: { H: periodTotalPresent, ...periodAbsenceCounts },
            totalAttendanceOpportunities,
            allClasses
        }
    });
}
