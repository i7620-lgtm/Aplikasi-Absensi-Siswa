import { setState, navigateTo } from './main.js';
import { showLoader, hideLoader, showNotification, displayAuthError } from './ui.js';
import { apiService } from './api.js';
import { idb } from './db.js';

// Helper to decode JWT tokens from Google
function jwtDecode(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Failed to decode JWT", e);
        return null;
    }
}

/**
 * Handles the successful sign-in callback from Google.
 * @param {object} response The credential response object from Google.
 */
export async function handleSignIn(response) {
    showLoader('Memverifikasi pengguna...');
    try {
        const profile = jwtDecode(response.credential);
        if (!profile) throw new Error("Gagal mendekode profil pengguna.");

        const { user: userProfile } = await attemptLogin(profile);
        
        showLoader('Mengambil data sekolah...');
        const { initialStudents, initialLogs, latestVersion } = await apiService.getInitialData();
        
        await setState({
            userProfile,
            studentsByClass: initialStudents,
            savedLogs: initialLogs,
            localVersion: latestVersion
        });
        
        hideLoader();
        showNotification(`Selamat datang, ${userProfile.name}!`, 'success');
        navigateTo('multiRoleHome');

    } catch (error) {
        console.error("Authentication failed:", error);
        hideLoader();
        displayAuthError('Login Gagal. Silakan coba lagi.', error);
        navigateTo('landingPage');
    }
}

async function attemptLogin(profile) {
    try {
        return await apiService.loginOrRegisterUser({ profile });
    } catch (error) {
        if (error.code === 'DATABASE_NOT_INITIALIZED') {
            showLoader('Database belum siap. Menginisialisasi...');
            console.warn("Database not initialized, attempting to set it up now.");
            try {
                await apiService.initializeDatabase();
                showLoader('Inisialisasi berhasil. Mencoba login kembali...');
                // Retry the login after successful initialization
                return await apiService.loginOrRegisterUser({ profile });
            } catch (initError) {
                console.error("Fatal: Database initialization failed.", initError);
                throw new Error("Gagal menginisialisasi database aplikasi. Silakan hubungi administrator.");
            }
        }
        // Re-throw other errors
        throw error;
    }
}


/**
 * Handles signing out the current user.
 */
export async function handleSignOut() {
    showLoader('Logout...');
    if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
    
    // Clear all application state
    await setState({
        userProfile: null,
        studentsByClass: {},
        savedLogs: [],
        localVersion: 0,
        adminActingAsSchool: null,
        adminActingAsJurisdiction: null,
        // Reset other states to default
        dashboard: { ...state.dashboard, data: null, isLoading: true, aiRecommendation: { isLoading: false, result: null, error: null } },
        adminPanel: { ...state.adminPanel, users: [], schools: [], isLoading: true, selectedUsers: [] },
    });
    
    // Clear IndexedDB for a clean slate on next login
    await idb.set('userProfile', null);
    await idb.set('userData', null);
    
    hideLoader();
    navigateTo('landingPage');
    showNotification('Anda telah berhasil logout.', 'info');
}

/**
 * Initializes the Google Sign-In client.
 */
export async function initializeGsi() {
    try {
        const { clientId } = await apiService.getAuthConfig();
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            google.accounts.id.initialize({
                client_id: clientId,
                callback: handleSignIn,
                auto_select: true,
                ux_mode: 'popup', // Can be 'popup' or 'redirect'
            });

            const gsiContainer = document.getElementById('gsi-button-container');
            if (gsiContainer && !state.userProfile) {
                 google.accounts.id.renderButton(
                    gsiContainer,
                    { theme: "outline", size: "large", text: "signin_with", shape: "rectangular", logo_alignment: "left" }
                );
            }
           
            // Show One Tap prompt if not logged in
            if (!state.userProfile) {
                google.accounts.id.prompt();
            }

            // Hide initial loader after GSI is ready
            const loaderWrapper = document.getElementById('loader-wrapper');
            if (loaderWrapper.querySelector('.loader-text').textContent.includes('Memuat Aplikasi')) {
                hideLoader();
            }
        };
        script.onerror = () => {
             displayAuthError('Gagal memuat skrip otentikasi Google. Periksa koneksi internet Anda atau coba muat ulang halaman.');
             hideLoader();
        };
        document.head.appendChild(script);
    } catch (error) {
        displayAuthError('Gagal mengambil konfigurasi otentikasi dari server.', error);
        hideLoader();
    }
}


/**
 * Handles the GSI redirect flow. Returns true if a redirect is being handled.
 */
export async function handleAuthenticationRedirect() {
    // A simple check for the g_csrf_token cookie is enough to know
    // if we are in a GSI redirect callback.
    const isGsiRedirect = document.cookie.includes('g_csrf_token');
    
    if (isGsiRedirect) {
        console.log("GSI redirect detected, waiting for callback to handle sign-in.");
        return true;
    }
    return false;
}
