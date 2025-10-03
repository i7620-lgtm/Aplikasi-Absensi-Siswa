
// This promise will be initialized on the first call and reused on subsequent
// calls within the same serverless function instance.
let dbSetupPromise = null;

async function runSetup(sql) {
    console.log("Running database schema setup for this instance...");
    try {
        // 1. Create 'schools' table
        await sql`
          CREATE TABLE IF NOT EXISTS schools (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `;
    
        // 2. Create 'users' table
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
    
        // 3. Handle migrations for existing users table
        try {
            await sql`ALTER TABLE users ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL;`;
        } catch (error) {
            if (error.code !== '42701') throw error; // Ignore if column already exists
        }
         try {
            await sql`ALTER TABLE users ADD COLUMN assigned_classes TEXT[] DEFAULT '{}'`;
        } catch (error)
            if (error.code !== '42701') throw error; // Ignore if column already exists
        }
        
        // Ensure default value for newly added column is not null
        await sql`UPDATE users SET assigned_classes = '{}' WHERE assigned_classes IS NULL`;
    
        // 4. Create 'absensi_data' table with data isolation per school
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
    
    
        // 5. Create application configuration table
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
        console.log("Database schema setup completed successfully for this instance.");
    } catch(error) {
        console.error("Failed to setup tables:", error);
        // Reset promise on failure to allow retry on the next request in this instance
        dbSetupPromise = null; 
        throw error;
    }
}

/**
 * Ensures the database tables are set up.
 * The setup process is only run once per serverless function instance to prevent
 * performance issues and connection timeouts.
 * @param {object} sql The Vercel Postgres sql instance.
 */
export default async function setupTables(sql) {
    if (!dbSetupPromise) {
        dbSetupPromise = runSetup(sql);
    }
    return dbSetupPromise;
}
