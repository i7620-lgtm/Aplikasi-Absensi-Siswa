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
    adminAllLogsView: null,
    adminActingAsSchool: null, // Stores {id, name} for SUPER_ADMIN context
    schoolDataContext: null, // Stores aggregated { studentsByClass, savedLogs } for admin school-wide views
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
    
    // Clear school-wide data context when leaving relevant screens
    const contextHoldingScreens = ['data', 'recap'];
    if (contextHoldingScreens.includes(state.currentScreen) && !contextHoldingScreens.includes(screen)) {
        if (state.schoolDataContext) {
            console.log("Leaving data/recap view. Clearing school-wide data context.");
            setState({ schoolDataContext: null });
        }
    }
    
    // Clear admin panel selections when leaving
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

// --- NEW HELPER FUNCTION FOR ADMINS ---
async function getAndSetSchoolWideData() {
    const isAdmin = state.userProfile.role === 'SUPER_ADMIN' || state.userProfile.role === 'ADMIN_SEKOLAH';
    if (!isAdmin) return { success: true }; // Not an admin, proceed with own data

    const schoolId = state.userProfile.role === 'SUPER_ADMIN' ? state.adminActingAsSchool?.id : state.userProfile.school_id;
    if (!schoolId) {
        showNotification('Konteks sekolah tidak dipilih atau admin tidak ditugaskan ke sekolah.', 'error');
        return { success: false };
    }

    showLoader('Mengumpulkan data sekolah...');
    try {
        const { allData } = await apiService.getGlobalData(schoolId);
        
        const aggregatedStudentsByClass = {};
        const aggregatedLogs = [];

        allData.forEach(teacherData => {
            if (teacherData.students_by_class) {
                // This simple merge overwrites, assuming the latest saved data is what we want.
                // A more complex strategy could be used if versioning was available.
                Object.assign(aggregatedStudentsByClass, teacherData.students_by_class);
            }
            if (teacherData.saved_logs) {
                aggregatedLogs.push(...teacherData.saved_logs);
            }
        });
        
        // This helper now returns the data instead of setting state directly,
        // allowing the caller to decide how to use it (e.g., filter it first).
        return {
            success: true,
            data: {
                studentsByClass: aggregatedStudentsByClass,
                savedLogs: aggregatedLogs
            }
        };
    } catch (error) {
        showNotification(error.message, 'error');
        console.error("Gagal mengambil data sekolah teragregasi:", error);
        return { success: false };
    } finally {
        hideLoader();
    }
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
    const isAdmin = state.userProfile.role === 'SUPER_ADMIN' || state.userProfile.role === 'ADMIN_SEKOLAH';
    
    if (isAdmin) {
        const result = await getAndSetSchoolWideData();
        if (!result.success) return;
        await setState({ schoolDataContext: result.data });
    }

    // Reset filters every time the history screen is entered
    await setState({ 
        dataScreenFilters: {
            studentName: '',
            status: 'all',
            startDate: '',
            endDate: '',
        },
        historyClassFilter: isClassSpecific ? document.getElementById('class-select').value : null,
        adminAllLogsView: null // Clear this view to ensure school context is used
    });
    
    // Specific logic for SUPER_ADMIN wanting a truly global, non-school-context view
    if (state.userProfile.role === 'SUPER_ADMIN' && !isClassSpecific) {
        showLoader('Memuat semua riwayat guru...');
        try {
            const { allData } = await apiService.getGlobalData();
            const flattenedLogs = allData.flatMap(teacher => 
                (teacher.saved_logs || []).map(log => ({ ...log, teacherName: teacher.user_name }))
            );
            await setState({ adminAllLogsView: flattenedLogs, schoolDataContext: null });
        } catch (error) {
            showNotification(error.message, 'error');
            hideLoader();
            return;
        }
    }

    navigateTo('data');
}

export async function handleViewRecap() {
    const isAdmin = state.userProfile.role === 'SUPER_ADMIN' || state.userProfile.role === 'ADMIN_SEKOLAH';
    state.selectedClass = document.getElementById('class-select').value; // Ensure selected class is captured

    if (isAdmin) {
        const result = await getAndSetSchoolWideData();
        if (!result.success) return;

        // --- NEW LOGIC: Filter the aggregated data for the selected class ---
        const { studentsByClass, savedLogs } = result.data;
        const selectedClass = state.selectedClass;

        const filteredStudentsByClass = {
            [selectedClass]: studentsByClass[selectedClass] || { students: [] }
        };
        const filteredLogs = savedLogs.filter(log => log.class === selectedClass);
        
        await setState({ 
            schoolDataContext: {
                studentsByClass: filteredStudentsByClass,
                savedLogs: filteredLogs
            } 
        });

    } else {
        // For non-admins, clear any potential stale context
        await setState({ schoolDataContext: null });
    }

    navigateTo('recap');
}


