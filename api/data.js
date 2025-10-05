import { sql } from '@vercel/postgres';
import { GoogleGenAI } from "@google/genai";

// Import Handlers
import handleLoginOrRegister from './handlers/authHandler.js';
import { handleGetMaintenanceStatus, handleSetMaintenanceStatus, handleGetUpdateSignal } from './handlers/configHandler.js';
import { handleGetAllUsers, handleUpdateUserConfiguration, handleUpdateUsersBulk, handleGetFullUserData } from './handlers/userHandler.js';
import { handleGetAllSchools, handleCreateSchool } from './handlers/schoolHandler.js';
import { handleSaveData, handleGetHistoryData, handleGetSchoolStudentData, handleGetChangesSince } from './handlers/attendanceHandler.js';
import handleGetDashboardData from './handlers/dashboardHandler.js';
import handleGetRecapData from './handlers/recapHandler.js';
import handleAiRecommendation from './handlers/aiHandler.js';
import handleGetParentData from './handlers/parentHandler.js'; // New
import { 
    handleGetJurisdictionTree, 
    handleCreateJurisdiction, 
    handleUpdateJurisdiction, 
    handleDeleteJurisdiction, 
    handleGetSchoolsForJurisdiction, 
    handleAssignSchoolToJurisdiction 
} from './handlers/jurisdictionHandler.js';


// --- KONFIGURASI ---
export const SUPER_ADMIN_EMAILS = ['i7620@guru.sd.belajar.id', 'admin@sekolah.com'];

// --- FUNGSI MIGRASI DATA ---
async function runMigrations() {
    console.log("Memeriksa status migrasi...");
    const { rows: executed } = await sql`SELECT name FROM migrations WHERE name = 'migrate_legacy_logs_to_changelog_v2'`;
    if (executed.length > 0) {
        console.log("Migrasi data lama ke change_log sudah dijalankan. Melewati.");
        return;
    }

    console.log("Memulai migrasi data dari 'absensi_data' ke 'change_log'...");
    const { rows: legacyData } = await sql`
        SELECT user_email, school_id, students_by_class, saved_logs 
        FROM absensi_data 
        WHERE saved_logs IS NOT NULL AND jsonb_array_length(saved_logs) > 0;
    `;

    if (legacyData.length === 0) {
        console.log("Tidak ada data lama yang perlu dimigrasi.");
        await sql`INSERT INTO migrations (name) VALUES ('migrate_legacy_logs_to_changelog_v2')`;
        return;
    }

    const client = await sql.connect();
    try {
        await client.query('BEGIN');
        console.log(`Ditemukan ${legacyData.length} pengguna dengan data lama untuk dimigrasi.`);

        for (const row of legacyData) {
            // Migrasi log absensi
            for (const log of row.saved_logs) {
                const payload = {
                    class: log.class,
                    date: log.date,
                    attendance: log.attendance
                };
                const createdAt = log.lastModified || new Date().toISOString();
                
                await client.query(
                    `INSERT INTO change_log (school_id, user_email, event_type, payload, created_at) VALUES ($1, $2, 'ATTENDANCE_UPDATED', $3, $4)`,
                    [row.school_id, row.user_email, JSON.stringify(payload), createdAt]
                );
            }
            
            // Migrasi daftar siswa
            if (row.students_by_class) {
                 for (const className in row.students_by_class) {
                    const studentData = row.students_by_class[className];
                    const payload = {
                        class: className,
                        students: studentData.students || []
                    };
                    const createdAt = studentData.lastModified || new Date().toISOString();
                    
                     await client.query(
                        `INSERT INTO change_log (school_id, user_email, event_type, payload, created_at) VALUES ($1, $2, 'STUDENT_LIST_UPDATED', $3, $4)`,
                        [row.school_id, row.user_email, JSON.stringify(payload), createdAt]
                    );
                 }
            }
        }

        await client.query(`INSERT INTO migrations (name) VALUES ('migrate_legacy_logs_to_changelog_v2')`);
        await client.query('COMMIT');
        console.log("Migrasi data lama berhasil diselesaikan.");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Gagal melakukan migrasi data:", error);
        throw error; // Hentikan proses jika migrasi gagal
    } finally {
        client.release();
    }
}


