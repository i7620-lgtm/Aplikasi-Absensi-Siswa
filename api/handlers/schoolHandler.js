export async function handleGetAllSchools({ user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') {
         return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    const { rows: allSchools } = await sql`SELECT id, name FROM schools ORDER BY name;`;
    return response.status(200).json({ allSchools });
}

export async function handleCreateSchool({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
         return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    const { schoolName } = payload;
    const { rows: newSchool } = await sql`INSERT INTO schools (name) VALUES (${schoolName}) RETURNING id, name;`;
    return response.status(201).json({ success: true, school: newSchool[0] });
}
