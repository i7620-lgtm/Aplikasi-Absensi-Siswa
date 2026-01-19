

import { initializeGsi, handleSignIn, handleSignOut, handleAuthenticationRedirect } from './auth.js';
import { templates } from './templates.js';
import { showLoader, hideLoader, showNotification, showConfirmation, renderScreen, updateOnlineStatus, showSchoolSelectorModal, stopAllPollers, resumePollingForCurrentScreen, displayAuthError, updateLoaderText } from './ui.js';
import { apiService } from './api.js';
import { idb } from './db.js';

// --- CONFIGURATION ---
function generateClasses(startGrade, endGrade, startLetterChar, endLetterChar) {
    const classes = [];
    const startLetter = startLetterChar.charCodeAt(0);
    const endLetter = endLetterChar.charCodeAt(0);

    for (let grade = startGrade; grade <= endGrade; grade++) {
        for (let letterCode = startLetter; letterCode <= endLetter; letterCode++) {
            const letter = String.fromCharCode(letterCode);
            classes.push(`${grade}${letter}`);
        }
    }
    return classes;
}

const sdClasses = generateClasses(1, 6, 'A', 'D'); 
const smpClasses = generateClasses(7, 9, 'A', 'P'); 

export const CLASSES = [...sdClasses, ...smpClasses];

// --- APPLICATION STATE ---
export let state = {
    userProfile: null, 
    currentScreen: 'landingPage',
    selectedClass: '',
    selectedDate: new Date().toISOString().split('T')[0],
    students: [], 
    studentsByClass: {},
    attendance: {},
    savedLogs: [], 
    localVersion: 0, 
    historyClassFilter: null,
    allHistoryLogs: [],
    holidays: [], 
    schoolSettings: { workDays: [1,2,3,4,5,6] }, 
    dataScreenFilters: {
        studentName: '',
        status: 'all',
        startDate: '',
        endDate: '',
    },
    newStudents: [{ name: '', parentEmail: '' }], 
    recapSortOrder: 'total',
    recapPeriod: null, 
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
        data: null, 
        isLoading: true,
        selectedDate: new Date().toISOString().split('T')[0],
        polling: {
            timeoutId: null,
            interval: 10000,
        },
        activeView: 'report', 
        chartViewMode: 'daily', 
        chartClassFilter: 'all', 
        chartSchoolFilter: 'all', 
        aiRecommendation: {
            isLoading: false,
            result: null,
            error: null,
            selectedRange: 'last30days', 
        },
    },
    parentDashboard: { 
        isLoading: true,
        data: null,
    },
    setup: {
        polling: {
            timeoutId: null,
            interval: 10000,
        },
    },
    adminActingAsSchool: null, 
    adminActingAsJurisdiction: null, 
    lastSaveContext: null, 
    logoutMessage: null, 
};

// Function to update state and persist it
export async function setState(newState) {
    if ('adminActingAsSchool' in newState && newState.adminActingAsSchool) {
        newState.adminActingAsJurisdiction = null;
    } else if ('adminActingAsJurisdiction' in newState && newState.adminActingAsJurisdiction) {
        newState.adminActingAsSchool = null;
    }
    
    state = { ...state, ...newState };

    if (newState.userProfile !== undefined || newState.studentsByClass !== undefined || newState.savedLogs !== undefined || newState.localVersion !== undefined || newState.holidays !== undefined || newState.schoolSettings !== undefined) {
        await idb.set('userProfile', state.userProfile);
        
        await idb.set('userData', {
            studentsByClass: state.studentsByClass,
            savedLogs: state.savedLogs,
            localVersion: state.localVersion,
            holidays: state.holidays, 
            schoolSettings: state.schoolSettings 
        });
    }
}

// --- MAIN RENDER FUNCTION ---
export function render() {
    renderScreen(state.currentScreen);
}

