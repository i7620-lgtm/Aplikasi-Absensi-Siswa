import { initializeGsi, handleSignIn, handleSignOut } from './auth.js';
import { templates } from './templates.js';
import { showLoader, hideLoader, showNotification, showConfirmation, renderScreen, updateOnlineStatus } from './ui.js';
import { apiService } from './api.js';
import { idb } from './db.js';

// --- CONFIGURATION ---
export const CLASSES = ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B", "6A", "6B"];

// --- APPLICATION STATE ---
export let state = {
    userProfile: null, // will contain { name, email, picture, role, school_id }
    currentScreen: 'setup',
    selectedClass: '',
    selectedDate: new Date().toISOString().split('T')[0],
    students: [], 
    studentsByClass: {},
    attendance: {},
    savedLogs: [], 
    historyClassFilter: null,
    dataScreenFilters: {
        studentName: '',
        status: 'all',
        startDate: '',
        endDate: '',
    },
    newStudents: [''],
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
        data: null, // Will store pre-aggregated data from the server
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
};

// Function to update state and persist it
export async function setState(newState) {
    const oldState = { ...state };
    state = { ...state, ...newState };

    // Persist critical data for offline use
    if (newState.userProfile || newState.studentsByClass || newState.savedLogs) {
        await idb.set('userProfile', state.userProfile);
        await idb.set('userData', {
            students_by_class: state.studentsByClass,
            saved_logs: state.savedLogs
        });
        
        const hasDataChanged = JSON.stringify(oldState.studentsByClass) !== JSON.stringify(state.studentsByClass) ||
                               JSON.stringify(oldState.savedLogs) !== JSON.stringify(state.savedLogs);

        if (hasDataChanged) {
            syncData().catch(err => console.error("Sync process failed:", err));
        }
    }
}

// --- MAIN RENDER FUNCTION ---
export function render() {
    renderScreen(state.currentScreen);
}

export function navigateTo(screen) {
    const schoolContextScreens = ['setup', 'dashboard', 'add-students', 'attendance', 'data', 'recap'];
    if (schoolContextScreens.includes(state.currentScreen) && !schoolContextScreens.includes(screen)) {
        if (state.adminActingAsSchool) {
            console.log("Leaving school context flow. Clearing Super Admin context.");
            setState({ adminActingAsSchool: null });
        }
    }
    
    const adminPanelScreens = ['adminPanel'];
    if (adminPanelScreens.includes(state.currentScreen) && !adminPanelScreens.includes(screen)) {
        if (state.adminPanel.selectedUsers.length > 0) {
            console.log("Leaving admin panel. Clearing user selections.");
            setState({ adminPanel: { ...state.adminPanel, selectedUsers: [] } });
        }
    }

    // --- START: Real-time update cleanup ---
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
    // --- END: Real-time update cleanup ---
    
    state.currentScreen = screen;
    render();
}

async function syncData() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('sync-data');
            console.log('Background sync registration successful.');
        } catch (e) {
            console.error('Background sync registration failed:', e);
        }
    }

    if (navigator.onLine && state.userProfile) {
        console.log('Online, attempting immediate sync...');
        showNotification('Menyinkronkan data ke cloud...', 'info');
        try {
            await apiService.saveData({ studentsByClass: state.studentsByClass, savedLogs: state.savedLogs });
            console.log('Immediate sync successful.');
            showNotification('Data berhasil disinkronkan!', 'success');
        } catch (error) {
            console.error('Immediate sync failed, relying on background sync.', error);
            showNotification('Gagal sinkronisasi, akan dicoba lagi di latar belakang.', 'error');
        }
    } else if (!navigator.onLine) {
        showNotification('Anda offline. Data disimpan lokal dan akan disinkronkan nanti.');
    }
}


