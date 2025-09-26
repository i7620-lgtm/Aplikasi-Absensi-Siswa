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
    newStudents: [''],
    recapSortOrder: 'total',
    adminPanel: {
        users: [],
        schools: [], // To store list of all schools
        isLoading: true,
        pollingIntervalId: null, // For real-time updates
    },
    dashboard: {
        allTeacherData: [],
        isLoading: true,
        selectedDate: new Date().toISOString().split('T')[0],
        pollingIntervalId: null, // For real-time updates
        activeView: 'report', // 'report', 'percentage', 'ai'
        aiRecommendation: {
            isLoading: false,
            result: null,
            error: null,
        },
    },
    setup: {
        pollingIntervalId: null, // For real-time updates of teacher profile
    },
    maintenanceMode: {
        isActive: false,
        statusChecked: false,
    },
    adminAllLogsView: null,
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
            // Fire-and-forget the sync process with its own error handling.
            // This prevents sync errors from crashing the state update flow.
            syncData().catch(err => console.error("Sync process failed:", err));
        }
    }
}

// --- MAIN RENDER FUNCTION ---
export function render() {
    renderScreen(state.currentScreen);
}

export function navigateTo(screen) {
    // --- START: Real-time update cleanup ---
    // A centralized place to stop all polling intervals when the user navigates away.
    if (state.dashboard.pollingIntervalId) {
        clearInterval(state.dashboard.pollingIntervalId);
        setState({ dashboard: { ...state.dashboard, pollingIntervalId: null } });
        console.log('Dashboard polling stopped.');
    }
    if (state.adminPanel.pollingIntervalId) {
        clearInterval(state.adminPanel.pollingIntervalId);
        setState({ adminPanel: { ...state.adminPanel, pollingIntervalId: null } });
        console.log('Admin Panel polling stopped.');
    }
    if (state.setup.pollingIntervalId) {
        clearInterval(state.setup.pollingIntervalId);
        setState({ setup: { ...state.setup, pollingIntervalId: null } });
        console.log('Setup Screen (Teacher/Admin) polling stopped.');
    }
    // --- END: Real-time update cleanup ---
    
    state.currentScreen = screen;
    render();
}

async function syncData() {
    // 1. Always register a background sync. It's the most reliable method.
    // The browser will deduplicate requests, so it's safe to call multiple times.
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('sync-data');
            console.log('Background sync registration successful.');
        } catch (e) {
            console.error('Background sync registration failed:', e);
        }
    }

    // 2. If online and have a user, try an immediate sync for instant feedback.
    if (navigator.onLine && state.userProfile) {
        console.log('Online, attempting immediate sync...');
        showNotification('Menyinkronkan data ke cloud...', 'info');
        try {
            await apiService.saveData({ studentsByClass: state.studentsByClass, savedLogs: state.savedLogs });
            console.log('Immediate sync successful.');
            showNotification('Data berhasil disinkronkan!', 'success');
        } catch (error) {
            console.error('Immediate sync failed, relying on background sync.', error);
            // Notify user that it failed but will be handled in the background.
            showNotification('Gagal sinkronisasi, akan dicoba lagi di latar belakang.', 'error');
        }
    } else if (!navigator.onLine) {
        // 3. If offline, just notify the user that data is saved locally.
        showNotification('Anda offline. Data disimpan lokal dan akan disinkronkan nanti.');
    }
}


async function findAndLoadClassDataForAdmin(className) {
    if (state.userProfile.role !== 'SUPER_ADMIN') return false;

    showLoader('Mencari data kelas...');
    try {
        const { allData } = await apiService.getGlobalData();
        for (const teacherData of allData) {
            if (teacherData.students_by_class && teacherData.students_by_class[className]) {
                const students = teacherData.students_by_class[className].students;
                if (students && students.length > 0) {
                    // Temporarily load this data into the admin's state for the current session.
                    // This is not persisted to the admin's own data record.
                    state.studentsByClass[className] = {
                        ...(state.studentsByClass[className] || {}),
                        students: students
                    };
                    state.students = students;
                    hideLoader();
                    return true; // Data found and loaded
                }
            }
        }
    } catch (error) {
        showNotification(error.message, 'error');
        console.error("Gagal mengambil data global untuk admin", error);
        hideLoader();
        return false; // Error occurred
    }
    
    hideLoader();
    return false; // Not found anywhere
}


