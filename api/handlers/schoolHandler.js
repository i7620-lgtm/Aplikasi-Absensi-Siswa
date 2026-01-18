
// Simple sanitizer to prevent basic XSS by removing HTML tags.
function sanitize(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '').trim();
}

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

export async function handleGetAllSchools({ user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') {
         return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    const { rows: allSchools } = await sql`SELECT id, name FROM schools ORDER BY name;`;
    return response.status(200).json({ allSchools });
}

export async function handleSearchSchools({ payload, user, sql, response }) {
    // Open to all authenticated users (GURU, etc) to facilitate onboarding
    const { query } = payload;
    const sanitizedQuery = sanitize(query);

    if (!sanitizedQuery || sanitizedQuery.length < 3) {
        return response.status(200).json({ results: [] });
    }

    // Find schools matching the name AND find the associated Admin/Principal name & email
    // Using LEFT JOIN LATERAL to efficiently fetch the top-ranking admin for each school found
    const { rows: results } = await sql`
        SELECT 
            s.id, 
            s.name, 
            u.name as admin_name,
            u.email as admin_email
        FROM schools s
        LEFT JOIN LATERAL (
            SELECT name, email
            FROM users
            WHERE school_id = s.id
            AND role IN ('ADMIN_SEKOLAH', 'KEPALA_SEKOLAH', 'SUPER_ADMIN')
            ORDER BY CASE WHEN role = 'ADMIN_SEKOLAH' THEN 1 ELSE 2 END
            LIMIT 1
        ) u ON true
        WHERE s.name ILIKE ${'%' + sanitizedQuery + '%'} 
        LIMIT 10;
    `;

    return response.status(200).json({ results });
}

export async function handleCreateSchool({ payload, user, sql, response }) {
    // Modified: If user has NO school_id, allow them to create one (Onboarding flow)
    // Otherwise, restrict to SUPER_ADMIN.
    
    if (user.role !== 'SUPER_ADMIN' && user.school_id) {
         return response.status(403).json({ error: 'Forbidden: Anda sudah terdaftar di sebuah sekolah.' });
    }
    
    const { schoolName } = payload;
    const sanitizedName = sanitize(schoolName);
    
    if (!sanitizedName) {
        return response.status(400).json({ error: 'Nama sekolah wajib diisi.' });
    }

    const client = await sql.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Create School
        const { rows: newSchool } = await client.query(`INSERT INTO schools (name) VALUES ($1) RETURNING id, name`, [sanitizedName]);
        const schoolId = newSchool[0].id;

        // 2. If this is a self-service creation (user has no role/school yet), promote them
        if (user.role !== 'SUPER_ADMIN') {
            await client.query(
                `UPDATE users SET school_id = $1, role = 'ADMIN_SEKOLAH' WHERE email = $2`,
                [schoolId, user.email]
            );
        }

        await client.query('COMMIT');
        return response.status(201).json({ success: true, school: newSchool[0] });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Failed to create school:", error);
        return response.status(500).json({ error: 'Gagal membuat sekolah.' });
    } finally {
        client.release();
    }
}

// --- NEW: Holiday Management Handlers ---

