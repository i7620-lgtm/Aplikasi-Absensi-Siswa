import { setState, navigateTo, state } from './main.js';
import { showLoader, hideLoader, showNotification, displayAuthError } from './ui.js';
import { apiService } from './api.js';

let googleClientId = null;
let authInitStarted = false;

// --- GOOGLE SIGN-IN LOGIC ---

export async function initializeGsi() {
    if (state.userProfile || authInitStarted) return;
    authInitStarted = true;

    try {
        const { clientId } = await apiService.getAuthConfig();

        if (!clientId) {
             throw new Error("Google Client ID tidak diterima dari server.");
        }
        googleClientId = clientId;

    } catch (error) {
        console.error("Google Auth initialization failed:", error);
        displayAuthError('Konfigurasi otentikasi server tidak lengkap. Hubungi administrator.', error);
    }
}

export function handleSignIn() {
    if (!googleClientId) {
        displayAuthError('Konfigurasi otentikasi belum siap. Coba lagi sesaat.');
        console.error("handleSignIn called before googleClientId was fetched.");
        return;
    }

    const oauth2Endpoint = 'https://accounts.google.com/o/oauth2/v2/auth';

    const params = {
        'client_id': googleClientId,
        'redirect_uri': window.location.origin + window.location.pathname,
        'response_type': 'token',
        'scope': 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        'include_granted_scopes': 'true'
    };

    const url = `${oauth2Endpoint}?${new URLSearchParams(params).toString()}`;
    window.location.href = url;
}

export async function handleSignOut() {
    await setState({
        userProfile: null,
        studentsByClass: {},
        savedLogs: [],
        localVersion: 0,
        adminActingAsSchool: null,
        adminActingAsJurisdiction: null,
    });
    navigateTo('setup');
    showNotification('Anda telah berhasil logout.', 'info');
}
