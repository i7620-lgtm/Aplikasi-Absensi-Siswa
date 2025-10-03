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
            let errorMessage = `Error ${response.status}: ${errorData.error || response.statusText}`;
            if (response.status >= 500) {
                errorMessage = `Kesalahan Server (${response.status}): ${errorData.error || 'Gagal terhubung ke database. Periksa log Vercel.'}`;
            }
            throw new Error(errorMessage);
        }
    
        return response.json();
    } catch (error) {
        // Blok catch terpadu ini menangani error jaringan (seperti 'Failed to fetch') 
        // dan error HTTP yang dilempar dari blok di atas.
        console.error(`Panggilan API '${action}' gagal:`, error);
        
        // Memeriksa apakah ini sudah merupakan pesan yang ramah untuk menghindari pesan error bertumpuk.
        if (error.message.startsWith('Kesalahan Server')) {
            throw error; // Menyebarkan error server yang spesifik.
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