// --- EVENT HANDLERS & LOGIC ---
export async function handleStartAttendance() {
    state.selectedClass = document.getElementById('class-select').value;
    state.selectedDate = document.getElementById('date-input').value;
    
    let students = (state.studentsByClass[state.selectedClass] || {}).students || [];

    // If no local students and user is Admin, try to fetch from other teachers
    if (students.length === 0 && state.userProfile.role === 'SUPER_ADMIN') {
        const found = await findAndLoadClassDataForAdmin(state.selectedClass);
        if (found) {
            students = state.students; // update students with the found data
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
    if (students.length === 0 && state.userProfile.role === 'SUPER_ADMIN') {
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
    state.historyClassFilter = isClassSpecific ? document.getElementById('class-select').value : null;

    // Special logic for SUPER_ADMIN viewing all teacher logs
    if (state.userProfile.role === 'SUPER_ADMIN' && !isClassSpecific) {
        showLoader('Memuat semua riwayat guru...');
        try {
            const { allData } = await apiService.getGlobalData();
            // Flatten the data: each teacher has a saved_logs array.
            // We want one big array of log objects, with teacher name added.
            const flattenedLogs = allData.flatMap(teacher => 
                (teacher.saved_logs || []).map(log => ({ ...log, teacherName: teacher.user_name }))
            );
            state.adminAllLogsView = flattenedLogs;
        } catch (error) {
            showNotification(error.message, 'error');
            hideLoader();
            return; // Stop navigation if fetch fails
        }
    } else {
        // Ensure this is cleared when not in admin global view mode
        state.adminAllLogsView = null;
    }

    navigateTo('data');
}

export async function handleGenerateAiRecommendation() {
    await setState({ dashboard: { ...state.dashboard, aiRecommendation: { isLoading: true, result: null, error: null } } });
    render(); // Re-render to show loader
    
    try {
        const { recommendation } = await apiService.generateAiRecommendation();
        await setState({ dashboard: { ...state.dashboard, aiRecommendation: { isLoading: false, result: recommendation, error: null } } });
    } catch(error) {
        console.error("AI Recommendation Error:", error);
        const errorMessage = error.message || 'Gagal menghasilkan rekomendasi. Coba lagi nanti.';
        await setState({ dashboard: { ...state.dashboard, aiRecommendation: { isLoading: false, result: null, error: errorMessage } } });
    } finally {
        render(); // Re-render to show result or error
    }
}

export async function handleCreateSchool() {
    const schoolName = prompt("Masukkan nama sekolah baru:");
    if (schoolName && schoolName.trim()) {
        showLoader('Menambahkan sekolah...');
        try {
            await apiService.createSchool(schoolName.trim());
            showNotification(`Sekolah "${schoolName.trim()}" berhasil ditambahkan.`);
            // Refresh the admin panel to show the new school in options
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
            // Cerdas menangani file: jika CSV, baca sebagai teks. Lainnya sebagai biner.
            if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                 workbook = XLSX.read(e.target.result, { type: 'string' });
            } else {
                 // Untuk format biner seperti .xlsx, .xls
                 const data = new Uint8Array(e.target.result); // Memperbaiki kesalahan ketik dari UintArray
                 workbook = XLSX.read(data, { type: 'array' });
            }
           
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const studentNames = json.slice(1).map(row => String(row[0] || '').trim()).filter(Boolean);

            if (studentNames.length > 0) {
                state.newStudents = studentNames;
                renderScreen('add-students'); // Render ulang hanya bagian input
                showNotification(`${studentNames.length} siswa berhasil diimpor & akan menggantikan daftar saat ini.`);
            } else {
                showNotification('Tidak ada nama siswa yang ditemukan di file.', 'error');
            }
        } catch (error) {
            showNotification('Gagal membaca file. Pastikan formatnya benar dan tidak rusak.', 'error');
            console.error("Excel import error:", error);
        }
    };
    
    // Putuskan cara membaca file berdasarkan jenisnya
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
    event.target.value = ''; // Reset input
}

export async function handleDownloadData() {
    showLoader('Menyiapkan data untuk diunduh...');

    if (!state.studentsByClass || Object.keys(state.studentsByClass).length === 0) {
        hideLoader();
        showNotification('Tidak ada data siswa untuk diunduh.', 'error');
        return;
    }

    try {
        const recapData = {};
        const studentToClassMap = {};

        for (const className in state.studentsByClass) {
            if (state.studentsByClass[className] && state.studentsByClass[className].students) {
                state.studentsByClass[className].students.forEach(studentName => {
                    recapData[studentName] = { S: 0, I: 0, A: 0 };
                    studentToClassMap[studentName] = className;
                });
            }
        }

        state.savedLogs.forEach(log => {
            Object.entries(log.attendance).forEach(([studentName, status]) => {
                if (recapData[studentName] && status !== 'H') {
                    if (recapData[studentName][status] !== undefined) {
                        recapData[studentName][status]++;
                    }
                }
            });
        });
        
        const recapArray = Object.keys(recapData).map(name => {
            const data = recapData[name];
            const total = data.S + data.I + data.A;
            return { name, class: studentToClassMap[name] || 'N/A', ...data, total };
        });

        recapArray.sort((a, b) => {
            const classCompare = a.class.localeCompare(b.class);
            if (classCompare !== 0) return classCompare;
            const classStudents = state.studentsByClass[a.class]?.students;
            return classStudents ? classStudents.indexOf(a.name) - classStudents.indexOf(b.name) : 0;
        });

        const dataForSheet = [
            ['Nama Lengkap', 'Sakit (S)', 'Izin (I)', 'Alpa (A)']
        ];

        recapArray.forEach((item) => {
            dataForSheet.push([
                item.name,
                item.S,
                item.I,
                item.A,
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

async function initApp() {
    // 1. Periksa status perbaikan terlebih dahulu
    try {
        const { isMaintenance } = await apiService.getMaintenanceStatus();
        state.maintenanceMode.isActive = isMaintenance;
    } catch (e) {
        console.error("Tidak dapat memeriksa status perbaikan:", e);
        // Jika API gagal, anggap tidak dalam mode perbaikan agar aplikasi tetap bisa dicoba.
    } finally {
        state.maintenanceMode.statusChecked = true;
    }

    // 2. Muat data pengguna yang ada dari offline
    await loadInitialData();
    
    // 3. Tentukan layar berikutnya
    if (state.maintenanceMode.isActive && state.userProfile?.role !== 'SUPER_ADMIN') {
        // Jika mode perbaikan aktif dan pengguna bukan admin, paksa ke layar perbaikan.
        navigateTo('maintenance');
    } else {
        // Jika tidak, lanjutkan alur normal
        initializeGsi();
        render();
    }

    // Handle online/offline status changes
    window.addEventListener('online', () => {
        updateOnlineStatus(true);
        showNotification('Koneksi internet kembali pulih.', 'success');
        syncData();
    });
    window.addEventListener('offline', () => updateOnlineStatus(false));
    
    // Set initial status
    updateOnlineStatus(navigator.onLine);
}

initApp();
