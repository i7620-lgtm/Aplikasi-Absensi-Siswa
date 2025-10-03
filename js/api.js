import { state } from './main.js';

async function _fetch(action, payload = {}) {
    // Secara proaktif memeriksa status offline untuk memberikan pesan error yang lebih baik.
    if (!navigator.onLine) {
        throw new Error('Koneksi internet terputus. Silakan periksa jaringan Anda.');
    }
    
    try {
        const response = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                payload,
                userEmail: state.userProfile?.email // Mengirim email pengguna terotentikasi untuk verifikasi
            }),
        });
    
        if (!response.ok) {
            const errorText = await response.text();
            let errorData = {};
            let isJson = false;

            try {
                errorData = JSON.parse(errorText);
                isJson = true;
            } catch (e) {
                // Bukan respons JSON, errorData tetap {}, error ada di errorText
            }
            
            console.log('Server Error Response:', errorData);

            // --- LOGIKA PENANGANAN ERROR DEFINITIF ---
            // 1. Periksa kode error spesifik yang kita kirim dari server.
            const isKnownDbError = isJson && errorData.errorCode === 'DB_CONNECTION_FAILED';
            
            // 2. Periksa tanda-tanda umum crash fungsi serverless (misalnya, timeout).
            const isServerlessCrash = !isJson && /FUNCTION_INVOCATION_FAILED|database connection|timeout/i.test(errorText);
            
            // 3. (PALING PENTING) Tangani kasus di mana server crash dengan respons kosong.
            //    Kita mengasumsikan 500 pada panggilan API pertama adalah masalah koneksi DB.
            const isGenericStartupFailure = response.status === 500 && action === 'getMaintenanceStatus' && !isJson && errorText.trim() === '';

            if (isKnownDbError || isServerlessCrash || isGenericStartupFailure) {
                const details = isJson 
                    ? errorData.details 
                    : 'Fungsi server gagal dieksekusi, kemungkinan besar karena timeout koneksi database atau sedang dalam proses aktifasi.';
                throw new Error(`CRITICAL: ${details}`);
            }
            // --- AKHIR LOGIKA PENANGANAN ERROR DEFINITIF ---

            let errorMessage;
            if (response.status >= 500) {
                errorMessage = `Terjadi masalah pada server (Error ${response.status}). Coba lagi nanti.`;
            } else {
                errorMessage = `Error ${response.status}: ${errorData.error || response.statusText}`;
            }
            throw new Error(errorMessage);
        }
    
        return response.json();
    } catch (error) {
        // Blok catch terpadu ini menangani error jaringan (seperti 'Failed to fetch') 
        // dan error HTTP yang dilempar dari blok di atas.
        console.error(`Panggilan API '${action}' gagal:`, error);
        
        // Periksa apakah ini adalah pesan error kritis yang sudah diformat.
        if (error.message.startsWith('CRITICAL:')) {
            throw error;
        }
        // Menyebarkan error yang sudah ramah pengguna.
        if (error.message.startsWith('Koneksi internet terputus')) {
            throw error; 
        }
        // Melempar pesan error yang lebih umum dan ramah pengguna untuk masalah koneksi lainnya.
        throw new Error('Gagal berkomunikasi dengan server. Konektivitas terbatas.');
    }
}

export const apiService = {
    async loginOrRegisterUser(profile) {
        return await _fetch('loginOrRegister', { profile });
    },

    async getUserProfile() {
        return await _fetch('getUserProfile');
    },

    async saveData(data) {
        const payload = {
            ...data,
            actingAsSchoolId: state.adminActingAsSchool?.id || null,
        };
        return await _fetch('saveData', payload);
    },

    async getGlobalData(schoolId = null) {
        return await _fetch('getGlobalData', { schoolId });
    },

    async getAllUsers() {
        return await _fetch('getAllUsers');
    },

    async getAllSchools() {
        return await _fetch('getAllSchools');
    },

    async createSchool(schoolName) {
        return await _fetch('createSchool', { schoolName });
    },

    async updateUserConfiguration(targetEmail, newRole, newSchoolId, newClasses) {
        return await _fetch('updateUserConfiguration', { targetEmail, newRole, newSchoolId, newClasses });
    },

    async updateUsersBulkConfiguration({ targetEmails, newRole, newSchoolId }) {
        return await _fetch('updateUsersBulk', { targetEmails, newRole, newSchoolId });
    },

    async getMaintenanceStatus() {
        // Tidak memerlukan payload atau userEmail
        return await _fetch('getMaintenanceStatus');
    },

    async setMaintenanceStatus(enabled) {
        return await _fetch('setMaintenanceStatus', { enabled });
    },

    async generateAiRecommendation(preprocessedData, dateRangeContext) {
        return await _fetch('generateAiRecommendation', { preprocessedData, dateRangeContext });
    }
};
