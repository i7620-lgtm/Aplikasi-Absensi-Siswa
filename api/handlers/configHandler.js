
export async function handleGetUpdateSignal({ payload, user, sql, response, redis }) {
    const schoolId = payload.schoolId || user.school_id;
    if (!schoolId) {
        return response.status(400).json({ error: 'School ID is required for update signal.' });
    }

    // --- NEW LOGIC: Try Redis first ---
    if (redis) {
        try {
            const key = `school_version:${schoolId}`;
            const latestVersion = await redis.get(key);
            
            // If we get a valid number from Redis, return it immediately.
            if (typeof latestVersion === 'number') {
                console.log(`Update signal hit from Redis for school ${schoolId}: v${latestVersion}`);
                return response.status(200).json({ latestVersion });
            }
        } catch (e) {
            console.error("Failed to read from Redis, falling back to DB:", e);
        }
    }

    // --- FALLBACK LOGIC: Query DB if Redis fails or is not configured ---
    try {
        console.log(`Update signal fallback to DB for school ${schoolId}`);
        const { rows } = await sql`SELECT MAX(id) as max_id FROM change_log WHERE school_id = ${schoolId}`;
        const latestVersion = rows[0]?.max_id || 0;
        return response.status(200).json({ latestVersion });
    } catch (dbError) {
        console.error("DB fallback for update signal failed:", dbError);
        return response.status(500).json({ error: 'Failed to read server update signal from DB.' });
    }
}
