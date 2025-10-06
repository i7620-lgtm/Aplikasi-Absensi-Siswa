import { initializeGsi, handleSignIn, handleSignOut, handleAuthenticationRedirect } from './auth.js';
import { templates } from './templates.js';
import { showLoader, hideLoader, showNotification, showConfirmation, renderScreen, updateOnlineStatus, showSchoolSelectorModal, stopAllPollers, resumePollingForCurrentScreen } from './ui.js';
import { apiService } from './api.js';
import { idb } from './db.js';

// --- CONFIGURATION ---
export const CLASSES = ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B", "6A", "6B"];

// --- APPLICATION STATE ---
export let state = {
    userProfile: null, // will contain { name, email, picture, primaryRole, isParent, school_id, ... }
    currentScreen: 'landingPage',
    selectedClass: '',
    selectedDate: new Date().toISOString().split('T')[0],
    students: [], 
    studentsByClass: {},
    attendance: {},
    savedLogs: [], 
    localVersion: 0, // NEW: Tracks the latest change ID processed by the client
    historyClassFilter: null,
    allHistoryLogs: [],
    dataScreenFilters: {
        studentName: '',
        status: 'all',
        startDate: '',
        endDate: '',
    },
    newStudents: [{ name: '', parentEmail: '' }], // Changed to object
    recapSortOrder: 'total',
    adminPanel: {
        users: [],
        schools: [],
        isLoading: true,
        polling: {
            timeoutId: null,
            interval: 10000,
        },
        currentPage: 1,
        groupBySchool: false,
        selectedUsers: [],
    },
    dashboard: {
        data: null, // Will store comprehensive payload from the server
        isLoading: true,
        selectedDate: new Date().toISOString().split('T')[0],
        polling: {
            timeoutId: null,
            interval: 10000,
        },
        activeView: 'report', // 'report', 'percentage', 'ai'
        chartViewMode: 'daily', // 'daily', 'weekly', 'monthly', 'yearly'
        chartClassFilter: 'all', // 'all' or specific class name
        chartSchoolFilter: 'all', // NEW: 'all' or specific school ID for regional dashboard
        aiRecommendation: {
            isLoading: false,
            result: null,
            error: null,
            selectedRange: 'last30days', // 'last30days', 'semester', 'year'
        },
    },
    parentDashboard: { // New state for parent view
        isLoading: true,
        data: null,
    },
    setup: {
        polling: {
            timeoutId: null,
            interval: 10000,
        },
    },
    adminActingAsSchool: null, // Stores {id, name} for SUPER_ADMIN context
    adminActingAsJurisdiction: null, // NEW: Stores {id, name} for SUPER_ADMIN/DINAS context
    lastSaveContext: null, // Stores { savedBy, className } for success message
};

// Function to update state and persist it
export async function setState(newState) {
    // --- NEW: Centralized context clearing logic ---
    // Ensures a Super Admin can only be in one context (school or jurisdiction) at a time.
    if ('adminActingAsSchool' in newState && newState.adminActingAsSchool) {
        newState.adminActingAsJurisdiction = null;
    } else if ('adminActingAsJurisdiction' in newState && newState.adminActingAsJurisdiction) {
        newState.adminActingAsSchool = null;
    }
    // --- END of new logic ---
    
    state = { ...state, ...newState };

    if (newState.userProfile !== undefined || newState.studentsByClass !== undefined || newState.savedLogs !== undefined || newState.localVersion !== undefined) {
        await idb.set('userProfile', state.userProfile);
        
        await idb.set('userData', {
            studentsByClass: state.studentsByClass,
            savedLogs: state.savedLogs,
            localVersion: state.localVersion
        });
    }
}

// --- MAIN RENDER FUNCTION ---
export function render() {
    renderScreen(state.currentScreen);
}

