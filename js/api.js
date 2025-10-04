import { state } from './main.js';

async function _fetch(action, payload = {}) {
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
                userEmail: state.userProfile?.email
            }),
        });
    
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            let errorMessage = `Error ${response.status}: ${errorData.error || response.statusText}`;
            if (response.status >= 500) {
                errorMessage = `Kesalahan Server (${response.status}): ${errorData.error || 'Gagal terhubung ke database.'}`;
            }
            throw new Error(errorMessage);
        }
    
        return response.json();
    } catch (error) {
        console.error(`Panggilan API '${action}' gagal:`, error);
        
        if (error.message.startsWith('Kesalahan Server') || error.message.startsWith('Error')) {
            throw error;
        }
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

    async getHistoryData(params) {
        return await _fetch('getHistoryData', params);
    },
    
    async getDashboardData(params) {
        return await _fetch('getDashboardData', params);
    },

    async getRecapData(params) {
        return await _fetch('getRecapData', params);
    },
    
    async getSchoolStudentData(schoolId) {
        return await _fetch('getSchoolStudentData', { schoolId });
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

    async updateUserConfiguration(targetEmail, newRole, newSchoolId, newClasses, newJurisdictionId) {
        return await _fetch('updateUserConfiguration', { targetEmail, newRole, newSchoolId, newClasses, newJurisdictionId });
    },

    async updateUsersBulkConfiguration({ targetEmails, newRole, newSchoolId }) {
        return await _fetch('updateUsersBulk', { targetEmails, newRole, newSchoolId });
    },

    async getMaintenanceStatus() {
        return await _fetch('getMaintenanceStatus');
    },

    async setMaintenanceStatus(enabled) {
        return await _fetch('setMaintenanceStatus', { enabled });
    },

    async generateAiRecommendation(params) {
        return await _fetch('generateAiRecommendation', params);
    },

    // Jurisdiction APIs
    async getJurisdictionTree() {
        return await _fetch('getJurisdictionTree');
    },
    async createJurisdiction(name, type, parentId) {
        return await _fetch('createJurisdiction', { name, type, parentId });
    },
    async updateJurisdiction(id, name, type) {
        return await _fetch('updateJurisdiction', { id, name, type });
    },
    async deleteJurisdiction(id) {
        return await _fetch('deleteJurisdiction', { id });
    },
    async getSchoolsForJurisdiction(jurisdictionId) {
        return await _fetch('getSchoolsForJurisdiction', { jurisdictionId });
    },
    async assignSchoolToJurisdiction(schoolId, jurisdictionId) {
        return await _fetch('assignSchoolToJurisdiction', { schoolId, jurisdictionId });
    }
};
