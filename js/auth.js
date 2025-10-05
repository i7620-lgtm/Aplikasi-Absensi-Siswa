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

// BARU: Fungsi untuk menjalankan migrasi di sisi browser
async function triggerClientSideMigration() {
    console.groupCollapsed('%c[Migrasi Data Lama]', 'font-weight: bold; color: #4f46e5;');
    try {
        console.log('Memeriksa status migrasi ke server...');
        const check = await apiService.checkAndStartClientMigration();

        if (check.status === 'complete') {
            console.log('Server mengonfirmasi migrasi sudah selesai. Tidak ada tindakan yang diperlukan.');
            console.groupEnd();
            return;
        }
        
        if (check.status === 'pending' && check.data && check.data.length > 0) {
            const rawData = check.data;
            console.log(`Diterima ${rawData.length} baris data absensi mentah dari server.`);

            console.log('Memulai pemrosesan dan pengelompokan data di browser...');
            // Resiliently get the class column name by checking the first record
            const classKey = 'class' in rawData[0] ? 'class' : 'class_name';
            
            const groupedData = rawData.reduce((acc, row) => {
                // Skip rows with invalid data
                if (!row.school_id || !row.date || !row[classKey]) return acc;
                
                const key = `${row.school_id}-${row.date}-${row[classKey]}`;
                if (!acc[key]) {
                    acc[key] = {
                        school_id: row.school_id,
                        user_email: row.teacher_email || 'migration@system.local',
                        event_type: 'ATTENDANCE_UPDATED',
                        payload: {
                            date: row.date.split('T')[0], // Ensure YYYY-MM-DD format
                            class: row[classKey],
                            attendance: {}
                        }
                    };
                }
                acc[key].payload.attendance[row.student_name] = row.status;
                return acc;
            }, {});

            const migratedData = Object.values(groupedData);
            console.log(`Pemrosesan selesai. Dihasilkan ${migratedData.length} rekaman change_log yang sudah dikelompokkan.`);

            if (migratedData.length > 0) {
                console.log('Mengunggah data yang sudah diproses ke server...');
                const uploadResult = await apiService.uploadMigratedData(migratedData);
                console.log(`Unggah berhasil! Server mengonfirmasi ${uploadResult.count} rekaman baru telah disimpan.`);
                console.log('Proses migrasi data lama telah selesai sepenuhnya.');
            } else {
                console.log('Tidak ada data valid untuk diunggah setelah diproses.');
            }
        } else {
            console.log('Tidak ada data absensi lama yang perlu dimigrasi.');
        }

    } catch (error) {
        console.error('%c[Kesalahan Migrasi Klien]', 'font-weight: bold; color: #dc2626;', error.message);
    } finally {
        console.groupEnd();
    }
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

        const loginResponse = await apiService.loginOrRegisterUser(profile);

        if (loginResponse.maintenance) {
            await setState({ maintenanceMode: { ...state.maintenanceMode, isActive: true } });
            hideLoader();
            navigateTo('maintenance');
            return;
        }
        
        const { user, initialStudents, initialLogs, latestVersion } = loginResponse;
        
        // The user object now contains primaryRole and isParent
        await setState({
            userProfile: user,
            studentsByClass: initialStudents || state.studentsByClass,
            savedLogs: initialLogs || state.savedLogs,
            localVersion: latestVersion || state.localVersion,
        });

        hideLoader();
        showNotification(`Selamat datang, ${state.userProfile.name}!`);

        // Trigger client-side migration for Super Admins
        if (user.primaryRole === 'SUPER_ADMIN') {
            triggerClientSideMigration(); // Fire-and-forget
        }

        // ALWAYS navigate to the new multi-role home screen.
        // This screen will decide what to show based on the user's roles.
        navigateTo('multiRoleHome');

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
    await idb.set('userProfile', null);
    await idb.set('userData', null);
    
    // Reset runtime state completely
    state.userProfile = null;
    state.studentsByClass = {};
    state.savedLogs = [];
    state.localVersion = 0;

    navigateTo('setup');
}
