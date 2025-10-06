import { sql } from '@vercel/postgres';
import { GoogleGenAI } from "@google/genai";
import { Redis } from '@upstash/redis';

// Import Handlers
import handleLoginOrRegister from './handlers/authHandler.js';
import { handleGetUpdateSignal, handleGetAuthConfig } from './handlers/configHandler.js';
import { handleGetAllUsers, handleUpdateUserConfiguration, handleUpdateUsersBulk, handleGetFullUserData } from './handlers/userHandler.js';
import { handleGetAllSchools, handleCreateSchool } from './handlers/schoolHandler.js';
import { handleSaveData, handleGetHistoryData, handleGetSchoolStudentData, handleGetChangesSince } from './handlers/attendanceHandler.js';
import handleGetDashboardData from './handlers/dashboardHandler.js';
import handleGetRecapData from './handlers/recapHandler.js';
import handleAiRecommendation from './handlers/aiHandler.js';
import handleGetParentData from './handlers/parentHandler.js';
import handleMigrateLegacyData from './handlers/migrationHandler.js';
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

// --- SETUP KLIEN EKSTERNAL ---
let redis = null;
// Memperbarui untuk menggunakan variabel Vercel KV yang benar
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    redis = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });
    console.log("Klien Upstash Redis (via Vercel KV) berhasil diinisialisasi.");
} else {
    console.warn("Variabel lingkungan Vercel KV (KV_REST_API_URL, KV_REST_API_TOKEN) tidak diatur. Fitur sinyal pembaruan cepat akan dinonaktifkan dan akan kembali menggunakan DB.");
}


// --- SETUP DATABASE ---
let dbSetupPromise = null;
async function setupDatabase() {
    if (dbSetupPromise) return dbSetupPromise;
    dbSetupPromise = (async () => {
        try {
            console.log("Menjalankan setup skema database...");
            // Tabel Inti
            await sql`CREATE TABLE IF NOT EXISTS jurisdictions (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, parent_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW());`;
            await sql`CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL);`;
            await sql`CREATE TABLE IF NOT EXISTS users (email VARCHAR(255) PRIMARY KEY, name VARCHAR(255), picture TEXT, role VARCHAR(50) DEFAULT 'GURU', school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL, assigned_classes TEXT[] DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());`;
            
            // Tabel Data
            await sql`CREATE TABLE IF NOT EXISTS change_log (
                id BIGSERIAL PRIMARY KEY,
                school_id INTEGER NOT NULL,
                user_email VARCHAR(255) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                payload JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );`;

            // Migrasi Skema / Alter Table
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;`;
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;`;

            // Indeks untuk mempercepat query
            await sql`CREATE INDEX IF NOT EXISTS idx_change_log_school_id_id ON change_log (school_id, id);`;
            
            console.log("Setup skema database (tabel dan indeks) berhasil.");
        } catch (error) {
            console.error("Gagal melakukan setup database:", error);
            dbSetupPromise = null; 
            throw error;
        }
    })();
    return dbSetupPromise;
}


// --- LOGIKA UTAMA HANDLER ---
export default async function handler(request, response) {
    // Validasi metode request di awal untuk menolak permintaan yang tidak valid secepat mungkin.
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { action, payload, userEmail } = request.body;
        if (!action) {
            return response.status(400).json({ error: 'Action is required' });
        }
        
        const context = { payload, sql, response, SUPER_ADMIN_EMAILS, GoogleGenAI, redis };

        // Aksi 'getAuthConfig' adalah satu-satunya yang tidak memerlukan koneksi DB.
        if (action === 'getAuthConfig') {
            return await handleGetAuthConfig(context);
        }
        
        // Semua aksi lain memerlukan koneksi DB, jadi inisialisasi sekarang.
        await setupDatabase();
        
        // Aksi publik yang memerlukan koneksi DB
        const publicActions = {
            'loginOrRegister': () => handleLoginOrRegister(context),
        };

        if (publicActions[action]) {
            return await publicActions[action]();
        }
        
        // Dari titik ini, semua aksi memerlukan autentikasi pengguna.
        if (!userEmail) {
            return response.status(401).json({ error: 'Unauthorized: userEmail is required' });
        }
        const { rows: userRows } = await sql`SELECT email, role, school_id, jurisdiction_id, assigned_classes, name, picture FROM users WHERE email = ${userEmail}`;
        
        if (userRows.length === 0) {
            // Cek apakah pengguna adalah orang tua
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
            'getChangesSince': () => handleGetChangesSince(context),
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
            'getParentData': () => handleGetParentData(context),
            'migrateLegacyData': () => handleMigrateLegacyData(context),
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
