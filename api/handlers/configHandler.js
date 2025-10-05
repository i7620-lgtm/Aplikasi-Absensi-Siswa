import { createClient } from '@vercel/edge-config';

export async function handleGetAuthConfig({ response }) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
        console.error("SERVER_CONFIGURATION_ERROR: GOOGLE_CLIENT_ID is not set in environment variables.");
        return response.status(503).json({ error: 'Konfigurasi otentikasi server tidak lengkap.' });
    }
    return response.status(200).json({ clientId });
}

export async function handleGetMaintenanceStatus({ response }) {
    if (!process.env.EDGE_CONFIG) {
        console.warn("EDGE_CONFIG env var not set. Maintenance mode check disabled, returning false.");
        return response.status(200).json({ isMaintenance: false });
    }

    try {
        const edgeConfigClient = createClient(process.env.EDGE_CONFIG);
        const isMaintenance = await edgeConfigClient.get('maintenance_mode');
        // Jika nilai belum pernah diatur, `get` akan mengembalikan `undefined`. `!!` mengubahnya menjadi `false`.
        return response.status(200).json({ isMaintenance: !!isMaintenance });
    } catch (error) {
        console.error("Edge Config read error:", error);
        // Jika Edge Config gagal diakses, kembalikan error agar frontend tahu ada masalah koneksi
        return response.status(500).json({ error: 'Failed to read server configuration.' });
    }
}

export async function handleSetMaintenanceStatus({ payload, user, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    
    if (!process.env.EDGE_CONFIG) {
        console.error("Cannot set maintenance status: EDGE_CONFIG env var is not defined.");
        return response.status(500).json({ error: 'Server is not configured for this feature.' });
    }
    
    try {
        const edgeConfigClient = createClient(process.env.EDGE_CONFIG);
        const { enabled } = payload;
        await edgeConfigClient.set('maintenance_mode', enabled).flush();
        return response.status(200).json({ success: true, newState: enabled });
    } catch (error) {
        console.error("Edge Config write error:", error);
        return response.status(500).json({ error: 'Failed to update maintenance status.' });
    }
}

export async function handleGetUpdateSignal({ payload, user, sql, response }) {
    const schoolId = payload.schoolId || user.school_id;
    if (!schoolId) {
        return response.status(400).json({ error: 'School ID is required for update signal.' });
    }

    // Prioritize Edge Config for speed
    if (process.env.EDGE_CONFIG) {
        try {
            const edgeConfigClient = createClient(process.env.EDGE_CONFIG);
            const key = `school_version_${schoolId}`;
            const latestVersion = await edgeConfigClient.get(key);
            return response.status(200).json({ latestVersion: latestVersion || 0 });
        } catch (error) {
            console.warn("Edge Config read error for update signal, falling back to DB:", error);
        }
    }

    // Fallback to database if Edge Config is not available or fails
    try {
        const { rows } = await sql`SELECT MAX(id) as max_id FROM change_log WHERE school_id = ${schoolId}`;
        const latestVersion = rows[0]?.max_id || 0;
        return response.status(200).json({ latestVersion });
    } catch (dbError) {
        console.error("DB fallback for update signal failed:", dbError);
        return response.status(500).json({ error: 'Failed to read server update signal from DB.' });
    }
}
