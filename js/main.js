import { initializeGsi, handleSignIn, handleSignOut } from './auth.js';
import { templates } from './templates.js';
import { showLoader, hideLoader, showNotification, showConfirmation, renderScreen } from './ui.js';
import { apiService } from './api.js';

// --- CONFIGURATION ---
export const CLASSES = ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B", "6A", "6B"];

// --- APPLICATION STATE ---
export let state = {
    userProfile: null, // will contain { name, email, picture, role }
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
        isLoading: true,
    },
    dashboard: {
        allTeacherData: [],
        isLoading: true,
    }
};

// Function to update state (optional, for more complex state management later)
export function setState(newState) {
    state = { ...state, ...newState };
}

// --- MAIN RENDER FUNCTION ---
export function render() {
    renderScreen(state.currentScreen);
}

export function navigateTo(screen) {
    state.currentScreen = screen;
    render();
}


// --- EVENT HANDLERS & LOGIC ---
export async function handleStartAttendance() {
    state.selectedClass = document.getElementById('class-select').value;
    state.selectedDate = document.getElementById('date-input').value;
    state.students = (state.studentsByClass[state.selectedClass] || {}).students || [];
    
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

export function handleManageStudents() {
    state.selectedClass = document.getElementById('class-select').value;
    state.students = (state.studentsByClass[state.selectedClass] || {}).students || [];
    state.newStudents = state.students.length > 0 ? [...state.students] : [''];
    navigateTo('add-students');
}

export async function handleSaveNewStudents() {
    const finalStudentList = state.newStudents.map(s => s.trim()).filter(s => s);
    showLoader('Menyimpan data siswa...');
    
    state.studentsByClass[state.selectedClass] = {
        students: finalStudentList,
        lastModified: new Date().toISOString()
    };
    
    try {
        await apiService.saveData({
            studentsByClass: state.studentsByClass,
            savedLogs: state.savedLogs
        });
        showNotification('Data siswa berhasil disimpan ke cloud.');
    } catch (e) {
        console.error('Gagal menyimpan data siswa:', e);
        showNotification(e.message, 'error');
    }

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

    if (existingLogIndex > -1) { 
        state.savedLogs[existingLogIndex] = newLog; 
    } else { 
        state.savedLogs.push(newLog); 
    }

    try {
        await apiService.saveData({
            studentsByClass: state.studentsByClass,
            savedLogs: state.savedLogs
        });
    } catch (error) {
        console.error('Gagal menyimpan data absensi:', error);
        navigateTo('success');
        showNotification(error.message, 'error');
        hideLoader();
        return;
    }
    
    hideLoader();
    navigateTo('success');
}

export function handleViewHistory(isClassSpecific = false) {
    state.historyClassFilter = isClassSpecific ? document.getElementById('class-select').value : null;
    navigateTo('data');
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
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const studentNames = json.slice(1).map(row => String(row[0] || '').trim()).filter(Boolean);

            if (studentNames.length > 0) {
                state.newStudents = studentNames;
                renderScreen('add-students'); // Re-render only the input part
                showNotification(`${studentNames.length} siswa berhasil diimpor & akan menggantikan daftar saat ini.`);
            } else {
                showNotification('Tidak ada nama siswa yang ditemukan di file.', 'error');
            }
        } catch (error) {
            showNotification('Gagal membaca file. Pastikan formatnya benar.', 'error');
            console.error("Excel import error:", error);
        }
    };
    reader.readAsArrayBuffer(file);
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
function checkSession() {
    const storedProfile = sessionStorage.getItem('userProfile');
    const storedData = sessionStorage.getItem('userData');

    if (storedProfile && storedData) {
        try {
            const user = JSON.parse(storedProfile);
            const userData = JSON.parse(storedData);
            
            setState({
                userProfile: user,
                studentsByClass: userData.students_by_class || {},
                savedLogs: userData.saved_logs || [],
            });

            if (user.role === 'SUPER_ADMIN') {
                state.currentScreen = 'adminHome';
            } else if (user.role === 'KEPALA_SEKOLAH') {
                state.currentScreen = 'dashboard';
            } else {
                state.currentScreen = 'setup';
            }
            console.log('Sesi dipulihkan untuk:', user.name);

        } catch (e) {
            console.error("Gagal mem-parsing data sesi, membersihkan penyimpanan.", e);
            sessionStorage.clear();
        }
    }
}

function main() {
    checkSession();
    initializeGsi();
    render();
}

main();
