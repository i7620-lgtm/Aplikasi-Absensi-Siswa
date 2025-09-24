--- START OF FILE js/main.js ---
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
    },
    importData: {
        parsedData: null,
        previewHtml: '',
        activeFormat: 'excel',
        csv: {
            students: { fileName: '', data: null },
            attendance: { fileName: '', data: null }
        },
        excel: { fileName: '' },
        json: { fileName: '' },
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

// --- FITUR IMPOR DATA LAMA ---

// --- Template Download Handlers ---
export function handleDownloadExcelTemplate() {
    const wb = XLSX.utils.book_new();
    const ws_students = XLSX.utils.aoa_to_sheet([["Kelas", "Nama Siswa"], ["1A", "Budi Santoso"], ["1A", "Citra Lestari"], ["1B", "Dewi Anggraini"]]);
    ws_students['!cols'] = [{wch:10}, {wch:30}];
    XLSX.utils.book_append_sheet(wb, ws_students, "Daftar Siswa");
    const ws_logs = XLSX.utils.aoa_to_sheet([["Tanggal (YYYY-MM-DD)", "Kelas", "Nama Siswa", "Status (H/S/I/A)"], ["2024-01-15", "1A", "Budi Santoso", "H"], ["2024-01-15", "1A", "Citra Lestari", "S"]]);
    ws_logs['!cols'] = [{wch:20}, {wch:10}, {wch:30}, {wch:18}];
    XLSX.utils.book_append_sheet(wb, ws_logs, "Riwayat Absensi");
    XLSX.writeFile(wb, "Template_Impor_Excel.xlsx");
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function handleDownloadCsvTemplate(type) {
    if (type === 'students') {
        const csvContent = `Kelas,Nama Siswa\n1A,"Budi Santoso"\n1A,"Citra Lestari"\n1B,"Dewi Anggraini"`;
        downloadFile('template_siswa.csv', csvContent, 'text/csv;charset=utf-8;');
    } else if (type === 'attendance') {
        const csvContent = `Tanggal (YYYY-MM-DD),Kelas,Nama Siswa,Status (H/S/I/A)\n2024-01-15,1A,"Budi Santoso",H\n2024-01-15,1A,"Citra Lestari",S`;
        downloadFile('template_absensi.csv', csvContent, 'text/csv;charset=utf-8;');
    }
}

export function handleDownloadJsonTemplate() {
    const jsonContent = {
        "studentsByClass": {
            "1A": { "students": ["Budi Santoso", "Citra Lestari"], "lastModified": "2024-01-01T00:00:00.000Z" },
            "1B": { "students": ["Dewi Anggraini"], "lastModified": "2024-01-01T00:00:00.000Z" }
        },
        "savedLogs": [
            { "date": "2024-01-15", "class": "1A", "attendance": { "Budi Santoso": "H", "Citra Lestari": "S" }, "lastModified": "2024-01-15T00:00:00.000Z" }
        ]
    };
    downloadFile('template_impor.json', JSON.stringify(jsonContent, null, 2), 'application/json');
}

// --- File Parsing Logic ---
function generatePreview(studentsByClass, savedLogs, fileName) {
    const totalStudents = Object.values(studentsByClass).reduce((sum, cls) => sum + (cls.students || []).length, 0);
    return {
        parsedData: { studentsByClass, savedLogs },
        previewHtml: `
            <p class="font-semibold text-slate-700">File <span class="text-blue-600">${fileName}</span> berhasil dibaca.</p>
            <ul class="list-disc list-inside text-slate-600 mt-2 space-y-1">
                <li>Ditemukan <span class="font-bold">${Object.keys(studentsByClass).length}</span> kelas.</li>
                <li>Ditemukan total <span class="font-bold">${totalStudents}</span> siswa.</li>
                <li>Ditemukan <span class="font-bold">${savedLogs.length}</span> catatan absensi harian.</li>
            </ul>
        `
    };
}

function processError(error, fileName) {
    showNotification(error.message, 'error');
    console.error("Import error:", error);
    setState({ importData: { ...state.importData, parsedData: null, previewHtml: `<p class="text-red-600 font-semibold">Gagal memproses file: ${fileName}</p><p class="text-xs text-slate-500 mt-1">${error.message}</p>` } });
}

function parseExcelFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array', cellDates:true, dateNF:'yyyy-mm-dd'});
            if (!workbook.SheetNames.includes("Daftar Siswa") || !workbook.SheetNames.includes("Riwayat Absensi")) {
                throw new Error("File tidak valid. Pastikan sheet 'Daftar Siswa' dan 'Riwayat Absensi' ada.");
            }
            const studentsSheet = workbook.Sheets["Daftar Siswa"];
            const studentData = XLSX.utils.sheet_to_json(studentsSheet);
            const studentsByClass = {};
            studentData.forEach(row => {
                const className = String(row["Kelas"] || '').trim();
                const studentName = String(row["Nama Siswa"] || '').trim();
                if (className && studentName) {
                    if (!studentsByClass[className]) studentsByClass[className] = { students: [], lastModified: new Date().toISOString() };
                    if (!studentsByClass[className].students.includes(studentName)) studentsByClass[className].students.push(studentName);
                }
            });
            const logsSheet = workbook.Sheets["Riwayat Absensi"];
            const logsData = XLSX.utils.sheet_to_json(logsSheet);
            const savedLogs = parseAttendanceLogs(logsData);
            
            const preview = generatePreview(studentsByClass, savedLogs, file.name);
            setState({ importData: { ...state.importData, ...preview, excel: { fileName: file.name } } });
        } catch (error) {
            processError(error, file.name);
        } finally {
            hideLoader();
            renderScreen('importData');
        }
    };
    reader.readAsArrayBuffer(file);
}

function parseJsonFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.studentsByClass || !data.savedLogs) {
                throw new Error("Struktur JSON tidak valid. Harus mengandung 'studentsByClass' dan 'savedLogs'.");
            }
            const preview = generatePreview(data.studentsByClass, data.savedLogs, file.name);
            setState({ importData: { ...state.importData, ...preview, json: { fileName: file.name } } });
        } catch (error) {
            processError(error, file.name);
        } finally {
            hideLoader();
            renderScreen('importData');
        }
    };
    reader.readAsText(file);
}

function parseCsvFile(file, type) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            let newCsvState = { ...state.importData.csv };
            if (type === 'students') {
                newCsvState.students = { fileName: file.name, data: jsonData };
            } else {
                newCsvState.attendance = { fileName: file.name, data: jsonData };
            }

            setState({ importData: { ...state.importData, csv: newCsvState, parsedData: null, previewHtml: '' } });

            // Check if both files are uploaded, then process them
            if (state.importData.csv.students.data && state.importData.csv.attendance.data) {
                const studentsByClass = {};
                state.importData.csv.students.data.forEach(row => {
                    const className = String(row["Kelas"] || '').trim();
                    const studentName = String(row["Nama Siswa"] || '').trim();
                    if (className && studentName) {
                        if (!studentsByClass[className]) studentsByClass[className] = { students: [], lastModified: new Date().toISOString() };
                        if (!studentsByClass[className].students.includes(studentName)) studentsByClass[className].students.push(studentName);
                    }
                });

                const savedLogs = parseAttendanceLogs(state.importData.csv.attendance.data);
                const fullFileName = `${state.importData.csv.students.fileName} & ${state.importData.csv.attendance.fileName}`;
                const preview = generatePreview(studentsByClass, savedLogs, fullFileName);
                setState({ importData: { ...state.importData, ...preview } });
            }
        } catch (error) {
            processError(error, file.name);
        } finally {
            hideLoader();
            renderScreen('importData');
        }
    };
    reader.readAsArrayBuffer(file);
}

