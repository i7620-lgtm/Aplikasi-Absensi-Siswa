
import { sql } from '@vercel/postgres';

// --- SETUP DATABASE YANG EFISIEN ---
async function setupDatabase() {
    // Get one client for the whole setup for robustness and efficiency
    const client = await sql.connect();
    try {
        console.log("Menjalankan setup skema database untuk instans ini...");
        
        // All CREATE TABLE statements in one go to reduce round trips.
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
        `);

        // ALTER statements need to be run separately with error handling for idempotency.
        try { await client.sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;`; } catch(e) { if(e.code !== '42701') throw e; }
        try { await client.sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;`; } catch(e) { if(e.code !== '42701') throw e; }
        try { await client.sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;`; } catch(e) { if(e.code !== '42701') throw e; }
        
        console.log("Memeriksa dan membuat indeks database untuk optimasi...");
         // All CREATE INDEX statements in one go.
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_schools_jurisdiction_id ON schools (jurisdiction_id);
            CREATE INDEX IF NOT EXISTS idx_jurisdictions_parent_id ON jurisdictions (parent_id);
            CREATE INDEX IF NOT EXISTS idx_users_school_id ON users (school_id);
            CREATE INDEX IF NOT EXISTS idx_users_jurisdiction_id ON users (jurisdiction_id);
            CREATE INDEX IF NOT EXISTS idx_changelog_main_query ON change_log (school_id, event_type, ((payload->>'date')::date));
            CREATE INDEX IF NOT EXISTS idx_changelog_latest_student_list ON change_log (school_id, (payload->>'class'), id DESC) WHERE event_type = 'STUDENT_LIST_UPDATED';
        `);
        
        console.log("Setup skema database dan indeks berhasil.");
    } catch (error) {
        console.error("Gagal melakukan setup database:", error);
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
