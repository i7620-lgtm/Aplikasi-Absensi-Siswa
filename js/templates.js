

import { state, CLASSES } from './main.js';
import { getGsiReadyState } from './auth.js';

function getRoleDisplayName(role) {
    switch(role) {
        case 'GURU': return 'Guru';
        case 'KEPALA_SEKOLAH': return 'Kepala Sekolah';
        case 'SUPER_ADMIN': return 'Super Admin';
        case 'ADMIN_SEKOLAH': return 'Admin Sekolah';
        default: return role;
    }
}

function getWeekRange(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dayOfWeek = d.getDay(); 
    const diffToMonday = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diffToMonday));
    const sunday = new Date(new Date(monday).setDate(monday.getDate() + 6));
    
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const locale = 'id-ID';

    return `${monday.toLocaleDateString(locale, options)} - ${sunday.toLocaleDateString(locale, options)}`;
}


export const templates = {
    setup: () => {
        const isAdmin = state.userProfile?.role === 'SUPER_ADMIN' || state.userProfile?.role === 'ADMIN_SEKOLAH';
        const isTeacher = state.userProfile?.role === 'GURU';
        const assignedClasses = state.userProfile?.assigned_classes || [];
        const needsAssignment = isTeacher && assignedClasses.length === 0;
        const availableClasses = isAdmin ? CLASSES : assignedClasses;
        const isSuperAdminInContext = state.userProfile?.role === 'SUPER_ADMIN' && state.adminActingAsSchool;
        const title = isSuperAdminInContext 
            ? `Absensi Sekolah`
            : "Absensi Online Siswa";
        
        return `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4">
            <div class="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full">
                ${
                    state.userProfile
                    ? `
                        <div class="flex items-center justify-between mb-6">
                            <h1 class="text-xl font-bold text-slate-800">${title}</h1>
                            <div>
                                ${isAdmin ? `<button id="back-to-admin-home-btn" class="text-slate-500 hover:text-blue-500 transition duration-300 p-2 rounded-full -mr-2" title="Kembali ke Dasbor Admin"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg></button>` : ''}
                                <button id="logoutBtn" class="text-slate-500 hover:text-red-500 transition duration-300 p-2 rounded-full -mr-2" title="Logout">
                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                </button>
                            </div>
                        </div>
                        ${isSuperAdminInContext ? `
                        <div class="bg-indigo-50 border-l-4 border-indigo-400 p-4 mb-6 text-sm text-indigo-800" role="alert">
                            <p><span class="font-bold">Mode Konteks:</span> Anda bertindak sebagai admin untuk sekolah <strong class="font-semibold">${state.adminActingAsSchool.name}</strong>.</p>
                        </div>
                        ` : ''}
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
                ${
                    (state.userProfile && ('Notification' in window) && Notification.permission === 'default' && !localStorage.getItem('notificationBannerDismissed'))
                    ? `
                        <div id="notification-permission-banner" class="bg-indigo-50 border border-indigo-200 p-4 rounded-lg my-6 text-sm text-indigo-800 flex items-start justify-between gap-4">
                            <div>
                                <p class="font-semibold mb-1">Dapatkan Notifikasi Latar Belakang</p>
                                <p>Izinkan notifikasi untuk mengetahui saat data Anda berhasil disinkronkan, bahkan saat aplikasi ditutup.</p>
                            </div>
                            <div class="flex-shrink-0 flex items-center gap-2">
                                <button id="enable-notifications-btn" class="font-bold text-indigo-600 hover:text-indigo-800 focus:outline-none">Aktifkan</button>
                                <button id="dismiss-notification-banner-btn" class="text-2xl leading-none text-indigo-400 hover:text-indigo-600 focus:outline-none" title="Tutup">&times;</button>
                            </div>
                        </div>
                    ` : ''
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
                         <button id="historyBtn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${!state.userProfile || needsAssignment ? 'disabled' : ''}>Lihat Riwayat Kelas Ini</button>
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
        const isAdmin = state.userProfile?.role === 'SUPER_ADMIN' || state.userProfile?.role === 'ADMIN_SEKOLAH';
        const title = state.userProfile?.role === 'SUPER_ADMIN' ? 'Dasbor Super Admin' : 'Dasbor Admin Sekolah';
        return `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4">
            <div class="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full">
                <div class="flex items-center justify-between mb-6">
                    <h1 class="text-xl font-bold text-slate-800">${title}</h1>
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
                    <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider text-center">Menu Admin</h2>
                    <button id="go-to-attendance-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300">Lakukan Absensi</button>
                    <button id="view-dashboard-btn" class="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300">Lihat Dasbor Kepala Sekolah</button>
                    <button id="view-admin-panel-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300">Panel Manajemen Pengguna</button>
                </div>

                ${state.userProfile?.role === 'SUPER_ADMIN' ? `
                <div class="pt-4 mt-3 border-t border-slate-200">
                    <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider text-center mb-3">Mode Perbaikan</h2>
                    <div id="maintenance-toggle-container" class="flex items-center justify-center p-3 bg-slate-50 rounded-lg">
                        <p class="text-sm text-slate-500">Memuat status...</p>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>`;
    },
    dashboard: () => {
        const { activeView, chartViewMode, selectedDate } = state.dashboard;
        const dateObj = new Date(selectedDate + 'T00:00:00');
        let displayDate;
        let isDatePickerVisible = true;

        if (activeView === 'report' || activeView === 'ai') {
            displayDate = dateObj.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        } else if (activeView === 'percentage') {
            switch (chartViewMode) {
                case 'daily':
                    displayDate = dateObj.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    break;
                case 'weekly':
                    displayDate = getWeekRange(dateObj);
                    break;
                case 'monthly':
                    displayDate = dateObj.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });
                    break;
                case 'semester1':
                    displayDate = `Semester I (Juli - Desember ${dateObj.getFullYear()})`;
                    isDatePickerVisible = false;
                    break;
                case 'semester2':
                    displayDate = `Semester II (Januari - Juni ${dateObj.getFullYear()})`;
                    isDatePickerVisible = false;
                    break;
                case 'yearly':
                    displayDate = `Tahun ${dateObj.getFullYear()}`;
                    break;
                default:
                     displayDate = dateObj.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            }
        } else {
            displayDate = dateObj.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
        
        const isAdmin = state.userProfile?.role === 'SUPER_ADMIN' || state.userProfile?.role === 'ADMIN_SEKOLAH';
        const backTarget = isAdmin ? 'adminHome' : 'setup';

        const getButtonClass = (viewName) => {
            return activeView === viewName
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100';
        };
        
        const title = state.userProfile?.role === 'SUPER_ADMIN' && state.adminActingAsSchool 
            ? `Dasbor (Konteks: ${state.adminActingAsSchool.name})`
            : "Dasbor Kepala Sekolah";

        return `
        <div class="screen active p-4 md:p-8 max-w-7xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 pb-4 border-b border-slate-200 gap-4">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">${title}</h1>
                        <p class="text-slate-500">${displayDate}</p>
                    </div>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
                        ${isDatePickerVisible ? `
                        <div class="flex items-center gap-2 w-full">
                             <label for="ks-date-display" class="text-sm font-medium text-slate-600 flex-shrink-0">Pilih Tanggal:</label>
                             <div id="ks-datepicker-wrapper" class="custom-datepicker-wrapper">
                                <input type="text" id="ks-date-display" value="${new Date(state.dashboard.selectedDate + 'T00:00:00').toLocaleDateString('id-ID', {day: '2-digit', month: '2-digit', year: 'numeric'})}" readonly class="w-full sm:w-auto p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition text-sm"/>
                                <div id="ks-datepicker-popup" class="datepicker-popup hidden"></div>
                             </div>
                        </div>
                        ` : ''}
                        <div class="flex items-center gap-2">
                           ${isAdmin ? `<button id="dashboard-back-btn" data-target="${backTarget}" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>` : ''}
                           <button id="logoutBtn-ks" class="text-slate-500 hover:text-red-500 transition duration-300 p-2 rounded-full flex items-center gap-2 text-sm font-semibold">
                               <span>Logout</span>
                               <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                           </button>
                        </div>
                    </div>
                </div>

                <!-- Dashboard Navigation Tabs -->
                <div class="mb-6 p-1 bg-slate-100 rounded-lg flex flex-col sm:flex-row gap-1">
                    <button id="db-view-report" class="flex-1 py-2 px-4 rounded-md font-semibold text-sm transition ${getButtonClass('report')}">Laporan Siswa Tidak Hadir</button>
                    <button id="db-view-percentage" class="flex-1 py-2 px-4 rounded-md font-semibold text-sm transition ${getButtonClass('percentage')}">Persentase Kehadiran</button>
                    <button id="db-view-ai" class="flex-1 py-2 px-4 rounded-md font-semibold text-sm transition ${getButtonClass('ai')}">Rekomendasi AI</button>
                </div>

                <!-- Content Area -->
                <div id="dashboard-content-report" class="space-y-6 ${activeView === 'report' ? '' : 'hidden'}"></div>
                <div id="dashboard-content-percentage" class="${activeView === 'percentage' ? '' : 'hidden'}"></div>
                <div id="dashboard-content-ai" class="${activeView === 'ai' ? '' : 'hidden'}"></div>
             </div>
        </div>`;
    },
    adminPanel: () => {
        const isSuperAdmin = state.userProfile?.role === 'SUPER_ADMIN';
        return `
        <div class="screen active p-4 md:p-8 max-w-5xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 pb-4 border-b border-slate-200">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Panel Admin: Manajemen Pengguna</h1>
                        <p class="text-slate-500">Kelola pengguna dan sekolah dari satu tempat.</p>
                    </div>
                    <div class="flex items-center gap-2 mt-4 sm:mt-0">
                         ${isSuperAdmin ? `<button id="add-school-btn" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition text-sm">Tambah Sekolah</button>` : ''}
                         <button id="admin-panel-back-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>
                    </div>
                </div>
                <div class="mb-4 flex justify-end">
                    <label class="flex items-center space-x-2 cursor-pointer text-sm text-slate-600">
                        <input type="checkbox" id="group-by-school-toggle" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        <span>Kelompokkan berdasarkan sekolah</span>
                    </label>
                </div>
                <div id="admin-bulk-actions-container" class="mb-4 transition-all"></div>
                <div id="admin-panel-container" class="overflow-x-auto">
                     <p class="text-center text-slate-500 py-8">Memuat daftar pengguna...</p>
                </div>
                <div id="admin-pagination-container" class="mt-6 flex justify-between items-center text-sm text-slate-600"></div>
             </div>
        </div>
    `},
    bulkActionsBar: (count) => `
        <div class="bg-blue-50 border border-blue-200 p-3 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
            <p class="font-semibold text-blue-800">${count} pengguna terpilih</p>
            <div class="flex items-center gap-2">
                <button id="bulk-assign-school-btn" class="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold py-2 px-3 rounded-lg text-sm transition">Tugaskan Sekolah</button>
                <button id="bulk-change-role-btn" class="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold py-2 px-3 rounded-lg text-sm transition">Ubah Peran</button>
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

                <div id="data-filters" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                        <label for="filter-student-name" class="block text-sm font-medium text-slate-700 mb-1">Cari Nama Siswa</label>
                        <input type="text" id="filter-student-name" placeholder="Ketik nama..." class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition">
                    </div>
                    <div>
                        <label for="filter-status" class="block text-sm font-medium text-slate-700 mb-1">Filter Status</label>
                        <select id="filter-status" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition bg-white">
                            <option value="all">Semua Absen</option>
                            <option value="S">Sakit (S)</option>
                            <option value="I">Izin (I)</option>
                            <option value="A">Alpa (A)</option>
                        </select>
                    </div>
                    <div class="lg:col-span-2">
                        <label class="block text-sm font-medium text-slate-700 mb-1">Rentang Tanggal</label>
                        <div class="flex items-center gap-2">
                            <input type="date" id="filter-start-date" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition">
                            <span class="text-slate-500">-</span>
                            <input type="date" id="filter-end-date" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition">
                        </div>
                    </div>
                    <div class="md:col-span-2 lg:col-span-4 text-right mt-2">
                         <button id="clear-filters-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Hapus Filter</button>
                    </div>
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
    maintenance: () => `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4 text-center">
            <div class="bg-white p-8 md:p-12 rounded-2xl shadow-lg max-w-md w-full animate-fade-in">
                <svg class="mx-auto h-16 w-16 text-amber-500 mb-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.471-2.471a1.286 1.286 0 00-1.82-1.82L11.42 15.17zm0 0L5.57 21a2.652 2.652 0 01-3.75-3.75l5.877-5.877m0 0l2.471 2.471" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h1 class="text-3xl font-bold text-slate-800 mb-3">Aplikasi dalam Perbaikan</h1>
                <p class="text-slate-500">Kami sedang melakukan beberapa pembaruan untuk meningkatkan pengalaman Anda. Aplikasi akan segera kembali normal. Mohon coba lagi nanti.</p>
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
    roleSelectorModal: (availableRoles) => `
        <div id="role-selector-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style="z-index: 10001;">
             <div class="bg-white p-8 rounded-2xl shadow-lg max-w-sm w-full animate-fade-in">
                <h2 class="text-xl font-bold text-slate-800 mb-4">Pilih Peran Baru</h2>
                <p class="text-slate-600 mb-6">Pilih peran baru untuk diterapkan pada pengguna yang dipilih.</p>
                <select id="role-select-bulk-modal" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                   ${availableRoles.map(role => `<option value="${role.value}">${role.text}</option>`).join('')}
                </select>
                <div class="flex justify-end gap-4 mt-8">
                    <button id="role-selector-cancel-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition">Batal</button>
                    <button id="role-selector-confirm-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition">Terapkan</button>
                </div>
            </div>
        </div>
    `,
    manageUserModal: (user, schools) => {
        const assignedClasses = user.assigned_classes || [];
        const currentUserRole = state.userProfile.role;
        const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';
        const isTargetSuperAdmin = user.role === 'SUPER_ADMIN';

        const availableRoles = [
            { value: 'GURU', text: 'Guru' },
            { value: 'KEPALA_SEKOLAH', text: 'Kepala Sekolah' },
        ];
        if (isSuperAdmin) {
            availableRoles.push({ value: 'ADMIN_SEKOLAH', text: 'Admin Sekolah' });
            availableRoles.push({ value: 'SUPER_ADMIN', text: 'Super Admin' });
        }

        return `
        <div id="manage-user-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style="z-index: 10001;">
             <div class="bg-white p-8 rounded-2xl shadow-lg max-w-lg w-full animate-fade-in">
                <h2 class="text-xl font-bold text-slate-800 mb-2">Kelola Pengguna</h2>
                <p class="text-slate-600 mb-6 font-semibold">${user.name}</p>
                
                <div class="space-y-4">
                    <div>
                        <label for="role-select-modal" class="block text-sm font-medium text-slate-700 mb-1">Peran Pengguna</label>
                        <select id="role-select-modal" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                           ${availableRoles.map(role => `<option value="${role.value}" ${user.role === role.value ? 'selected' : ''}>${role.text}</option>`).join('')}
                        </select>
                    </div>
                    ${isSuperAdmin ? `
                    <div>
                        <label for="school-select-modal" class="block text-sm font-medium text-slate-700 mb-1">Tugaskan ke Sekolah</label>
                        <select id="school-select-modal" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${isTargetSuperAdmin ? 'bg-slate-100 cursor-not-allowed' : ''}" ${isTargetSuperAdmin ? 'disabled' : ''}>
                            <option value="">-- Tidak Ditugaskan --</option>
                            ${schools.map(school => `<option value="${school.id}" ${user.school_id === school.id ? 'selected' : ''}>${school.name}</option>`).join('')}
                        </select>
                        ${isTargetSuperAdmin ? '<p class="text-xs text-slate-500 mt-1">Super Admin adalah peran global dan tidak dapat ditugaskan ke sekolah tertentu.</p>' : ''}
                    </div>` : ''}
                </div>

                <div id="manage-classes-container" class="mt-6 pt-4 border-t border-slate-200 ${user.role !== 'GURU' ? 'hidden' : ''}">
                     <label class="block text-sm font-medium text-slate-700 mb-2">Tugaskan Kelas (untuk Guru)</label>
                     <div id="class-checkbox-container" class="grid grid-cols-3 sm:grid-cols-4 gap-4 max-h-48 overflow-y-auto border p-4 rounded-lg">
                        ${CLASSES.map(c => `
                            <label class="flex items-center space-x-2 text-slate-700">
                                <input type="checkbox" value="${c}" class="class-checkbox h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" ${assignedClasses.includes(c) ? 'checked' : ''}>
                                <span>${c}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="flex justify-end gap-4 mt-8">
                    <button id="manage-user-cancel-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition">Batal</button>
                    <button id="manage-user-save-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition">Simpan Perubahan</button>
                </div>
            </div>
        </div>`;
    },
    schoolSelectorModal: (schools, title) => `
        <div id="school-selector-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style="z-index: 10001;">
             <div class="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full animate-fade-in">
                <h2 class="text-xl font-bold text-slate-800 mb-4">${title}</h2>
                <p class="text-slate-600 mb-6">Pilih salah satu sekolah di bawah ini untuk melanjutkan.</p>
                <div id="school-list-container" class="space-y-2 max-h-60 overflow-y-auto mb-6 border-t border-b py-4">
                    ${schools.length > 0 
                        ? schools.map(school => `<button class="school-select-btn w-full text-left p-3 rounded-lg hover:bg-slate-100 transition" data-school-id="${school.id}" data-school-name="${school.name}">${school.name}</button>`).join('')
                        : '<p class="text-slate-500 text-center">Belum ada sekolah yang ditambahkan.</p>'
                    }
                </div>
                <div class="flex justify-end">
                    <button id="school-selector-cancel-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition">Batal</button>
                </div>
            </div>
        </div>
    `
};