// --- SETUP DATABASE YANG EFISIEN ---
let dbSetupPromise = null;
async function setupTables() {
    if (dbSetupPromise) return dbSetupPromise;
    dbSetupPromise = (async () => {
        try {
            console.log("Menjalankan setup skema database untuk instans ini...");
            await sql`CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());`;
            await sql`CREATE TABLE IF NOT EXISTS jurisdictions (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, parent_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW());`;
            try { await sql`ALTER TABLE schools ADD COLUMN jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;`; } catch (e) { if (e.code !== '42701') throw e; }
            
            await sql`CREATE TABLE IF NOT EXISTS users (email VARCHAR(255) PRIMARY KEY, name VARCHAR(255), picture TEXT, role VARCHAR(50) DEFAULT 'GURU', school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL, assigned_classes TEXT[] DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), last_login TIMESTAMPTZ);`;
            try { await sql`ALTER TABLE users ADD COLUMN jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;`; } catch (e) { if (e.code !== '42701') throw e; }
            // --- FIX: Ensure last_login column exists for older schemas ---
            try { await sql`ALTER TABLE users ADD COLUMN last_login TIMESTAMPTZ;`; } catch (e) { if (e.code !== '42701') throw e; }
            
            // --- SKEMA BARU: DELTA SYNC ---
            await sql`CREATE TABLE IF NOT EXISTS change_log (
                id SERIAL PRIMARY KEY,
                school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
                user_email VARCHAR(255) REFERENCES users(email) ON DELETE SET NULL,
                event_type VARCHAR(50) NOT NULL,
                payload JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );`;
            
            // Tabel untuk migrasi
            await sql`CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, name VARCHAR(255) UNIQUE, executed_at TIMESTAMPTZ DEFAULT NOW());`;

            // Tabel lama (tetap ada untuk proses migrasi)
            await sql`CREATE TABLE IF NOT EXISTS absensi_data (user_email VARCHAR(255) PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE, school_id INTEGER, students_by_class JSONB, saved_logs JSONB, last_updated TIMESTAMPTZ DEFAULT NOW());`;
            
            // --- OPTIMASI: MENAMBAHKAN INDEX UNTUK KINERJA KEUERI ---
            console.log("Memeriksa dan membuat indeks database untuk optimasi...");
            // Index untuk foreign keys yang sering di-join/filter
            await sql`CREATE INDEX IF NOT EXISTS idx_schools_jurisdiction_id ON schools (jurisdiction_id);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_jurisdictions_parent_id ON jurisdictions (parent_id);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_users_school_id ON users (school_id);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_users_jurisdiction_id ON users (jurisdiction_id);`;
            
            // Index utama untuk change_log yang mencakup filter paling umum (sekolah, tipe event, tanggal)
            await sql`CREATE INDEX IF NOT EXISTS idx_changelog_main_query ON change_log (school_id, event_type, ((payload->>'date')::date));`;
            
            // Index spesifik untuk mempercepat pencarian daftar siswa terbaru per kelas
            await sql`CREATE INDEX IF NOT EXISTS idx_changelog_latest_student_list ON change_log (school_id, (payload->>'class'), id DESC) WHERE event_type = 'STUDENT_LIST_UPDATED';`;
            
            // Index GIN untuk mempercepat pencarian di dalam array students (untuk fitur orang tua)
            await sql`CREATE INDEX IF NOT EXISTS idx_changelog_students_gin ON change_log USING GIN ((payload->'students')) WHERE event_type = 'STUDENT_LIST_UPDATED';`;


            console.log("Indeks berhasil diverifikasi/dibuat.");

            console.log("Setup skema database berhasil. Menjalankan migrasi jika diperlukan...");
            await runMigrations(); // Jalankan migrasi setelah tabel ada

        } catch (error) {
            console.error("Gagal melakukan setup tabel:", error);
            dbSetupPromise = null; 
            throw error;
        }
    })();
    return dbSetupPromise;
}

