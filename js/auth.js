import { state, setState, navigateTo } from './main.js';
import { renderScreen, showLoader, hideLoader, showNotification, displayAuthError } from './ui.js';
import { apiService } from './api.js';
import { idb } from './db.js';

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
        const loginResponse = await apiService.loginOrRegisterUser(profile);

        if (loginResponse.maintenance) {
            // App is in maintenance mode for this user, navigate to maintenance screen.
            await setState({ maintenanceMode: { ...state.maintenanceMode, isActive: true } });
            hideLoader();
            navigateTo('maintenance');
            return;
        }
        
        const { user, userData } = loginResponse;
        
        // Use setState which now handles persistence to IndexedDB
        await setState({
            userProfile: user,
            studentsByClass: userData.students_by_class,
            savedLogs: userData.saved_logs,
        });

        hideLoader();
        showNotification(`Selamat datang, ${state.userProfile.name}!`);

        // Navigate based on role
        if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_SEKOLAH') {
            navigateTo('adminHome');
        } else if (user.role === 'KEPALA_SEKOLAH' || user.role === 'DINAS_PENDIDIKAN' || user.role === 'ADMIN_DINAS_PENDIDIKAN') {
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

export async function handleSignOut() {
    // Clear state from IDB
    await idb.set('userProfile', null);
    await idb.set('userData', null);
    
    // Reset runtime state
    state.userProfile = null;
    state.studentsByClass = {};
    state.savedLogs = [];

    navigateTo('setup');
}