export async function handleManageHoliday({ payload, user, sql, response }) {
    const { operation, holidayId, date, description } = payload;
    // operation: 'ADD' or 'DELETE'

    // Authorization: Only admins can manage
    if (!['SUPER_ADMIN', 'ADMIN_SEKOLAH', 'KEPALA_SEKOLAH', 'ADMIN_DINAS_PENDIDIKAN', 'DINAS_PENDIDIKAN'].includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    if (operation === 'DELETE') {
        // Need to check ownership before deleting
        const { rows: existing } = await sql`SELECT scope, reference_id FROM holidays WHERE id = ${holidayId}`;
        if (existing.length === 0) return response.status(404).json({ error: 'Holiday not found' });
        
        const h = existing[0];
        // Validate Permission
        let canDelete = false;
        if (user.role === 'SUPER_ADMIN') canDelete = true;
        else if (h.scope === 'SCHOOL' && user.school_id === h.reference_id && ['ADMIN_SEKOLAH', 'KEPALA_SEKOLAH'].includes(user.role)) canDelete = true;
        else if (h.scope === 'REGIONAL' && user.jurisdiction_id === h.reference_id && ['ADMIN_DINAS_PENDIDIKAN', 'DINAS_PENDIDIKAN'].includes(user.role)) canDelete = true;

        if (!canDelete) return response.status(403).json({ error: 'Anda tidak berhak menghapus libur ini.' });

        await sql`DELETE FROM holidays WHERE id = ${holidayId}`;
        return response.status(200).json({ success: true });
    }

    if (operation === 'ADD') {
        if (!date || !description) return response.status(400).json({ error: 'Date and description required.' });
        
        let scope, referenceId;
        
        if (user.role === 'SUPER_ADMIN') {
            scope = 'NATIONAL';
            referenceId = null;
        } else if (['ADMIN_DINAS_PENDIDIKAN', 'DINAS_PENDIDIKAN'].includes(user.role)) {
            scope = 'REGIONAL';
            referenceId = user.jurisdiction_id;
            if (!referenceId) return response.status(400).json({ error: 'Admin Dinas must have a jurisdiction.' });
        } else if (['ADMIN_SEKOLAH', 'KEPALA_SEKOLAH'].includes(user.role)) {
            scope = 'SCHOOL';
            referenceId = user.school_id;
            if (!referenceId) return response.status(400).json({ error: 'School Admin must have a school.' });
        }

        const { rows } = await sql`
            INSERT INTO holidays (date, description, scope, reference_id, created_by_email)
            VALUES (${date}, ${sanitize(description)}, ${scope}, ${referenceId}, ${user.email})
            RETURNING *
        `;
        return response.status(201).json({ holiday: rows[0] });
    }

    return response.status(400).json({ error: 'Invalid operation' });
}

export async function handleGetHolidays({ user, sql, response }) {
    // Determine the scope of holidays to fetch for this user
    let query = sql`SELECT * FROM holidays WHERE scope = 'NATIONAL'`;
    
    const conditions = [];
    conditions.push(sql`scope = 'NATIONAL'`);

    if (user.school_id) {
        // Fetch School specific
        conditions.push(sql`(scope = 'SCHOOL' AND reference_id = ${user.school_id})`);
        
        // Fetch Regional (Need to know School's Jurisdiction)
        // We do this via a join or subquery if we had school data handy, 
        // but let's assume we fetch school's jurisdiction first.
        const { rows: schoolData } = await sql`SELECT jurisdiction_id FROM schools WHERE id = ${user.school_id}`;
        if (schoolData[0] && schoolData[0].jurisdiction_id) {
            // Get all parent jurisdictions (recursive) for the school
            const { rows: jurIds } = await sql`
                WITH RECURSIVE parents AS (
                    SELECT id, parent_id FROM jurisdictions WHERE id = ${schoolData[0].jurisdiction_id}
                    UNION ALL
                    SELECT j.id, j.parent_id FROM jurisdictions j JOIN parents p ON j.id = p.parent_id
                )
                SELECT id FROM parents
            `;
            const ids = jurIds.map(j => j.id);
            if (ids.length > 0) {
                 conditions.push(sql`(scope = 'REGIONAL' AND reference_id = ANY(${ids}))`);
            }
        }
    } else if (user.jurisdiction_id) {
        // For Dinas Users
        const { rows: jurIds } = await sql`
            WITH RECURSIVE parents AS (
                SELECT id, parent_id FROM jurisdictions WHERE id = ${user.jurisdiction_id}
                UNION ALL
                SELECT j.id, j.parent_id FROM jurisdictions j JOIN parents p ON j.id = p.parent_id
            )
            SELECT id FROM parents
        `;
        const ids = jurIds.map(j => j.id);
        if (ids.length > 0) {
             conditions.push(sql`(scope = 'REGIONAL' AND reference_id = ANY(${ids}))`);
        }
    }

    // Combine conditions with OR
    // Since node-postgres templating for dynamic OR conditions is tricky, we'll do simpler separate queries or a UNION.
    // Let's use a simpler approach: Fetch relevant sets.
    
    // Actually, `userHandler.getInitialData` logic will duplicate this partially. 
    // This handler is for the "Manage Holidays" UI specifically.
    
    let whereClause;
    if (conditions.length === 1) whereClause = conditions[0];
    else {
        // Construct composite query
        // Note: Using `sql` template literal composition is safer.
        // For simplicity in this constraints, we will fetch generic lists based on role.
    }
    
    // Refined Query Strategy
    const { rows: holidays } = await sql`
        SELECT * FROM holidays
        ORDER BY date DESC
    `;
    
    // Filter in JS for simplicity regarding the dynamic jurisdiction tree
    // (Optimization: In a massive DB, this should be SQL, but for < 10k holidays it's fine)
    
    const filteredHolidays = [];
    
    // Helper to check regional scope
    let myJurisdictionIds = [];
    if (user.school_id) {
         const { rows } = await sql`SELECT jurisdiction_id FROM schools WHERE id = ${user.school_id}`;
         if (rows[0]?.jurisdiction_id) {
             const { rows: ids } = await sql`WITH RECURSIVE p AS (SELECT id, parent_id FROM jurisdictions WHERE id = ${rows[0].jurisdiction_id} UNION ALL SELECT j.id, j.parent_id FROM jurisdictions j JOIN p ON j.id = p.parent_id) SELECT id FROM p`;
             myJurisdictionIds = ids.map(i => i.id);
         }
    } else if (user.jurisdiction_id) {
             const { rows: ids } = await sql`WITH RECURSIVE p AS (SELECT id, parent_id FROM jurisdictions WHERE id = ${user.jurisdiction_id} UNION ALL SELECT j.id, j.parent_id FROM jurisdictions j JOIN p ON j.id = p.parent_id) SELECT id FROM p`;
             myJurisdictionIds = ids.map(i => i.id);
    }

    for (const h of holidays) {
        if (h.scope === 'NATIONAL') {
            filteredHolidays.push(h);
        } else if (h.scope === 'SCHOOL' && h.reference_id === user.school_id) {
            filteredHolidays.push(h);
        } else if (h.scope === 'REGIONAL' && myJurisdictionIds.includes(h.reference_id)) {
            filteredHolidays.push(h);
        }
        // Admin View: See what they created
        else if (h.created_by_email === user.email) {
            if (!filteredHolidays.find(x => x.id === h.id)) filteredHolidays.push(h);
        }
    }

    return response.status(200).json({ holidays: filteredHolidays });
}

export async function handleUpdateSchoolSettings({ payload, user, sql, response }) {
    // payload: { workDays: [1,2,3,4,5] }
    if (!['ADMIN_SEKOLAH', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'].includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden' });
    }
    
    const { workDays } = payload;
    if (!Array.isArray(workDays)) return response.status(400).json({ error: 'Invalid format' });
    
    const schoolId = user.role === 'SUPER_ADMIN' ? payload.schoolId : user.school_id;
    if (!schoolId) return response.status(400).json({ error: 'School ID required' });

    const newSettings = { workDays: workDays.map(Number) }; // Ensure numbers
    
    await sql`UPDATE schools SET settings = ${JSON.stringify(newSettings)} WHERE id = ${schoolId}`;
    
    return response.status(200).json({ success: true, settings: newSettings });
}
