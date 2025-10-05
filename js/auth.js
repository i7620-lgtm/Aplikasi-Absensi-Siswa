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

    // Ensure a consistent redirect_uri by removing 'index.html' if it's at the end of the path.
    // This prevents mismatches if the user accesses the site via '/some/path/' vs '/some/path/index.html'.
    let path = window.location.pathname;
    if (path.endsWith('/index.html')) {
        // Removes 'index.html' but keeps the preceding '/'. e.g., /foo/index.html -> /foo/
        path = path.slice(0, -10);
    }
    const redirectUri = window.location.origin + path;

    const params = {
        'client_id': googleClientId,
        'redirect_uri': redirectUri,
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
