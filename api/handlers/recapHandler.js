

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

    const { schoolId, classFilter: payloadClassFilter, jurisdictionId } = payload;
    let schoolIdsInScope = [];
    let classFilter = payloadClassFilter;

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

    const { rows: recapArray } = await sql`
        WITH
        latest_student_lists AS (
            SELECT DISTINCT ON (school_id, payload->>'class')
                school_id,
                payload->>'class' as class_name,
                payload->'students' as students
            FROM change_log
            WHERE school_id = ANY(${schoolIdsInScope}) AND event_type = 'STUDENT_LIST_UPDATED'
            ORDER BY school_id, payload->>'class', id DESC
        ),
        students_flat AS (
            SELECT
                lsl.school_id,
                lsl.class_name as class,
                (jsonb_array_elements(students)->>'name') as name,
                row_number() over (partition by lsl.class_name order by (jsonb_array_elements(students)->>'name')) as "originalIndex"
            FROM latest_student_lists lsl
            WHERE ${classFilter}::text IS NULL OR lsl.class_name = ${classFilter}::text
        ),
        attendance_events AS (
            SELECT DISTINCT ON (school_id, payload->>'class', payload->>'date')
                payload
            FROM change_log
            WHERE school_id = ANY(${schoolIdsInScope}) AND event_type = 'ATTENDANCE_UPDATED'
            AND (${classFilter}::text IS NULL OR payload->>'class' = ${classFilter}::text)
            ORDER BY school_id, payload->>'class', payload->>'date', id DESC
        ),
        absences AS (
            SELECT
                att.key as name,
                att.value as status
            FROM attendance_events
            CROSS JOIN jsonb_each_text(payload->'attendance') as att
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
            s_flat.name,
            s_flat.class,
            s_flat."originalIndex",
            sch.name as school_name,
            COALESCE(ac."S", 0)::int as "S",
            COALESCE(ac."I", 0)::int as "I",
            COALESCE(ac."A", 0)::int as "A",
            (COALESCE(ac."S", 0) + COALESCE(ac."I", 0) + COALESCE(ac."A", 0))::int as total
        FROM students_flat s_flat
        LEFT JOIN absence_counts ac ON s_flat.name = ac.name
        JOIN schools sch ON s_flat.school_id = sch.id;
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