// Helper for parsing attendance from Excel/CSV JSON data
function parseAttendanceLogs(logsData) {
    const logsByDateAndClass = {};
    logsData.forEach(row => {
        let dateStr;
        const dateRaw = row["Tanggal (YYYY-MM-DD)"];
        if (dateRaw instanceof Date) dateStr = dateRaw.toISOString().split('T')[0];
        else if (typeof dateRaw === 'string') dateStr = dateRaw.trim();
        else if (typeof dateRaw === 'number') dateStr = new Date(Math.round((dateRaw - 25569) * 86400 * 1000)).toISOString().split('T')[0];
        else return;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;

        const className = String(row["Kelas"] || '').trim();
        const studentName = String(row["Nama Siswa"] || '').trim();
        const status = String(row["Status (H/S/I/A)"] || '').trim().toUpperCase();

        if (className && studentName && ['H', 'S', 'I', 'A'].includes(status)) {
            const key = `${dateStr}|${className}`;
            if (!logsByDateAndClass[key]) logsByDateAndClass[key] = { attendance: {} };
            logsByDateAndClass[key].attendance[studentName] = status;
        }
    });

    return Object.entries(logsByDateAndClass).map(([key, data]) => {
        const [date, className] = key.split('|');
        return { date, class: className, attendance: data.attendance, lastModified: new Date().toISOString() };
    });
}

// --- Main File Upload Handler ---
export function handleFileUploadForImport(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    showLoader("Membaca dan memvalidasi file...");
    
    if (type === 'excel') {
        parseExcelFile(file);
    } else if (type === 'json') {
        parseJsonFile(file);
    } else if (type === 'csv_students' || type === 'csv_attendance') {
        parseCsvFile(file, type);
    }
    
    event.target.value = ''; // Reset input
}