// --- LOGIKA UTAMA HANDLER ---
export default async function handler(request, response) {
    try {
        
        const { action, payload, userEmail } = request.body;
        if (!action) {
            return response.status(400).json({ error: 'Action is required' });
        }
        
        const context = { payload, sql, response, SUPER_ADMIN_EMAILS, GoogleGenAI };
        
        // Cek tindakan publik yang tidak memerlukan setup database penuh
        if (action === 'getMaintenanceStatus') {
            return await handleGetMaintenanceStatus(context);
        }

        await setupTables();

        if (request.method !== 'POST') {
            return response.status(405).json({ error: 'Method Not Allowed' });
        }


        // --- Tindakan Publik (Tidak Memerlukan Otentikasi) ---
        const publicActions = {
            'loginOrRegister': () => handleLoginOrRegister(context),
        };

        if (publicActions[action]) {
            return await publicActions[action]();
        }

        // --- Tindakan Terotentikasi ---
        if (!userEmail) {
            return response.status(401).json({ error: 'Unauthorized: userEmail is required' });
        }
        const { rows: userRows } = await sql`SELECT email, role, school_id, jurisdiction_id, assigned_classes, name, picture FROM users WHERE email = ${userEmail}`;
        
        // --- NEW: PARENT LOGIN CHECK ---
        // If user is not in the users table, check if they are a parent.
        if (userRows.length === 0) {
            const { rows: parentCheck } = await sql`
                SELECT 1 FROM change_log
                WHERE event_type = 'STUDENT_LIST_UPDATED'
                AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(payload->'students') as s
                    WHERE s->>'parentEmail' = ${userEmail}
                )
                LIMIT 1;
            `;
            if (parentCheck.length > 0) {
                 // User is a parent, create a temporary user object for context
                 context.user = { email: userEmail, role: 'ORANG_TUA' };
            } else {
                 return response.status(403).json({ error: 'Forbidden: User not found' });
            }
        } else {
            context.user = userRows[0];
        }


        const authenticatedActions = {
            'getUserProfile': () => response.status(200).json({ userProfile: context.user }),
            'getFullUserData': () => handleGetFullUserData(context),
            'getUpdateSignal': () => handleGetUpdateSignal(context),
            'getChangesSince': () => handleGetChangesSince(context), // Baru
            'setMaintenanceStatus': () => handleSetMaintenanceStatus(context),
            'getAllUsers': () => handleGetAllUsers(context),
            'updateUserConfiguration': () => handleUpdateUserConfiguration(context),
            'updateUsersBulk': () => handleUpdateUsersBulk(context),
            'getAllSchools': () => handleGetAllSchools(context),
            'createSchool': () => handleCreateSchool(context),
            'saveData': () => handleSaveData(context),
            'getHistoryData': () => handleGetHistoryData(context),
            'getDashboardData': () => handleGetDashboardData(context),
            'getRecapData': () => handleGetRecapData(context),
            'generateAiRecommendation': () => handleAiRecommendation(context),
            'getSchoolStudentData': () => handleGetSchoolStudentData(context),
            'getParentData': () => handleGetParentData(context), // New
            // Jurisdiction Actions
            'getJurisdictionTree': () => handleGetJurisdictionTree(context),
            'createJurisdiction': () => handleCreateJurisdiction(context),
            'updateJurisdiction': () => handleUpdateJurisdiction(context),
            'deleteJurisdiction': () => handleDeleteJurisdiction(context),
            'getSchoolsForJurisdiction': () => handleGetSchoolsForJurisdiction(context),
            'assignSchoolToJurisdiction': () => handleAssignSchoolToJurisdiction(context),
        };

        if (authenticatedActions[action]) {
            return await authenticatedActions[action]();
        }

        return response.status(400).json({ error: 'Invalid action' });

    } catch (error) {
        console.error('API Error:', error);
        return response.status(500).json({ error: 'An internal server error occurred', details: error.message });
    }
}
