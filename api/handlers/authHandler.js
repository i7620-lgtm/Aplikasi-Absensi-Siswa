
import { db } from '@vercel/postgres';

// --- DATABASE SETUP LOGIC (Moved from setup.js) ---
async function setupDatabase(sql) {
    // Gunakan db.connect() untuk mendapatkan client koneksi untuk transaksi
    const client = await db.connect();
    try {
        console.log("Menjalankan setup skema database...");
        
        await client.query('BEGIN');

        // Create Tables
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
            CREATE TABLE IF NOT EXISTS calendars (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                description TEXT,
                type VARCHAR(20) NOT NULL, 
                scope_id INTEGER, 
                created_by VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(date, type, scope_id)
            );
        `);

        // Alter Tables (Idempotent)
        await client.query('ALTER TABLE schools ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;');
        await client.query('ALTER TABLE schools ADD COLUMN IF NOT EXISTS work_days INTEGER DEFAULT 6;'); 
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;');
        
        // Create Indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_schools_jurisdiction_id ON schools (jurisdiction_id);
            CREATE INDEX IF NOT EXISTS idx_jurisdictions_parent_id ON jurisdictions (parent_id);
            CREATE INDEX IF NOT EXISTS idx_users_school_id ON users (school_id);
            CREATE INDEX IF NOT EXISTS idx_users_jurisdiction_id ON users (jurisdiction_id);
            CREATE INDEX IF NOT EXISTS idx_changelog_main_query ON change_log (school_id, event_type, ((payload->>'date')::date));
            CREATE INDEX IF NOT EXISTS idx_changelog_latest_student_list ON change_log (school_id, (payload->>'class'), id DESC) WHERE event_type = 'STUDENT_LIST_UPDATED';
            CREATE INDEX IF NOT EXISTS idx_calendars_date ON calendars (date);
            CREATE INDEX IF NOT EXISTS idx_calendars_scope ON calendars (scope_id, type);
        `);

        await client.query('COMMIT');
        console.log("Setup skema database berhasil.");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Gagal melakukan setup database:", error);
        throw error;
    } finally {
        client.release();
    }
}

// --- AUTH LOGIC ---

/**
 * Core logic to find or create a user in the database.
 */
async function loginOrRegisterUser(profile, sql, SUPER_ADMIN_EMAILS) {
    const { email, name, picture } = profile;
    
    // 1. Check for an existing user
    const { rows: userRows } = await sql`
        SELECT u.email, u.name, u.picture, u.role, u.school_id, u.jurisdiction_id, u.assigned_classes, j.name as jurisdiction_name 
        FROM users u
        LEFT JOIN jurisdictions j ON u.jurisdiction_id = j.id
        WHERE u.email = ${email}`;
    let primaryUser = userRows[0];
    let primaryRole = primaryUser ? primaryUser.role : null;

    if (primaryUser) {
        await sql`UPDATE users SET last_login = NOW(), name = ${name}, picture = ${picture} WHERE email = ${email}`;
    } else if (SUPER_ADMIN_EMAILS.includes(email)) {
        primaryRole = 'SUPER_ADMIN';
    }

    // 2. Independently check if the user is a parent
    const { rows: parentCheck } = await sql`
        WITH latest_logs AS (
            SELECT DISTINCT ON (school_id, payload->>'class')
                payload->'students' as students
            FROM change_log
            WHERE event_type = 'STUDENT_LIST_UPDATED'
            ORDER BY school_id, payload->>'class', id DESC
        )
        SELECT 1 
        FROM latest_logs, jsonb_array_elements(students) as student
        WHERE student->>'parentEmail' = ${email}
        LIMIT 1;
    `;
    const isParent = parentCheck.length > 0;

    // 3. Consolidate profile
    let finalUser;
    if (primaryUser) {
        finalUser = { ...primaryUser, primaryRole: primaryUser.role, isParent };
    } else {
        if (!primaryRole) {
            primaryRole = isParent ? 'ORANG_TUA' : 'GURU';
        }
        
        if (primaryRole !== 'ORANG_TUA') {
             const { rows: newRows } = await sql`
                INSERT INTO users (email, name, picture, role, last_login, assigned_classes)
                VALUES (${email}, ${name}, ${picture}, ${primaryRole}, NOW(), '{}')
                RETURNING email, name, picture, role, school_id, jurisdiction_id, assigned_classes;
            `;
            finalUser = { ...newRows[0], primaryRole: newRows[0].role, isParent, jurisdiction_name: null };
        } else {
            finalUser = { email, name, picture, primaryRole: 'ORANG_TUA', isParent: true, school_id: null, jurisdiction_id: null, jurisdiction_name: null, assigned_classes: [] };
        }
    }
    
    finalUser.assigned_classes = finalUser.assigned_classes || [];
    return { user: finalUser };
}

export default async function handleLoginOrRegister({ payload, sql, response, SUPER_ADMIN_EMAILS }) {
    if (!payload || !payload.profile) {
        return response.status(400).json({ error: 'Profile payload is required' });
    }
    
    try {
        const { user } = await loginOrRegisterUser(payload.profile, sql, SUPER_ADMIN_EMAILS);
        return response.status(200).json({ user });

    } catch (error) {
        // Gatekeeper logic for uninitialized DB
        if (error.code === '42P01') { 
            console.error("DB tables not found. Signaling client to initialize.");
            const initError = new Error("Database not initialized, caught undefined table error.");
            initError.code = 'DATABASE_NOT_INITIALIZED'; 
            throw initError;
        }
        console.error("Error during login/register:", error);
        throw error;
    }
}

/**
 * Dedicated handler for initializing the database via api/data.js
 */
export async function handleInitializeDatabase({ response, sql }) {
    try {
        console.log("Dedicated endpoint called to initialize database.");
        await setupDatabase(sql);
        return response.status(200).json({ success: true, message: "Database setup complete." });
    } catch (error) {
        console.error("Manual database setup via dedicated endpoint failed:", error);
        return response.status(500).json({ error: "Failed to initialize database.", details: error.message });
    }
}
