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
        schools: [],
        isLoading: true,
        polling: {
            timeoutId: null,
            interval: 10000,
        },
        currentPage: 1,
        groupBySchool: false,
    },
    dashboard: {
        allTeacherData: [],
        isLoading: true,
        isDataLoaded: false, // Flag to check if initial data fetch is complete
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
    adminAllLogsView: null,
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
    // New, more robust logic for clearing SUPER_ADMIN's school context.
    // The context should persist across all screens that are part of a school-specific workflow.
    const schoolContextScreens = ['setup', 'dashboard', 'add-students', 'attendance', 'data', 'recap'];
    if (schoolContextScreens.includes(state.currentScreen) && !schoolContextScreens.includes(screen)) {
        if (state.adminActingAsSchool) {
            console.log("Leaving school context flow. Clearing Super Admin context.");
            setState({ adminActingAsSchool: null });
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

    // SUPER_ADMIN must have a school context to perform this action.
    const schoolId = state.userProfile.role === 'SUPER_ADMIN' ? state.adminActingAsSchool?.id : state.userProfile.school_id;
    if (!schoolId) {
        showNotification('Konteks sekolah tidak dipilih.', 'error');
        return false;
    }

    showLoader('Mencari data kelas...');
    try {
        // Fetch data specifically for the school context.
        const { allData } = await apiService.getGlobalData(schoolId);
        for (const teacherData of allData) {
            if (teacherData.students_by_class && teacherData.students_by_class[className]) {
                const students = teacherData.students_by_class[className].students;
                if (students && students.length > 0) {
                    state.studentsByClass[className] = {
                        ...(state.studentsByClass[className] || {}),
                        students: students
                    };
                    state.students = students;
                    hideLoader();
                    return true;
                }
            }
        }
    } catch (error) {
        showNotification(error.message, 'error');
        console.error("Gagal mengambil data global untuk admin", error);
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
    state.historyClassFilter = isClassSpecific ? document.getElementById('class-select').value : null;

    if (state.userProfile.role === 'SUPER_ADMIN' && !isClassSpecific) {
        showLoader('Memuat semua riwayat guru...');
        try {
            const { allData } = await apiService.getGlobalData();
            const flattenedLogs = allData.flatMap(teacher => 
                (teacher.saved_logs || []).map(log => ({ ...log, teacherName: teacher.user_name }))
            );
            state.adminAllLogsView = flattenedLogs;
        } catch (error) {
            showNotification(error.message, 'error');
            hideLoader();
            return;
        }
    } else {
        state.adminAllLogsView = null;
    }

    navigateTo('data');
}

export async function handleGenerateAiRecommendation() {
    await setState({ dashboard: { ...state.dashboard, aiRecommendation: { isLoading: true, result: null, error: null } } });
    render();
    
    try {
        // --- START: Client-side data processing ---
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const studentSummary = {};

        state.dashboard.allTeacherData.forEach(teacher => {
            (teacher.saved_logs || []).forEach(log => {
                const logDate = new Date(log.date + 'T00:00:00');
                if (logDate >= thirtyDaysAgo) {
                    Object.entries(log.attendance).forEach(([studentName, status]) => {
                        if (status !== 'H') {
                            if (!studentSummary[studentName]) {
                                studentSummary[studentName] = { name: studentName, class: log.class, S: 0, I: 0, A: 0, total: 0, absences: [] };
                            }
                            if (studentSummary[studentName][status] !== undefined) {
                                studentSummary[studentName][status]++;
                                studentSummary[studentName].total++;
                                studentSummary[studentName].absences.push({ date: log.date, status: status });
                            }
                        }
                    });
                }
            });
        });
        
        const topStudentsData = Object.values(studentSummary)
            .sort((a, b) => b.total - a.total)
            .slice(0, 20)
            .map(({ name, class: className, S, I, A, total, absences }) => ({ name, class: className, S, I, A, total, absences }));
        // --- END: Client-side data processing ---

        if (topStudentsData.length === 0) {
            await setState({
                dashboard: {
                    ...state.dashboard,
                    aiRecommendation: {
                        isLoading: false,
                        result: "Tidak ada data absensi (sakit, izin, alpa) dalam 30 hari terakhir untuk dianalisis.",
                        error: null,
                    },
                },
            });
            render();
            return;
        }

        const { recommendation } = await apiService.generateAiRecommendation(topStudentsData);
        await setState({ dashboard: { ...state.dashboard, aiRecommendation: { isLoading: false, result: recommendation, error: null } } });
    
    } catch(error) {
        console.error("AI Recommendation Error:", error);
        const errorMessage = error.message || 'Gagal menghasilkan rekomendasi. Coba lagi nanti.';
        await setState({ dashboard: { ...state.dashboard, aiRecommendation: { isLoading: false, result: null, error: errorMessage } } });
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
    try {
        const { isMaintenance } = await apiService.getMaintenanceStatus();
        state.maintenanceMode.isActive = isMaintenance;
    } catch (e) {
        console.error("Tidak dapat memeriksa status perbaikan:", e);
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
}

initApp();