export function navigateTo(screen) {
    const schoolContextScreens = ['setup', 'dashboard', 'add-students', 'attendance', 'data', 'recap'];
    const adminContextScreens = ['dashboard', 'jurisdictionPanel', 'adminPanel', 'migrationTool'];
    
    if (schoolContextScreens.includes(state.currentScreen) && !schoolContextScreens.includes(screen)) {
        if (state.adminActingAsSchool) {
            console.log("Leaving school context. Clearing Super Admin school context.");
            setState({ 
                adminActingAsSchool: null,
                dashboard: { ...state.dashboard, data: null, isLoading: true }
            });
        }
    }
    
    if (adminContextScreens.includes(state.currentScreen) && !adminContextScreens.includes(screen)) {
        if (state.adminActingAsJurisdiction) {
            console.log("Leaving jurisdiction context. Clearing context.");
            setState({ 
                adminActingAsJurisdiction: null,
                dashboard: { ...state.dashboard, data: null, isLoading: true } 
            });
        }
    }
    
    const adminPanelScreens = ['adminPanel'];
    if (adminPanelScreens.includes(state.currentScreen) && !adminPanelScreens.includes(screen)) {
        if (state.adminPanel.selectedUsers.length > 0) {
            console.log("Leaving admin panel. Clearing user selections.");
            setState({ adminPanel: { ...state.adminPanel, selectedUsers: [] } });
        }
    }

    // Stop any active polling when navigating away from a screen.
    // This is now the primary mechanism for stopping pollers.
    stopAllPollers();
    
    state.currentScreen = screen;
    render();
}

async function findAndLoadClassDataForAdmin(className) {
    const isAdmin = ['SUPER_ADMIN', 'ADMIN_SEKOLAH'].includes(state.userProfile.primaryRole);
    if (!isAdmin) return false;

    const schoolId = state.userProfile.primaryRole === 'SUPER_ADMIN' ? state.adminActingAsSchool?.id : state.userProfile.school_id;
    if (!schoolId) {
        showNotification('Konteks sekolah tidak dipilih.', 'error');
        return false;
    }

    showLoader('Mencari data siswa...');
    try {
        const { aggregatedStudentsByClass } = await apiService.getSchoolStudentData(schoolId);
        const classData = aggregatedStudentsByClass[className];
        
        if (classData && classData.length > 0) {
            state.studentsByClass[className] = {
                ...(state.studentsByClass[className] || {}),
                students: classData
            };
            state.students = classData;
            return true;
        }
    } catch (error) {
        showNotification(error.message, 'error');
        console.error("Gagal mengambil data siswa sekolah:", error);
    } finally {
        hideLoader();
    }
    
    return false;
}

// --- EVENT HANDLERS & LOGIC ---
export async function handleStartAttendance() {
    state.selectedClass = document.getElementById('class-select').value;
    state.selectedDate = document.getElementById('date-input').value;
    
    let students = (state.studentsByClass[state.selectedClass] || {}).students || [];
    const isAdmin = ['SUPER_ADMIN', 'ADMIN_SEKOLAH'].includes(state.userProfile.primaryRole);

    if (students.length === 0 && isAdmin) {
        const found = await findAndLoadClassDataForAdmin(state.selectedClass);
        if (found) {
            students = state.students;
        }
    }
    state.students = students;
    
    const existingLog = state.savedLogs.find(log => log.class === state.selectedClass && log.date === state.selectedDate);
    if (existingLog) {
        const confirmed = await showConfirmation(`Absensi untuk kelas ${state.selectedClass} pada tanggal ini sudah ada. Ingin mengeditnya?`);
        if (!confirmed) return;
    }

    if (state.students.length === 0) {
        state.newStudents = [{ name: '', parentEmail: '' }];
        navigateTo('add-students');
    } else {
        state.attendance = existingLog ? { ...existingLog.attendance } : {};
        if (!existingLog) {
            state.students.forEach(s => state.attendance[s.name] = 'H');
        }
        navigateTo('attendance');
    }
}

export async function handleManageStudents() {
    state.selectedClass = document.getElementById('class-select').value;
    let students = (state.studentsByClass[state.selectedClass] || {}).students || [];
    const isAdmin = ['SUPER_ADMIN', 'ADMIN_SEKOLAH'].includes(state.userProfile.primaryRole);
    if (students.length === 0 && isAdmin) {
        const found = await findAndLoadClassDataForAdmin(state.selectedClass);
        if (found) students = state.students;
    }
    state.students = students;
    state.newStudents = state.students.length > 0 ? [...state.students] : [{ name: '', parentEmail: '' }];
    navigateTo('add-students');
}

