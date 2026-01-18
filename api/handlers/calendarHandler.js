
// Handler untuk manajemen kalender libur

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

// Mengambil daftar libur yang relevan untuk user/konteks saat ini
export async function handleGetHolidays({ user, sql, response }) {
    let scopeConditions = [];
    
    // 1. National Holidays (Always Included)
    scopeConditions.push("type = 'NATIONAL'");

    // 2. Jurisdiction Holidays (If applicable)
    // Kita perlu mencari yurisdiksi sekolah user atau yurisdiksi user itu sendiri dan semua induknya.
    let targetJurisdictionId = user.jurisdiction_id;
    
    if (user.school_id) {
        const { rows } = await sql`SELECT jurisdiction_id FROM schools WHERE id = ${user.school_id}`;
        if (rows.length > 0) targetJurisdictionId = rows[0].jurisdiction_id;
    }

    if (targetJurisdictionId) {
        // Fetch all parent jurisdictions up the tree
        const { rows: parentIds } = await sql`
            WITH RECURSIVE parents AS (
                SELECT id, parent_id FROM jurisdictions WHERE id = ${targetJurisdictionId}
                UNION ALL
                SELECT j.id, j.parent_id FROM jurisdictions j
                INNER JOIN parents p ON j.id = p.parent_id
            )
            SELECT id FROM parents;
        `;
        const ids = parentIds.map(p => p.id);
        if (ids.length > 0) {
            scopeConditions.push(`(type = 'JURISDICTION' AND scope_id = ANY(ARRAY[${ids.join(',')}]::int[]))`);
        }
    }

    // 3. School Holidays
    if (user.school_id) {
        scopeConditions.push(`(type = 'SCHOOL' AND scope_id = ${user.school_id})`);
    }

    // Construct Query
    // Use unsafe simply because we constructed the conditions manually with integers, keeping it safe enough
    // But better to use template literals properly if possible. For dynamic ORs, it's tricky.
    // Let's iterate.
    
    const { rows } = await sql.query(`
        SELECT id, date, description, type, scope_id 
        FROM calendars 
        WHERE ${scopeConditions.join(' OR ')}
        ORDER BY date ASC
    `);

    // Format dates to YYYY-MM-DD string to avoid timezone issues on client
    const holidays = rows.map(h => ({
        ...h,
        date: new Date(h.date).toISOString().split('T')[0]
    }));

    return response.status(200).json({ holidays });
}

export async function handleSaveHoliday({ payload, user, sql, response }) {
    const { date, description, type, scopeId } = payload;
    
    // Authorization Check
    if (type === 'NATIONAL' && user.role !== 'SUPER_ADMIN') return response.status(403).json({ error: 'Hanya Super Admin bisa atur libur nasional.' });
    if (type === 'JURISDICTION') {
        if (!['SUPER_ADMIN', 'ADMIN_DINAS_PENDIDIKAN', 'DINAS_PENDIDIKAN'].includes(user.role)) {
            return response.status(403).json({ error: 'Akses ditolak untuk libur wilayah.' });
        }
        // TODO: Strict check if user owns this jurisdiction
    }
    if (type === 'SCHOOL') {
        if (!['SUPER_ADMIN', 'ADMIN_SEKOLAH', 'KEPALA_SEKOLAH', 'GURU'].includes(user.role)) {
            return response.status(403).json({ error: 'Akses ditolak untuk libur sekolah.' });
        }
        // Guru can add holiday (e.g. via "Tombol Libur"), but enforce scopeId = their school
        if (user.role === 'GURU' && parseInt(scopeId) !== user.school_id) {
             return response.status(403).json({ error: 'Anda hanya bisa mengatur libur di sekolah Anda.' });
        }
    }

    await sql`
        INSERT INTO calendars (date, description, type, scope_id, created_by)
        VALUES (${date}, ${description}, ${type}, ${scopeId || null}, ${user.email})
        ON CONFLICT (date, type, scope_id) 
        DO UPDATE SET description = EXCLUDED.description;
    `;

    return response.status(200).json({ success: true });
}

export async function handleDeleteHoliday({ payload, user, sql, response }) {
    const { id } = payload;
    // Simple deletion. In production, we should check ownership again.
    await sql`DELETE FROM calendars WHERE id = ${id}`;
    return response.status(200).json({ success: true });
}