export function navigateTo(screen) {
    const schoolContextScreens = ['setup', 'dashboard', 'add-students', 'attendance', 'data', 'recap', 'holidaySettings'];
    const adminContextScreens = ['dashboard', 'jurisdictionPanel', 'adminPanel', 'migrationTool', 'holidaySettings'];
    
    // Logic to clear Super Admin context when leaving specific areas
    if (schoolContextScreens.includes(state.currentScreen) && !schoolContextScreens.includes(screen)) {
        if (state.adminActingAsSchool) {
            console.log("Leaving school context. Clearing Super Admin school context.");
            setState({ 
                adminActingAsSchool: null,
                dashboard: { 
                    ...state.dashboard, 
                    data: null, 
                    isLoading: true,
                    aiRecommendation: { isLoading: false, result: null, error: null, selectedRange: 'last30days' }
                }
            });
        }
    }
    
    if (adminContextScreens.includes(state.currentScreen) && !adminContextScreens.includes(screen)) {
        if (state.adminActingAsJurisdiction) {
            console.log("Leaving jurisdiction context. Clearing context.");
            setState({ 
                adminActingAsJurisdiction: null,
                dashboard: { 
                    ...state.dashboard, 
                    data: null, 
                    isLoading: true,
                    aiRecommendation: { isLoading: false, result: null, error: null, selectedRange: 'last30days' }
                }
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
export async function handleStartAttendance(overrideClass = null, overrideDate = null) {
    if (overrideClass && overrideDate) {
        state.selectedClass = overrideClass;
        state.selectedDate = overrideDate;
    } else {
        const classSelect = document.getElementById('class-select');
        const dateInput = document.getElementById('date-input');
        
        if (classSelect) state.selectedClass = classSelect.value;
        if (dateInput) state.selectedDate = dateInput.value;
    }
    
    // --- FIX: Robust Day of Week Calculation ---
    // Parsing string "YYYY-MM-DD" directly to Date object can yield different results based on browser timezone (UTC vs Local).
    // Explicitly constructing the date using Year, Month, Day components ensures we check the exact date selected.
    const [y, m, d] = state.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d); // Month is 0-indexed
    const dayOfWeek = dateObj.getDay(); // 0 (Sun) - 6 (Sat)
    
    const workDays = (state.schoolSettings?.workDays || [1,2,3,4,5,6]).map(Number); // Ensure numbers
    
    // Check if dayOfWeek is in workDays. 
    // dayOfWeek 0 is Sunday. If Sunday (7 in UI setup, usually 0 in JS) is not in workDays, warn.
    // If UI saves Sunday as 0, this logic works directly. If UI saves Sunday as 7, handle conversion.
    const isWorkDay = workDays.includes(dayOfWeek) || (dayOfWeek === 0 && workDays.includes(7));

    if (!isWorkDay) {
        const proceed = await showConfirmation(`Hari ini (${dateObj.toLocaleDateString('id-ID', {weekday:'long'})}) bukan hari sekolah aktif. Tetap lanjutkan?`);
        if (!proceed) return;
    }

    // --- FIX: Robust Date Comparison for Holidays ---
    const holiday = state.holidays.find(h => {
        let hDateStr = h.date;
        if (hDateStr instanceof Date) hDateStr = hDateStr.toISOString();
        if (typeof hDateStr === 'string') {
            return hDateStr.substring(0, 10) === state.selectedDate;
        }
        return false;
    });

    if (holiday) {
        const proceed = await showConfirmation(`Tanggal ini terdaftar sebagai libur: ${holiday.description} (${holiday.scope}). Tetap ingin mengisi absensi?`);
        if (!proceed) return;
    }

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
    
    if (existingLog && !overrideClass) {
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
        
        const updatedStudentsByClass = { ...state.studentsByClass };
        updatedStudentsByClass[state.selectedClass] = { students: finalStudentList };

        if (response.queued) {
            await setState({ studentsByClass: updatedStudentsByClass });
            hideLoader();
            showNotification('Anda sedang offline. Daftar siswa disimpan lokal dan akan disinkronkan nanti.', 'info');
        } else {
            await setState({ 
                studentsByClass: updatedStudentsByClass,
                localVersion: response.newVersion
            });
            
            try {
                const { userProfile } = await apiService.getUserProfile();
                await setState({ userProfile });
            } catch (pError) {
                console.error("Failed to refresh profile:", pError);
            }

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
            await setState({ 
                savedLogs: updatedLogs, 
                lastSaveContext: newContext,
            });
            hideLoader();
            showNotification('Anda sedang offline. Absensi disimpan lokal dan akan disinkronkan nanti.', 'info');
        } else {
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

// --- NEW FUNCTION: Select School specifically for Configuration ---
export async function handleSelectSchoolForConfig() {
    const selectedSchool = await showSchoolSelectorModal('Pilih Sekolah untuk Diatur');
    if (selectedSchool) {
        showLoader('Memuat data sekolah...');
        try {
            const { settings, holidays } = await apiService.getSchoolStudentData(selectedSchool.id);
            // Defensive coding: If settings is unexpectedly null or incomplete, fallback to default.
            const validSettings = (settings && Array.isArray(settings.workDays)) 
                ? settings 
                : { workDays: [1, 2, 3, 4, 5, 6] };

            await setState({ 
                adminActingAsSchool: selectedSchool,
                schoolSettings: validSettings,
                holidays: holidays || [] // Update holidays context
            });
            renderScreen('holidaySettings'); // Re-render to show checkboxes
        } catch (error) {
            showNotification('Gagal memuat pengaturan sekolah: ' + error.message, 'error');
        } finally {
            hideLoader();
        }
    }
}

export async function handleSaveSchoolSettings(workDays) {
    // Validation for Super Admin Context
    if (state.userProfile.primaryRole === 'SUPER_ADMIN' && !state.adminActingAsSchool) {
        showNotification('Silakan pilih sekolah terlebih dahulu.', 'error');
        return;
    }

    showLoader('Menyimpan pengaturan...');
    try {
        const schoolId = state.userProfile.primaryRole === 'SUPER_ADMIN' ? state.adminActingAsSchool.id : state.userProfile.school_id;
        const { settings } = await apiService.updateSchoolSettings(workDays, schoolId);
        await setState({ schoolSettings: settings });
        showNotification('Pengaturan sekolah berhasil diperbarui.');
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        hideLoader();
    }
}

export async function handleManageHoliday(operation, date, description, id = null) {
    if (operation === 'ADD' && (!date || !description)) {
        showNotification('Tanggal dan deskripsi wajib diisi.', 'error');
        return;
    }
    
    showLoader(operation === 'ADD' ? 'Menambah libur...' : 'Menghapus libur...');
    try {
        const { holiday } = await apiService.manageHoliday(operation, id, date, description);
        
        let updatedHolidays = [...state.holidays];
        if (operation === 'ADD') {
            updatedHolidays.push(holiday);
            updatedHolidays.sort((a,b) => new Date(b.date) - new Date(a.date)); 
        } else {
            updatedHolidays = updatedHolidays.filter(h => h.id !== parseInt(id));
        }
        
        await setState({ holidays: updatedHolidays });
        
        if (operation === 'ADD') {
            showNotification('Hari libur berhasil ditambahkan.');
            return true; 
        } else {
            showNotification('Hari libur berhasil dihapus.');
        }
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        hideLoader();
    }
}

export async function handleMarkClassAsHoliday() {
    const confirmed = await showConfirmation(`Tandai seluruh siswa di kelas ${state.selectedClass} sebagai LIBUR untuk hari ini?`);
    if (!confirmed) return;
    
    state.students.forEach(student => {
        state.attendance[student.name] = 'L';
    });
    
    renderScreen('attendance');
    showNotification('Seluruh kelas ditandai Libur. Jangan lupa simpan absensi.', 'info');
}


export async function handleViewHistory(identifier = false) {
    // 1. Determine target Class based on identifier type
    let targetClass = null;

    if (typeof identifier === 'string') {
        // Case A: Passed explicitly (e.g. "6A" from Success screen)
        targetClass = identifier;
    } else if (identifier === true) {
        // Case B: Passed as boolean true (e.g. from Setup screen) -> Grab from DOM or state
        const domSelect = document.getElementById('class-select');
        targetClass = domSelect ? domSelect.value : state.selectedClass;
    }
    // Case C: Passed as false/null -> remains null (View All / Global View)

    const isSuperAdmin = state.userProfile.primaryRole === 'SUPER_ADMIN';
    // If targetClass is set, it is NOT a global view, even for super admin.
    const isGlobalView = isSuperAdmin && !targetClass && !state.adminActingAsSchool;

    await setState({ 
        dataScreenFilters: { studentName: '', status: 'all', startDate: '', endDate: '' },
        historyClassFilter: targetClass,
        adminAllLogsView: isGlobalView, 
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
        const { recommendation } = await apiService.generateAiRecommendation({ 
            aiRange, 
            schoolId, 
            jurisdictionId,
            selectedDate: state.dashboard.selectedDate 
        });
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
        legacyDataEl.value = ''; 
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
        const { recapData, reportType, monthlySummary } = await apiService.getRecapData(params);
        const hasRecapData = recapData && ((reportType === 'class' && recapData.length > 0) || (reportType !== 'class' && Object.keys(recapData).length > 0));
        const hasSummaryData = monthlySummary && monthlySummary.length > 0;

        if (!hasRecapData && !hasSummaryData) {
            hideLoader();
            showNotification('Tidak ada data rekap untuk diunduh.', 'info');
            return;
        }

        const workbook = XLSX.utils.book_new();

        if (reportType === 'regional' && hasSummaryData) {
            const header1 = ["Nama Sekolah"];
            const header2 = [""];
            const merges = [];
            const months = ['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'];
            const statuses = ['Hadir', 'Sakit', 'Izin', 'Alpa', 'Belum Absensi'];
            
            let col = 1;
            months.forEach(month => {
                header1.push(month, null, null, null, null);
                merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + 4 } });
                statuses.forEach(status => header2.push(status));
                col += 5;
            });

            const dataForSheet = [header1, header2];

            monthlySummary.forEach(school => {
                const row = [school.schoolName];
                months.forEach((month, index) => {
                    const monthIndex = (index + 6) % 12; // Juli is 6, Jan is 0
                    const monthData = school.monthlyData[monthIndex];
                    if (monthData) {
                        row.push(
                            `${monthData.H.toFixed(2)}%`,
                            `${monthData.S.toFixed(2)}%`,
                            `${monthData.I.toFixed(2)}%`,
                            `${monthData.A.toFixed(2)}%`,
                            `${monthData.Unreported.toFixed(2)}%`
                        );
                    } else {
                        row.push('0.00%', '0.00%', '0.00%', '0.00%', '100.00%');
                    }
                });
                dataForSheet.push(row);
            });
            
            const summaryWorksheet = XLSX.utils.aoa_to_sheet(dataForSheet);
            summaryWorksheet['!merges'] = merges;
            XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Rekapitulasi Kehadiran');
        }

        if (hasRecapData) {
            const header = ['Nama Lengkap', 'Kelas', 'Sakit (S)', 'Izin (I)', 'Alpa (A)', 'Total Absen'];
            const createSheetFromData = (dataArray, includeClassCol = true) => {
                const finalHeader = includeClassCol ? header : header.filter(h => h !== 'Kelas');
                const dataForSheet = [finalHeader];
                
                dataArray
                    .sort((a, b) => {
                        if (a.class && b.class && a.class !== b.class) {
                            return a.class.localeCompare(b.class);
                        }
                        return (a.originalIndex || 0) - (b.originalIndex || 0);
                    })
                    .forEach(item => {
                        const row = [item.name, item.class, item.S, item.I, item.A, item.total];
                        if (!includeClassCol) {
                            row.splice(1, 1);
                        }
                        dataForSheet.push(row);
                    });
                
                const worksheet = XLSX.utils.aoa_to_sheet(dataForSheet);
                worksheet['!cols'] = finalHeader.map((_, colIndex) => ({
                    wch: dataForSheet.reduce((w, r) => Math.max(w, String(r[colIndex] || "").length), 10)
                }));
                return worksheet;
            };
            
            const sanitizeSheetName = (name) => name.replace(/[*?:/\\\[\]]/g, '').substring(0, 31);

            if (reportType === 'regional') {
                for (const schoolName in recapData) {
                    if (Object.hasOwnProperty.call(recapData, schoolName)) {
                        const worksheet = createSheetFromData(recapData[schoolName], true);
                        XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(schoolName));
                    }
                }
            } else if (reportType === 'school') {
                const sortedClasses = Object.keys(recapData).sort();
                for (const className of sortedClasses) {
                    const worksheet = createSheetFromData(recapData[className], false);
                    XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(`Kelas ${className}`));
                }
            } else { 
                const worksheet = createSheetFromData(recapData, true);
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Absensi');
            }
        }

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
    
    let startDate, endDate;
    if (state.recapPeriod) {
        const [year, sem] = state.recapPeriod.split('-').map(Number);
        if (sem === 1) { 
            startDate = `${year}-07-01`;
            endDate = `${year}-12-31`;
        } else { 
            startDate = `${year}-01-01`;
            endDate = `${year}-06-30`;
        }
    } else {
        const today = new Date();
        const currentMonth = today.getMonth(); 
        const currentYear = today.getFullYear();
        if (currentMonth >= 6) { 
            startDate = `${currentYear}-07-01`;
            endDate = `${currentYear}-12-31`;
        } else { 
            startDate = `${currentYear}-01-01`;
            endDate = `${currentYear}-06-30`;
        }
    }

    await downloadRecapData({ classFilter: state.selectedClass, schoolId, fileName, startDate, endDate });
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
    
    const today = new Date();
    const currentMonth = today.getMonth(); 
    const currentYear = today.getFullYear();
    let startDate, endDate;
    if (currentMonth >= 6) { 
        startDate = `${currentYear}-07-01`;
        endDate = `${currentYear}-12-31`;
    } else { 
        startDate = `${currentYear}-01-01`;
        endDate = `${currentYear}-06-30`;
    }

    await downloadRecapData({ schoolId: finalSchoolId, fileName, startDate, endDate });
}

export async function handleDownloadJurisdictionReport(jurisdictionId, jurisdictionName) {
    if (!jurisdictionId) {
        showNotification('Tidak dapat menentukan yurisdiksi untuk diunduh.', 'error');
        return;
    }
    const finalJurisdictionName = jurisdictionName || `Yurisdiksi_ID_${jurisdictionId}`;
    const fileName = `Laporan_Absensi_Regional_${finalJurisdictionName.replace(/\s+/g, '_')}.xlsx`;
    
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    let startDate, endDate;
    if (currentMonth >= 6) {
        startDate = `${currentYear}-07-01`;
        endDate = `${currentYear}-12-31`;
    } else {
        startDate = `${currentYear}-01-01`;
        endDate = `${currentYear}-06-30`;
    }

    await downloadRecapData({ jurisdictionId, fileName, startDate, endDate });
}

async function syncWithServer() {
    if (!navigator.onLine) {
        console.log("Offline, skipping server sync.");
        return;
    }
    const queue = await idb.getQueue();
    if (queue.length === 0) {
        console.log("No offline actions to sync.");
        return;
    }

    showNotification(`Menyinkronkan ${queue.length} perubahan offline...`, 'info');
    let failedActions = [];
    let successCount = 0;

    for (const request of queue) {
        try {
            await apiService.saveData(request.body.payload);
            successCount++;
        } catch (error) {
            console.error('Failed to sync an action:', request, error);
            failedActions.push(request);
        }
    }

    await idb.setQueue(failedActions);
    if (failedActions.length > 0) {
        showNotification(`Gagal menyinkronkan ${failedActions.length} perubahan. Akan dicoba lagi nanti.`, 'error');
    } else {
        showNotification('Semua data offline berhasil disinkronkan!', 'success');
        await fetchChangesFromServer();
    }
}

async function fetchChangesFromServer() {
    if (!navigator.onLine || !state.userProfile?.school_id) return;
    try {
        const { changes } = await apiService.getChangesSince({ 
            schoolId: state.userProfile.school_id, 
            lastVersion: state.localVersion 
        });
        
        if (changes.length > 0) {
            let updatedStudentsByClass = { ...state.studentsByClass };
            let updatedLogs = [...state.savedLogs];
            let latestVersion = state.localVersion;
            
            changes.forEach(change => {
                if (change.event_type === 'ATTENDANCE_UPDATED') {
                    const existingLogIndex = updatedLogs.findIndex(log => log.class === change.payload.class && log.date === change.payload.date);
                    if (existingLogIndex > -1) updatedLogs[existingLogIndex] = change.payload;
                    else updatedLogs.push(change.payload);
                } else if (change.event_type === 'STUDENT_LIST_UPDATED') {
                    updatedStudentsByClass[change.payload.class] = { students: change.payload.students };
                }
                latestVersion = Math.max(latestVersion, change.id);
            });
            
            await setState({
                studentsByClass: updatedStudentsByClass,
                savedLogs: updatedLogs,
                localVersion: latestVersion
            });
            
            showNotification('Data telah diperbarui dari server.', 'info');
            render(); 
        }
    } catch (error) {
        console.error("Failed to fetch changes from server:", error);
        showNotification('Gagal mengambil data terbaru dari server.', 'error');
    }
}

async function loadInitialData() {
    try {
        const userProfile = await idb.get('userProfile');
        const userData = await idb.get('userData');

        if (userProfile && userData) {
            state.userProfile = userProfile;
            state.studentsByClass = userData.studentsByClass || {};
            state.savedLogs = Array.isArray(userData.savedLogs) ? userData.savedLogs : [];
            state.localVersion = typeof userData.localVersion === 'number' ? userData.localVersion : 0;
            state.holidays = Array.isArray(userData.holidays) ? userData.holidays : [];
            state.schoolSettings = userData.schoolSettings || { workDays: [1,2,3,4,5,6] };
            state.currentScreen = 'multiRoleHome';
            console.log(`Data dipulihkan dari penyimpanan offline. Versi lokal: ${state.localVersion}`);
        }
    } catch (e) {
        console.warn("Gagal memuat data awal, memulai dengan state kosong:", e);
    }
}

async function initApp() {
    if (localStorage.getItem('attendanceApp')) {
        localStorage.removeItem('attendanceApp');
        console.log('Data lama dari localStorage telah dihapus.');
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').then(registration => {
                console.log('ServiceWorker registered with scope: ', registration.scope);
            }).catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
        });
    }

    updateLoaderText('Memuat Aplikasi Absensi...'); 
    
    const loadPromise = loadInitialData();
    const timeoutPromise = new Promise(r => setTimeout(() => r('timeout'), 2000));
    
    const loadResult = await Promise.race([loadPromise, timeoutPromise]);
    if (loadResult === 'timeout') {
        console.warn("Pemuatan data lokal timeout. Melanjutkan rendering.");
    }
    
    render(); 

    try {
        await initializeGsi(); 
    } catch (e) {
        console.warn("GSI Initialization deferred or failed:", e);
    }

    if (state.userProfile) {
        syncWithServer().then(() => fetchChangesFromServer()).catch(console.error);
    }
    
    window.addEventListener('online', async () => {
        updateOnlineStatus(true);
        showNotification('Koneksi internet kembali pulih.', 'success');
        await syncWithServer();
    });
    window.addEventListener('offline', () => updateOnlineStatus(false));
    
    updateOnlineStatus(navigator.onLine);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            stopAllPollers();
        } else if (document.visibilityState === 'visible') {
            resumePollingForCurrentScreen();
        }
    });
}

initApp().catch(error => {
    console.error("Failed to initialize app:", error);
    const loader = document.getElementById('loader-wrapper');
    if (loader) loader.style.display = 'none';
    
    document.body.innerHTML = `
        <div style="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div class="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
                <svg class="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                <h1 class="text-xl font-bold text-slate-800 mb-2">Gagal Memuat Aplikasi</h1>
                <p class="text-slate-600 mb-6">Terjadi kesalahan saat menyiapkan aplikasi. Mohon periksa koneksi internet Anda dan muat ulang halaman.</p>
                <pre class="bg-slate-100 p-3 rounded text-xs text-left overflow-auto mb-6 text-slate-700 max-h-32">${error.message}</pre>
                <button onclick="window.location.reload()" class="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition">Muat Ulang Halaman</button>
            </div>
        </div>
    `;
});
