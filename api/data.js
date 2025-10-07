import { sql, db } from '@vercel/postgres';
import { GoogleGenAI } from "@google/genai";
import { Redis } from '@upstash/redis';

// Import Handlers
import handleLoginOrRegister, { handleInitializeDatabase } from './handlers/authHandler.js';
import { handleGetUpdateSignal } from './handlers/configHandler.js';
import { handleGetAllUsers, handleUpdateUserConfiguration, handleUpdateUsersBulk, handleGetInitialData } from './handlers/userHandler.js';
import { handleGetAllSchools, handleCreateSchool } from './handlers/schoolHandler.js';
import { handleSaveData, handleGetHistoryData, handleGetSchoolStudentData, handleGetChangesSince } from './handlers/attendanceHandler.js';
import handleGetDashboardData from './handlers/dashboardHandler.js';
import handleGetRecapData from './handlers/recapHandler.js';
import handleAiRecommendation from './handlers/aiHandler.js';
import handleGetParentData from './handlers/parentHandler.js';
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
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    redis = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });
    console.log("Klien Upstash Redis (via Vercel KV) berhasil diinisialisasi.");
} else {
    console.warn("Variabel lingkungan Vercel KV tidak diatur. Fitur sinyal pembaruan cepat akan dinonaktifkan.");
}


// --- LOGIKA UTAMA HANDLER ---
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }
    
    const { action, payload, userEmail } = request.body;

    // --- PERBAIKAN: Tangani aksi publik yang tidak memerlukan DB terlebih dahulu ---
    if (action === 'getAuthConfig') {
        try {
            const clientId = process.env.GOOGLE_CLIENT_ID;
            if (!clientId) {
                console.error("SERVER_CONFIGURATION_ERROR: GOOGLE_CLIENT_ID is not set in environment variables.");
                return response.status(503).json({ error: 'Konfigurasi otentikasi server tidak lengkap.' });
            }
            return response.status(200).json({ clientId });
        } catch (e) {
            console.error(`Aksi 'getAuthConfig' gagal secara tak terduga:`, e);
            return response.status(500).json({ error: 'Terjadi kesalahan internal pada server saat mengambil konfigurasi.' });
        }
    }

    // --- Lanjutkan dengan aksi yang memerlukan DB ---
    const context = { 
        payload, 
        response, 
        userEmail,
        SUPER_ADMIN_EMAILS, 
        GoogleGenAI, 
        redis, 
        sql,
        db
    };

    try {
        if (!action) {
            return response.status(400).json({ error: 'Action is required' });
        }
        
        // --- Tindakan Publik yang memerlukan DB ---
        const publicDbActions = {
            'loginOrRegister': () => handleLoginOrRegister(context),
            'initializeDatabase': () => handleInitializeDatabase(context),
        };
        if (publicDbActions[action]) {
            return await publicDbActions[action]();
        }
        
        // --- Tindakan Terotentikasi ---
        if (!userEmail) {
            return response.status(401).json({ error: 'Unauthorized: userEmail is required' });
        }
        
        const { rows: userRows } = await context.sql`
            SELECT u.email, u.name, u.picture, u.role, u.school_id, u.jurisdiction_id, u.assigned_classes, j.name as jurisdiction_name 
            FROM users u
            LEFT JOIN jurisdictions j ON u.jurisdiction_id = j.id
            WHERE u.email = ${userEmail}`;

        // NEW: Independently check if the user is a parent, regardless of their primary role.
        const { rows: parentCheck } = await context.sql`
            SELECT 1 FROM change_log
            WHERE event_type = 'STUDENT_LIST_UPDATED'
            AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(payload->'students') as s
                WHERE s->>'parentEmail' = ${userEmail}
            )
            LIMIT 1;
        `;
        const isParent = parentCheck.length > 0;

        if (userRows.length === 0) {
            if (isParent) {
                // User is ONLY a parent, not in the users table.
                context.user = { email: userEmail, role: 'ORANG_TUA', isParent: true };
            } else {
                return response.status(403).json({ error: 'Forbidden: User not found' });
            }
        } else {
            // User exists in the users table. Add the `isParent` flag.
            context.user = userRows[0];
            context.user.isParent = isParent;
        }


        const authenticatedActions = {
            'getUserProfile': () => response.status(200).json({ userProfile: context.user }),
            'getInitialData': () => handleGetInitialData(context),
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
        console.error(`API Action '${action}' failed unexpectedly:`, error);
        
        if (error.code === 'DB_NOT_INITIALIZED' || error.code === 'DATABASE_NOT_INITIALIZED') {
            return response.status(503).json({ 
                error: 'Database is not initialized.', 
                code: 'DATABASE_NOT_INITIALIZED' 
            });
        }
        
        const criticalErrors = ['failed to connect', 'timeout', 'econnrefused', 'gagal terhubung', 'database initialization failed', 'cannot find package'];
        const errorMessage = (error.message || '').toLowerCase();
        if (criticalErrors.some(keyword => errorMessage.includes(keyword))) {
            return response.status(503).json({
                error: 'Gagal terhubung ke database atau dependensi server hilang.',
                details: 'Server tidak dapat membuat koneksi ke database atau salah satu library penting tidak ditemukan. Pastikan semua dependensi telah diinstal di server.'
            });
        }

        return response.status(500).json({ 
            error: 'Terjadi kesalahan internal pada server.', 
            details: error.message 
        });
    }
}
