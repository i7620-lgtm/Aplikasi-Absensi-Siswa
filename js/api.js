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

    async saveData(data) {
        return await _fetch('saveData', data);
    },

    async getDashboardData() {
        return await _fetch('getDashboardData');
    },

    async getAllUsers() {
        return await _fetch('getAllUsers');
    },

    async updateUserRole(targetEmail, newRole) {
        return await _fetch('updateUserRole', { targetEmail, newRole });
    },

    async updateAssignedClasses(emailToUpdate, newClasses) {
        return await _fetch('updateAssignedClasses', { emailToUpdate, newClasses });
    }
};
