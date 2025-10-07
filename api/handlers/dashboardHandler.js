

async function getSubJurisdictionIds(jurisdictionId, sql) {
    if (!jurisdictionId) return [];
    const { rows } = await sql`
        WITH RECURSIVE sub_jurisdictions AS (
            SELECT id FROM jurisdictions WHERE id = ${jurisdictionId}
            UNION ALL
            SELECT j.id FROM jurisdictions j JOIN sub_jurisdictions s ON j.parent_id = s.id
        )
        SELECT id FROM sub_jurisdictions;
    `;
    return rows.map(r => r.id);
}

export default async function handleGetDashboardData({ payload, user, sql, response }) {
    const authorizedRoles = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'];
    if (!authorizedRoles.includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { schoolId, jurisdictionId, selectedDate } = payload;
    let schoolIdList = [];
    let isRegionalView = false;

    if (user.role === 'SUPER_ADMIN') {
        if (jurisdictionId) {
            const accessibleJurisdictionIds = await getSubJurisdictionIds(jurisdictionId, sql);
            if (accessibleJurisdictionIds.length > 0) {
                const { rows: schoolRows } = await sql`SELECT id FROM schools WHERE jurisdiction_id = ANY(${accessibleJurisdictionIds})`;
                schoolIdList = schoolRows.map(r => r.id);
            }
            isRegionalView = true;
        } else if (schoolId) {
            schoolIdList.push(schoolId);
        }
    } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(user.role)) {
        const effectiveJurisdictionId = jurisdictionId || user.jurisdiction_id;
        if (!effectiveJurisdictionId) return response.status(200).json({ isUnassigned: true });
        
        const accessibleJurisdictionIds = await getSubJurisdictionIds(effectiveJurisdictionId, sql);
        if (accessibleJurisdictionIds.length > 0) {
            const { rows: schoolRows } = await sql`SELECT id FROM schools WHERE jurisdiction_id = ANY(${accessibleJurisdictionIds})`;
            schoolIdList = schoolRows.map(r => r.id);
        }
        isRegionalView = true;
    } else {
        if (user.school_id) schoolIdList.push(user.school_id);
        else return response.status(200).json({ isUnassigned: true });
    }

    if (schoolIdList.length === 0 && isRegionalView) {
        return response.status(200).json({
            isRegionalView,
            reportData: { 
                schoolCompletionStatus: []
            },
            schoolInfo: { totalStudents: 0, allSchools: [], studentsPerSchool: {}, allClasses: [], studentsPerClass: {} },
            allLogsForYear: []
        });
    }
    
    const schoolIds = schoolIdList.map(id => Number(id));
    const todayForYear = new Date(selectedDate + 'T00:00:00');
    let yearStart = new Date(todayForYear.getFullYear(), 6, 1);
    if (todayForYear.getMonth() < 6) { yearStart.setFullYear(todayForYear.getFullYear() - 1); }
    const yearEnd = new Date(yearStart.getFullYear() + 1, 5, 30);

    // --- REGIONAL VIEW LOGIC ---
    if (isRegionalView) {
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
            SchoolClassCounts AS (
                SELECT school_id, COUNT(class_name)::int as total_classes FROM LatestStudentLists GROUP BY school_id
            ),
            DailySubmissions AS (
                SELECT school_id, COUNT(DISTINCT payload->>'class')::int as submitted_classes
                FROM change_log
                WHERE school_id = ANY(${schoolIds})
                  AND event_type = 'ATTENDANCE_UPDATED'
                  AND payload->>'date' = ${selectedDate}
                GROUP BY school_id
            ),
            SchoolCompletion AS (
                SELECT 
                    s.id as "schoolId",
                    s.name as "schoolName",
                    COALESCE(scc.total_classes, 0) as "totalClasses",
                    COALESCE(ds.submitted_classes, 0) as "submittedClasses"
                FROM schools s
                LEFT JOIN SchoolClassCounts scc ON s.id = scc.school_id
                LEFT JOIN DailySubmissions ds ON s.id = ds.school_id
                WHERE s.id = ANY(${schoolIds})
            ),
            RegionalStats AS (
                SELECT
                    SUM(total_students_per_school)::int AS "totalStudents",
                    COALESCE(jsonb_object_agg(school_id, total_students_per_school), '{}'::jsonb) AS "studentsPerSchool"
                FROM (
                    SELECT
                        school_id,
                        SUM(jsonb_array_length(payload->'students'))::int AS total_students_per_school
                    FROM (
                        SELECT DISTINCT ON (school_id, payload->>'class') school_id, payload
                        FROM change_log
                        WHERE school_id = ANY(${schoolIds}) AND event_type = 'STUDENT_LIST_UPDATED'
                        ORDER BY school_id, payload->>'class', id DESC
                    ) as latest_lists
                    GROUP BY school_id
                ) as school_counts
            )
            SELECT
                COALESCE((SELECT jsonb_agg(sc ORDER BY "schoolName") FROM SchoolCompletion sc), '[]'::jsonb) as "schoolCompletionStatus",
                (SELECT to_jsonb(rs) FROM RegionalStats rs) as "schoolInfo";
        `;
        
        const result = rows[0] || {};
        const { schoolCompletionStatus = [], schoolInfo = {} } = result;
        const { totalStudents = 0, studentsPerSchool = {} } = schoolInfo || {};

        const { rows: schoolDetails } = await sql`SELECT id, name FROM schools WHERE id = ANY(${schoolIds}) ORDER BY name;`;
        const { rows: allLogsRows } = await sql`SELECT payload as log, school_id FROM change_log WHERE school_id = ANY(${schoolIds}) AND event_type = 'ATTENDANCE_UPDATED' AND (payload->>'date')::date BETWEEN ${yearStart.toISOString().split('T')[0]} AND ${yearEnd.toISOString().split('T')[0]};`;

        return response.status(200).json({
            isRegionalView: true,
            reportData: {
                schoolCompletionStatus
            },
            schoolInfo: { totalStudents, allSchools: schoolDetails, studentsPerSchool },
            allLogsForYear: allLogsRows.map(r => ({ ...r.log, school_id: r.school_id }))
        });
    }

    // --- SINGLE SCHOOL VIEW LOGIC (existing logic, slightly adapted) ---
    if (schoolIds.length === 0) {
        // This case handles non-regional roles that are not yet assigned to a school.
        return response.status(200).json({ isUnassigned: true });
    }

    const { rows } = await sql`
        WITH LatestStudentLists AS (
            SELECT DISTINCT ON (payload->>'class')
                payload->>'class' as class_name,
                jsonb_array_length(payload->'students') as student_count
            FROM change_log
            WHERE school_id = ${schoolIds[0]} AND event_type = 'STUDENT_LIST_UPDATED'
            ORDER BY payload->>'class', id DESC
        ),
        SchoolInfo AS (
            SELECT COALESCE(SUM(student_count), 0)::int as "totalStudents",
                   COALESCE(jsonb_agg(DISTINCT class_name ORDER BY class_name), '[]'::jsonb) as "allClasses",
                   COALESCE(jsonb_object_agg(class_name, student_count), '{}'::jsonb) as "studentsPerClass"
            FROM LatestStudentLists
        ),
        DailyAttendanceEvents AS (
            SELECT cl.payload, u.name as "teacherName"
            FROM change_log cl JOIN users u ON cl.user_email = u.email
            WHERE cl.school_id = ${schoolIds[0]} AND cl.event_type = 'ATTENDANCE_UPDATED' AND cl.payload->>'date' = ${selectedDate}
        ),
        SubmittedClasses AS (SELECT DISTINCT payload->>'class' as class_name, "teacherName" FROM DailyAttendanceEvents),
        DailyAbsences AS (
            SELECT payload->>'class' as class, "teacherName", att.key as student_name, att.value as status
            FROM DailyAttendanceEvents CROSS JOIN jsonb_each_text(payload->'attendance') as att WHERE att.value <> 'H'
        )
        SELECT
            (SELECT to_jsonb(s) FROM SchoolInfo s) as "schoolInfo",
            COALESCE((SELECT jsonb_agg(t) FROM (SELECT class, "teacherName", jsonb_agg(jsonb_build_object('name', student_name, 'status', status) ORDER BY student_name) as students FROM DailyAbsences GROUP BY class, "teacherName" ORDER BY class) t), '[]'::jsonb) as "dailyAbsentRows",
            COALESCE((SELECT jsonb_agg(sc) FROM SubmittedClasses sc), '[]'::jsonb) as "submittedClasses";
    `;

    const { schoolInfo, dailyAbsentRows, submittedClasses } = rows[0] || { schoolInfo: {}, dailyAbsentRows: [], submittedClasses: [] };
    const { totalStudents = 0, allClasses = [], studentsPerClass = {} } = schoolInfo;

    const absentStudentData = new Map(dailyAbsentRows.map(row => [row.class, { teacherName: row.teacherName, students: row.students }]));
    const submittedClassMap = new Map((submittedClasses || []).map(sc => [sc.class_name, { teacherName: sc.teacherName }]));

    const classCompletionStatus = allClasses.map(className => {
        const submission = submittedClassMap.get(className);
        if (submission) {
            const absenceInfo = absentStudentData.get(className);
            return { className, isSubmitted: true, teacherName: submission.teacherName, absentStudents: absenceInfo ? absenceInfo.students : [], allPresent: !absenceInfo };
        } else {
            return { className, isSubmitted: false, teacherName: null, absentStudents: [], allPresent: false };
        }
    });

    const { rows: allLogsRows } = await sql`SELECT payload as log FROM change_log WHERE school_id = ${schoolIds[0]} AND event_type = 'ATTENDANCE_UPDATED' AND (payload->>'date')::date BETWEEN ${yearStart.toISOString().split('T')[0]} AND ${yearEnd.toISOString().split('T')[0]};`;
    
    return response.status(200).json({
        isRegionalView: false,
        reportData: {},
        schoolInfo: { totalStudents, allClasses, studentsPerClass },
        allLogsForYear: allLogsRows.map(r => r.log),
        classCompletionStatus,
    });
}
