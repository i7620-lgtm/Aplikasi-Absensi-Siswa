
import { setState, navigateTo } from './main.js';
import { showLoader, hideLoader, showNotification, displayAuthError } from './ui.js';
import { apiService } from './api.js';

let googleClientId = null;
let authInitStarted = false;

// --- GOOGLE SIGN-IN LOGIC ---

export async function initializeGsi() {
    if (authInitStarted) return;
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

    // --- STRATEGI BARU: PANGGILAN PROAKTIF UNTUK MEMBANGUNKAN DB ---
    // Kirim permintaan "tembak dan lupakan" untuk membangunkan server/database
    // sementara pengguna sedang dialihkan ke Google.
    fetch('/api/wakeup', { method: 'POST' })
        .then(res => {
            if(res.ok) console.log("Proactive DB wakeup signal sent successfully.");
            else console.warn("Proactive DB wakeup signal failed, relying on retry mechanism.");
        })
        .catch(err => {
            // Kita tidak menghentikan alur login jika ini gagal.
            // Browser mungkin membatalkan permintaan saat navigasi terjadi.
            console.warn('Proactive DB wakeup call failed but proceeding with login:', err);
        });
    // --- AKHIR STRATEGI BARU ---

    const oauth2Endpoint = 'https://accounts.google.com/o/oauth2/v2/auth';

    const redirectUri = `${window.location.origin}/`;

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
        
        // Menggunakan fungsi login yang lebih tangguh dengan mekanisme coba-lagi
        const { user, initialStudents, initialLogs, latestVersion } = await apiService.robustLoginOrRegister(profile);

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
      
