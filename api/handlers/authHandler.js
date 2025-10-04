import { createClient } from '@vercel/edge-config';

async function loginOrRegisterUser(profile, sql, SUPER_ADMIN_EMAILS) {
    const { email, name, picture } = profile;
    
    const { rows } = await sql`SELECT email, name, picture, role, school_id, jurisdiction_id, assigned_classes FROM users WHERE email = ${email}`;
    let user = rows[0];

    if (user) {
        await sql`UPDATE users SET last_login = NOW(), name = ${name}, picture = ${picture} WHERE email = ${email}`;
        user.last_login = new Date();
        user.assigned_classes = user.assigned_classes || []; // Pastikan tidak null
    } else {
        const role = SUPER_ADMIN_EMAILS.includes(email) ? 'SUPER_ADMIN' : 'GURU';
        const { rows: newRows } = await sql`
            INSERT INTO users (email, name, picture, role, last_login, assigned_classes)
            VALUES (${email}, ${name}, ${picture}, ${role}, NOW(), '{}')
            RETURNING email, name, picture, role, school_id, jurisdiction_id, assigned_classes;
        `;
        user = newRows[0];
        user.assigned_classes = user.assigned_classes || [];
    }
    
    // Cek maintenance mode dari Edge Config, bukan database
    if (process.env.EDGE_CONFIG) {
        try {
            const edgeConfigClient = createClient(process.env.EDGE_CONFIG);
            const isMaintenance = await edgeConfigClient.get('maintenance_mode');
            if (isMaintenance && user.role !== 'SUPER_ADMIN') {
                return { maintenance: true };
            }
        } catch (e) {
            // Fail open: Jika Edge Config gagal dibaca, asumsikan tidak dalam maintenance
            // agar tidak memblokir login pengguna secara tidak sengaja.
            console.error("Auth handler failed to read Edge Config, proceeding without maintenance check:", e);
        }
    }
    
    return { user };
}


export default async function handleLoginOrRegister({ payload, sql, response, SUPER_ADMIN_EMAILS }) {
    if (!payload || !payload.profile) return response.status(400).json({ error: 'Profile payload is required' });
    
    const loginResult = await loginOrRegisterUser(payload.profile, sql, SUPER_ADMIN_EMAILS);
                    
    if (loginResult.maintenance) {
        return response.status(200).json({ maintenance: true });
    }

    const loggedInUser = loginResult.user;
    const { rows: dataRows } = await sql`SELECT students_by_class, saved_logs FROM absensi_data WHERE user_email = ${loggedInUser.email}`;
    const userData = dataRows[0] || { students_by_class: {}, saved_logs: [] };
    return response.status(200).json({ user: loggedInUser, userData });
}
