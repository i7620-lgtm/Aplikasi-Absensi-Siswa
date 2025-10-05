import { sql } from '@vercel/postgres';
import { GoogleGenAI } from "@google/genai";

// Import Handlers
import handleLoginOrRegister from './handlers/authHandler.js';
import { handleGetMaintenanceStatus, handleSetMaintenanceStatus, handleGetUpdateSignal, handleGetAuthConfig } from './handlers/configHandler.js';
import { handleGetAllUsers, handleUpdateUserConfiguration, handleUpdateUsersBulk, handleGetFullUserData } from './handlers/userHandler.js';
import { handleGetAllSchools, handleCreateSchool } from './handlers/schoolHandler.js';
import { handleSaveData, handleGetHistoryData, handleGetSchoolStudentData, handleGetChangesSince } from './handlers/attendanceHandler.js';
import handleGetDashboardData from './handlers/dashboardHandler.js';
import handleGetRecapData from './handlers/recapHandler.js';
import handleAiRecommendation from './handlers/aiHandler.js';
import handleGetParentData from './handlers/parentHandler.js';
// BARU: Impor handler migrasi sisi klien
import { handleCheckAndStartClientMigration, handleUploadMigratedData } from './handlers/migrationHandler.js'; 
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

// --- SETUP DATABASE PARSIAL (DUA FASE) ---

// FASE 1: Setup super cepat, membuat SEMUA tabel esensial.
let essentialDbSetupPromise = null;
async function setupEssentialTables() {
    if (essentialDbSetupPromise) return essentialDbSetupPromise;
    essentialDbSetupPromise = (async () => {
        try {
            console.log("Menjalankan setup skema database esensial...");
            // Tabel Inti
            await sql`CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL);`;
            await sql`CREATE TABLE IF NOT EXISTS jurisdictions (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, parent_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW());`;
            await sql`CREATE TABLE IF NOT EXISTS users (email VARCHAR(255) PRIMARY KEY, name VARCHAR(255), picture TEXT, role VARCHAR(50) DEFAULT 'GURU', school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL, assigned_classes TEXT[] DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());`;
            
            // Tabel Data (dipindahkan ke sini untuk konsistensi)
            await sql`CREATE TABLE IF NOT EXISTS change_log (
                id BIGSERIAL PRIMARY KEY,
                school_id INTEGER NOT NULL,
                user_email VARCHAR(255) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                payload JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );`;
            // Tabel absensi lama, hanya ada untuk migrasi. Bisa dihapus setelah migrasi selesai.
            await sql`CREATE TABLE IF NOT EXISTS absensi_data (
                id BIGSERIAL PRIMARY KEY,
                school_id INTEGER,
                student_name VARCHAR(255),
                class VARCHAR(50),
                class_name VARCHAR(50),
                date DATE,
                status CHAR(1),
                teacher_email VARCHAR(255),
                last_updated TIMESTAMPTZ DEFAULT NOW()
            );`;
            
            // Tabel untuk melacak status migrasi
            await sql`CREATE TABLE IF NOT EXISTS migrations (name VARCHAR(255) PRIMARY KEY, executed_at TIMESTAMPTZ DEFAULT NOW());`;

            // Migrasi Skema / Alter Table
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;`;
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;`;
            
            console.log("Setup skema esensial (semua tabel) berhasil.");
        } catch (error) {
            console.error("Gagal melakukan setup tabel esensial:", error);
            essentialDbSetupPromise = null; 
            throw error;
        }
    })();
    return essentialDbSetupPromise;
}

// FASE 2: Setup lanjutan, hanya untuk optimasi (indeks).
let extendedDbSetupPromise = null;
async function setupExtendedTables() {
    if (extendedDbSetupPromise) return extendedDbSetupPromise;
    extendedDbSetupPromise = (async () => {
        try {
            console.log("Menjalankan setup skema database lanjutan (indeks)...");
            
            // Indeks untuk mempercepat query
            await sql`CREATE INDEX IF NOT EXISTS idx_change_log_school_id_id ON change_log (school_id, id);`;
            
            console.log("Setup skema lanjutan (indeks) berhasil.");
        } catch (error) {
            console.error("Gagal melakukan setup tabel lanjutan (indeks):", error);
            extendedDbSetupPromise = null;
            throw error;
        }
    })();
    return extendedDbSetupPromise;
}

// --- LOGIKA UTAMA HANDLER ---
export default async function handler(request, response) {
    try {
        const { action, payload, userEmail } = request.body;
        if (!action) {
            return response.status(400).json({ error: 'Action is required' });
        }
        
        const context = { payload, sql, response, SUPER_ADMIN_EMAILS, GoogleGenAI };
        
        // Aksi publik yang tidak memerlukan setup tabel apa pun
        if (action === 'getMaintenanceStatus') {
            return await handleGetMaintenanceStatus(context);
        }
        if (action === 'getAuthConfig') {
            return await handleGetAuthConfig(context);
        }

        // Jalankan FASE 1: Setup Esensial (sekarang membuat semua tabel)
        await setupEssentialTables();

        if (request.method !== 'POST') {
            return response.status(405).json({ error: 'Method Not Allowed' });
        }
        
        // Aksi publik yang hanya memerlukan setup esensial
        const publicActions = {
            'loginOrRegister': () => handleLoginOrRegister(context),
        };

        if (publicActions[action]) {
            return await publicActions[action]();
        }
        
        // Dari titik ini, semua aksi memerlukan setup lanjutan (indeks)
        const nonExtendedSetupActions = ['checkAndStartClientMigration', 'uploadMigratedData'];
        if (!nonExtendedSetupActions.includes(action)) {
            await setupExtendedTables();
        }


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
            'checkAndStartClientMigration': () => handleCheckAndStartClientMigration(context), // BARU
            'uploadMigratedData': () => handleUploadMigratedData(context), // BARU
            'getUserProfile': () => response.status(200).json({ userProfile: context.user }),
            'getFullUserData': () => handleGetFullUserData(context),
            'getUpdateSignal': () => handleGetUpdateSignal(context),
            'getChangesSince': () => handleGetChangesSince(context),
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
            'getParentData': () => handleGetParentData(context),
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