export async function handleSaveNewStudents() {
    const finalStudentList = state.newStudents
        .map(s => ({ name: s.name.trim(), parentEmail: (s.parentEmail || '').trim() }))
        .filter(s => s.name);

    showLoader('Menyimpan data siswa...');
    
    const newStudentLog = {
        type: 'STUDENT_LIST_UPDATED',
        payload: {
            class: state.selectedClass,
            students: finalStudentList
        }
    };

    try {
        const response = await apiService.saveData(newStudentLog);
        
        // Optimistic update for both online and offline
        const updatedStudentsByClass = { ...state.studentsByClass };
        updatedStudentsByClass[state.selectedClass] = { students: finalStudentList };

        if (response.queued) {
            // Offline case: Only update local state, NOT localVersion
            await setState({ studentsByClass: updatedStudentsByClass });
            hideLoader();
            showNotification('Anda sedang offline. Daftar siswa disimpan lokal dan akan disinkronkan nanti.', 'info');
        } else {
            // Online case: Update state AND localVersion from server
            await setState({ 
                studentsByClass: updatedStudentsByClass,
                localVersion: response.newVersion
            });
            hideLoader();
        }
        
        navigateTo('setup');
    } catch (error) {
        hideLoader();
        showNotification('Gagal menyimpan daftar siswa: ' + error.message, 'error');
    }
}

export async function handleSaveAttendance() {
    const confirmed = await showConfirmation(`Anda akan menyimpan data absensi untuk kelas ${state.selectedClass}. Lanjutkan?`);
    if (!confirmed) return;

    showLoader('Menyimpan absensi...');

    const newLogPayload = { 
        date: state.selectedDate, 
        class: state.selectedClass, 
        attendance: { ...state.attendance },
    };
    
    const newLogEvent = {
        type: 'ATTENDANCE_UPDATED',
        payload: newLogPayload
    };

    try {
        const response = await apiService.saveData(newLogEvent);

        // Optimistically update local state on success (for both online and offline)
        const existingLogIndex = state.savedLogs.findIndex(log => log.class === state.selectedClass && log.date === state.selectedDate);
        const updatedLogs = [...state.savedLogs];
        if (existingLogIndex > -1) { 
            updatedLogs[existingLogIndex] = newLogPayload; 
        } else { 
            updatedLogs.push(newLogPayload); 
        }

        const newContext = { 
            savedBy: response.savedBy, 
            className: state.selectedClass 
        };
        
        if (response.queued) {
             // Offline Case: Update local data, but NOT the version number
            await setState({ 
                savedLogs: updatedLogs, 
                lastSaveContext: newContext,
            });
            hideLoader();
            showNotification('Anda sedang offline. Absensi disimpan lokal dan akan disinkronkan nanti.', 'info');
        } else {
            // Online Case: Update local data AND the version number
            await setState({ 
                savedLogs: updatedLogs, 
                lastSaveContext: newContext,
                localVersion: response.newVersion
            });
            hideLoader();
        }
        
        navigateTo('success');
    } catch (error) {
        console.error("Save failed:", error);
        showNotification('Gagal menyimpan: ' + error.message, 'error');
        hideLoader();
    }
}


export async function handleViewHistory(isClassSpecific = false) {
    const isSuperAdmin = state.userProfile.primaryRole === 'SUPER_ADMIN';
    const isGlobalView = isSuperAdmin && !isClassSpecific && !state.adminActingAsSchool;

    await setState({ 
        dataScreenFilters: { studentName: '', status: 'all', startDate: '', endDate: '' },
        historyClassFilter: isClassSpecific ? document.getElementById('class-select').value : null,
        adminAllLogsView: isGlobalView, // Simplified flag
    });
    
    navigateTo('data');
}

export async function handleViewRecap() {
    state.selectedClass = document.getElementById('class-select').value;
    navigateTo('recap');
}


