import { state } from './main.js';
import { idb } from './db.js';
import { updateLoaderText } from './ui.js';

// --- KONFIGURASI UNTUK PERCOBAAN ULANG LOGIN ---
const MAX_RETRIES = 3; // Jumlah maksimal percobaan ulang
const RETRY_DELAY_MS = 2500; // Waktu tunggu antara percobaan (dalam milidetik)

async function _fetch(action, payload = {}) {
    // Logic to queue 'saveData' action when offline
    if (action === 'saveData' && !navigator.onLine) {
        console.log(`Offline mode detected. Queuing action: ${action}`);
        try {
            const queue = await idb.getQueue();
            const offlineAction = {
                body: {
                    action,
                    payload,
                    userEmail: state.userProfile?.email
                }
            };

            queue.push(offlineAction);
            await idb.setQueue(queue);
            
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                navigator.serviceWorker.ready.then(sw => {
                    sw.sync.register('sync-offline-actions');
                    console.log('Background sync registered for offline actions.');
                });
            }

            return Promise.resolve({ success: true, queued: true, savedBy: state.userProfile.name });
        } catch (error) {
            console.error('Failed to queue offline action:', error);
            throw new Error('Gagal menyimpan data secara lokal. Coba lagi.');
        }
    }

    // Original online logic for data actions
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
            let errorMessage;
            if (response.status === 503) {
                 errorMessage = `Layanan tidak tersedia: ${errorData.error || 'Konfigurasi otentikasi server tidak lengkap. Hubungi administrator.'}`;
            } else if (response.status >= 500) {
                errorMessage = `Kesalahan Server (${response.status}): ${errorData.error || 'Gagal terhubung ke database.'}`;
            } else {
                errorMessage = `Error ${response.status}: ${errorData.error || response.statusText}`;
            }
            throw new Error(errorMessage);
        }
    
        return response.json();
    } catch (error) {
        console.error(`Panggilan API '${action}' gagal:`, error);
        
        if (error.message.startsWith('Layanan tidak tersedia') || error.message.startsWith('Kesalahan Server') || error.message.startsWith('Error')) {
            throw error;
        }
        throw new Error('Gagal terhubung ke server. Periksa koneksi internet Anda.');
    }
}

export const apiService = {
    async getAuthConfig() {
        // Panggil endpoint baru yang terisolasi, bukan _fetch
        try {
            const response = await fetch('/api/auth-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = `Error ${response.status}: ${errorData.error || response.statusText}`;
                throw new Error(errorMessage);
            }
            return response.json();
        } catch (error) {
            console.error("Panggilan API 'getAuthConfig' gagal:", error);
            throw new Error('Gagal mendapatkan konfigurasi autentikasi dari server.');
        }
    },
    
    async robustLoginOrRegister(profile) {
        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                // Percobaan pertama tidak mengubah teks loader
                if (i > 0) {
                    updateLoaderText(`Menghubungkan ke server... (Percobaan ${i + 1})`);
                }
                const result = await _fetch('loginOrRegister', { profile });
                return result; // Jika berhasil, keluar dari loop dan kembalikan hasil
            } catch (error) {
                // Periksa apakah ini error koneksi DB yang bisa dicoba lagi
                const isRetryableError = error.message.includes('Gagal terhubung ke database.');
                
                if (isRetryableError && i < MAX_RETRIES - 1) {
                    console.warn(`Login gagal, mencoba lagi dalam ${RETRY_DELAY_MS}ms... (Percobaan ${i + 1})`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    continue; // Lanjutkan ke iterasi berikutnya
                } else {
                    // Jika bukan error yang bisa dicoba lagi atau sudah mencapai batas percobaan
                    throw error; // Lemparkan error terakhir untuk ditangani oleh auth.js
                }
            }
        }
        // Ini seharusnya tidak akan tercapai, tapi sebagai fallback
        throw new Error('Gagal login setelah beberapa kali percobaan.');
    },

    async getUserProfile() {
        return await _fetch('getUserProfile');
    },
    
    async getFullUserData() {
        // DEPRECATED in delta-sync model, login provides initial data.
        // Kept for compatibility if some flows still use it, but should be phased out.
        console.warn("getFullUserData is deprecated.");
        return await _fetch('getFullUserData');
    },
    
    async getUpdateSignal(params) {
        return await _fetch('getUpdateSignal', params);
    },

    async getChangesSince(params) {
        return await _fetch('getChangesSince', params);
    },

    async saveData(event) { // Now sends a single event object
        const payload = {
            ...event,
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

    async getParentData() {
        return await _fetch('getParentData');
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

    async generateAiRecommendation(params) {
        return await _fetch('generateAiRecommendation', params);
    },

    async migrateLegacyData(params) {
        return await _fetch('migrateLegacyData', params);
    },

    // Jurisdiction APIs
    async getJurisdictionTree() {
        return await _fetch('getJurisdictionTree');
    },
    async createJurisdiction(name, type, parentId) {
        return await _fetch('createJurisdiction', { name, type, parentId });
    },
    async updateJurisdiction(id, name, type, parentId) {
        return await _fetch('updateJurisdiction', { id, name, type, parentId });
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
