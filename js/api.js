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
            const errorData = await response.json().catch(() => ({}));
            let errorMessage;

            if (response.status >= 500) {
                 // Periksa pesan error kustom dari backend kami.
                if (errorData.error && errorData.error.includes('Koneksi Database')) {
                     errorMessage = 'Gagal terhubung ke layanan data. Ini mungkin masalah sementara.';
                } else {
                     errorMessage = `Terjadi masalah pada server (Error ${response.status}). Coba lagi nanti.`;
                }
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
        
        // Memeriksa apakah ini sudah merupakan pesan yang ramah untuk menghindari pesan error bertumpuk.
        if (error.message.startsWith('Gagal terhubung')) {
            throw error; // Menyebarkan error yang sudah ramah pengguna.
        }
        // Melempar pesan error yang lebih umum dan ramah pengguna untuk masalah koneksi.
        throw new Error('Gagal terhubung ke server. Periksa koneksi internet Anda.');
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