export async function handleGenerateAiRecommendation() {
    const aiRange = state.dashboard.aiRecommendation.selectedRange;
    await setState({ dashboard: { ...state.dashboard, aiRecommendation: { ...state.dashboard.aiRecommendation, isLoading: true, result: null, error: null } } });
    render();
    
    try {
        // --- START: Client-side data processing with dynamic date ranges ---
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let startDate = new Date(today);
        let dateRangeContext = "30 Hari Terakhir";

        switch (aiRange) {
            case 'last30days':
                startDate.setDate(today.getDate() - 30);
                break;
            case 'semester':
                const currentMonth = today.getMonth(); // 0-11
                if (currentMonth >= 0 && currentMonth <= 5) { // Semester 2 (Jan-Juni)
                    startDate = new Date(today.getFullYear(), 0, 1);
                    dateRangeContext = `Semester II (Januari - Juni ${today.getFullYear()})`;
                } else { // Semester 1 (Juli-Des)
                    startDate = new Date(today.getFullYear(), 6, 1);
                    dateRangeContext = `Semester I (Juli - Desember ${today.getFullYear()})`;
                }
                break;
            case 'year':
                startDate = new Date(today.getFullYear(), 6, 1); // Tahun ajaran dimulai Juli
                if (today.getMonth() < 6) { // Jika sekarang sebelum Juli, tahun ajaran dimulai tahun lalu
                    startDate.setFullYear(today.getFullYear() - 1);
                }
                dateRangeContext = `Tahun Ajaran ${startDate.getFullYear()}/${startDate.getFullYear() + 1}`;
                break;
        }
        startDate.setHours(0, 0, 0, 0);

        const studentSummary = {};

        state.dashboard.allTeacherData.forEach(teacher => {
            (teacher.saved_logs || []).forEach(log => {
                const logDate = new Date(log.date + 'T00:00:00');
                if (logDate >= startDate) {
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
                        ...state.dashboard.aiRecommendation,
                        isLoading: false,
                        result: `Tidak ada data absensi (sakit, izin, alpa) dalam periode **${dateRangeContext}** untuk dianalisis.`,
                        error: null,
                    },
                },
            });
            render();
            return;
        }

        const { recommendation } = await apiService.generateAiRecommendation(topStudentsData, dateRangeContext);
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

let hasInitialized = false;

function setupGlobalEventListeners() {
    if (hasInitialized) return;
    window.addEventListener('online', () => {
        updateOnlineStatus(true);
        showNotification('Koneksi internet kembali pulih.', 'success');
        syncData();
    });
    window.addEventListener('offline', () => updateOnlineStatus(false));
    hasInitialized = true;
}

async function initApp() {
    const notificationEl = document.getElementById('notification');
    if (notificationEl) notificationEl.classList.remove('show');
    const appContainer = document.getElementById('app-container');

    try {
        const { isMaintenance } = await apiService.getMaintenanceStatus();
        state.maintenanceMode.isActive = isMaintenance;
        state.maintenanceMode.statusChecked = true;

        await loadInitialData();
        
        if (state.maintenanceMode.isActive && state.userProfile?.role !== 'SUPER_ADMIN') {
            navigateTo('maintenance');
        } else {
            initializeGsi();
            render();
        }
        
        setupGlobalEventListeners();
        updateOnlineStatus(navigator.onLine);

    } catch (e) {
        console.error("Tidak dapat memulai aplikasi:", e.message);
        
        // Periksa apakah ini adalah error konfigurasi database kritis yang tidak dapat dipulihkan.
        if (e.message.startsWith('CRITICAL:')) {
            const userFriendlyMessage = e.message.replace('CRITICAL: ', '');
            appContainer.innerHTML = templates.criticalError(userFriendlyMessage);
        } else {
             // Untuk error lain yang mungkin bersifat sementara, tampilkan notifikasi dengan opsi coba lagi.
            showNotification(
                e.message, 
                'error', 
                { isPermanent: true, onRetry: initApp }
            );
            appContainer.innerHTML = `<div class="p-8 text-center"><h2 class="text-xl font-bold text-slate-700">Gagal Memuat Aplikasi</h2><p class="text-slate-500 mt-2">Terjadi kesalahan saat mencoba terhubung ke server.</p></div>`;
        }
        hideLoader();
    }
}

initApp();
