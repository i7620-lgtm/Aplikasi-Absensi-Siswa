import { state } from './main.js';

async function _fetch(action, payload = {}) {
    const response = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action,
            payload,
            userEmail: state.userProfile?.email // Send authenticated user's email for verification
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = `Error ${response.status}: ${errorData.error || response.statusText}`;
        if (response.status >= 500) {
            errorMessage = `Kesalahan Server (${response.status}): ${errorData.error || 'Gagal terhubung ke database. Periksa variabel lingkungan atau log Vercel.'}`;
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

export const apiService = {
    async loginOrRegisterUser(profile) {
        return await _fetch('loginOrRegister', { profile });
    },

    async getUserProfile() {
        return await _fetch('getUserProfile');
    },

    async saveData(data) {
        return await _fetch('saveData', data);
    },

    async getGlobalData() {
        return await _fetch('getGlobalData');
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

    async getMaintenanceStatus() {
        // Tidak memerlukan payload atau userEmail
        return await _fetch('getMaintenanceStatus');
    },

    async setMaintenanceStatus(enabled) {
        return await _fetch('setMaintenanceStatus', { enabled });
    }
};