export async function handleGenerateAiRecommendation() {
    const aiRange = state.dashboard.aiRecommendation.selectedRange;
    await setState({ dashboard: { ...state.dashboard, aiRecommendation: { ...state.dashboard.aiRecommendation, isLoading: true, result: null, error: null } } });
    render();

    // Determine the correct context for the current dashboard view.
    const schoolId = state.userProfile.primaryRole === 'SUPER_ADMIN' 
        ? state.adminActingAsSchool?.id 
        : state.userProfile.school_id;
    
    const jurisdictionId = (state.userProfile.primaryRole === 'SUPER_ADMIN' && state.adminActingAsJurisdiction)
        ? state.adminActingAsJurisdiction.id
        : (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(state.userProfile.primaryRole) ? state.userProfile.jurisdiction_id : null);
    
    if (!schoolId && !jurisdictionId) {
        const errorMessage = 'Konteks sekolah atau yurisdiksi tidak dapat ditentukan.';
        await setState({ dashboard: { ...state.dashboard, aiRecommendation: { ...state.dashboard.aiRecommendation, isLoading: false, result: null, error: errorMessage } } });
        render();
        return;
    }

    try {
        const { recommendation } = await apiService.generateAiRecommendation({ aiRange, schoolId, jurisdictionId });
        await setState({ dashboard: { ...state.dashboard, aiRecommendation: { ...state.dashboard.aiRecommendation, isLoading: false, result: recommendation, error: null } } });
    
    } catch(error) {
        console.error("AI Recommendation Error:", error);
        const errorMessage = error.message || 'Gagal menghasilkan rekomendasi. Coba lagi nanti.';
        await setState({ dashboard: { ...state.dashboard, aiRecommendation: { ...state.dashboard.aiRecommendation, isLoading: false, result: null, error: errorMessage } } });
    } finally {
        render();
    }
}

export async function handleCreateSchool() {
    const schoolName = prompt("Masukkan nama sekolah baru:");
    if (schoolName && schoolName.trim()) {
        showLoader('Menambahkan sekolah...');
        try {
            await apiService.createSchool(schoolName.trim());
            showNotification(`Sekolah "${schoolName.trim()}" berhasil ditambahkan.`);
            navigateTo('adminPanel');
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            hideLoader();
        }
    }
}

export async function handleMigrateLegacyData() {
    const schoolIdEl = document.getElementById('migration-school-id');
    const userEmailEl = document.getElementById('migration-user-email');
    const legacyDataEl = document.getElementById('migration-legacy-data');
    const resultEl = document.getElementById('migration-result');

    const schoolId = schoolIdEl.value.trim();
    const userEmail = userEmailEl.value.trim();
    const legacyDataStr = legacyDataEl.value.trim();

    resultEl.textContent = '';

    if (!schoolId || !userEmail || !legacyDataStr) {
        showNotification('Semua kolom harus diisi.', 'error');
        return;
    }

    let legacyData;
    try {
        legacyData = JSON.parse(legacyDataStr);
    } catch (e) {
        showNotification('Data JSON tidak valid. Periksa formatnya.', 'error');
        resultEl.textContent = `Error parsing JSON: ${e.message}`;
        resultEl.classList.add('text-red-500');
        return;
    }

    const confirmed = await showConfirmation(`Anda akan memigrasikan data untuk sekolah ID ${schoolId} atas nama ${userEmail}. Tindakan ini tidak dapat diurungkan. Lanjutkan?`);
    if (!confirmed) return;

    showLoader('Memigrasikan data...');
    try {
        const response = await apiService.migrateLegacyData({ schoolId, userEmail, legacyData });
        showNotification(response.message, 'success');
        resultEl.textContent = response.message;
        resultEl.classList.remove('text-red-500');
        resultEl.classList.add('text-green-600');
        legacyDataEl.value = ''; // Clear on success
    } catch (error) {
        showNotification(`Migrasi gagal: ${error.message}`, 'error');
        resultEl.textContent = `Error: ${error.message}`;
        resultEl.classList.add('text-red-500');
    } finally {
        hideLoader();
    }
}


