import { sql } from '@vercel/postgres';

// --- KONFIGURASI ---
// Daftar email yang akan otomatis menjadi SUPER_ADMIN saat pertama kali login.
const SUPER_ADMIN_EMAILS = ['i7620@guru.sd.belajar.id', 'admin@sekolah.com'];

async function setupTables() {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        email VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        picture TEXT,
        role VARCHAR(50) DEFAULT 'GURU',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS absensi_data (
        user_email VARCHAR(255) PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
        students_by_class JSONB,
        saved_logs JSONB,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      );
    `;
}

async function loginOrRegisterUser(profile) {
    const { email, name, picture } = profile;
    const { rows } = await sql`SELECT * FROM users WHERE email = ${email}`;
    let user = rows[0];

    if (user) {
        // User exists, update last login
        await sql`UPDATE users SET last_login = NOW(), name = ${name}, picture = ${picture} WHERE email = ${email}`;
        user.last_login = new Date();
    } else {
        // New user, determine role
        const role = SUPER_ADMIN_EMAILS.includes(email) ? 'SUPER_ADMIN' : 'GURU';
        const { rows: newRows } = await sql`
            INSERT INTO users (email, name, picture, role, last_login)
            VALUES (${email}, ${name}, ${picture}, ${role}, NOW())
            RETURNING *;
        `;
        user = newRows[0];
    }
    return user;
}


export default async function handler(request, response) {
    try {
        await setupTables();

        if (request.method === 'POST') {
            const { action, payload, userEmail } = request.body;

            if (!action) {
                return response.status(400).json({ error: 'Action is required' });
            }

            // For all actions EXCEPT loginOrRegister, we need an authenticated user email.
            if (action !== 'loginOrRegister' && !userEmail) {
                return response.status(400).json({ error: 'userEmail is required for this action' });
            }
            
            // Authenticate user for all actions (except login which is handled inside the switch)
            let userRole = null;
            if (action !== 'loginOrRegister') {
                const { rows: userRows } = await sql`SELECT role FROM users WHERE email = ${userEmail}`;
                if (userRows.length === 0) {
                    return response.status(403).json({ error: 'Forbidden: User not found' });
                }
                userRole = userRows[0].role;
            }
            
            switch (action) {
                case 'loginOrRegister':
                    if (!payload || !payload.profile) {
                        return response.status(400).json({ error: 'Profile payload is required for registration' });
                    }
                    const user = await loginOrRegisterUser(payload.profile);
                    const { rows: dataRows } = await sql`SELECT students_by_class, saved_logs FROM absensi_data WHERE user_email = ${user.email}`;
                    const userData = dataRows[0] || { students_by_class: {}, saved_logs: [] };
                    return response.status(200).json({ user, userData });

                case 'saveData':
                    if (userRole === 'KEPALA_SEKOLAH') {
                         return response.status(403).json({ error: 'Akun Kepala Sekolah bersifat hanya-baca.' });
                    }
                    const { studentsByClass, savedLogs } = payload;
                    const studentsByClassJson = JSON.stringify(studentsByClass);
                    const savedLogsJson = JSON.stringify(savedLogs);
                    await sql`
                        INSERT INTO absensi_data (user_email, students_by_class, saved_logs, last_updated)
                        VALUES (${userEmail}, ${studentsByClassJson}, ${savedLogsJson}, NOW())
                        ON CONFLICT (user_email)
                        DO UPDATE SET
                          students_by_class = EXCLUDED.students_by_class,
                          saved_logs = EXCLUDED.saved_logs,
                          last_updated = NOW();
                    `;
                    return response.status(200).json({ success: true });

                case 'getDashboardData':
                     if (userRole !== 'SUPER_ADMIN' && userRole !== 'KEPALA_SEKOLAH') {
                        return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
                    const { rows: allData } = await sql`SELECT ad.saved_logs, u.name as user_name FROM absensi_data ad JOIN users u ON ad.user_email = u.email;`;
                    return response.status(200).json({ allData });

                case 'getAllUsers':
                    if (userRole !== 'SUPER_ADMIN') {
                         return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
                    const { rows: allUsers } = await sql`SELECT email, name, picture, role FROM users ORDER BY name;`;
                    return response.status(200).json({ allUsers });

                case 'updateUserRole':
                     if (userRole !== 'SUPER_ADMIN') {
                         return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
                    const { targetEmail, newRole } = payload;
                    if (SUPER_ADMIN_EMAILS.includes(targetEmail) && newRole !== 'SUPER_ADMIN') {
                        return response.status(400).json({ error: 'Cannot demote a bootstrapped Super Admin.' });
                    }
                    await sql`UPDATE users SET role = ${newRole} WHERE email = ${targetEmail}`;
                    return response.status(200).json({ success: true });
                
                default:
                    return response.status(400).json({ error: 'Invalid action' });
            }

        } else {
            return response.status(405).json({ error: 'Method Not Allowed' });
        }
    } catch (error) {
        console.error('API Error:', error);
        return response.status(500).json({ error: 'An internal server error occurred', details: error.message });
    }
}
