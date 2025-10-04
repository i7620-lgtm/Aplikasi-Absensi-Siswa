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
    if (!name || !type) {
        return response.status(400).json({ error: 'Name and type are required' });
    }
    const { rows } = await sql`
        INSERT INTO jurisdictions (name, type, parent_id) VALUES (${name}, ${type}, ${parentId || null}) RETURNING *;
    `;
    return response.status(201).json({ jurisdiction: rows[0] });
}

export async function handleUpdateJurisdiction({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden' });
    }
    const { id, name, type } = payload;
    if (!id || !name || !type) {
        return response.status(400).json({ error: 'ID, name, and type are required' });
    }
    await sql`UPDATE jurisdictions SET name = ${name}, type = ${type} WHERE id = ${id}`;
    return response.status(200).json({ success: true });
}

export async function handleDeleteJurisdiction({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden' });
    }
    const { id } = payload;
    // Check for child jurisdictions or schools before deleting
    const { rows: children } = await sql`SELECT id FROM jurisdictions WHERE parent_id = ${id}`;
    if (children.length > 0) {
        return response.status(400).json({ error: 'Cannot delete jurisdiction with children nodes' });
    }
    const { rows: schools } = await sql`SELECT id FROM schools WHERE jurisdiction_id = ${id}`;
    if (schools.length > 0) {
        return response.status(400).json({ error: 'Cannot delete jurisdiction with assigned schools' });
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
