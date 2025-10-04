import { createClient } from '@vercel/edge-config';

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
