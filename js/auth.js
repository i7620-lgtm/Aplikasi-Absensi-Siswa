import { setState, navigateTo, state } from './main.js';
import { showLoader, hideLoader, showNotification, displayAuthError } from './ui.js';
import { apiService } from './api.js';

let isGsiReady = false;

// --- GOOGLE SIGN-IN LOGIC ---
export function getGsiReadyState() {
    return isGsiReady;
}

export async function initializeGsi() {
    if (state.userProfile) return;
    try {
        const { clientId } = await apiService.getAuthConfig();

        if (!clientId) {
             throw new Error("Google Client ID tidak diterima dari server.");
        }

        if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
            throw new Error("Skrip Google Identity Services belum dimuat.");
        }

        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleTokenResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: true // Explicitly use the modern browser standard
        });
        isGsiReady = true;
        console.log("Google Sign-In service initialized.");

        // If GSI is ready but the button text hasn't updated, update it now.
        const loginBtnText = document.getElementById('loginBtnText');
        if (loginBtnText && loginBtnText.textContent !== 'Login & Mulai Absensi') {
            loginBtnText.textContent = 'Login & Mulai Absensi';
            document.getElementById('loginBtn')?.removeAttribute('disabled');
        }

    } catch (error) {
        console.error("Google Sign-In initialization failed:", error);
        isGsiReady = false;
        displayAuthError('Konfigurasi otentikasi server tidak lengkap. Hubungi administrator.', error);
    }
}

export function handleSignIn() {
    try {
        if (!isGsiReady) throw new Error("Layanan Google Sign-In belum siap atau gagal dimuat karena masalah konfigurasi server.");
        // The notification callback is removed to comply with FedCM migration guidelines.
        // The prompt will now show without the UI status check, which resolves the warning.
        google.accounts.id.prompt();
    } catch (error) {
        console.error("Error triggering GSI prompt:", error);
        displayAuthError('Tidak dapat memulai proses login.', error);
    }
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
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
    navigateTo('setup');
    showNotification('Anda telah berhasil logout.', 'info');
}

async function handleTokenResponse(response) {
    showLoader('Memverifikasi...');
    try {
        const token = response.credential;
        const profile = JSON.parse(atob(token.split('.')[1]));
        const { user, initialStudents, initialLogs, latestVersion, maintenance } = await apiService.loginOrRegisterUser(profile);

        if (maintenance) {
            navigateTo('maintenance');
            return;
        }

        await setState({
            userProfile: user,
            studentsByClass: initialStudents || {},
            savedLogs: initialLogs || [],
            localVersion: latestVersion || 0,
        });

        showNotification(`Selamat datang, ${user.name}!`);
        console.log("Google Sign-In successful. User profile:", user);

        navigateTo('multiRoleHome');
    } catch (error) {
        console.error("A critical error occurred after receiving the token:", error);
        displayAuthError('Gagal memproses login Anda.', error);
        await handleSignOut(); // Ensure clean state on failure
    } finally {
        hideLoader();
    }
}
