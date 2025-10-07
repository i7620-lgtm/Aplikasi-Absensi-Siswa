import { state } from './main.js';
import { idb } from './db.js';

async function _fetch(url, action, payload = {}) {
    const body = {
        action,
        payload,
        userEmail: state.userProfile?.email || null,
    };
    
    // For save actions, if offline, queue it.
    if (action === 'saveData' && !navigator.onLine) {
        console.log(`Offline mode detected. Queuing action: ${action}`);
        try {
            const queue = await idb.getQueue();
            const offlineAction = { url, body };
            queue.push(offlineAction);
            await idb.setQueue(queue);
            
            // Register a sync event with the service worker
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                navigator.serviceWorker.ready.then(sw => {
                    sw.sync.register('sync-offline-actions');
                }).catch(err => console.error("Sync registration failed:", err));
            }
            
            return Promise.resolve({ success: true, queued: true, savedBy: state.userProfile.name });
        } catch (error) {
            console.error('Failed to queue offline action:', error);
            throw new Error('Gagal menyimpan data secara lokal. Coba lagi.');
        }
    }
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Gagal mem-parsing JSON error dari server.' }));
            const errorMessage = errorData.error || `Server merespons dengan status ${response.status}`;
            const error = new Error(errorMessage);
            if (errorData.code) {
                error.code = errorData.code;
            }
            throw error;
        }

        return await response.json();
    } catch (error) {
        console.error(`API call for action '${action}' failed:`, error);
        // Rethrow to be handled by the calling function
        throw error;
    }
}

export const apiService = {
    async getAuthConfig() {
        // This is a special case that doesn't use the standard _fetch wrapper
        try {
            const response = await fetch('/api/auth-config', { method: 'POST' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server responded with ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Failed to get auth config:", error);
            throw error;
        }
    },
    
    async loginOrRegisterUser(profile) {
        return await _fetch('/api/data', 'loginOrRegister', { profile });
    },
    
    async initializeDatabase() {
        return await _fetch('/api/data', 'initializeDatabase');
    },

    async getUserProfile() {
        return await _fetch('/api/data', 'getUserProfile');
    },
    
    async getInitialData() {
        return await _fetch('/api/data', 'getInitialData');
    },
    
    async getUpdateSignal(params) {
        return await _fetch('/api/data', 'getUpdateSignal', params);
    },

    async getChangesSince(params) {
        return await _fetch('/api/data', 'getChangesSince', params);
    },

    async saveData(event) {
        const payload = {
            ...event,
            actingAsSchoolId: state.adminActingAsSchool?.id || null,
        };
        return await _fetch('/api/data', 'saveData', payload);
    },

    async getHistoryData(params) {
        return await _fetch('/api/data', 'getHistoryData', params);
    },
    
    async getDashboardData(params) {
        return await _fetch('/api/data', 'getDashboardData', params);
    },

    async getRecapData(params) {
        return await _fetch('/api/data', 'getRecapData', params);
    },

    async getParentData() {
        return await _fetch('/api/data', 'getParentData');
    },
    
    async getSchoolStudentData(schoolId) {
        return await _fetch('/api/data', 'getSchoolStudentData', { schoolId });
    },

    async getAllUsers() {
        return await _fetch('/api/data', 'getAllUsers');
    },

    async getAllSchools() {
        return await _fetch('/api/data', 'getAllSchools');
    },

    async createSchool(schoolName) {
        return await _fetch('/api/data', 'createSchool', { schoolName });
    },

    async updateUserConfiguration(targetEmail, newRole, newSchoolId, newClasses, newJurisdictionId) {
        return await _fetch('/api/data', 'updateUserConfiguration', { targetEmail, newRole, newSchoolId, newClasses, newJurisdictionId });
    },

    async updateUsersBulkConfiguration({ targetEmails, newRole, newSchoolId }) {
        return await _fetch('/api/data', 'updateUsersBulk', { targetEmails, newRole, newSchoolId });
    },

    async generateAiRecommendation(params) {
        return await _fetch('/api/data', 'generateAiRecommendation', params);
    },

    async migrateLegacyData(params) {
        return await _fetch('/api/data', 'migrateLegacyData', params);
    },

    // Jurisdiction APIs
    async getJurisdictionTree() {
        return await _fetch('/api/data', 'getJurisdictionTree');
    },
    async createJurisdiction(name, type, parentId) {
        return await _fetch('/api/data', 'createJurisdiction', { name, type, parentId });
    },
    async updateJurisdiction(id, name, type, parentId) {
        return await _fetch('/api/data', 'updateJurisdiction', { id, name, type, parentId });
    },
    async deleteJurisdiction(id) {
        return await _fetch('/api/data', 'deleteJurisdiction', { id });
    },
    async getSchoolsForJurisdiction(jurisdictionId) {
        return await _fetch('/api/data', 'getSchoolsForJurisdiction', { jurisdictionId });
    },
    async assignSchoolToJurisdiction(schoolId, jurisdictionId) {
        return await _fetch('/api/data', 'assignSchoolToJurisdiction', { schoolId, jurisdictionId });
    }
};
