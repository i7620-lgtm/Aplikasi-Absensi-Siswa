import { sql } from '@vercel/postgres';
import { GoogleGenAI } from "@google/genai";

// Import Handlers
import handleLoginOrRegister from './handlers/authHandler.js';
import { handleGetMaintenanceStatus, handleSetMaintenanceStatus } from './handlers/configHandler.js';
import { handleGetAllUsers, handleUpdateUserConfiguration, handleUpdateUsersBulk } from './handlers/userHandler.js';
import { handleGetAllSchools, handleCreateSchool } from './handlers/schoolHandler.js';
import { handleSaveData, handleGetHistoryData, handleGetSchoolStudentData } from './handlers/attendanceHandler.js';
import handleGetDashboardData from './handlers/dashboardHandler.js';
import handleGetRecapData from './handlers/recapHandler.js';
import handleAiRecommendation from './handlers/aiHandler.js';
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

// --- SETUP DATABASE YANG EFISIEN ---
let dbSetupPromise = null;
async function setupTables() {
    if (dbSetupPromise) return dbSetupPromise;
    dbSetupPromise = (async () => {
        try {
            console.log("Menjalankan setup skema database untuk instans ini...");
            await sql`CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());`;
            // Tabel Yurisdiksi Hirarkis
            await sql`CREATE TABLE IF NOT EXISTS jurisdictions (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, parent_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW());`;
            try { await sql`ALTER TABLE schools ADD COLUMN jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;`; } catch (e) { if (e.code !== '42701') throw e; }
            
            await sql`CREATE TABLE IF NOT EXISTS users (email VARCHAR(255) PRIMARY KEY, name VARCHAR(255), picture TEXT, role VARCHAR(50) DEFAULT 'GURU', school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL, assigned_classes TEXT[] DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), last_login TIMESTAMPTZ);`;
            try { await sql`ALTER TABLE users ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL;`; } catch (e) { if (e.code !== '42701') throw e; }
            try { await sql`ALTER TABLE users ADD COLUMN assigned_classes TEXT[] DEFAULT '{}'`; } catch (e) { if (e.code !== '42701') throw e; }
            try { await sql`ALTER TABLE users ADD COLUMN jurisdiction_id INTEGER REFERENCES jurisdictions(id) ON DELETE SET NULL;`; } catch (e) { if (e.code !== '42701') throw e; }
            
            await sql`UPDATE users SET assigned_classes = '{}' WHERE assigned_classes IS NULL`;
            await sql`CREATE TABLE IF NOT EXISTS absensi_data (user_email VARCHAR(255) PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE, school_id INTEGER, students_by_class JSONB, saved_logs JSONB, last_updated TIMESTAMPTZ DEFAULT NOW());`;
            try { await sql`ALTER TABLE absensi_data ADD COLUMN school_id INTEGER;`; } catch (e) { if (e.code !== '42701') throw e; }
            await sql`CREATE TABLE IF NOT EXISTS app_config (key VARCHAR(50) PRIMARY KEY, value TEXT);`;
            
            console.log("Setup skema database berhasil untuk instans ini.");
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
        if (userRows.length === 0) {
            return response.status(403).json({ error: 'Forbidden: User not found' });
        }
        context.user = userRows[0];

        const authenticatedActions = {
            'getUserProfile': () => response.status(200).json({ userProfile: context.user }),
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
