
import { state } from './main.js';
import { idb } from './db.js';

async function _fetch(url, action, payload = {}, retryCount = 0) {
    const body = {
        action,
        payload,
        userEmail: state.userProfile?.email || null,
    };
    
    // For save actions, if offline, throw an error immediately.
    if (action === 'saveData' && !navigator.onLine) {
        throw new Error('Koneksi terputus. Gagal menyimpan data, pastikan Anda terhubung ke internet.');
    }
    
    // Create an abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal // Attach the signal
        });
        
        clearTimeout(timeoutId); // Clear timeout on successful response

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Gagal mem-parsing JSON error dari server.' }));
            
            // --- AUTO HEAL: If DB/Schema is missing, try to init and retry once ---
            if (errorData.code === 'DATABASE_NOT_INITIALIZED' && retryCount < 1) {
                console.warn("Schema mismatch detected. Auto-running database initialization...");
                try {
                    await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'initializeDatabase' })
                    });
                    console.log("Database initialized. Retrying original request...");
                    return await _fetch(url, action, payload, retryCount + 1);
                } catch (initErr) {
                    console.error("Failed to auto-heal database:", initErr);
                    // Fall through to throw original error
                }
            }
            
            let errorMessage = errorData.error || `Server merespons dengan status ${response.status}`;
            
            // Perjelas pesan error jika ini adalah error skema persisten setelah retry
            if (errorData.code === 'DATABASE_NOT_INITIALIZED') {
                errorMessage = "Database sedang diperbarui. Silakan coba tekan tombol 'Simpan' sekali lagi.";
            }

            const error = new Error(errorMessage);
            error.status = response.status; // Tambahkan status code ke objek error
            if (errorData.code) {
                error.code = errorData.code;
            }
            throw error;
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId); // Ensure timeout is cleared on error too
        
        if (error.name === 'AbortError') {
            console.error(`API call for action '${action}' timed out.`);
            throw new Error('Koneksi server terlalu lama (timeout). Silakan periksa internet Anda atau coba lagi nanti.');
        }
        
        console.error(`API call for action '${action}' failed:`, error);
        // Rethrow to be handled by the calling function
        throw error;
    }
}

export const apiService = {
    async getAuthConfig() {
        return await _fetch('/api/data', 'getAuthConfig');
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

    async getAllUsers(params) {
        return await _fetch('/api/data', 'getAllUsers', params);
    },

    async getAllSchools() {
        return await _fetch('/api/data', 'getAllSchools');
    },

    async searchSchools(query) {
        return await _fetch('/api/data', 'searchSchools', { query });
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
    },

    // Holiday & Settings APIs
    async manageHoliday(operation, holidayId, date, description, endDate = null) {
        return await _fetch('/api/data', 'manageHoliday', { operation, holidayId, date, description, endDate });
    },
    async updateSchoolSettings(workDays, schoolId = null) {
        return await _fetch('/api/data', 'updateSchoolSettings', { workDays, schoolId });
    },
    async getHolidays() {
        return await _fetch('/api/data', 'getHolidays');
    }
};
