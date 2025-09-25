import { sql } from '@vercel/postgres';

// --- KONFIGURASI ---
// Daftar email yang akan otomatis menjadi SUPER_ADMIN saat pertama kali login.
const SUPER_ADMIN_EMAILS = ['i7620@guru.sd.belajar.id', 'admin@sekolah.com'];

async function setupTables() {
    // Membuat tabel 'users' jika belum ada.
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

    // Bagian ini menangani migrasi skema untuk tabel yang sudah ada.
    // Aman untuk dijalankan berulang kali (idempotent).
    try {
        // Mencoba menambahkan kolom untuk kelas yang ditugaskan.
        await sql`ALTER TABLE users ADD COLUMN assigned_classes TEXT[] DEFAULT '{}'`;
    } catch (error) {
        // Abaikan error jika kolom sudah ada (kode error Postgres: 42701)
        if (error.code !== '42701') {
            throw error;
        }
    }

    // Ini memastikan setiap pengguna yang dibuat sebelum kolom memiliki nilai default diperbaiki.
    await sql`UPDATE users SET assigned_classes = '{}' WHERE assigned_classes IS NULL`;
    
    // Membuat tabel 'absensi_data' jika belum ada.
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
    
    // Dengan setupTables memastikan kolom ada dan tidak null, query ini lebih aman.
    const { rows } = await sql`SELECT email, name, picture, role, assigned_classes FROM users WHERE email = ${email}`;
    let user = rows[0];

    if (user) {
        // Pengguna ada, perbarui login terakhir
        await sql`UPDATE users SET last_login = NOW(), name = ${name}, picture = ${picture} WHERE email = ${email}`;
        user.last_login = new Date();
        // Pemeriksaan defensif: pastikan assigned_classes adalah array, bukan null.
        if (user.assigned_classes === null) {
            user.assigned_classes = [];
        }
    } else {
        // Pengguna baru, tentukan peran
        const role = SUPER_ADMIN_EMAILS.includes(email) ? 'SUPER_ADMIN' : 'GURU';
        const { rows: newRows } = await sql`
            INSERT INTO users (email, name, picture, role, last_login, assigned_classes)
            VALUES (${email}, ${name}, ${picture}, ${role}, NOW(), '{}')
            RETURNING email, name, picture, role, assigned_classes;
        `;
        user = newRows[0];
        // Klausa RETURNING harus memberikan array karena DEFAULT, tetapi periksa untuk jaga-jaga.
         if (user.assigned_classes === null) {
            user.assigned_classes = [];
        }
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

            // Untuk semua tindakan KECUALI loginOrRegister, kita memerlukan email pengguna yang terotentikasi.
            if (action !== 'loginOrRegister' && !userEmail) {
                return response.status(400).json({ error: 'userEmail is required for this action' });
            }
            
            // Otentikasi pengguna untuk semua tindakan (kecuali login yang ditangani di dalam switch)
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

                case 'getUserProfile':
                    const { rows: userProfileRows } = await sql`SELECT email, name, picture, role, assigned_classes FROM users WHERE email = ${userEmail}`;
                    if (userProfileRows.length === 0) {
                        return response.status(404).json({ error: 'User profile not found' });
                    }
                    // Pemeriksaan defensif: pastikan assigned_classes adalah array.
                    const userProfile = userProfileRows[0];
                    if (userProfile.assigned_classes === null) {
                        userProfile.assigned_classes = [];
                    }
                    return response.status(200).json({ userProfile });

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

                case 'getGlobalData':
                     if (userRole !== 'SUPER_ADMIN' && userRole !== 'KEPALA_SEKOLAH') {
                        return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
                    const { rows: allData } = await sql`SELECT ad.saved_logs, ad.students_by_class, u.name as user_name FROM absensi_data ad JOIN users u ON ad.user_email = u.email;`;
                    return response.status(200).json({ allData });

                case 'getAllUsers':
                    if (userRole !== 'SUPER_ADMIN') {
                         return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
                    const { rows: allUsers } = await sql`SELECT email, name, picture, role, assigned_classes FROM users ORDER BY name;`;
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

                case 'updateAssignedClasses':
                    if (userRole !== 'SUPER_ADMIN') {
                        return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
                    const { emailToUpdate, newClasses } = payload;
                    // newClasses harus berupa array string
                    await sql`UPDATE users SET assigned_classes = ${newClasses} WHERE email = ${emailToUpdate}`;
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
