// --- Utility Functions ---
async function getSubJurisdictionIds(jurisdictionId, sql) {
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

// Simple sanitizer to prevent basic XSS by removing HTML tags.
function sanitize(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '').trim();
}


// --- Handler Functions ---

export async function handleGetJurisdictionTree({ user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden' });
    }
    const { rows } = await sql`SELECT id, name, type, parent_id FROM jurisdictions ORDER BY name`;
    
    const nodes = {};
    const tree = [];

    rows.forEach(row => {
        nodes[row.id] = { ...row, children: [] };
    });

    rows.forEach(row => {
        if (row.parent_id && nodes[row.parent_id]) {
            nodes[row.parent_id].children.push(nodes[row.id]);
        } else {
            tree.push(nodes[row.id]);
        }
    });

    return response.status(200).json({ tree });
}

export async function handleGetSchoolsForJurisdiction({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden' });
    }
    const { jurisdictionId } = payload;
    const { rows: assignedSchools } = await sql`
        SELECT id, name FROM schools WHERE jurisdiction_id = ${jurisdictionId} ORDER BY name;
    `;
    const { rows: unassignedSchools } = await sql`
        SELECT id, name FROM schools WHERE jurisdiction_id IS NULL ORDER BY name;
    `;
    return response.status(200).json({ assignedSchools, unassignedSchools });
}

export async function handleCreateJurisdiction({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden' });
    }
    const { name, type, parentId } = payload;
    const sanitizedName = sanitize(name);

    if (!sanitizedName || !type) {
        return response.status(400).json({ error: 'Name and type are required' });
    }
    const { rows } = await sql`
        INSERT INTO jurisdictions (name, type, parent_id) VALUES (${sanitizedName}, ${type}, ${parentId || null}) RETURNING *;
    `;
    return response.status(201).json({ jurisdiction: rows[0] });
}

export async function handleUpdateJurisdiction({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden' });
    }
    const { id, name, type, parentId } = payload;
    const finalParentId = parentId || null;
    const sanitizedName = sanitize(name);

    if (!id || !sanitizedName || !type) {
        return response.status(400).json({ error: 'ID, name, and type are required' });
    }

    // Validation 1: Cannot be its own parent
    if (Number(id) === Number(finalParentId)) {
        return response.status(400).json({ error: 'Sebuah yurisdiksi tidak bisa menjadi induknya sendiri.' });
    }

    // Validation 2: Cannot be a child of its own descendants
    if (finalParentId) {
        const descendantIds = await getSubJurisdictionIds(id, sql);
        if (descendantIds.includes(Number(finalParentId))) {
            return response.status(400).json({ error: 'Tidak dapat memindahkan yurisdiksi ke dalam salah satu turunannya.' });
        }
    }

    await sql`UPDATE jurisdictions SET name = ${sanitizedName}, type = ${type}, parent_id = ${finalParentId} WHERE id = ${id}`;
    return response.status(200).json({ success: true });
}

export async function handleDeleteJurisdiction({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden' });
    }
    const { id } = payload;
    // Check for child jurisdictions
    const { rows: children } = await sql`SELECT id FROM jurisdictions WHERE parent_id = ${id} LIMIT 1`;
    if (children.length > 0) {
        return response.status(400).json({ error: 'Hapus semua sub-yurisdiksi terlebih dahulu.' });
    }
    // Check for assigned schools
    const { rows: schools } = await sql`SELECT id FROM schools WHERE jurisdiction_id = ${id} LIMIT 1`;
    if (schools.length > 0) {
        return response.status(400).json({ error: 'Pindahkan semua sekolah dari yurisdiksi ini terlebih dahulu.' });
    }
    // Check for assigned users
    const { rows: users } = await sql`SELECT email FROM users WHERE jurisdiction_id = ${id} LIMIT 1`;
    if (users.length > 0) {
        return response.status(400).json({ error: 'Masih ada pengguna yang ditugaskan ke yurisdiksi ini. Pindahkan pengguna terlebih dahulu.' });
    }

    await sql`DELETE FROM jurisdictions WHERE id = ${id}`;
    return response.status(200).json({ success: true });
}

export async function handleAssignSchoolToJurisdiction({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden' });
    }
    const { schoolId, jurisdictionId } = payload;
    await sql`UPDATE schools SET jurisdiction_id = ${jurisdictionId} WHERE id = ${schoolId}`;
    return response.status(200).json({ success: true });
}
