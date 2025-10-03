export default async function setupTables(sql) {
    try {
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
    } catch(error) {
        console.error("Gagal melakukan setup tabel:", error);
        throw error;
    }
}