export async function handleSaveImportedData() {
    if (!state.importData.parsedData) {
        showNotification('Tidak ada data yang valid untuk diimpor.', 'error');
        return;
    }
    
    const confirmed = await showConfirmation(`Anda akan mengimpor data dari file. Ini akan menambahkan data baru dan menimpa data absensi pada tanggal/kelas yang sama. Lanjutkan?`);
    if (!confirmed) return;

    showLoader("Mengimpor data ke database...");
    try {
        await apiService.importData(state.importData.parsedData);
        showNotification('Data berhasil diimpor! Silakan muat ulang halaman untuk melihat semua perubahan.', 'success');
        
        // Reset state and back to admin home
        setState({ 
            importData: { parsedData: null, previewHtml: '', activeFormat: 'excel', csv: { students: { fileName: '', data: null }, attendance: { fileName: '', data: null } }, excel: { fileName: '' }, json: { fileName: '' } },
            studentsByClass: {}, // Clear local data for sync on re-login
            savedLogs: []
        });
        sessionStorage.clear(); // Clear session to force reload data from server
        navigateTo('adminHome');
        
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        hideLoader();
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
--- END OF FILE js/main.js ---
<content>
<file>js/templates.js</file>
<description>Merombak total template `importData` untuk mendukung berbagai format file. Sekarang menggunakan antarmuka berbasis tab untuk Excel, CSV, dan JSON. Setiap tab memiliki tombol unduh template dan unggah file yang spesifik, memberikan pengalaman pengguna yang lebih terpandu dan jelas. Tampilan pratinjau dan tombol simpan dibuat lebih dinamis berdasarkan status unggahan.</description>
<content><![CDATA[--- START OF FILE js/templates.js ---
import { state, CLASSES } from './main.js';
import { getGsiReadyState } from './auth.js';

function getRoleDisplayName(role) {
    switch(role) {
        case 'GURU': return 'Guru';
        case 'KEPALA_SEKOLAH': return 'Kepala Sekolah';
        case 'SUPER_ADMIN': return 'Super Admin';
        default: return role;
    }
}

export const templates = {
    setup: () => {
        const isAdmin = state.userProfile?.role === 'SUPER_ADMIN';
        const isTeacher = state.userProfile?.role === 'GURU';
        const assignedClasses = state.userProfile?.assigned_classes || [];
        const needsAssignment = isTeacher && assignedClasses.length === 0;
        const availableClasses = isAdmin ? CLASSES : assignedClasses;
        
        return `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4">
            <div class="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full">
                ${
                    state.userProfile
                    ? `
                        <div class="flex items-center justify-between mb-6">
                            <h1 class="text-xl font-bold text-slate-800">Absensi Online Siswa</h1>
                            <div>
                                ${isAdmin ? `<button id="back-to-admin-home-btn" class="text-slate-500 hover:text-blue-500 transition duration-300 p-2 rounded-full -mr-2" title="Kembali ke Dasbor Admin"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg></button>` : ''}
                                <button id="logoutBtn" class="text-slate-500 hover:text-red-500 transition duration-300 p-2 rounded-full -mr-2" title="Logout">
                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                </button>
                            </div>
                        </div>
                        <div class="flex items-center gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
                            <img src="${state.userProfile.picture}" alt="User" class="w-12 h-12 rounded-full"/>
                            <div>
                                <p class="font-semibold text-slate-800">${state.userProfile.name}</p>
                                <p class="text-sm text-slate-500">${state.userProfile.email}</p>
                                <span class="px-2 py-0.5 mt-1 inline-block rounded-full text-xs font-semibold ${isAdmin ? 'bg-indigo-100 text-indigo-800' : 'bg-green-100 text-green-800'}">${getRoleDisplayName(state.userProfile.role)}</span>
                            </div>
                        </div>
                    `
                    : `
                        <h1 class="text-xl font-bold text-slate-800 mb-4">Absensi Online Siswa</h1>
                        <div id="backup-notice" class="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6 text-sm text-blue-800">
                            <p class="font-semibold mb-2">Selamat Datang!</p>
                            <p class="mb-3">Untuk memulai, silakan login dengan akun Google Anda. Semua data absensi akan disimpan dengan aman di cloud dan dapat diakses dari perangkat mana pun.</p>
                            <button id="loginBtn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg w-full transition duration-300 flex items-center justify-center gap-2" ${!getGsiReadyState() ? 'disabled' : ''}>
                                <svg class="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.519-3.108-11.127-7.481l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.022,35.17,44,30.023,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>
                                <span id="loginBtnText">${getGsiReadyState() ? 'Login & Mulai Absensi' : 'Opsi Login Gagal Dimuat'}</span>
                            </button>
                            <div id="auth-error-container" class="text-left text-sm mt-4 hidden"></div>
                        </div>
                    `
                }
                ${ needsAssignment ? `
                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                        <div class="flex">
                            <div class="py-1"><svg class="w-6 h-6 text-yellow-500 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></div>
                            <div>
                                <p class="font-bold text-yellow-800">Menunggu Penugasan Kelas</p>
                                <p class="text-sm text-yellow-700 mt-1">Akun Anda aktif tetapi belum ditugaskan kelas. Silakan hubungi admin sekolah untuk mendapatkan akses.</p>
                            </div>
                        </div>
                    </div>
                ` : `
                    <h2 class="text-lg font-semibold text-slate-700 mb-4 pt-4 ${state.userProfile ? 'border-t border-slate-200' : ''}">Pilih Kelas & Tanggal</h2>
                    <div class="space-y-4">
                        <div>
                            <label for="class-select" class="block text-sm font-medium text-slate-700 mb-1">Pilih Kelas</label>
                            <select id="class-select" class="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" ${!state.userProfile || availableClasses.length === 0 ? 'disabled' : ''}>
                                ${ availableClasses.length > 0 
                                    ? availableClasses.map(c => `<option value="${c}">${c}</option>`).join('')
                                    : `<option>Tidak ada kelas ditugaskan</option>`
                                }
                            </select>
                        </div>
                        <div>
                            <label for="date-input" class="block text-sm font-medium text-slate-700 mb-1">Tanggal</label>
                            <input type="date" id="date-input" value="${state.selectedDate}" class="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" ${!state.userProfile ? 'disabled' : ''}/>
                        </div>
                    </div>
                    <div class="mt-6 space-y-3">
                         <button id="startBtn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${!state.userProfile || needsAssignment ? 'disabled' : ''}>Mulai Absensi</button>
                         <button id="historyBtn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${!state.userProfile || needsAssignment ? 'disabled' : ''}>Lihat Semua Riwayat</button>
                         <button id="recapBtn" class="bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${!state.userProfile || needsAssignment ? 'disabled' : ''}>Rekap Absensi Siswa</button>
                         <button id="manageStudentsBtn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${!state.userProfile || needsAssignment ? 'disabled' : ''}>Tambah/Kurangi Data Siswa</button>
                         <button id="downloadDataBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${!state.userProfile || needsAssignment ? 'disabled' : ''}>Unduh Rekap Absensi (Excel)</button>
                    </div>
                `}
                <p id="setup-status" class="text-center text-sm text-slate-500 mt-4 h-5">${state.userProfile ? 'Data disimpan secara otomatis di cloud.' : 'Silakan login untuk memulai.'}</p>
            </div>
        </div>`;
    },
    adminHome: () => {
        return `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4">
            <div class="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full">
                <div class="flex items-center justify-between mb-6">
                    <h1 class="text-xl font-bold text-slate-800">Dasbor Super Admin</h1>
                    <button id="logoutBtn" class="text-slate-500 hover:text-red-500 transition duration-300 p-2 rounded-full -mr-2" title="Logout">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    </button>
                </div>
                <div class="flex items-center gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
                    <img src="${state.userProfile.picture}" alt="User" class="w-12 h-12 rounded-full"/>
                    <div>
                        <p class="font-semibold text-slate-800">${state.userProfile.name}</p>
                        <p class="text-sm text-slate-500">${state.userProfile.email}</p>
                        <span class="px-2 py-0.5 mt-1 inline-block rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">${getRoleDisplayName(state.userProfile.role)}</span>
                    </div>
                </div>
                <div class="space-y-3 pt-4 border-t border-slate-200">
                    <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider text-center">Menu Super Admin</h2>
                    <button id="go-to-attendance-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300">Lakukan Absensi</button>
                    <button id="view-dashboard-btn" class="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300">Lihat Dasbor Kepala Sekolah</button>
                    <button id="view-admin-panel-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300">Panel Admin</button>
                    <button id="import-data-btn" class="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300">Impor Data Absensi Lama</button>
                </div>
            </div>
        </div>`;
    },
    importData: () => {
        const { activeFormat, csv, excel, json, previewHtml, parsedData } = state.importData;
        return `
        <div class="screen active p-4 md:p-8 max-w-4xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
                    <h1 class="text-2xl font-bold text-slate-800">Impor Data Absensi Lama</h1>
                    <button id="import-back-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>
                </div>
                
                <div class="mb-6">
                    <p class="text-lg font-semibold text-slate-700 mb-2">1. Pilih Format Data</p>
                    <div class="flex border-b border-slate-200">
                        <button data-format="excel" class="import-format-btn py-2 px-4 font-semibold ${activeFormat === 'excel' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}">Excel</button>
                        <button data-format="csv" class="import-format-btn py-2 px-4 font-semibold ${activeFormat === 'csv' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}">CSV</button>
                        <button data-format="json" class="import-format-btn py-2 px-4 font-semibold ${activeFormat === 'json' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}">JSON</button>
                    </div>
                </div>

                <div class="space-y-6">
                    <!-- Panel for Each Format -->
                    <div id="import-panel-excel" class="import-panel ${activeFormat === 'excel' ? 'block' : 'hidden'}">
                        <p class="text-lg font-semibold text-slate-700 mb-2">2. Unduh Template & Unggah File</p>
                        <p class="text-slate-500 mb-4">Gunakan template Excel (.xlsx) dengan dua sheet: 'Daftar Siswa' dan 'Riwayat Absensi'.</p>
                        <div class="flex items-center gap-4">
                             <button id="download-excel-template-btn" class="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition">Unduh Template</button>
                             <button id="upload-excel-btn" class="bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-2 px-4 rounded-lg text-sm transition">Pilih File Excel...</button>
                             <span class="text-sm text-slate-500" id="excel-filename">${excel.fileName || "Belum ada file dipilih."}</span>
                        </div>
                        <input type="file" id="import-excel-input" class="hidden" accept=".xlsx, .xls"/>
                    </div>

                    <div id="import-panel-csv" class="import-panel ${activeFormat === 'csv' ? 'block' : 'hidden'}">
                        <p class="text-lg font-semibold text-slate-700 mb-2">2. Unduh Template & Unggah 2 File CSV</p>
                        <p class="text-slate-500 mb-4">Anda harus mengunggah dua file terpisah: satu untuk daftar siswa dan satu untuk riwayat absensi.</p>
                        <div class="p-4 bg-slate-50 rounded-lg space-y-4">
                            <div>
                                <p class="font-semibold text-slate-600 mb-2">File 1: Daftar Siswa</p>
                                <div class="flex items-center gap-4">
                                    <button id="download-csv-students-template-btn" class="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition">Unduh Template</button>
                                    <button id="upload-csv-students-btn" class="bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-2 px-4 rounded-lg text-sm transition">Pilih File Siswa...</button>
                                    <span class="text-sm text-slate-500" id="csv-students-filename">${csv.students.fileName || "Belum ada file."}</span>
                                </div>
                                <input type="file" id="import-csv-students-input" class="hidden" accept=".csv"/>
                            </div>
                            <hr/>
                            <div>
                                <p class="font-semibold text-slate-600 mb-2">File 2: Riwayat Absensi</p>
                                <div class="flex items-center gap-4">
                                    <button id="download-csv-attendance-template-btn" class="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition">Unduh Template</button>
                                    <button id="upload-csv-attendance-btn" class="bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-2 px-4 rounded-lg text-sm transition">Pilih File Absensi...</button>
                                    <span class="text-sm text-slate-500" id="csv-attendance-filename">${csv.attendance.fileName || "Belum ada file."}</span>
                                </div>
                                <input type="file" id="import-csv-attendance-input" class="hidden" accept=".csv"/>
                            </div>
                        </div>
                    </div>
                    
                    <div id="import-panel-json" class="import-panel ${activeFormat === 'json' ? 'block' : 'hidden'}">
                        <p class="text-lg font-semibold text-slate-700 mb-2">2. Unduh Template & Unggah File</p>
                        <p class="text-slate-500 mb-4">Unggah satu file .json yang berisi 'studentsByClass' dan 'savedLogs'.</p>
                        <div class="flex items-center gap-4">
                            <button id="download-json-template-btn" class="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition">Unduh Template</button>
                            <button id="upload-json-btn" class="bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-2 px-4 rounded-lg text-sm transition">Pilih File JSON...</button>
                            <span class="text-sm text-slate-500" id="json-filename">${json.fileName || "Belum ada file dipilih."}</span>
                        </div>
                        <input type="file" id="import-json-input" class="hidden" accept=".json"/>
                    </div>
                </div>

                <div class="mt-6">
                    <p class="text-lg font-semibold text-slate-700 mb-2">3. Pratinjau & Simpan</p>
                    <p class="text-slate-500 mb-3">Periksa ringkasan data yang dibaca dari file Anda. Jika sudah benar, simpan data ke sistem.</p>
                    <div id="import-preview" class="min-h-[80px] bg-slate-50 border p-4 rounded-lg text-sm">
                        ${previewHtml || '<p class="text-slate-400">Silakan unggah file untuk melihat pratinjau di sini.</p>'}
                    </div>
                </div>

                <div class="mt-8 pt-6 border-t border-slate-200 flex justify-end">
                    <button id="save-imported-data-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition" ${!parsedData ? 'disabled' : ''}>Simpan Data Impor</button>
                </div>
                <p class="text-xs text-slate-400 mt-4 text-right">Penting: Proses ini akan menambahkan data dari file. Jika ada data absensi untuk kelas & tanggal yang sama, data lama akan ditimpa.</p>
            </div>
        </div>
    `},
    dashboard: () => {
        const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const canGoBack = state.userProfile?.role === 'SUPER_ADMIN';
        const backTarget = canGoBack ? 'adminHome' : 'setup';
        return `
        <div class="screen active p-4 md:p-8 max-w-5xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 pb-4 border-b border-slate-200">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Dasbor Kepala Sekolah</h1>
                        <p class="text-slate-500">${today}</p>
                    </div>
                    <div class="flex items-center gap-4 mt-4 sm:mt-0">
                        ${canGoBack ? `<button id="dashboard-back-btn" data-target="${backTarget}" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>` : ''}
                        <button id="logoutBtn-ks" class="text-slate-500 hover:text-red-500 transition duration-300 p-2 rounded-full flex items-center gap-2 text-sm font-semibold">
                            <span>Logout</span>
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        </button>
                    </div>
                </div>
                <h2 class="text-xl font-semibold text-slate-700 mb-4">Laporan Absensi Hari Ini</h2>
                <div id="ks-report-container" class="space-y-6">
                    <p class="text-center text-slate-500 py-8">Memuat laporan harian...</p>
                </div>
             </div>
        </div>`;
    },
    adminPanel: () => `
        <div class="screen active p-4 md:p-8 max-w-5xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 pb-4 border-b border-slate-200">
                    <h1 class="text-2xl font-bold text-slate-800">Panel Admin: Manajemen Pengguna</h1>
                    <button id="admin-panel-back-btn" class="mt-4 sm:mt-0 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>
                </div>
                <div id="admin-panel-container" class="overflow-x-auto">
                     <p class="text-center text-slate-500 py-8">Memuat daftar pengguna...</p>
                </div>
             </div>
        </div>
    `,
    addStudents: (className) => {
        const isEditing = (state.students && state.students.length > 0);
        const message = isEditing
            ? `Ubah daftar siswa untuk kelas <span class="font-semibold text-blue-600">${className}</span>. Hapus nama atau baris untuk mengurangi siswa.`
            : `Data siswa untuk <span class="font-semibold text-blue-600">${className}</span> belum ada. Silakan tambahkan di bawah ini.`;
        return `
        <div class="screen active p-4 md:p-8 max-w-4xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                <h1 class="text-2xl font-bold text-slate-800 mb-2">Tambah/Kurangi Data Siswa</h1>
                <p class="text-slate-500 mb-6">${message}</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <!-- Manual Input -->
                    <div class="border-r-0 md:border-r md:pr-8 border-slate-200">
                         <h2 class="text-lg font-semibold text-slate-700 mb-4">Daftar Siswa</h2>
                         <div id="manual-input-container" class="space-y-3 mb-4 max-h-60 overflow-y-auto pr-2"></div>
                         <button id="add-student-row-btn" class="w-full text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">+ Tambah Baris</button>
                    </div>
                    <!-- Excel Import -->
                    <div>
                        <h2 class="text-lg font-semibold text-slate-700 mb-4">Impor dari File</h2>
                        <p class="text-sm text-slate-500 mb-4">Unggah file .xlsx untuk <span class="font-bold">menimpa</span> daftar saat ini.</p>
                        <button id="download-template-btn" class="w-full mb-3 text-sm bg-green-100 hover:bg-green-200 text-green-700 font-semibold py-2 px-4 rounded-lg transition">Unduh Template (.csv)</button>
                        <input type="file" id="excel-upload" class="hidden" accept=".xlsx, .xls, .csv"/>
                        <button id="import-excel-btn" class="w-full text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-2 px-4 rounded-lg transition">Pilih File Excel untuk Diimpor</button>
                    </div>
                </div>
                <div class="mt-8 pt-6 border-t border-slate-200 flex justify-end gap-4">
                    <button id="cancel-add-students-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition">Batal</button>
                    <button id="save-students-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition">Simpan Data Siswa</button>
                </div>
            </div>
        </div>`;
    },
    attendance: (className, date) => `
        <div class="screen active p-4 md:p-8 max-w-4xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Absensi Kelas ${className}</h1>
                        <p class="text-slate-500">Tanggal: ${new Date(date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                     <button id="back-to-setup-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="border-b bg-slate-50">
                                <th class="p-3 text-sm font-semibold text-slate-600">No.</th>
                                <th class="p-3 text-sm font-semibold text-slate-600">Nama Siswa</th>
                                <th class="p-3 text-sm font-semibold text-slate-600 text-center">Hadir (H)</th>
                                <th class="p-3 text-sm font-semibold text-slate-600 text-center">Sakit (S)</th>
                                <th class="p-3 text-sm font-semibold text-slate-600 text-center">Izin (I)</th>
                                <th class="p-3 text-sm font-semibold text-slate-600 text-center">Alfa (A)</th>
                            </tr>
                        </thead>
                        <tbody id="attendance-table-body"></tbody>
                    </table>
                </div>
                <div class="mt-8 flex justify-end">
                    <button id="save-attendance-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg transition">Simpan Absensi</button>
                </div>
            </div>
        </div>`,
    success: () => `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4 text-center">
            <div class="bg-white p-8 md:p-12 rounded-2xl shadow-lg max-w-md w-full animate-fade-in">
                <div class="checkmark-wrapper mx-auto mb-6">
                    <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                        <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                    </svg>
                </div>
                <h1 class="text-3xl md:text-4xl font-bold text-slate-800 mb-3">Absensi Tersimpan!</h1>
                <p class="text-slate-500 mb-10">Data absensi telah berhasil disimpan di database cloud Anda.</p>
                <div class="space-y-4">
                     <button id="success-back-to-start-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300 text-lg">Kembali ke Halaman Awal</button>
                     <button id="success-view-data-btn" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-lg w-full transition duration-300">Lihat Semua Riwayat</button>
                </div>
            </div>
        </div>`,
    data: () => `
         <div class="screen active p-4 md:p-8 max-w-5xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                 <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
                    <h1 id="data-title" class="text-2xl font-bold text-slate-800">Riwayat Data Absensi</h1>
                    <button id="data-back-to-start-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>
                </div>
                <div id="data-container" class="space-y-6"></div>
             </div>
        </div>`,
    recap: () => `
         <div class="screen active p-4 md:p-8 max-w-5xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                 <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
                    <h1 class="text-2xl font-bold text-slate-800">Rekapitulasi Absensi Siswa</h1>
                    <button id="recap-back-to-start-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>
                </div>
                <div class="mb-4 flex items-center gap-2">
                    <label class="text-sm font-medium text-slate-600">Urutkan:</label>
                    <button id="sort-by-total-btn" class="${state.recapSortOrder === 'total' ? 'bg-blue-500 text-white' : 'bg-white text-blue-700 border border-blue-500 hover:bg-blue-50'} font-semibold py-1 px-3 rounded-lg text-sm transition">Total Terbanyak</button>
                    <button id="sort-by-absen-btn" class="${state.recapSortOrder === 'absen' ? 'bg-blue-500 text-white' : 'bg-white text-blue-700 border border-blue-500 hover:bg-blue-50'} font-semibold py-1 px-3 rounded-lg text-sm transition">No. Absen</button>
                </div>
                <div id="recap-container" class="overflow-x-auto"></div>
             </div>
        </div>`,
    confirmation: (message) => `
        <div id="confirmation-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style="z-index: 10001;">
             <div class="bg-white p-8 rounded-2xl shadow-lg max-w-sm w-full text-center animate-fade-in">
                <h2 class="text-xl font-bold text-slate-800 mb-4">Konfirmasi</h2>
                <p class="text-slate-600 mb-8">${message}</p>
                <div class="flex justify-center gap-4">
                    <button id="confirm-no-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-8 rounded-lg transition">Tidak</button>
                    <button id="confirm-yes-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg transition">Ya</button>
                </div>
            </div>
        </div>`,
    manageClassesModal: (user) => {
        const assigned = user.assigned_classes || [];
        return `
        <div id="manage-classes-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style="z-index: 10001;">
             <div class="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full animate-fade-in">
                <h2 class="text-xl font-bold text-slate-800 mb-2">Kelola Kelas untuk</h2>
                <p class="text-slate-600 mb-6 font-semibold">${user.name}</p>
                <div id="class-checkbox-container" class="grid grid-cols-3 gap-4 max-h-60 overflow-y-auto border p-4 rounded-lg mb-6">
                    ${CLASSES.map(c => `
                        <label class="flex items-center space-x-2 text-slate-700">
                            <input type="checkbox" value="${c}" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" ${assigned.includes(c) ? 'checked' : ''}>
                            <span>${c}</span>
                        </label>
                    `).join('')}
                </div>
                <div class="flex justify-end gap-4">
                    <button id="manage-classes-cancel-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition">Batal</button>
                    <button id="manage-classes-save-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition">Simpan</button>
                </div>
            </div>
        </div>`;
    }
};
--- END OF FILE js/templates.js ---
<content>
<file>js/ui.js</file>
<description>Memperbarui `renderImportDataScreen` untuk menangani antarmuka impor yang baru. Fungsi ini sekarang melampirkan event listener ke pemilih format (tab), serta tombol unduh dan unggah yang spesifik untuk Excel, CSV, dan JSON. Ini memastikan bahwa semua elemen interaktif di halaman impor yang didesain ulang berfungsi dengan benar.</description>
<content><![CDATA[--- START OF FILE js/ui.js ---
import { state, setState, navigateTo, handleStartAttendance, handleManageStudents, handleViewHistory, handleDownloadData, handleSaveNewStudents, handleExcelImport, handleDownloadTemplate, handleSaveAttendance, handleDownloadExcelTemplate, handleDownloadCsvTemplate, handleDownloadJsonTemplate, handleFileUploadForImport, handleSaveImportedData } from './main.js';
import { templates } from './templates.js';
import { handleSignIn, handleSignOut } from './auth.js';
import { apiService } from './api.js';

const appContainer = document.getElementById('app-container');
const loaderWrapper = document.getElementById('loader-wrapper');
const notificationEl = document.getElementById('notification');

export function showLoader(message) {
    loaderWrapper.querySelector('.loader-text').textContent = message;
    loaderWrapper.style.display = 'flex';
    setTimeout(() => loaderWrapper.style.opacity = '1', 10);
}

export function hideLoader() {
    loaderWrapper.style.opacity = '0';
    setTimeout(() => {
        loaderWrapper.style.display = 'none';
        loaderWrapper.querySelector('.loader-text').textContent = 'Memuat...';
    }, 300);
}

export function showNotification(message, type = 'success') {
    notificationEl.textContent = message;
    notificationEl.className = type === 'error' ? 'error' : 'success';
    notificationEl.classList.add('show');
    setTimeout(() => {
        notificationEl.classList.remove('show');
    }, 5000);
}

export function showConfirmation(message) {
    return new Promise(resolve => {
        const existingModal = document.getElementById('confirmation-modal');
        if (existingModal) existingModal.remove();
        
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = templates.confirmation(message);
        document.body.appendChild(modalContainer);

        const cleanup = () => {
            if(document.body.contains(modalContainer)){
                document.body.removeChild(modalContainer);
            }
        }

        document.getElementById('confirm-yes-btn').onclick = () => { cleanup(); resolve(true); };
        document.getElementById('confirm-no-btn').onclick = () => { cleanup(); resolve(false); };
    });
}

export function displayAuthError(message, error = null) {
    const errorContainer = document.getElementById('auth-error-container');
    if (!errorContainer) return;
    errorContainer.classList.remove('hidden');
    let details = error ? (error.message || (typeof error === 'string' ? error : JSON.stringify(error))) : '';
    details = details.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    errorContainer.innerHTML = `<div class="bg-red-50 p-3 rounded-lg border border-red-200"><p class="text-red-700 font-semibold">${message}</p><p class="text-slate-500 text-xs mt-2">${details}</p></div>`;
}

// --- SCREEN SPECIFIC RENDER LOGIC ---

function renderSetupScreen() {
    appContainer.innerHTML = templates.setup();
    const isAdmin = state.userProfile?.role === 'SUPER_ADMIN';
    const isTeacher = state.userProfile?.role === 'GURU';
    const needsAssignment = isTeacher && (!state.userProfile.assigned_classes || state.userProfile.assigned_classes.length === 0);

    if (state.userProfile) {
        document.getElementById('logoutBtn').addEventListener('click', handleSignOut);
        if (isAdmin) {
            document.getElementById('back-to-admin-home-btn').addEventListener('click', () => navigateTo('adminHome'));
        }
    } else {
        document.getElementById('loginBtn').addEventListener('click', handleSignIn);
    }
    
    if (!needsAssignment && state.userProfile) {
        document.getElementById('startBtn').addEventListener('click', handleStartAttendance);
        document.getElementById('historyBtn').addEventListener('click', () => handleViewHistory(false));
        document.getElementById('recapBtn').addEventListener('click', () => navigateTo('recap'));
        document.getElementById('manageStudentsBtn').addEventListener('click', handleManageStudents);
        document.getElementById('downloadDataBtn').addEventListener('click', handleDownloadData);

        const availableClasses = isAdmin ? state.CLASSES : (state.userProfile?.assigned_classes || []);
        document.getElementById('class-select').value = state.selectedClass || availableClasses[0] || '';
    }
}

function renderAdminHomeScreen() {
    appContainer.innerHTML = templates.adminHome();
    document.getElementById('logoutBtn').addEventListener('click', handleSignOut);
    document.getElementById('go-to-attendance-btn').addEventListener('click', () => navigateTo('setup'));
    document.getElementById('view-dashboard-btn').addEventListener('click', () => navigateTo('dashboard'));
    document.getElementById('view-admin-panel-btn').addEventListener('click', () => navigateTo('adminPanel'));
    document.getElementById('import-data-btn').addEventListener('click', () => navigateTo('importData'));
}

function renderImportDataScreen() {
    appContainer.innerHTML = templates.importData();
    document.getElementById('import-back-btn').addEventListener('click', () => navigateTo('adminHome'));

    // Format selector
    document.querySelectorAll('.import-format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setState({ importData: { ...state.importData, activeFormat: btn.dataset.format } });
            renderScreen('importData');
        });
    });

    // Excel
    document.getElementById('download-excel-template-btn').addEventListener('click', handleDownloadExcelTemplate);
    document.getElementById('upload-excel-btn').addEventListener('click', () => document.getElementById('import-excel-input').click());
    document.getElementById('import-excel-input').addEventListener('change', (e) => handleFileUploadForImport(e, 'excel'));

    // CSV
    document.getElementById('download-csv-students-template-btn').addEventListener('click', () => handleDownloadCsvTemplate('students'));
    document.getElementById('download-csv-attendance-template-btn').addEventListener('click', () => handleDownloadCsvTemplate('attendance'));
    document.getElementById('upload-csv-students-btn').addEventListener('click', () => document.getElementById('import-csv-students-input').click());
    document.getElementById('import-csv-students-input').addEventListener('change', (e) => handleFileUploadForImport(e, 'csv_students'));
    document.getElementById('upload-csv-attendance-btn').addEventListener('click', () => document.getElementById('import-csv-attendance-input').click());
    document.getElementById('import-csv-attendance-input').addEventListener('change', (e) => handleFileUploadForImport(e, 'csv_attendance'));

    // JSON
    document.getElementById('download-json-template-btn').addEventListener('click', handleDownloadJsonTemplate);
    document.getElementById('upload-json-btn').addEventListener('click', () => document.getElementById('import-json-input').click());
    document.getElementById('import-json-input').addEventListener('change', (e) => handleFileUploadForImport(e, 'json'));

    // Save
    document.getElementById('save-imported-data-btn').addEventListener('click', handleSaveImportedData);
}

async function renderDashboardScreen() {
    appContainer.innerHTML = templates.dashboard();
    document.getElementById('logoutBtn-ks').addEventListener('click', handleSignOut);
    
    const backBtn = document.getElementById('dashboard-back-btn');
    if(backBtn) {
        const target = backBtn.dataset.target;
        backBtn.addEventListener('click', () => navigateTo(target));
    }

    const container = document.getElementById('ks-report-container');
    try {
        const { allData } = await apiService.getDashboardData();
        const todayStr = new Date().toISOString().split('T')[0];

        const todaysLogs = allData.flatMap(teacher => 
            (teacher.saved_logs || []).filter(log => log.date === todayStr).map(log => ({...log, teacherName: teacher.user_name}))
        );

        if (todaysLogs.length === 0) {
            container.innerHTML = `<p class="text-center text-slate-500 py-8">Belum ada data absensi yang dicatat hari ini.</p>`;
            return;
        }

        const absentByClass = {};
        todaysLogs.forEach(log => {
            if (!absentByClass[log.class]) {
                absentByClass[log.class] = { students: [], teacher: log.teacherName };
            }
            Object.entries(log.attendance).forEach(([studentName, status]) => {
                if (status !== 'H') {
                    absentByClass[log.class].students.push({ name: studentName, status });
                }
            });
        });
        
        let reportHtml = Object.entries(absentByClass).map(([className, data]) => {
            if (data.students.length === 0) return '';
            return `
                <div class="bg-slate-50 p-4 rounded-lg">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="font-bold text-blue-600">Kelas ${className}</h3>
                        <p class="text-xs text-slate-400 font-medium">Oleh: ${data.teacher}</p>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead><tr class="text-left text-slate-500"><th class="py-1 pr-4 font-medium">Nama Siswa</th><th class="py-1 px-2 font-medium">Status</th></tr></thead>
                            <tbody>
                                ${data.students.map(student => `
                                    <tr class="border-t border-slate-200">
                                        <td class="py-2 pr-4 text-slate-700">${student.name}</td>
                                        <td class="py-2 px-2"><span class="px-2 py-1 rounded-full text-xs font-semibold ${student.status === 'S' ? 'bg-yellow-100 text-yellow-800' : student.status === 'I' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}">${student.status}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');

        if (reportHtml.trim() === '') {
             container.innerHTML = `<div class="text-center py-8"><div class="inline-block p-4 bg-green-100 text-green-800 rounded-lg"><p class="font-semibold">Semua siswa di semua kelas yang tercatat hadir hari ini.</p></div></div>`;
        } else {
            container.innerHTML = reportHtml;
        }

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        container.innerHTML = `<p class="text-center text-red-500 py-8">${error.message}</p>`;
    }
}

async function renderAdminPanelScreen() {
    appContainer.innerHTML = templates.adminPanel();
    document.getElementById('admin-panel-back-btn').addEventListener('click', () => navigateTo('adminHome'));
    const container = document.getElementById('admin-panel-container');

    try {
        const { allUsers } = await apiService.getAllUsers();
        setState({ adminPanel: { users: allUsers, isLoading: false }});
        
        container.innerHTML = `
            <table class="w-full text-left">
                <thead>
                    <tr class="border-b bg-slate-50">
                        <th class="p-3 text-sm font-semibold text-slate-600">Pengguna</th>
                        <th class="p-3 text-sm font-semibold text-slate-600">Peran</th>
                        <th class="p-3 text-sm font-semibold text-slate-600">Tindakan</th>
                    </tr>
                </thead>
                <tbody>
                    ${allUsers.map(user => `
                        <tr class="border-b hover:bg-slate-50 transition">
                            <td class="p-3">
                                <div class="flex items-center gap-3">
                                    <img src="${user.picture}" alt="${user.name}" class="w-10 h-10 rounded-full"/>
                                    <div>
                                        <p class="font-medium text-slate-800">${user.name}</p>
                                        <p class="text-xs text-slate-500">${user.email}</p>
                                    </div>
                                </div>
                            </td>
                            <td class="p-3">
                                <select data-email="${user.email}" class="role-select w-full max-w-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="GURU" ${user.role === 'GURU' ? 'selected' : ''}>Guru</option>
                                    <option value="KEPALA_SEKOLAH" ${user.role === 'KEPALA_SEKOLAH' ? 'selected' : ''}>Kepala Sekolah</option>
                                    <option value="SUPER_ADMIN" ${user.role === 'SUPER_ADMIN' ? 'selected' : ''}>Super Admin</option>
                                </select>
                            </td>
                             <td class="p-3">
                                ${user.role === 'GURU' ? `
                                <button class="manage-classes-btn bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold py-2 px-3 rounded-lg text-sm transition" 
                                        data-email="${user.email}" 
                                        data-name="${user.name}" 
                                        data-assigned='${JSON.stringify(user.assigned_classes || [])}'>
                                    Kelola Kelas
                                </button>
                                ` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const targetEmail = e.target.dataset.email;
                const newRole = e.target.value;
                const confirmed = await showConfirmation(`Anda yakin ingin mengubah peran untuk ${targetEmail} menjadi ${newRole}?`);
                if (confirmed) {
                    showLoader('Mengubah peran...');
                    try {
                        await apiService.updateUserRole(targetEmail, newRole);
                        showNotification('Peran berhasil diubah.');
                        navigateTo('adminPanel'); // Refresh
                    } catch (error) {
                        showNotification(error.message, 'error');
                        e.target.value = state.adminPanel.users.find(u => u.email === targetEmail).role; // revert dropdown
                    } finally {
                        hideLoader();
                    }
                } else {
                     e.target.value = state.adminPanel.users.find(u => u.email === targetEmail).role; // revert dropdown
                }
            });
        });

        document.querySelectorAll('.manage-classes-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const user = {
                    email: e.currentTarget.dataset.email,
                    name: e.currentTarget.dataset.name,
                    assigned_classes: JSON.parse(e.currentTarget.dataset.assigned)
                };
                showManageClassesModal(user);
            });
        });
    } catch(error) {
         container.innerHTML = `<p class="text-center text-red-500 py-8">${error.message}</p>`;
    }
}

