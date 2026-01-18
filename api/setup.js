
import { db } from '@vercel/postgres';

// --- SETUP DATABASE YANG EFISIEN & ROBUST ---
export async function setupDatabase() {
    // Gunakan db.connect() untuk mendapatkan client koneksi
    const client = await db.connect();
    try {
        console.log("Menjalankan setup skema database...");
        
        // 1. Buat Tabel (Aman untuk dijalankan berulang kali)
        // Kita jalankan ini dulu untuk memastikan tabel dasar ada.
        await client.query(`
            CREATE TABLE IF NOT EXISTS jurisdictions (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, parent_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW());
            CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
            CREATE TABLE IF NOT EXISTS users (email VARCHAR(255) PRIMARY KEY, name VARCHAR(255), picture TEXT, role VARCHAR(50) DEFAULT 'GURU', school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL, assigned_classes TEXT[] DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
            CREATE TABLE IF NOT EXISTS change_log (
                id BIGSERIAL PRIMARY KEY,
                school_id INTEGER NOT NULL,
                user_email VARCHAR(255) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                payload JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS holidays (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                description TEXT,
                scope VARCHAR(20) NOT NULL, -- 'NATIONAL', 'REGIONAL', 'SCHOOL'
                reference_id INTEGER, -- NULL for NATIONAL, jurisdiction_id for REGIONAL, school_id for SCHOOL
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // 2. Migrasi Kolom (Jalankan satu per satu tanpa transaksi global)
        // Ini mencegah kegagalan pada satu kolom (misal karena constraint) membatalkan penambahan kolom lain (seperti 'settings').
        const migrationQueries = [
            `ALTER TABLE schools ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;`,
            // Settings dengan default value JSONB
            `ALTER TABLE schools ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{"workDays": [1, 2, 3, 4, 5, 6]}';`,
            `ALTER TABLE holidays ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(255);`
        ];

        for (const query of migrationQueries) {
            try {
                await client.query(query);
            } catch (err) {
                // Log error tapi jangan hentikan proses setup lainnya
                console.warn(`Peringatan migrasi (mungkin sudah ada atau konflik): ${err.message}`);
                // Lanjut ke query berikutnya
            }
        }
        
        // 3. Indeks (Jalankan satu per satu juga untuk keamanan)
        const indexQueries = [
            `CREATE INDEX IF NOT EXISTS idx_schools_jurisdiction_id ON schools (jurisdiction_id);`,
            `CREATE INDEX IF NOT EXISTS idx_jurisdictions_parent_id ON jurisdictions (parent_id);`,
            `CREATE INDEX IF NOT EXISTS idx_users_school_id ON users (school_id);`,
            `CREATE INDEX IF NOT EXISTS idx_users_jurisdiction_id ON users (jurisdiction_id);`,
            `CREATE INDEX IF NOT EXISTS idx_changelog_main_query ON change_log (school_id, event_type, ((payload->>'date')::date));`,
            `CREATE INDEX IF NOT EXISTS idx_changelog_latest_student_list ON change_log (school_id, (payload->>'class'), id DESC) WHERE event_type = 'STUDENT_LIST_UPDATED';`,
            `CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays (date);`,
            `CREATE INDEX IF NOT EXISTS idx_holidays_scope_ref ON holidays (scope, reference_id);`
        ];

        for (const query of indexQueries) {
            try {
                await client.query(query);
            } catch (err) {
                console.warn(`Gagal membuat indeks (non-kritis): ${err.message}`);
            }
        }

        console.log("Setup skema database selesai.");
    } catch (error) {
        console.error("Gagal melakukan setup database utama:", error);
        throw error;
    } finally {
        client.release();
    }
}


export default async function handler(request, response) {
    // Endpoint ini bisa diamankan lebih lanjut jika diperlukan,
    // misalnya dengan secret key di query params.
    if (request.method !== 'POST' && request.method !== 'GET') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        await setupDatabase();
        return response.status(200).json({ success: true, message: 'Database setup completed successfully.' });
    } catch (error) {
        return response.status(500).json({ success: false, message: 'Database setup failed.', error: error.message });
    }
}
