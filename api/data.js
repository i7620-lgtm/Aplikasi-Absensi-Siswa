
import { sql } from '@vercel/postgres';
import { GoogleGenAI } from "@google/genai";

// --- KONFIGURASI ---
// Daftar email yang akan otomatis menjadi SUPER_ADMIN saat pertama kali login.
const SUPER_ADMIN_EMAILS = ['i7620@guru.sd.belajar.id', 'admin@sekolah.com'];

async function setupTables() {
    // 1. Membuat tabel 'schools' untuk arsitektur multi-tenant.
    await sql`
      CREATE TABLE IF NOT EXISTS schools (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // 2. Membuat tabel 'users' jika belum ada.
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        email VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        picture TEXT,
        role VARCHAR(50) DEFAULT 'GURU',
        school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
        assigned_classes TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ
      );
    `;

    // 3. Menangani migrasi untuk tabel pengguna yang sudah ada.
    try {
        await sql`ALTER TABLE users ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL;`;
    } catch (error) {
        if (error.code !== '42701') throw error; // Abaikan jika kolom sudah ada
    }
     try {
        await sql`ALTER TABLE users ADD COLUMN assigned_classes TEXT[] DEFAULT '{}'`;
    } catch (error) {
        if (error.code !== '42701') throw error; // Abaikan jika kolom sudah ada
    }
    
    // Memastikan nilai default untuk kolom yang baru ditambahkan tidak null.
    await sql`UPDATE users SET assigned_classes = '{}' WHERE assigned_classes IS NULL`;

    // 4. Membuat tabel 'absensi_data' dengan isolasi data per sekolah.
    await sql`
      CREATE TABLE IF NOT EXISTS absensi_data (
        user_email VARCHAR(255) PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
        school_id INTEGER, 
        students_by_class JSONB,
        saved_logs JSONB,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      );
    `;
     try {
        await sql`ALTER TABLE absensi_data ADD COLUMN school_id INTEGER;`;
    } catch (error) {
        if (error.code !== '42701') throw error;
    }


    // 5. Membuat tabel konfigurasi aplikasi.
    await sql`
      CREATE TABLE IF NOT EXISTS app_config (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT
      );
    `;
    await sql`
        INSERT INTO app_config (key, value)
        VALUES ('maintenance_mode', 'false')
        ON CONFLICT (key) DO NOTHING;
    `;
}

