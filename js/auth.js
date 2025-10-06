import { setState, navigateTo } from './main.js';
import { showLoader, hideLoader, showNotification, displayAuthError, updateLoaderText } from './ui.js';
import { apiService } from './api.js';

let googleClientId = null;
let authInitStarted = false;

// --- GOOGLE SIGN-IN LOGIC ---

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

        // --- Enable the button now that config is ready ---
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

    // --- FIX: Construct a robust redirect URI using the current origin and path. ---
    // This avoids hardcoded domain checks and works for both localhost and Vercel.
    // The user must ensure this exact URI is registered in their Google Cloud Console.
    const currentUrl = new URL(window.location.href);
    // For a root deploy, pathname is '/', resulting in e.g. "https://domain.com/"
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
        
        // Menggunakan fungsi login yang sederhana dan langsung.
        const { user, initialStudents, initialLogs, latestVersion } = await apiService.loginOrRegisterUser(profile);

        await setState({
            userProfile: user,
            studentsByClass: initialStudents || {},
            savedLogs: initialLogs || [],
            localVersion: latestVersion || 0,
        });
        showNotification(`Selamat datang, ${user.name}!`);
        navigateTo('multiRoleHome');

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
