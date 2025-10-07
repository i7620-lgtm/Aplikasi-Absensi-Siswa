import { setState, navigateTo } from './main.js';
import { showLoader, hideLoader, showNotification, displayAuthError, updateLoaderText } from './ui.js';
import { apiService } from './api.js';

let googleClientId = null;
let authInitStarted = false;

/**
 * Performs the final login steps after a user profile is successfully retrieved or created.
 * @param {object} profile - The user profile from Google.
 */
async function performLogin(profile) {
    const { user, initialStudents, initialLogs, latestVersion } = await apiService.loginOrRegisterUser(profile);

    await setState({
        userProfile: user,
        studentsByClass: initialStudents || {},
        savedLogs: initialLogs || [],
        localVersion: latestVersion || 0,
    });
    showNotification(`Selamat datang, ${user.name}!`);
    navigateTo('multiRoleHome');
}

export async function initializeGsi() {
    if (authInitStarted) return;
    authInitStarted = true;

    updateLoaderText('Menyiapkan Autentikasi...');

    try {
        const { clientId } = await apiService.getAuthConfig();

        if (!clientId) {
             throw new Error("Google Client ID tidak diterima dari server.");
        }
        googleClientId = clientId;

        const loginButton = document.getElementById('loginBtn-landing');
        if (loginButton) {
            loginButton.disabled = false;
        }

    } catch (error) {
        console.error("Google Auth initialization failed:", error);
        displayAuthError('Konfigurasi otentikasi belum siap. Coba lagi sesaat.', error);
    }
}

export function handleSignIn() {
    if (!googleClientId) {
        displayAuthError('Konfigurasi otentikasi belum siap. Coba lagi sesaat.');
        console.error("handleSignIn called before googleClientId was fetched.");
        return;
    }

    const oauth2Endpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
    const currentUrl = new URL(window.location.href);
    const redirectUri = `${currentUrl.origin}${currentUrl.pathname}`;

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

export async function handleAuthenticationRedirect() {
    if (!window.location.hash.includes('access_token')) {
        return false;
    }

    const fragment = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = fragment.get('access_token');
    
    if (!accessToken) return false;

    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    
    showLoader('Memverifikasi...');
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error(`Gagal mengambil profil: ${response.statusText}`);
        
        const profile = await response.json();
        
        try {
            // First optimistic attempt to login
            await performLogin(profile);
        } catch (loginError) {
            // If the specific error for a non-existent DB is returned, handle it gracefully.
            if (loginError.code === 'DATABASE_NOT_INITIALIZED') {
                console.warn('Database not initialized. Starting one-time setup process.');
                updateLoaderText('Menyiapkan database untuk penggunaan pertama kali...');
                
                // Call the dedicated setup endpoint
                await apiService.initializeDatabase();
                
                // Retry the login now that the database is ready
                updateLoaderText('Menyelesaikan login...');
                await performLogin(profile);

            } else {
                // For any other error, fail fast
                throw loginError;
            }
        }

    } catch (error) {
        console.error("Gagal memproses login OAuth:", error);
        showNotification(`Gagal memproses login Anda: ${error.message}`, 'error');
        navigateTo('landingPage');
    } finally {
        hideLoader();
    }
    return true;
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
    navigateTo('landingPage');
    showNotification('Anda telah berhasil logout.', 'info');
}
