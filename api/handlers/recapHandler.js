
async function getSubJurisdictionIds(jurisdictionId, sql) {
    if (!jurisdictionId) return [];
    const { rows } = await sql`
        WITH RECURSIVE sub_jurisdictions AS (
            SELECT id FROM jurisdictions WHERE id = ${jurisdictionId}
            UNION
            SELECT j.id FROM jurisdictions j
            INNER JOIN sub_jurisdictions s ON s.id = j.parent_id
        )
        SELECT id FROM sub_jurisdictions;
    `;
    return rows.map(r => r.id);
}

export default async function handleGetRecapData({ payload, user, sql, response }) {
    const authorizedRoles = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'GURU', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'];
    if (!authorizedRoles.includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { schoolId, classFilter: payloadClassFilter, jurisdictionId, startDate, endDate } = payload;
    let schoolIdsInScope = [];
    let classFilter = payloadClassFilter ? payloadClassFilter.trim() : null;

    // Determine scope based on user role and payload
    if (jurisdictionId) {
        // Highest priority: if a jurisdictionId is provided, use it.
        const accessibleJurisdictionIds = await getSubJurisdictionIds(jurisdictionId, sql);
        if (accessibleJurisdictionIds.length > 0) {
            const { rows } = await sql`SELECT id FROM schools WHERE jurisdiction_id = ANY(${accessibleJurisdictionIds})`;
            schoolIdsInScope = rows.map(r => r.id);
        }
    } else if (user.role === 'SUPER_ADMIN') {
        if (schoolId) {
            schoolIdsInScope.push(schoolId);
        } else {
            // Super Admin without context defaults to ALL schools (can be heavy)
            const { rows } = await sql`SELECT id FROM schools`;
            schoolIdsInScope = rows.map(r => r.id);
        }
    } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(user.role)) {
        if (user.jurisdiction_id) {
             const accessibleJurisdictionIds = await getSubJurisdictionIds(user.jurisdiction_id, sql);
             if (accessibleJurisdictionIds.length > 0) {
                 const { rows } = await sql`SELECT id FROM schools WHERE jurisdiction_id = ANY(${accessibleJurisdictionIds})`;
                 schoolIdsInScope = rows.map(r => r.id);
             }
        }
    } else { // GURU, KEPALA_SEKOLAH, ADMIN_SEKOLAH
        const effectiveSchoolId = schoolId || user.school_id;
        if (effectiveSchoolId) {
            schoolIdsInScope.push(effectiveSchoolId);
        }
    }
    
    if (schoolIdsInScope.length === 0) {
        return response.status(200).json({ recapData: [], reportType: 'class' });
    }

    // --- Date Filtering Logic ---
    // If startDate/endDate provided, use them. Otherwise, default to "all time" (no filter),
    // but in practice, the frontend should now always provide semester dates.
    // To be safe, we check if they exist.
    const hasDateFilter = startDate && endDate;

    const { rows: recapArray } = await sql`
        WITH
        latest_student_lists AS (
            SELECT DISTINCT ON (school_id, TRIM(payload->>'class'))
                school_id,
                TRIM(payload->>'class') as class_name,
                payload->'students' as students
            FROM change_log
            WHERE school_id = ANY(${schoolIdsInScope}) 
              AND event_type = 'STUDENT_LIST_UPDATED'
              AND jsonb_array_length(payload->'students') > 0 -- Ignore accidentally saved empty lists
            ORDER BY school_id, TRIM(payload->>'class'), id DESC
        ),
        students_flat AS (
            SELECT
                lsl.school_id,
                lsl.class_name as class,
                -- Robust extraction: Handles {name: "Budi"} AND "Budi" (legacy strings)
                TRIM(COALESCE(elem->>'name', elem#>>'{}')) as name,
                row_number() over (partition by lsl.class_name order by TRIM(COALESCE(elem->>'name', elem#>>'{}'))) as "originalIndex"
            FROM latest_student_lists lsl,
            jsonb_array_elements(lsl.students) as elem
            WHERE ${classFilter}::text IS NULL OR lsl.class_name = ${classFilter}::text
        ),
        attendance_events AS (
            SELECT DISTINCT ON (school_id, TRIM(payload->>'class'), payload->>'date')
                school_id,
                TRIM(payload->>'class') as class_name,
                payload
            FROM change_log
            WHERE school_id = ANY(${schoolIdsInScope}) AND event_type = 'ATTENDANCE_UPDATED'
            AND (${classFilter}::text IS NULL OR TRIM(payload->>'class') = ${classFilter}::text)
            AND (${!hasDateFilter} OR (payload->>'date')::date BETWEEN ${startDate}::date AND ${endDate}::date)
            ORDER BY school_id, TRIM(payload->>'class'), payload->>'date', id DESC
        ),
        absences AS (
            SELECT
                ae.school_id,
                ae.class_name,
                TRIM(att.key) as name, -- Normalize student name key
                att.value as status
            FROM attendance_events ae
            CROSS JOIN jsonb_each_text(ae.payload->'attendance') as att
            WHERE att.value <> 'H'
        ),
        absence_counts AS (
            SELECT
                school_id,
                class_name,
                name,
                COUNT(*) FILTER (WHERE status = 'S') as "S",
                COUNT(*) FILTER (WHERE status = 'I') as "I",
                COUNT(*) FILTER (WHERE status = 'A') as "A"
            FROM absences
            GROUP BY school_id, class_name, name
        )
        SELECT
            s_flat.name,
            s_flat.class,
            s_flat."originalIndex",
            COALESCE(sch.name, 'Unknown School') as school_name,
            COALESCE(ac."S", 0)::int as "S",
            COALESCE(ac."I", 0)::int as "I",
            COALESCE(ac."A", 0)::int as "A",
            (COALESCE(ac."S", 0) + COALESCE(ac."I", 0) + COALESCE(ac."A", 0))::int as total
        FROM students_flat s_flat
        LEFT JOIN absence_counts ac 
            ON s_flat.name = ac.name 
            AND s_flat.class = ac.class_name 
            AND s_flat.school_id = ac.school_id
        LEFT JOIN schools sch ON s_flat.school_id = sch.id
        WHERE s_flat.name IS NOT NULL AND s_flat.name <> ''; 
    `;

    const isRegionalReport = !!jurisdictionId;
    const isFullSchoolReport = !!schoolId && !classFilter;

    if (isRegionalReport) {
        const dataBySchool = recapArray.reduce((acc, row) => {
            const { school_name, ...studentData } = row;
            if (!acc[school_name]) acc[school_name] = [];
            acc[school_name].push(studentData);
            return acc;
        }, {});
        return response.status(200).json({ recapData: dataBySchool, reportType: 'regional' });

    } else if (isFullSchoolReport) {
        const dataByClass = recapArray.reduce((acc, row) => {
            const { class: className, ...studentData } = row;
            if (!acc[className]) acc[className] = [];
            acc[className].push(studentData);
            return acc;
        }, {});
        return response.status(200).json({ recapData: dataByClass, reportType: 'school' });
    }
    
    // Fallback for single class report
    return response.status(200).json({ recapData: recapArray, reportType: 'class' });
}
