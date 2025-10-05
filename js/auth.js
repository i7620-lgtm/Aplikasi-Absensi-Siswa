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
            throw new Error("Google Client ID tidak dapat diambil dari server.");
        }

        if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
            throw new Error("Skrip Google Identity Services belum dimuat.");
        }

        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleTokenResponse,
            auto_select: false,
            cancel_on_tap_outside: true
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
        displayAuthError(error.message); // Menampilkan pesan error yang lebih spesifik dari API
    }
}

export function handleSignIn() {
    try {
        if (!isGsiReady) throw new Error("Google Sign-In service is not ready.");
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

        // --- Client-side Migration Trigger for Super Admin ---
        if (user.primaryRole === 'SUPER_ADMIN') {
            console.groupCollapsed("[Migrasi Data Lama]");
            try {
                console.log("Memeriksa status migrasi ke server...");
                const migrationResponse = await apiService.checkAndStartClientMigration();
                console.log("Status migrasi diterima:", migrationResponse.status);

                if (migrationResponse.status === 'pending' && migrationResponse.data) {
                    const rawData = migrationResponse.data;
                    const defaultSchoolId = migrationResponse.defaultSchoolId;
                    console.log(`Diterima ${rawData.length} baris data absensi mentah dari server.`);
                    console.log("Memulai pemrosesan dan pengelompokan data di browser...");
                    
                    const changeLog = [];
                    const studentLists = {}; // key: `schoolId-className`, value: {students: []}

                    rawData.forEach(row => {
                        const schoolId = row.school_id || defaultSchoolId;
                        if (!schoolId) return; // Skip if no school context

                        // Process `saved_logs` for attendance
                        if (row.saved_logs && Array.isArray(row.saved_logs)) {
                            row.saved_logs.forEach(log => {
                                changeLog.push({
                                    school_id: schoolId,
                                    user_email: row.user_email || row.teacher_email || user.email,
                                    event_type: 'ATTENDANCE_UPDATED',
                                    payload: {
                                        date: log.date,
                                        class: log.class,
                                        attendance: log.attendance,
                                    }
                                });
                            });
                        }
                        
                        // Process `nts_by_class` for student lists
                        if (row.nts_by_class && typeof row.nts_by_class === 'object') {
                            Object.entries(row.nts_by_class).forEach(([className, classData]) => {
                                if (classData && classData.students) {
                                     const key = `${schoolId}-${className}`;
                                     // Only take the latest list for each class in the old data
                                     studentLists[key] = {
                                         school_id: schoolId,
                                         user_email: row.user_email || row.teacher_email || user.email,
                                         event_type: 'STUDENT_LIST_UPDATED',
                                         payload: {
                                             class: className,
                                             students: classData.students
                                         }
                                     };
                                }
                            });
                        }
                    });

                    // Add the student lists to the final changelog
                    Object.values(studentLists).forEach(list => changeLog.push(list));

                    console.log(`Pemrosesan selesai. Dihasilkan ${changeLog.length} rekaman change_log yang sudah dikelompokkan.`);
                    
                    if (changeLog.length > 0) {
                        console.log("Mengunggah data yang telah diproses ke server...");
                        const uploadResponse = await apiService.uploadMigratedData(changeLog);
                        console.log("Unggahan migrasi berhasil:", uploadResponse);
                        showNotification(`Migrasi data lama berhasil: ${uploadResponse.count} rekaman diproses.`, 'success');
                    } else {
                        console.log("Tidak ada data valid untuk diunggah setelah diproses.");
                    }
                } else if (migrationResponse.status === 'no_data_table') {
                    console.log("Tidak ada tabel data lama, tidak perlu migrasi.");
                } else {
                     console.log("Migrasi data tidak diperlukan atau sudah selesai.");
                }

            } catch (migrationError) {
                console.error("[Migration Failed]", migrationError);
                showNotification(`Proses migrasi gagal: ${migrationError.message}`, 'error');
            } finally {
                console.groupEnd();
            }
        }
        
        navigateTo('multiRoleHome');
    } catch (error) {
        console.error("A critical error occurred after receiving the token:", error);
        displayAuthError('Gagal memproses login Anda.', error);
        await handleSignOut(); // Ensure clean state on failure
    } finally {
        hideLoader();
    }
}