async function findAndLoadClassDataForAdmin(className) {
    const isAdmin = state.userProfile.role === 'SUPER_ADMIN' || state.userProfile.role === 'ADMIN_SEKOLAH';
    if (!isAdmin) return false;

    const schoolId = state.userProfile.role === 'SUPER_ADMIN' ? state.adminActingAsSchool?.id : state.userProfile.school_id;
    if (!schoolId) {
        showNotification('Konteks sekolah tidak dipilih.', 'error');
        return false;
    }

    showLoader('Mencari data siswa...');
    try {
        const { aggregatedStudentsByClass } = await apiService.getSchoolStudentData(schoolId);
        const classData = aggregatedStudentsByClass[className];
        
        if (classData && classData.students && classData.students.length > 0) {
            state.studentsByClass[className] = {
                ...(state.studentsByClass[className] || {}),
                students: classData.students
            };
            state.students = classData.students;
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
    const isAdmin = state.userProfile.role === 'SUPER_ADMIN' || state.userProfile.role === 'ADMIN_SEKOLAH';

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
        state.newStudents = [''];
        navigateTo('add-students');
    } else {
        state.attendance = existingLog ? { ...existingLog.attendance } : {};
        if (!existingLog) {
            state.students.forEach(s => state.attendance[s] = 'H');
        }
        navigateTo('attendance');
    }
}

export async function handleManageStudents() {
    state.selectedClass = document.getElementById('class-select').value;
    let students = (state.studentsByClass[state.selectedClass] || {}).students || [];
    const isAdmin = state.userProfile.role === 'SUPER_ADMIN' || state.userProfile.role === 'ADMIN_SEKOLAH';
    if (students.length === 0 && isAdmin) {
        const found = await findAndLoadClassDataForAdmin(state.selectedClass);
        if (found) students = state.students;
    }
    state.students = students;
    state.newStudents = state.students.length > 0 ? [...state.students] : [''];
    navigateTo('add-students');
}

export async function handleSaveNewStudents() {
    const finalStudentList = state.newStudents.map(s => s.trim()).filter(s => s);
    showLoader('Menyimpan data siswa...');
    
    const updatedStudentsByClass = {
        ...state.studentsByClass,
        [state.selectedClass]: {
            students: finalStudentList,
            lastModified: new Date().toISOString()
        }
    };
    
    await setState({ studentsByClass: updatedStudentsByClass });
    
    hideLoader();
    navigateTo('setup');
}

export async function handleSaveAttendance() {
    const confirmed = await showConfirmation(`Anda akan menyimpan data absensi untuk kelas ${state.selectedClass}. Lanjutkan?`);
    if (!confirmed) return;

    showLoader('Menyimpan absensi...');

    const existingLogIndex = state.savedLogs.findIndex(log => log.class === state.selectedClass && log.date === state.selectedDate);
    const newLog = { 
        date: state.selectedDate, 
        class: state.selectedClass, 
        attendance: { ...state.attendance },
        lastModified: new Date().toISOString()
    };

    const updatedLogs = [...state.savedLogs];
    if (existingLogIndex > -1) { 
        updatedLogs[existingLogIndex] = newLog; 
    } else { 
        updatedLogs.push(newLog); 
    }

    await setState({ savedLogs: updatedLogs });
    
    hideLoader();
    navigateTo('success');
}

export async function handleViewHistory(isClassSpecific = false) {
    const isSuperAdmin = state.userProfile.role === 'SUPER_ADMIN';
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
    
    try {
        const { recommendation } = await apiService.generateAiRecommendation({ aiRange });
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
    const csvContent = "data:text/csv;charset=utf-8," + "Nama Siswa\nContoh Siswa 1\nContoh Siswa 2";
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
            const studentNames = json.slice(1).map(row => String(row[0] || '').trim()).filter(Boolean);

            if (studentNames.length > 0) {
                state.newStudents = studentNames;
                renderScreen('add-students');
                showNotification(`${studentNames.length} siswa berhasil diimpor & akan menggantikan daftar saat ini.`);
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

export async function handleDownloadData() {
    showLoader('Menyiapkan data untuk diunduh...');

    try {
        const { recapArray } = await apiService.getRecapData({
            schoolId: state.adminActingAsSchool?.id || state.userProfile.school_id,
            classFilter: null,
        });

        if (!recapArray || recapArray.length === 0) {
            hideLoader();
            showNotification('Tidak ada data rekap untuk diunduh.', 'error');
            return;
        }

        const dataForSheet = [
            ['Nama Lengkap', 'Kelas', 'Sakit (S)', 'Izin (I)', 'Alpa (A)', 'Total Absen']
        ];

        recapArray.forEach((item) => {
            dataForSheet.push([
                item.name,
                item.class,
                item.S,
                item.I,
                item.A,
                item.total
            ]);
        });
        
        const worksheet = XLSX.utils.aoa_to_sheet(dataForSheet);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Absensi');
        
        const columnWidths = dataForSheet[0].map((_, colIndex) => ({
            wch: dataForSheet.reduce((w, r) => Math.max(w, String(r[colIndex] || "").length), 10)
        }));
        worksheet['!cols'] = columnWidths;

        XLSX.writeFile(workbook, 'Rekap_Absensi_Siswa.xlsx');
        
        hideLoader();
        showNotification('Data absensi berhasil diunduh.', 'success');

    } catch (error) {
        hideLoader();
        showNotification('Terjadi kesalahan saat membuat file Excel.', 'error');
        console.error("Failed to download data:", error);
    }
}


// --- INITIALIZATION ---
async function loadInitialData() {
    const userProfile = await idb.get('userProfile');
    const userData = await idb.get('userData');

    if (userProfile && userData) {
        state.userProfile = userProfile;
        state.studentsByClass = userData.students_by_class || {};
        state.savedLogs = userData.saved_logs || [];
        
        console.log('Data dipulihkan dari penyimpanan offline untuk:', userProfile.name);
        
        if (userProfile.role === 'SUPER_ADMIN') {
            state.currentScreen = 'adminHome';
        } else if (userProfile.role === 'KEPALA_SEKOLAH') {
            state.currentScreen = 'dashboard';
        } else {
            state.currentScreen = 'setup';
        }
    }
}

// Global scope for the listener to be added only once
let rootListenerAttached = false;

async function initApp() {
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
    
    if (state.maintenanceMode.isActive && state.userProfile?.role !== 'SUPER_ADMIN') {
        navigateTo('maintenance');
    } else {
        initializeGsi();
        render();
    }

    window.addEventListener('online', () => {
        updateOnlineStatus(true);
        showNotification('Koneksi internet kembali pulih.', 'success');
        syncData();
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