export function handleDownloadTemplate() {
    const csvContent = "data:text/csv;charset=utf-8," 
        + "Nama Siswa,Email Orang Tua\n"
        + "Contoh Siswa 1,orangtua1@example.com\n"
        + "Contoh Siswa 2,orangtua2@example.com";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "template_siswa.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let workbook;
            if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                 workbook = XLSX.read(e.target.result, { type: 'string' });
            } else {
                 const data = new Uint8Array(e.target.result);
                 workbook = XLSX.read(data, { type: 'array' });
            }
           
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            const newStudents = json.slice(1).map(row => ({
                name: String(row[0] || '').trim(),
                parentEmail: String(row[1] || '').trim()
            })).filter(s => s.name);

            if (newStudents.length > 0) {
                state.newStudents = newStudents;
                renderScreen('add-students');
                showNotification(`${newStudents.length} siswa berhasil diimpor & akan menggantikan daftar saat ini.`);
            } else {
                showNotification('Tidak ada nama siswa yang ditemukan di file.', 'error');
            }
        } catch (error) {
            showNotification('Gagal membaca file. Pastikan formatnya benar dan tidak rusak.', 'error');
            console.error("Excel import error:", error);
        }
    };
    
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
    event.target.value = '';
}

async function downloadRecapData(params) {
    showLoader('Menyiapkan data untuk diunduh...');
    try {
        const { recapArray } = await apiService.getRecapData(params);

        if (!recapArray || recapArray.length === 0) {
            hideLoader();
            showNotification('Tidak ada data rekap untuk diunduh.', 'info');
            return;
        }

        const dataForSheet = [['Nama Lengkap', 'Kelas', 'Sakit (S)', 'Izin (I)', 'Alpa (A)', 'Total Absen']];
        recapArray.forEach(item => {
            dataForSheet.push([item.name, item.class, item.S, item.I, item.A, item.total]);
        });
        
        const worksheet = XLSX.utils.aoa_to_sheet(dataForSheet);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Absensi');
        
        const columnWidths = dataForSheet[0].map((_, colIndex) => ({
            wch: dataForSheet.reduce((w, r) => Math.max(w, String(r[colIndex] || "").length), 10)
        }));
        worksheet['!cols'] = columnWidths;

        const fileName = params.fileName || 'Laporan_Absensi.xlsx';
        XLSX.writeFile(workbook, fileName);
        
        hideLoader();
        showNotification('Data absensi berhasil diunduh.', 'success');
    } catch (error) {
        hideLoader();
        showNotification('Terjadi kesalahan saat membuat file Excel.', 'error');
        console.error("Failed to download data:", error);
    }
}

export async function handleDownloadData() {
    state.selectedClass = document.getElementById('class-select').value;
    const schoolId = state.adminActingAsSchool?.id || state.userProfile.school_id;
    const fileName = `Rekap_Absensi_Kelas_${state.selectedClass}.xlsx`;
    await downloadRecapData({ classFilter: state.selectedClass, schoolId, fileName });
}

export async function handleDownloadFullSchoolReport(schoolId, schoolName) {
    const finalSchoolId = schoolId || state.userProfile.school_id;
    if (!finalSchoolId) {
        showNotification('Tidak dapat menentukan sekolah untuk diunduh.', 'error');
        return;
    }
    
    let finalSchoolName = schoolName;
    if (!finalSchoolName) {
        const schoolInfo = state.adminPanel.schools.find(s => s.id === finalSchoolId);
        finalSchoolName = schoolInfo ? schoolInfo.name : `Sekolah_ID_${finalSchoolId}`;
    }
    
    const fileName = `Laporan_Absensi_Lengkap_${finalSchoolName.replace(/\s+/g, '_')}.xlsx`;
    await downloadRecapData({ schoolId: finalSchoolId, fileName });
}

export async function handleDownloadJurisdictionReport(jurisdictionId, jurisdictionName) {
    if (!jurisdictionId) {
        showNotification('Tidak dapat menentukan yurisdiksi untuk diunduh.', 'error');
        return;
    }
    const finalJurisdictionName = jurisdictionName || `Yurisdiksi_ID_${jurisdictionId}`;
    const fileName = `Laporan_Absensi_Regional_${finalJurisdictionName.replace(/\s+/g, '_')}.xlsx`;
    await downloadRecapData({ jurisdictionId, fileName });
}



