import { sql } from './data.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const tables = ['jurisdictions', 'schools', 'users', 'change_log', 'holidays'];
        let sqlDump = `-- ===================================================================\n`;
        sqlDump += `-- Backup SQL Dump dari Aplikasi (Migrasi Neon ke Supabase)\n`;
        sqlDump += `-- Buka Dashboard Supabase -> SQL Editor -> Klik "+ New query" -> Paste isi file ini -> Klik "Run"\n`;
        sqlDump += `-- ===================================================================\n\n`;
        
        // 1. SCHEMA SETUP (Jika belum ada)
        sqlDump += `-- 1. MEMBUAT STRUKTUR TABEL (SCHEMA)\n`;
        sqlDump += `CREATE TABLE IF NOT EXISTS jurisdictions (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, parent_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW());\n`;
        sqlDump += `CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL, settings JSONB DEFAULT '{"workDays": [1, 2, 3, 4, 5, 6]}');\n`;
        sqlDump += `CREATE TABLE IF NOT EXISTS users (email VARCHAR(255) PRIMARY KEY, name VARCHAR(255), picture TEXT, role VARCHAR(50) DEFAULT 'GURU', school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL, assigned_classes TEXT[] DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL, last_login TIMESTAMPTZ);\n`;
        sqlDump += `CREATE TABLE IF NOT EXISTS change_log (\n    id BIGSERIAL PRIMARY KEY,\n    school_id INTEGER NOT NULL,\n    user_email VARCHAR(255) NOT NULL,\n    event_type VARCHAR(50) NOT NULL,\n    payload JSONB NOT NULL,\n    created_at TIMESTAMPTZ DEFAULT NOW()\n);\n`;
        sqlDump += `CREATE TABLE IF NOT EXISTS holidays (\n    id SERIAL PRIMARY KEY,\n    date DATE NOT NULL,\n    description TEXT,\n    scope VARCHAR(20) NOT NULL,\n    reference_id INTEGER,\n    created_at TIMESTAMPTZ DEFAULT NOW(),\n    created_by_email VARCHAR(255)\n);\n\n`;

        sqlDump += `-- 2. MEMASUKKAN DATA\n`;
        for (const table of tables) {
            const rows = await sql.unsafe(`SELECT * FROM ${table} ORDER BY created_at ASC`);
            if (rows.length > 0) {
                sqlDump += `\n-- Data untuk tabel ${table}\n`;
                for (const row of rows) {
                    const columns = Object.keys(row).join(', ');
                    const values = Object.values(row).map(val => {
                        if (val === null) return 'NULL';
                        if (val instanceof Date) return `'${val.toISOString()}'`;
                        if (Array.isArray(val)) {
                            return `ARRAY[${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')}]::text[]`;
                        }
                        if (typeof val === 'object') {
                            return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
                        }
                        return `'${String(val).replace(/'/g, "''")}'`;
                    }).join(', ');
                    
                    sqlDump += `INSERT INTO ${table} (${columns}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
                }
            }
        }
        
        sqlDump += `\n\n-- 3. MENGATUR ULANG URUTAN ID AUTO-INCREMENT\n`;
        sqlDump += `SELECT setval('jurisdictions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM jurisdictions));\n`;
        sqlDump += `SELECT setval('schools_id_seq', (SELECT COALESCE(MAX(id), 1) FROM schools));\n`;
        sqlDump += `SELECT setval('change_log_id_seq', (SELECT COALESCE(MAX(id), 1) FROM change_log));\n`;
        sqlDump += `SELECT setval('holidays_id_seq', (SELECT COALESCE(MAX(id), 1) FROM holidays));\n`;
        
        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', 'attachment; filename="migrasi-neon-ke-supabase.sql"');
        return res.status(200).send(sqlDump);

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
