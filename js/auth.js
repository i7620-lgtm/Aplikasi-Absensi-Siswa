import { state, setState, navigateTo } from './main.js';
import { showLoader, hideLoader, showNotification, displayAuthError } from './ui.js';
import { apiService } from './api.js';
import { idb } from './db.js';

let gsiScriptLoaded = false;
let gsiClientInitialized = false;
let googleClientId = null;

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
 */
export async function handleSignIn(response) {
    showLoader('Memverifikasi pengguna...');
    try {
        const profile = jwtDecode(response.credential);
        if (!profile) throw new Error("Gagal mendekode profil pengguna.");

        // Langkah 1: Dapatkan profil pengguna dari server.
        const { user: userProfile } = await attemptLogin(profile);
        
        // Langkah 2: KRUSIAL - Atur profil pengguna di state global SEGERA.
        // Ini memungkinkan panggilan API terotentikasi berikutnya.
        await setState({ userProfile });
        
        // Langkah 3: Sekarang, ambil sisa data awal menggunakan state yang sudah terotentikasi.
        showLoader('Mengambil data sekolah...');
        const { initialStudents, initialLogs, latestVersion } = await apiService.getInitialData();
        
        // Langkah 4: Atur sisa data di state.
        await setState({
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
        
        if (error.status === 500) {
            const dbConnectionError = `
                <div class="bg-red-50 p-4 rounded-lg border border-red-200 text-left flex items-start gap-4">
                    <div class="flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                           <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                           <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01" />
                        </svg>
                    </div>
                    <div>
                        <h3 class="font-bold text-red-800">Login Gagal: Koneksi Database Bermasalah</h3>
                        <p class="text-sm text-red-700 mt-1">
                           Server lokal Anda tidak dapat terhubung ke database di cloud. Ini sering disebabkan oleh firewall atau pengaturan jaringan.
                        </p>
                        <p class="text-sm text-red-700 mt-2 font-semibold">
                           <strong>Saran:</strong> Coba hubungkan ke jaringan lain (misalnya, hotspot seluler) atau periksa pengaturan firewall Anda.
                        </p>
                    </div>
                </div>`;
            displayAuthError(dbConnectionError, null);
        } else {
             // NEW: Specific error for 401 to guide the user
            if (error.status === 401 || (error.message && error.message.toLowerCase().includes('unauthorized'))) {
                error.message = "Otentikasi gagal. Sesi Anda mungkin telah kedaluwarsa. Silakan coba lagi. " + error.message;
            }
            displayAuthError('Login Gagal. Silakan coba lagi.', error);
        }
        
        navigateTo('landingPage');
    }
}

async function attemptLogin(profile) {
    try {
        return await apiService.loginOrRegisterUser(profile);
    } catch (error) {
        if (error.code === 'DATABASE_NOT_INITIALIZED') {
            showLoader('Database belum siap. Menginisialisasi...');
            console.warn("Database not initialized, attempting to set it up now.");
            try {
                await apiService.initializeDatabase();
                showLoader('Inisialisasi berhasil. Mencoba login kembali...');
                // Retry the login after successful initialization
                return await apiService.loginOrRegisterUser(profile);
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
        dashboard: { ...state.dashboard, data: null, isLoading: true, aiRecommendation: { isLoading: false, result: null, error: null } },
        adminPanel: { ...state.adminPanel, users: [], schools: [], isLoading: true, selectedUsers: [] },
        logoutMessage: 'Logout Berhasil.', // Set one-time message
    });
    
    // Clear IndexedDB for a clean slate on next login
    await idb.set('userProfile', null);
    await idb.set('userData', null);
    
    hideLoader();
    navigateTo('landingPage');
}

/**
 * Renders the Google Sign-In button if the client is ready.
 * This function can be called multiple times safely.
 */
export function renderSignInButton() {
    if (!gsiClientInitialized || state.userProfile) {
        return;
    }

    const gsiContainer = document.getElementById('gsi-button-container');
    if (gsiContainer) {
        // Clear any previous placeholder or button content to prevent duplicates.
        gsiContainer.innerHTML = '';
        
        // Render the official Google button, configured for a stable pop-up experience.
        google.accounts.id.renderButton(
            gsiContainer,
            { 
                theme: 'filled_blue', 
                size: 'large',
                text: 'signin_with', // Will be localized to "Masuk dengan Google"
                shape: 'rectangular',
                width: '320', // A good width for the large button
            } 
        );
    }
}


/**
 * Initializes the Google Sign-In client by loading the script.
 * This should only be run once per application load.
 */
export async function initializeGsi() {
    if (gsiScriptLoaded) return;

    try {
        const { clientId } = await apiService.getAuthConfig();
        googleClientId = clientId;

        if (!clientId || typeof clientId !== 'string' || clientId.trim() === '') {
            const missingIdError = `<div class="bg-red-50 p-4 rounded-lg border border-red-200 text-left"><h3 class="font-bold text-red-800">Kesalahan Konfigurasi Server</h3><p class="text-sm text-red-700 mt-1">Server tidak menyediakan Client ID Google. Aplikasi tidak dapat melanjutkan proses otentikasi. Silakan hubungi administrator.</p></div>`;
            displayAuthError(missingIdError, null);
            hideLoader();
            return;
        }

        const script = document.createElement('script');
        // Force Indonesian locale for the button and popups
        script.src = 'https://accounts.google.com/gsi/client?hl=id'; 
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if (!window.google || !window.google.accounts || !window.google.accounts.id) {
                console.error("Google Sign-In library failed to initialize correctly.");
                displayAuthError("Gagal memuat pustaka Google. Coba muat ulang halaman.");
                hideLoader();
                return;
            }

            try {
                google.accounts.id.initialize({
                    client_id: clientId,
                    callback: handleSignIn,
                    auto_select: false,
                    ux_mode: 'popup', // Explicitly set to popup for stability
                });

                gsiClientInitialized = true;
                renderSignInButton(); // Perform the initial render

                const loaderWrapper = document.getElementById('loader-wrapper');
                if (loaderWrapper.querySelector('.loader-text').textContent.includes('Memuat Aplikasi')) {
                    hideLoader();
                }
            } catch (initError) {
                // This catch block is crucial for diagnosing Client ID/Origin issues.
                console.error("GSI Initialization failed:", initError);
                const detailedError = `
                    <div class="bg-red-50 p-4 rounded-lg border border-red-200 text-left flex items-start gap-4">
                        <div class="flex-shrink-0"><svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                        <div>
                            <h3 class="font-bold text-red-800">Gagal Menginisialisasi Login Google</h3>
                            <p class="text-sm text-red-700 mt-1">Ini adalah masalah konfigurasi umum. Mari kita periksa:</p>
                            <ul class="text-sm text-red-700 mt-2 list-disc list-inside space-y-1">
                                <li><strong>Client ID yang Digunakan:</strong> <code class="bg-red-100 p-1 rounded text-xs break-all">${googleClientId || 'Tidak Ditemukan'}</code></li>
                                <li><strong>Origin Browser Saat Ini:</strong> <code class="bg-red-100 p-1 rounded text-xs">${window.location.origin}</code></li>
                            </ul>
                            <p class="text-sm text-red-700 mt-2 font-semibold"><strong>Tindakan:</strong> Pastikan <strong>Origin Browser</strong> di atas terdaftar <strong>persis</strong> di "Authorized JavaScript origins" untuk <strong>Client ID</strong> tersebut di Google Cloud Console Anda.</p>
                        </div>
                    </div>`;
                displayAuthError(detailedError, null);
            }
        };
        script.onerror = () => {
             displayAuthError('Gagal memuat skrip otentikasi Google. Periksa koneksi internet Anda atau coba muat ulang halaman.');
             hideLoader();
        };
        document.head.appendChild(script);
        gsiScriptLoaded = true;

    } catch (error) {
        displayAuthError('Gagal mengambil konfigurasi otentikasi dari server.', error);
        hideLoader();
    }
}

/**
 * Handles the GSI redirect flow. Now obsolete with popup flow.
 * Returns false to maintain compatibility with initialization logic.
 */
export async function handleAuthenticationRedirect() {
    return false;
}