function showManageClassesModal(user) {
    const existingModal = document.getElementById('manage-classes-modal');
    if (existingModal) existingModal.parentElement.remove();
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = templates.manageClassesModal(user);
    document.body.appendChild(modalContainer);

    const closeModal = () => {
        if (document.body.contains(modalContainer)) {
            document.body.removeChild(modalContainer);
        }
    };

    document.getElementById('manage-classes-cancel-btn').onclick = closeModal;
    document.getElementById('manage-classes-save-btn').onclick = async () => {
        const selectedClasses = Array.from(document.querySelectorAll('#class-checkbox-container input:checked')).map(cb => cb.value);
        showLoader('Menyimpan perubahan...');
        try {
            await apiService.updateAssignedClasses(user.email, selectedClasses);
            showNotification('Kelas berhasil diperbarui.');
            closeModal();
            navigateTo('adminPanel'); // Refresh to show updated data
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            hideLoader();
        }
    };
}


function renderAddStudentsScreen() {
    appContainer.innerHTML = templates.addStudents(state.selectedClass);
    renderStudentInputRows();
    document.getElementById('add-student-row-btn').addEventListener('click', addStudentInputRow);
    document.getElementById('download-template-btn').addEventListener('click', handleDownloadTemplate);
    document.getElementById('import-excel-btn').addEventListener('click', () => document.getElementById('excel-upload').click());
    document.getElementById('excel-upload').addEventListener('change', handleExcelImport);
    document.getElementById('cancel-add-students-btn').addEventListener('click', () => navigateTo('setup'));
    document.getElementById('save-students-btn').addEventListener('click', handleSaveNewStudents);
}