async function loginOrRegisterUser(profile) {
    const { email, name, picture } = profile;
    
    const { rows } = await sql`SELECT email, name, picture, role, school_id, assigned_classes FROM users WHERE email = ${email}`;
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
            RETURNING email, name, picture, role, school_id, assigned_classes;
        `;
        user = newRows[0];
        user.assigned_classes = user.assigned_classes || [];
    }

    const { rows: configRows } = await sql`SELECT value FROM app_config WHERE key = 'maintenance_mode'`;
    const isMaintenance = configRows[0]?.value === 'true';

    if (isMaintenance && user.role !== 'SUPER_ADMIN') {
        return { maintenance: true };
    }
    
    return { user };
}


export default async function handler(request, response) {
    try {
        await setupTables();

        if (request.method === 'POST') {
            const { action, payload, userEmail } = request.body;

            if (!action) {
                return response.status(400).json({ error: 'Action is required' });
            }

            if (action === 'getMaintenanceStatus') {
                 const { rows: configRows } = await sql`SELECT value FROM app_config WHERE key = 'maintenance_mode'`;
                 const isMaintenance = configRows[0]?.value === 'true';
                 return response.status(200).json({ isMaintenance });
            }

            if (action !== 'loginOrRegister' && !userEmail) {
                return response.status(400).json({ error: 'userEmail is required for this action' });
            }
            
            let user = null;
            if (action !== 'loginOrRegister') {
                const { rows: userRows } = await sql`SELECT email, role, school_id FROM users WHERE email = ${userEmail}`;
                if (userRows.length === 0) {
                    return response.status(403).json({ error: 'Forbidden: User not found' });
                }
                user = userRows[0];
            }
            
            switch (action) {
                case 'loginOrRegister': {
                    if (!payload || !payload.profile) {
                        return response.status(400).json({ error: 'Profile payload is required' });
                    }
                    const loginResult = await loginOrRegisterUser(payload.profile);
                    
                    if (loginResult.maintenance) {
                        return response.status(200).json({ maintenance: true });
                    }

                    const loggedInUser = loginResult.user;
                    const { rows: dataRows } = await sql`SELECT students_by_class, saved_logs FROM absensi_data WHERE user_email = ${loggedInUser.email}`;
                    const userData = dataRows[0] || { students_by_class: {}, saved_logs: [] };
                    return response.status(200).json({ user: loggedInUser, userData });
                }
                case 'setMaintenanceStatus': {
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
                case 'getUserProfile': {
                    const { rows: userProfileRows } = await sql`SELECT email, name, picture, role, school_id, assigned_classes FROM users WHERE email = ${userEmail}`;
                    if (userProfileRows.length === 0) {
                        return response.status(404).json({ error: 'User profile not found' });
                    }
                    const userProfile = userProfileRows[0];
                    userProfile.assigned_classes = userProfile.assigned_classes || [];
                    return response.status(200).json({ userProfile });
                }
                case 'saveData': {
                    if (user.role === 'KEPALA_SEKOLAH') {
                         return response.status(403).json({ error: 'Akun Kepala Sekolah bersifat hanya-baca.' });
                    }
                    const { studentsByClass, savedLogs, actingAsSchoolId } = payload;
                    
                    // FIX: Enclosed case in a block to correctly scope this variable.
                    let finalSchoolId;
                    if (user.role === 'SUPER_ADMIN' && actingAsSchoolId) {
                        finalSchoolId = actingAsSchoolId;
                    } else {
                        finalSchoolId = user.school_id;
                    }

                    const studentsByClassJson = JSON.stringify(studentsByClass);
                    const savedLogsJson = JSON.stringify(savedLogs);
                    
                    await sql`
                        INSERT INTO absensi_data (user_email, school_id, students_by_class, saved_logs, last_updated)
                        VALUES (${userEmail}, ${finalSchoolId}, ${studentsByClassJson}, ${savedLogsJson}, NOW())
                        ON CONFLICT (user_email)
                        DO UPDATE SET
                          school_id = ${finalSchoolId},
                          students_by_class = EXCLUDED.students_by_class,
                          saved_logs = EXCLUDED.saved_logs,
                          last_updated = NOW();
                    `;
                    return response.status(200).json({ success: true });
                }
                case 'getGlobalData': {
                     if (user.role !== 'SUPER_ADMIN' && user.role !== 'KEPALA_SEKOLAH') {
                        return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
                    
                    const { schoolId } = payload;

                    let query;
                    if (user.role === 'KEPALA_SEKOLAH') {
                        if (!user.school_id) {
                             return response.status(200).json({ allData: [] });
                        }
                        query = sql`
                            SELECT ad.saved_logs, ad.students_by_class, u.name as user_name 
                            FROM absensi_data ad 
                            JOIN users u ON ad.user_email = u.email
                            WHERE ad.school_id = ${user.school_id}
                        `;
                    } else { // SUPER_ADMIN
                        if (schoolId) {
                            query = sql`
                                SELECT ad.saved_logs, ad.students_by_class, u.name as user_name 
                                FROM absensi_data ad 
                                JOIN users u ON ad.user_email = u.email
                                WHERE ad.school_id = ${schoolId}
                            `;
                        } else {
                            query = sql`
                                SELECT ad.saved_logs, ad.students_by_class, u.name as user_name 
                                FROM absensi_data ad 
                                JOIN users u ON ad.user_email = u.email
                            `;
                        }
                    }
                    
                    const { rows: allData } = await query;
                    return response.status(200).json({ allData });
                }
                case 'getAllUsers': {
                    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') {
                         return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }

                    let usersQuery;
                    if (user.role === 'SUPER_ADMIN') {
                        usersQuery = sql`
                            SELECT 
                                email, name, picture, role, school_id, assigned_classes,
                                (role = 'GURU' AND school_id IS NULL) AS is_unmanaged
                            FROM users 
                            ORDER BY name;
                        `;
                    } else { // ADMIN_SEKOLAH
                        if (!user.school_id) return response.status(200).json({ allUsers: [] });
                        usersQuery = sql`
                            SELECT 
                                email, name, picture, role, school_id, assigned_classes,
                                (role = 'GURU' AND school_id IS NULL) AS is_unmanaged
                            FROM users
                            WHERE school_id = ${user.school_id} AND role IN ('GURU', 'KEPALA_SEKOLAH')
                            ORDER BY name;
                        `;
                    }
                    const { rows: allUsers } = await usersQuery;
                    return response.status(200).json({ allUsers });
                }
                case 'getAllSchools': {
                    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') {
                         return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
                    const { rows: allSchools } = await sql`SELECT id, name FROM schools ORDER BY name;`;
                    return response.status(200).json({ allSchools });
                }
                case 'createSchool': {
                    if (user.role !== 'SUPER_ADMIN') {
                         return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
                    const { schoolName } = payload;
                    const { rows: newSchool } = await sql`INSERT INTO schools (name) VALUES (${schoolName}) RETURNING id, name;`;
                    return response.status(201).json({ success: true, school: newSchool[0] });
                }
                case 'updateUserConfiguration': {
                     if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') {
                         return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
                    const { targetEmail, newRole, newSchoolId, newClasses } = payload;
                    
                    if (user.role === 'ADMIN_SEKOLAH') {
                        if (!user.school_id) return response.status(403).json({ error: 'Admin Sekolah tidak ditugaskan ke sekolah manapun.' });

                        const { rows: targetUserRows } = await sql`SELECT school_id FROM users WHERE email = ${targetEmail}`;
                        if (targetUserRows.length === 0 || targetUserRows[0].school_id !== user.school_id) {
                            return response.status(403).json({ error: 'Anda hanya dapat mengelola pengguna di sekolah Anda sendiri.' });
                        }
                        if (newRole === 'SUPER_ADMIN' || newRole === 'ADMIN_SEKOLAH') {
                             return response.status(403).json({ error: 'Anda tidak memiliki izin untuk menetapkan peran admin.' });
                        }
                        if (newSchoolId && newSchoolId !== user.school_id.toString()) {
                             return response.status(403).json({ error: 'Anda tidak dapat memindahkan pengguna ke sekolah lain.' });
                        }
                    } else { // SUPER_ADMIN checks
                        if (SUPER_ADMIN_EMAILS.includes(targetEmail) && newRole !== 'SUPER_ADMIN') {
                            return response.status(400).json({ error: 'Cannot demote a bootstrapped Super Admin.' });
                        }
                    }
                    
                    // FIX: Enclosed case in a block to correctly scope this variable.
                    let finalSchoolId = newSchoolId === "" ? null : newSchoolId;

                    if (newRole === 'SUPER_ADMIN') {
                        finalSchoolId = null;
                    }
                    
                    const assignedClasses = newRole === 'GURU' ? newClasses : '{}';
                    
                    await sql`
                        UPDATE users 
                        SET 
                            role = ${newRole}, 
                            school_id = ${finalSchoolId}, 
                            assigned_classes = ${assignedClasses}
                        WHERE email = ${targetEmail}`;
                    
                    return response.status(200).json({ success: true });
                }
                case 'generateAiRecommendation': {
                    if (user.role !== 'SUPER_ADMIN' && user.role !== 'KEPALA_SEKOLAH') {
                        return response.status(403).json({ error: 'Forbidden: Access denied' });
                    }
    
                    try {
                        if (!process.env.API_KEY) {
                            console.error('SERVER_CONFIGURATION_ERROR: GEMINI_API_KEY is not set in environment variables.');
                            return response.status(500).json({ error: 'Gagal menghasilkan rekomendasi: Konfigurasi server tidak lengkap.', details: 'Kunci API untuk layanan AI tidak ditemukan di lingkungan server.' });
                        }
                        
                        const { preprocessedData } = payload;
    
                        if (!preprocessedData || preprocessedData.length === 0) {
                             return response.status(200).json({ success: true, recommendation: "Tidak ada data absensi yang relevan untuk dianalisis." });
                        }
    
                        const prompt = `
                            Anda adalah seorang asisten kepala sekolah virtual yang cerdas dan proaktif. Tugas Anda adalah menganalisis data absensi siswa selama 30 hari terakhir dan memberikan rekomendasi yang tajam, ringkas, dan dapat ditindaklanjuti.

                            Berikut adalah data absensi yang sudah dirangkum untuk siswa dengan total absensi tertinggi dalam format JSON. Setiap siswa memiliki total jumlah absensi berdasarkan status (S=Sakit, I=Izin, A=Alpa).
                            Data: ${JSON.stringify(preprocessedData)}

                            Berdasarkan data di atas, lakukan hal berikut:
                            1.  **Identifikasi Peringatan Dini:** Cari 5 siswa dengan jumlah total absensi (S+I+A) tertinggi. Tampilkan dalam format daftar bernomor. Untuk setiap siswa, sebutkan NAMA LENGKAP, KELAS, dan rincian jumlah absensi (Contoh: Total 8 kali: 5 Alpa, 2 Sakit, 1 Izin).
                            2.  **Temukan Pola Tersembunyi:** Apakah ada tren yang menarik? Misalnya, kelas dengan total absensi 'Sakit' yang tinggi, atau dominasi absensi 'Alpa' secara keseluruhan. Sebutkan 1-2 pola paling signifikan yang Anda temukan berdasarkan data agregat. (Catatan: Anda tidak memiliki data harian, jadi fokus pada tren agregat).
                            3.  **Berikan Rekomendasi Konkret:** Berikan 2-3 rekomendasi yang jelas dan dapat langsung ditindaklanjuti oleh kepala sekolah atau guru BK. Rekomendasi harus berhubungan langsung dengan temuan Anda di atas.

                            Gunakan format Markdown untuk jawaban Anda dengan heading, bold, dan list agar mudah dibaca.
                        `;
                        
                        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
                        const geminiResponse = await ai.models.generateContent({
                            model: 'gemini-2.5-flash',
                            contents: prompt
                        });
            
                        const recommendation = geminiResponse.text;
                        return response.status(200).json({ success: true, recommendation });
    
                    } catch (error) {
                        console.error('AI Recommendation processing failed:', error);
                        return response.status(500).json({ error: 'Gagal menghasilkan rekomendasi AI.', details: error.message });
                    }
                }
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
