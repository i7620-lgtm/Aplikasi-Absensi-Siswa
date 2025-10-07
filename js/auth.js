import { setState, navigateTo } from './main.js';
import { showLoader, hideLoader, showNotification, displayAuthError, updateLoaderText } from './ui.js';
import { apiService } from './api.js';

let googleClientId = null;
let authInitStarted = false;

export async function initializeGsi() {
    if (authInitStarted) return;
    authInitStarted = true;
    updateLoaderText('Menyiapkan Autentikasi...');

    try {
        const { clientId } = await apiService.getAuthConfig();
        if (!clientId) throw new Error("Google Client ID tidak diterima dari server.");
        googleClientId = clientId;

        const loginButton = document.getElementById('loginBtn-landing');
        if (loginButton) loginButton.disabled = false;
        // After GSI is ready, hide the main loader if we are on the landing page
        const loaderWrapper = document.getElementById('loader-wrapper');
        if (loaderWrapper.querySelector('.loader-text').textContent.includes('Memuat Aplikasi')) {
            hideLoader();
        }

    } catch (error) {
        console.error("Google Auth initialization failed:", error);
        displayAuthError('Konfigurasi otentikasi belum siap. Coba lagi sesaat.', error);
        hideLoader();
    }
}

export function handleSignIn() {
    if (!googleClientId) {
        displayAuthError('Konfigurasi otentikasi belum siap. Coba lagi sesaat.');
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
    const fragment = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = fragment.get('access_token');
    
    if (!accessToken) return false;

    // Clean the URL of auth tokens
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    
    showLoader('Memverifikasi...');
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error(`Gagal mengambil profil: ${response.statusText}`);
        
        const profile = await response.json();
        
        // --- NEW TWO-STEP LOGIN FLOW ---
        let userProfile;

        // STEP 1: LOGIN & GET PROFILE (with retry for DB setup)
        try {
            updateLoaderText('Memvalidasi pengguna...');
            const loginResult = await apiService.loginOrRegisterUser(profile);
            userProfile = loginResult.user;
        } catch (loginError) {
            if (loginError.code === 'DATABASE_NOT_INITIALIZED') {
                console.warn('Database not initialized. Starting one-time setup.');
                updateLoaderText('Menyiapkan database untuk penggunaan pertama...');
                await apiService.initializeDatabase();
                
                updateLoaderText('Mencoba login kembali...');
                const loginResult = await apiService.loginOrRegisterUser(profile);
                userProfile = loginResult.user;
            } else {
                throw loginError; // Rethrow other login errors
            }
        }
        
        // At this point, login is successful. Set user profile in state.
        await setState({ userProfile });
        
        // STEP 2: FETCH INITIAL DATA (if applicable)
        if (userProfile.primaryRole !== 'ORANG_TUA' && userProfile.school_id) {
            updateLoaderText('Memuat data sekolah...');
            const { initialStudents, initialLogs, latestVersion } = await apiService.getInitialData();
            // Set the rest of the data state
            await setState({
                studentsByClass: initialStudents || {},
                savedLogs: initialLogs || [],
                localVersion: latestVersion || 0,
            });
        }
        
        // Login complete
        showNotification(`Selamat datang, ${userProfile.name}!`);
        navigateTo('multiRoleHome');

    } catch (error) {
        console.error("Gagal memproses login OAuth:", error);
        showNotification(`Gagal memproses login Anda: ${error.message}`, 'error');
        navigateTo('landingPage');
    } finally {
        hideLoader();
    }
    return true; // Indicates that an auth redirect was successfully processed.
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
