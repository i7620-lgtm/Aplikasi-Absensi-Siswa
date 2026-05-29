
export async function handleGetUpdateSignal({ payload, user, sql, response }) {
    const schoolId = payload.schoolId || user.school_id;
    if (!schoolId) {
        return response.status(400).json({ error: 'School ID is required for update signal.' });
    }

    try {
        const rows = await sql`SELECT MAX(id) as max_id FROM change_log WHERE school_id = ${schoolId}`;
        const latestVersion = rows[0]?.max_id ? Number(rows[0].max_id) : 0;
        return response.status(200).json({ latestVersion });
    } catch (dbError) {
        console.error("DB fallback for update signal failed:", dbError);
        return response.status(500).json({ error: 'Failed to read server update signal from DB.' });
    }
}