function renderStudentInputRows() {
    const container = document.getElementById('manual-input-container');
    if (!container) return;
    container.innerHTML = '';
    state.newStudents.forEach((name, index) => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2';
        div.innerHTML = `
            <input type="text" value="${name}" data-index="${index}" class="student-name-input w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Nama Siswa ${index + 1}">
            <button data-index="${index}" class="remove-student-row-btn text-slate-400 hover:text-red-500 p-1 text-2xl font-bold leading-none">&times;</button>
        `;
        container.appendChild(div);
    });
    document.querySelectorAll('.student-name-input').forEach(input => {
        input.addEventListener('input', (e) => {
            state.newStudents[e.target.dataset.index] = e.target.value;
        });
    });
    document.querySelectorAll('.remove-student-row-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            removeStudentInputRow(e.target.dataset.index);
        });
    });
}

function addStudentInputRow() {
    state.newStudents.push('');
    renderStudentInputRows();
    const inputs = document.querySelectorAll('.student-name-input');
    inputs[inputs.length - 1].focus();
}

function removeStudentInputRow(index) {
    state.newStudents.splice(index, 1);
    if (state.newStudents.length === 0) {
        state.newStudents.push('');
    }
    renderStudentInputRows();
}

function renderAttendanceScreen() {
    appContainer.innerHTML = templates.attendance(state.selectedClass, state.selectedDate);
    const tbody = document.getElementById('attendance-table-body');
    tbody.innerHTML = '';
    state.students.forEach((student, index) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-slate-50 transition';
        const status = state.attendance[student] || 'H';
        tr.innerHTML = `
            <td class="p-3 text-sm text-slate-500">${index + 1}</td>
            <td class="p-3 font-medium text-slate-800">${student}</td>
            ${['H', 'S', 'I', 'A'].map(s => `
                <td class="p-3 text-center">
                    <input type="radio" name="status-${index}" value="${s}" class="w-5 h-5 accent-blue-500" ${status === s ? 'checked' : ''} data-student="${student}">
                </td>
            `).join('')}
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.attendance[e.target.dataset.student] = e.target.value;
        });
    });

    document.getElementById('back-to-setup-btn').addEventListener('click', () => {
       const targetScreen = state.userProfile.role === 'SUPER_ADMIN' ? 'adminHome' : 'setup';
       navigateTo(targetScreen);
    });
    document.getElementById('save-attendance-btn').addEventListener('click', handleSaveAttendance);
}


function renderDataScreen() {
    appContainer.innerHTML = templates.data();
    document.getElementById('data-back-to-start-btn').addEventListener('click', () => {
        const targetScreen = state.userProfile.role === 'SUPER_ADMIN' ? 'adminHome' : 'setup';
        navigateTo(targetScreen);
    });
    const container = document.getElementById('data-container');
    const titleEl = document.getElementById('data-title');
    
    const logsToShow = state.historyClassFilter 
        ? state.savedLogs.filter(log => log.class === state.historyClassFilter)
        : state.savedLogs;
        
    if (state.historyClassFilter) {
        titleEl.textContent = `Riwayat Absensi Kelas ${state.historyClassFilter}`;
    } else {
         titleEl.textContent = `Semua Riwayat Absensi`;
    }

    if (logsToShow.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500">Belum ada riwayat absensi yang tersimpan.</p>`;
        return;
    }

    const groupedByDate = logsToShow.reduce((acc, log) => {
        const dateStr = log.date;
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(log);
        return acc;
    }, {});

    container.innerHTML = Object.entries(groupedByDate)
        .sort((a, b) => new Date(b[0]) - new Date(a[0]))
        .map(([date, logs]) => {
            const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const logsHtml = logs.map(log => {
                const absentStudents = Object.entries(log.attendance)
                    .filter(([_, status]) => status !== 'H');
                
                let contentHtml;
                if (absentStudents.length > 0) {
                    contentHtml = `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-slate-500"><th class="py-1 pr-4 font-medium">Nama Siswa</th><th class="py-1 px-2 font-medium">Status</th></tr></thead><tbody>${Object.entries(Object.fromEntries(absentStudents)).map(([name, status]) => `<tr class="border-t border-slate-200"><td class="py-2 pr-4 text-slate-700">${name}</td><td class="py-2 px-2"><span class="px-2 py-1 rounded-full text-xs font-semibold ${status === 'S' ? 'bg-yellow-100 text-yellow-800' : status === 'I' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}">${status}</span></td></tr>`).join('')}</tbody></table></div>`;
                } else {
                    contentHtml = `<p class="text-sm text-slate-500 italic px-1 py-2">Semua siswa hadir.</p>`;
                }

                return `<div class="bg-slate-50 p-4 rounded-lg"><h3 class="font-bold text-blue-600 mb-2">Kelas ${log.class}</h3>${contentHtml}</div>`;
            }).join('');

            return `<div><h2 class="text-lg font-semibold text-slate-700 mb-3">${displayDate}</h2><div class="space-y-4">${logsHtml}</div></div>`;
        }).join('');
}

