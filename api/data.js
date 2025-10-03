import { sql } from '@vercel/postgres';
import setupTables from './utils/dbSetup.js';
import handleLoginOrRegister from './handlers/authHandler.js';
import { handleGetMaintenanceStatus, handleSetMaintenanceStatus } from './handlers/configHandler.js';
import { handleGetAllUsers, handleUpdateUserConfiguration, handleUpdateUsersBulk } from './handlers/userHandler.js';
import { handleGetAllSchools, handleCreateSchool } from './handlers/schoolHandler.js';
import { handleSaveData, handleGetGlobalData } from './handlers/attendanceHandler.js';
import handleAiRecommendation from './handlers/aiHandler.js';

// --- KONFIGURASI ---
// Daftar email yang akan otomatis menjadi SUPER_ADMIN saat pertama kali login.
export const SUPER_ADMIN_EMAILS = ['i7620@guru.sd.belajar.id', 'admin@sekolah.com'];

export default async function handler(request, response) {
    try {
        await setupTables(sql);

        if (request.method !== 'POST') {
            return response.status(405).json({ error: 'Method Not Allowed' });
        }

        const { action, payload, userEmail } = request.body;

        if (!action) {
            return response.status(400).json({ error: 'Action is required' });
        }
        
        // Tindakan publik yang tidak memerlukan autentikasi pengguna
        if (action === 'getMaintenanceStatus') {
            return await handleGetMaintenanceStatus({ sql, response });
        }
        if (action === 'loginOrRegister') {
            if (!payload || !payload.profile) {
                return response.status(400).json({ error: 'Profile payload is required' });
            }
            return await handleLoginOrRegister({ payload, sql, response, SUPER_ADMIN_EMAILS });
        }

        // --- DARI TITIK INI, SEMUA TINDAKAN MEMERLUKAN PENGGUNA TERAUTENTIKASI ---
        if (!userEmail) {
            return response.status(400).json({ error: 'userEmail is required for this action' });
        }

        const { rows: userRows } = await sql`SELECT email, role, school_id, assigned_classes FROM users WHERE email = ${userEmail}`;
        if (userRows.length === 0) {
            return response.status(403).json({ error: 'Forbidden: User not found' });
        }
        const user = userRows[0];
        
        // Membuat objek handler untuk pemetaan yang lebih bersih
        const actionHandlers = {
            // Config
            setMaintenanceStatus: handleSetMaintenanceStatus,
            // User
            getUserProfile: (params) => response.status(200).json({ userProfile: params.user }), // Aksi sederhana bisa langsung ditangani
            getAllUsers: handleGetAllUsers,
            updateUserConfiguration: handleUpdateUserConfiguration,
            updateUsersBulk: handleUpdateUsersBulk,
            // School
            getAllSchools: handleGetAllSchools,
            createSchool: handleCreateSchool,
            // Attendance
            saveData: handleSaveData,
            getGlobalData: handleGetGlobalData,
            // AI
            generateAiRecommendation: handleAiRecommendation,
        };

        const handlerFunction = actionHandlers[action];
        if (handlerFunction) {
            return await handlerFunction({ payload, user, sql, response });
        } else {
            return response.status(400).json({ error: 'Invalid action' });
        }

    } catch (error) {
        console.error('API Error:', error);
        // Periksa error koneksi database yang umum untuk memberikan pesan yang lebih jelas.
        const isConnectionError = /connect|database|env var|does not exist|credentials|timeout/i.test(error.message);
        if (isConnectionError) {
            return response.status(500).json({ 
                error: 'Kesalahan Koneksi Database', 
                details: 'Server tidak dapat terhubung ke database. Silakan periksa konfigurasi lingkungan Vercel atau status database.' 
            });
        }
        return response.status(500).json({ error: 'Terjadi kesalahan internal pada server.', details: error.message });
    }
}
