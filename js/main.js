import { initializeGsi, handleSignIn, handleSignOut } from './auth.js';
import { templates } from './templates.js';
import { showLoader, hideLoader, showNotification, showConfirmation, renderScreen, updateOnlineStatus, showSchoolSelectorModal } from './ui.js';
import { apiService } from './api.js';
import { idb } from './db.js';

// --- CONFIGURATION ---
export const CLASSES = ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B", "6A", "6B"];

// --- APPLICATION STATE ---
export let state = {
    userProfile: null, // will contain { name, email, picture, primaryRole, isParent, school_id, ... }
    currentScreen: 'setup',
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
    maintenanceMode: {
        isActive: false,
        statusChecked: false,
    },
    connectionError: null,
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
    const adminContextScreens = ['dashboard', 'jurisdictionPanel', 'adminPanel'];
    
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

    if (state.dashboard.polling.timeoutId) {
        clearTimeout(state.dashboard.polling.timeoutId);
        setState({ dashboard: { ...state.dashboard, polling: { timeoutId: null, interval: 10000 } } });
        console.log('Dashboard polling stopped.');
    }
    if (state.adminPanel.polling.timeoutId) {
        clearTimeout(state.adminPanel.polling.timeoutId);
        setState({ adminPanel: { ...state.adminPanel, polling: { timeoutId: null, interval: 10000 } } });
        console.log('Admin Panel polling stopped.');
    }
    if (state.setup.polling.timeoutId) {
        clearTimeout(state.setup.polling.timeoutId);
        setState({ setup: { ...state.setup, polling: { timeoutId: null, interval: 10000 } } });
        console.log('Setup Screen (Teacher/Admin) polling stopped.');
    }
    
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

    // Determine the correct schoolId for the current context.
    const schoolId = state.userProfile.primaryRole === 'SUPER_ADMIN' 
        ? state.adminActingAsSchool?.id 
        : state.userProfile.school_id;
    
    if (!schoolId) {
        const errorMessage = 'Konteks sekolah tidak dapat ditentukan. Pastikan sekolah telah dipilih.';
        await setState({ dashboard: { ...state.dashboard, aiRecommendation: { ...state.dashboard.aiRecommendation, isLoading: false, result: null, error: errorMessage } } });
        render();
        return;
    }

    try {
        const { recommendation } = await apiService.generateAiRecommendation({ aiRange, schoolId });
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

async function downloadRecapData(classFilter, schoolId, fileName) {
    showLoader('Menyiapkan data untuk diunduh...');
    try {
        const { recapArray } = await apiService.getRecapData({ schoolId, classFilter });

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
    await downloadRecapData(state.selectedClass, schoolId, fileName);
}

export async function handleDownloadFullSchoolReport() {
    const isSuperAdmin = state.userProfile.primaryRole === 'SUPER_ADMIN';
    let schoolId = isSuperAdmin ? null : state.userProfile.school_id;
    let schoolName = 'Sekolah';

    if (isSuperAdmin) {
        const selectedSchool = await showSchoolSelectorModal('Pilih Sekolah untuk Laporan');
        if (!selectedSchool) return; // User cancelled
        schoolId = selectedSchool.id;
        schoolName = selectedSchool.name.replace(/\s+/g, '_'); // Sanitize name for filename
    } else {
        const schoolInfo = state.adminPanel.schools.find(s => s.id === schoolId);
        if (schoolInfo) schoolName = schoolInfo.name.replace(/\s+/g, '_');
    }
    
    if (!schoolId) {
        showNotification('Tidak dapat menentukan sekolah untuk diunduh.', 'error');
        return;
    }

    const fileName = `Laporan_Absensi_${schoolName}.xlsx`;
    await downloadRecapData(null, schoolId, fileName);
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

// Global scope for the listener to be added only once
let rootListenerAttached = false;

async function handleAuthenticationRedirect() {
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
        const { user, initialStudents, initialLogs, latestVersion, maintenance } = await apiService.loginOrRegisterUser(profile);

        if (maintenance) {
            navigateTo('maintenance');
        } else {
            await setState({
                userProfile: user,
                studentsByClass: initialStudents || {},
                savedLogs: initialLogs || [],
                localVersion: latestVersion || 0,
            });
            showNotification(`Selamat datang, ${user.name}!`);
            navigateTo('multiRoleHome');
        }
    } catch (error) {
        console.error("Gagal memproses login OAuth:", error);
        showNotification(`Gagal memproses login Anda: ${error.message}`, 'error');
        navigateTo('setup');
    } finally {
        hideLoader();
    }
    return true;
}


async function initApp() {
    if (await handleAuthenticationRedirect()) {
        return;
    }

    if(state.connectionError) {
        await setState({ connectionError: null });
    }
    
    try {
        showLoader('Memeriksa status server...');
        const { isMaintenance } = await apiService.getMaintenanceStatus();
        state.maintenanceMode.isActive = isMaintenance;
    } catch (e) {
        console.error("Tidak dapat memeriksa status perbaikan:", e);
        hideLoader();
        await setState({ connectionError: e.message });
        navigateTo('connectionFailed');
        return;
    } finally {
        state.maintenanceMode.statusChecked = true;
    }

    await loadInitialData();
    
    if (state.maintenanceMode.isActive && state.userProfile?.primaryRole !== 'SUPER_ADMIN') {
        navigateTo('maintenance');
    } else {
        await initializeGsi();
        render();
        if (state.userProfile) {
            syncWithServer(); // Initial sync on load
        }
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

    if (!rootListenerAttached) {
        document.getElementById('root').addEventListener('click', (e) => {
            if (e.target.id === 'retry-connection-btn') {
                showLoader('Mencoba menghubungkan kembali...');
                initApp();
            }
        });
        rootListenerAttached = true;
    }
}

initApp();