function renderRecapScreen() {
    appContainer.innerHTML = templates.recap();
    document.getElementById('recap-back-to-start-btn').addEventListener('click', () => {
        const targetScreen = state.userProfile.role === 'SUPER_ADMIN' ? 'adminHome' : 'setup';
        navigateTo(targetScreen);
    });
    document.getElementById('sort-by-total-btn').addEventListener('click', () => { setState({ recapSortOrder: 'total' }); navigateTo('recap'); });
    document.getElementById('sort-by-absen-btn').addEventListener('click', () => { setState({ recapSortOrder: 'absen' }); navigateTo('recap'); });

    const container = document.getElementById('recap-container');

    if (!state.studentsByClass || Object.keys(state.studentsByClass).length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500">Belum ada data siswa untuk ditampilkan.</p>`;
        return;
    }

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
        if (state.recapSortOrder === 'total') {
            if (b.total !== a.total) return b.total - a.total;
            return a.name.localeCompare(b.name);
        } else { // 'absen'
            const classCompare = a.class.localeCompare(b.class);
            if (classCompare !== 0) return classCompare;
            const classStudents = state.studentsByClass[a.class]?.students;
            return classStudents ? classStudents.indexOf(a.name) - classStudents.indexOf(b.name) : 0;
        }
    });

    container.innerHTML = `
        <table class="w-full text-left">
            <thead>
                <tr class="border-b bg-slate-50">
                    <th class="p-3 text-sm font-semibold text-slate-600">No.</th>
                    <th class="p-3 text-sm font-semibold text-slate-600">Nama Siswa</th>
                    <th class="p-3 text-sm font-semibold text-slate-600">Kelas</th>
                    <th class="p-3 text-sm font-semibold text-slate-600 text-center">Sakit (S)</th>
                    <th class="p-3 text-sm font-semibold text-slate-600 text-center">Izin (I)</th>
                    <th class="p-3 text-sm font-semibold text-slate-600 text-center">Alfa (A)</th>
                    <th class="p-3 text-sm font-semibold text-slate-600 text-center">Total</th>
                </tr>
            </thead>
            <tbody>
                ${recapArray.map((item, index) => `
                    <tr class="border-b hover:bg-slate-50 transition">
                        <td class="p-3 text-sm text-slate-500">${index + 1}</td>
                        <td class="p-3 font-medium text-slate-800">${item.name}</td>
                        <td class="p-3 text-sm text-slate-500">${item.class}</td>
                        <td class="p-3 text-sm text-slate-700 text-center">${item.S}</td>
                        <td class="p-3 text-sm text-slate-700 text-center">${item.I}</td>
                        <td class="p-3 text-sm text-slate-700 text-center">${item.A}</td>
                        <td class="p-3 text-sm font-bold text-slate-800 text-center">${item.total}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

// This function orchestrates which screen to render
export function renderScreen(screen) {
    // Clear previous content
    appContainer.innerHTML = '';
    
    switch(screen) {
        case 'setup':
            renderSetupScreen();
            break;
        case 'adminHome':
            renderAdminHomeScreen();
            break;
        case 'importData':
            renderImportDataScreen();
            break;
        case 'dashboard':
            renderDashboardScreen();
            break;
        case 'adminPanel':
            renderAdminPanelScreen();
            break;
        case 'add-students':
            renderAddStudentsScreen();
            break;
        case 'attendance':
            renderAttendanceScreen();
            break;
        case 'success':
             appContainer.innerHTML = templates.success();
             document.getElementById('success-back-to-start-btn').addEventListener('click', () => {
                const targetScreen = state.userProfile.role === 'SUPER_ADMIN' ? 'adminHome' : 'setup';
                navigateTo(targetScreen);
             });
             document.getElementById('success-view-data-btn').addEventListener('click', () => handleViewHistory(false));
             break;
        case 'data':
            renderDataScreen();
            break;
        case 'recap':
            renderRecapScreen();
            break;
        default:
            renderSetupScreen();
    }

    hideLoader();
}
--- END OF FILE js/ui.js ---
<content>
</change>
</changes>
```