// --- DATA SYNC LOGIC ---
function applyChanges(changes) {
    if (!changes || changes.length === 0) return false;

    let dataChanged = false;
    const newStudentsByClass = { ...state.studentsByClass };
    const newSavedLogs = [...state.savedLogs];

    changes.forEach(change => {
        const { event_type, payload } = change;
        if (event_type === 'ATTENDANCE_UPDATED') {
            const existingLogIndex = newSavedLogs.findIndex(log => log.class === payload.class && log.date === payload.date);
            if (existingLogIndex > -1) {
                newSavedLogs[existingLogIndex] = payload;
            } else {
                newSavedLogs.push(payload);
            }
            dataChanged = true;
        } else if (event_type === 'STUDENT_LIST_UPDATED') {
            newStudentsByClass[payload.class] = { students: payload.students };
            dataChanged = true;
        }
    });

    if (dataChanged) {
        setState({
            studentsByClass: newStudentsByClass,
            savedLogs: newSavedLogs,
            localVersion: changes[changes.length - 1].id // Update to the latest version ID from the batch
        });
    } else {
        // Even if no data changed, update version to not re-fetch same empty changes
        setState({ localVersion: changes[changes.length - 1].id });
    }
    
    return dataChanged;
}

async function syncWithServer() {
    if (!navigator.onLine || !state.userProfile || !state.userProfile.school_id) {
        console.log("Skipping sync: Offline, no user, or no school context.");
        return;
    }

    try {
        const { latestVersion } = await apiService.getUpdateSignal({ schoolId: state.userProfile.school_id });

        if (latestVersion && latestVersion > state.localVersion) {
            console.log(`Server version (${latestVersion}) > Local version (${state.localVersion}). Fetching changes.`);
            showNotification('Memperbarui data terbaru dari server...', 'info');

            const { changes } = await apiService.getChangesSince({ schoolId: state.userProfile.school_id, lastVersion: state.localVersion });
            
            const dataWasUpdated = applyChanges(changes);
            
            if (dataWasUpdated) {
                showNotification('Data berhasil diperbarui!', 'success');
                render(); // Re-render the current screen with the fresh data
            } else {
                console.log("Sync completed, no render needed as only version number was updated.");
            }
        } else {
            console.log("Local data is up-to-date.");
        }
    } catch (error) {
        console.error("Failed to sync with server:", error);
    }
}


// --- INITIALIZATION ---
async function loadInitialData() {
    const userProfile = await idb.get('userProfile');
    const userData = await idb.get('userData');

    if (userProfile && userData) {
        state.userProfile = userProfile;
        state.studentsByClass = userData.studentsByClass || {};
        state.savedLogs = userData.savedLogs || [];
        state.localVersion = userData.localVersion || 0;
        
        console.log(`Data dipulihkan dari penyimpanan offline. Versi lokal: ${state.localVersion}`);
        
        // With the new multi-role home, always go there if logged in.
        state.currentScreen = 'multiRoleHome';

    }
}

async function initApp() {
    // Clean up old localStorage data if it exists
    if (localStorage.getItem('attendanceApp')) {
        localStorage.removeItem('attendanceApp');
        console.log('Data lama dari localStorage telah dihapus.');
    }

    if (await handleAuthenticationRedirect()) {
        return;
    }

    showLoader('Memuat Aplikasi Absensi...');
    
    await loadInitialData();
    
    const loaderTextEl = document.querySelector('#loader-wrapper .loader-text');
    if (loaderTextEl) {
        loaderTextEl.textContent = 'Menyiapkan Autentikasi...';
    }

    await initializeGsi();
    render();
    if (state.userProfile) {
        syncWithServer(); // Initial sync on load
    }
    
    window.addEventListener('online', async () => {
        updateOnlineStatus(true);
        const queue = await idb.getQueue();
        if (queue.length > 0) {
            showNotification(`Koneksi pulih. Menyinkronkan ${queue.length} perubahan...`, 'info');
        } else {
            showNotification('Koneksi internet kembali pulih.', 'success');
        }
        if (state.userProfile) syncWithServer();
    });
    window.addEventListener('offline', () => updateOnlineStatus(false));
    
    updateOnlineStatus(navigator.onLine);

    // --- NEW: Page Visibility API handler ---
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            // Stop all pollers when the page is not visible
            stopAllPollers();
        } else if (document.visibilityState === 'visible') {
            // Resume polling for the current screen when the page becomes visible
            resumePollingForCurrentScreen();
        }
    });
}

initApp();
