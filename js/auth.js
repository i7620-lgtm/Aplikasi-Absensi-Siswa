import { state, setState, navigateTo } from './main.js';
import { renderScreen, showLoader, hideLoader, showNotification, displayAuthError } from './ui.js';
import { apiService } from './api.js';

// --- GSI CONFIG ---
const CLIENT_ID = '584511730006-avkntpukucstgnf7c0otn3dt0lajtu43.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

let gsiClient;
let isGsiReady = false;

export function initializeGsi() {
    const gsiLoadCheck = setInterval(() => {
        if (window.google && window.google.accounts) {
            clearInterval(gsiLoadCheck);
            try {
                gsiClient = google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: handleTokenResponse,
                });
                isGsiReady = true;
                console.log("Google Sign-In service initialized.");
            } catch (err) {
                isGsiReady = false;
                console.error("GSI Initialization Failed:", err);
                displayAuthError('Gagal memuat layanan login Google.', err);
            } finally {
                if (state.currentScreen === 'setup') {
                    renderScreen('setup'); 
                }
            }
        }
    }, 100);

    setTimeout(() => {
        if (!isGsiReady) {
            clearInterval(gsiLoadCheck);
            console.error("GSI script failed to load within 10 seconds.");
            if (state.currentScreen === 'setup') {
                 isGsiReady = false;
                 renderScreen('setup');
            }
        }
    }, 10000);
}

export function getGsiReadyState() {
    return isGsiReady;
}

async function handleTokenResponse(tokenResponse) {
    if (tokenResponse.error) {
        console.error('Authentication failed:', tokenResponse);
        if (tokenResponse.error === 'popup_closed_by_user' || tokenResponse.error === 'access_denied') {
            showNotification('Proses login dibatalkan oleh pengguna.', 'error');
            hideLoader();
            return;
        }
        displayAuthError('Proses otentikasi gagal.', new Error(tokenResponse.error_description || 'Detail tidak tersedia.'));
        hideLoader();
        return;
    }

    try {
        showLoader('Login berhasil, mengambil data...');
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
        });
        if (!userInfoResponse.ok) throw new Error(`Gagal mengambil info pengguna: ${userInfoResponse.statusText}`);
        
        const profile = await userInfoResponse.json();

        // Register user with our backend and get their role and data
        const { user, userData } = await apiService.loginOrRegisterUser(profile);
        
        try {
            sessionStorage.setItem('userProfile', JSON.stringify(user));
            sessionStorage.setItem('userData', JSON.stringify(userData));
        } catch (e) {
            console.warn("Tidak dapat menyimpan data sesi ke sessionStorage.", e);
            showNotification("Gagal menyimpan sesi, Anda mungkin perlu login lagi.", "error");
        }

        setState({
            userProfile: user,
            studentsByClass: userData.students_by_class,
            savedLogs: userData.saved_logs,
        });

        hideLoader();
        showNotification(`Selamat datang, ${state.userProfile.name}!`);

        // Navigate based on role
        if (user.role === 'SUPER_ADMIN') {
            navigateTo('adminHome');
        } else if (user.role === 'KEPALA_SEKOLAH') {
            navigateTo('dashboard');
        } else {
            navigateTo('setup');
        }

    } catch (error) {
        console.error('A critical error occurred after receiving the token:', error);
        hideLoader();
        showNotification(error.message || 'Terjadi kesalahan saat mengambil data.', 'error');
        displayAuthError('Terjadi kesalahan setelah login berhasil.', error);
        handleSignOut(); 
    }
}

export function handleSignIn() {
    if (!isGsiReady || !gsiClient) {
        showNotification("Layanan login belum siap, coba lagi.", "error");
        return;
    }
    showLoader('Membuka jendela login Google...');
    gsiClient.requestAccessToken({ prompt: 'consent' });
}

export function handleSignOut() {
    sessionStorage.removeItem('userProfile');
    sessionStorage.removeItem('userData');
    
    setState({
        userProfile: null,
        studentsByClass: {},
        savedLogs: [],
    });
    navigateTo('setup');
}
