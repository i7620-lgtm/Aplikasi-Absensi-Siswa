export async function handleGetMaintenanceStatus({ sql, response }) {
    const { rows: configRows } = await sql`SELECT value FROM app_config WHERE key = 'maintenance_mode'`;
    const isMaintenance = configRows[0]?.value === 'true';
    return response.status(200).json({ isMaintenance });
}

export async function handleSetMaintenanceStatus({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    const { enabled } = payload;
    await sql`
        INSERT INTO app_config (key, value) VALUES ('maintenance_mode', ${String(enabled)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    `;
    return response.status(200).json({ success: true, newState: enabled });
}
