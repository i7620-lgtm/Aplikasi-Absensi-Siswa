import { state, CLASSES } from './main.js';

export function encodeHTML(str) {
    if (typeof str !== 'string' || !str) return str === 0 ? '0' : (str || '');
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

export function getRoleDisplayName(role) {
    switch(role) {
        case 'GURU': return 'Guru';
        case 'KEPALA_SEKOLAH': return 'Kepala Sekolah';
        case 'SUPER_ADMIN': return 'Super Admin';
        case 'ADMIN_SEKOLAH': return 'Admin Sekolah';
        case 'DINAS_PENDIDIKAN': return 'Analis Dinas Pendidikan';
        case 'ADMIN_DINAS_PENDIDIKAN': return 'Manajer Dinas Pendidikan';
        case 'ORANG_TUA': return 'Orang Tua';
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
        const isAdmin = ['SUPER_ADMIN', 'ADMIN_SEKOLAH'].includes(state.userProfile?.primaryRole);
        const isTeacher = state.userProfile?.primaryRole === 'GURU';
        const assignedClasses = state.userProfile?.assigned_classes || [];
        const needsAssignment = isTeacher && assignedClasses.length === 0;
        const availableClasses = isAdmin ? CLASSES : assignedClasses;
        const isSuperAdminInContext = state.userProfile?.primaryRole === 'SUPER_ADMIN' && state.adminActingAsSchool;
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
                            <h1 class="text-xl font-bold text-slate-800">${encodeHTML(title)}</h1>
                            <div>
                                <button id="back-to-main-home-btn" class="text-slate-500 hover:text-blue-500 transition duration-300 p-2 rounded-full -mr-2" title="Kembali ke Beranda"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg></button>
                                <button id="logoutBtn" class="text-slate-500 hover:text-red-500 transition duration-300 p-2 rounded-full -mr-2" title="Logout">
                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                </button>
                            </div>
                        </div>
                        ${isSuperAdminInContext ? `
                        <div class="bg-indigo-50 border-l-4 border-indigo-400 p-4 mb-6 text-sm text-indigo-800" role="alert">
                            <p><span class="font-bold">Mode Konteks:</span> Anda bertindak sebagai admin untuk sekolah <strong class="font-semibold">${encodeHTML(state.adminActingAsSchool.name)}</strong>.</p>
                        </div>
                        ` : ''}
                        <div class="flex items-center gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
                            <img src="${encodeHTML(state.userProfile.picture)}" alt="User" class="w-12 h-12 rounded-full"/>
                            <div>
                                <p class="font-semibold text-slate-800">${encodeHTML(state.userProfile.name)}</p>
                                <p class="text-sm text-slate-500">${encodeHTML(state.userProfile.email)}</p>
                                <span class="px-2 py-0.5 mt-1 inline-block rounded-full text-xs font-semibold ${isAdmin ? 'bg-indigo-100 text-indigo-800' : 'bg-green-100 text-green-800'}">${getRoleDisplayName(state.userProfile.primaryRole)}</span>
                            </div>
                        </div>
                    `
                    : `
                        <h1 class="text-xl font-bold text-slate-800 mb-4">Absensi Online Siswa</h1>
                        <div id="backup-notice" class="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6 text-sm text-blue-800">
                            <p class="font-semibold mb-2">Selamat Datang!</p>
                            <p class="mb-3">Untuk memulai, silakan login dengan akun Google Anda. Semua data absensi akan disimpan dengan aman di cloud dan dapat diakses dari perangkat mana pun.</p>
                            <button id="loginBtn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg w-full transition duration-300 flex items-center justify-center gap-2">
                                <svg class="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.519-3.108-11.127-7.481l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.022,35.17,44,30.023,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>
                                <span>Login & Mulai Absensi</span>
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
                         <button id="downloadDataBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${!state.userProfile || needsAssignment ? 'disabled' : ''}>Unduh Rekap Kelas (Excel)</button>
                    </div>
                `}
                <p id="setup-status" class="text-center text-sm text-slate-500 mt-4 h-5">${state.userProfile ? 'Data disimpan secara otomatis di cloud.' : 'Silakan login untuk memulai.'}</p>
            </div>
        </div>`;
    },
    multiRoleHome: () => {
        if (!state.userProfile) return ``; // Should not happen, but a safeguard.
        const { name, email, picture, primaryRole, isParent } = state.userProfile;
        
        const roleMapping = {
            'SUPER_ADMIN': { color: 'bg-red-100 text-red-800', title: 'Super Admin' },
            'ADMIN_SEKOLAH': { color: 'bg-indigo-100 text-indigo-800', title: 'Admin Sekolah' },
            'KEPALA_SEKOLAH': { color: 'bg-purple-100 text-purple-800', title: 'Kepala Sekolah' },
            'GURU': { color: 'bg-green-100 text-green-800', title: 'Guru' },
            'ADMIN_DINAS_PENDIDIKAN': { color: 'bg-sky-100 text-sky-800', title: 'Manajer Dinas Pendidikan' },
            'DINAS_PENDIDIKAN': { color: 'bg-cyan-100 text-cyan-800', title: 'Analis Dinas Pendidikan' },
            'ORANG_TUA': { color: 'bg-teal-100 text-teal-800', title: 'Orang Tua' },
        };
        
        const primaryRoleInfo = roleMapping[primaryRole] || { color: 'bg-slate-100 text-slate-800', title: primaryRole };

        return `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4">
            <div class="bg-white p-8 rounded-2xl shadow-lg max-w-2xl w-full">
                <div class="flex items-center justify-between mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">Beranda Aplikasi</h1>
                    <button id="logoutBtn" class="text-slate-500 hover:text-red-500 transition duration-300 p-2 rounded-full -mr-2" title="Logout">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    </button>
                </div>
                <div class="flex flex-col sm:flex-row items-center gap-4 mb-8 p-4 bg-slate-50 rounded-lg">
                    <img src="${encodeHTML(picture)}" alt="User" class="w-16 h-16 rounded-full"/>
                    <div class="text-center sm:text-left">
                        <p class="text-lg font-semibold text-slate-800">${encodeHTML(name)}</p>
                        <p class="text-sm text-slate-500">${encodeHTML(email)}</p>
                        <div class="mt-2 flex flex-wrap justify-center sm:justify-start gap-2">
                            <span class="px-2 py-0.5 inline-block rounded-full text-xs font-semibold ${primaryRoleInfo.color}">${primaryRoleInfo.title}</span>
                            ${isParent && primaryRole !== 'ORANG_TUA' ? `<span class="px-2 py-0.5 inline-block rounded-full text-xs font-semibold ${roleMapping['ORANG_TUA'].color}">${roleMapping['ORANG_TUA'].title}</span>` : ''}
                        </div>
                    </div>
                </div>

                <div class="space-y-4">
                    <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider text-center">Pilih Aksi</h2>
                    
                    <!-- Teacher & School Admin Actions -->
                    ${['GURU', 'ADMIN_SEKOLAH', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'].includes(primaryRole) ? `
                    <button id="go-to-attendance-btn" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><div><p class="font-bold">Lakukan & Kelola Absensi</p><p class="text-sm font-normal opacity-90">Catat kehadiran, kelola siswa, dan lihat rekap.</p></div></button>
                    ` : ''}

                    <!-- Dashboard Actions -->
                     ${['KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN', 'SUPER_ADMIN'].includes(primaryRole) ? `
                    <button id="view-dashboard-btn" class="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg><div><p class="font-bold">Lihat Dasbor Analitik</p><p class="text-sm font-normal opacity-90">Analisis data kehadiran, persentase, dan dapatkan rekomendasi AI.</p></div></button>
                    ` : ''}

                    <!-- Parent Action -->
                    ${isParent ? `
                    <button id="view-parent-dashboard-btn" class="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg><div><p class="font-bold">Dasbor Orang Tua</p><p class="text-sm font-normal opacity-90">Lihat riwayat kehadiran anak Anda.</p></div></button>
                    ` : ''}

                    <!-- Super Admin / Dinas Admin Actions -->
                    ${['SUPER_ADMIN', 'ADMIN_DINAS_PENDIDIKAN'].includes(primaryRole) ? `
                    <button id="view-admin-panel-btn" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21v-1.5a2.5 2.5 0 00-5 0V21M3 21v-1.5a2.5 2.5 0 015 0V21"></path></svg><div><p class="font-bold">Panel Manajemen Pengguna</p><p class="text-sm font-normal opacity-90">Kelola pengguna dan penetapan peran.</p></div></button>
                    ` : ''}

                    ${primaryRole === 'SUPER_ADMIN' ? `
                    <button id="view-jurisdiction-panel-btn" class="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg><div><p class="font-bold">Panel Manajemen Yurisdiksi</p><p class="text-sm font-normal opacity-90">Kelola hierarki wilayah dan sekolah.</p></div></button>
                    <button id="go-to-migration-tool-btn" class="w-full bg-gray-700 hover:bg-gray-800 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10m16-10v10M4 17h16M4 7h16M9 4v3m6-3v3m-3 14v-3"></path></svg><div><p class="font-bold">Alat Migrasi Data Lama</p><p class="text-sm font-normal opacity-90">Unggah data dari sistem lama ke format baru.</p></div></button>
                    <button id="toggle-maintenance-btn" class="w-full bg-slate-600 hover:bg-slate-700 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><div id="maintenance-toggle-container" class="w-full flex items-center justify-between"><span class="flex items-center gap-4"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg><div><p class="font-bold">Mode Perbaikan</p><p class="text-sm font-normal opacity-90">Memuat status...</p></div></span></div></button>
                    ` : ''}

                </div>
            </div>
        </div>
        `;
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
        
        const isSuperAdmin = state.userProfile?.primaryRole === 'SUPER_ADMIN';
        const isSchoolAdmin = state.userProfile?.primaryRole === 'ADMIN_SEKOLAH';
        const isDinas = ['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(state.userProfile.primaryRole);
        
        let backButtonHtml = `<button id="dashboard-back-btn" data-target="multiRoleHome" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>`;

        let title = "Dasbor";
        if (state.userProfile.primaryRole === 'KEPALA_SEKOLAH') title = "Dasbor Kepala Sekolah";
        if (isDinas) title = "Dasbor Regional Dinas Pendidikan";
        if (isSuperAdmin && state.adminActingAsSchool) title = `Dasbor (Konteks: ${encodeHTML(state.adminActingAsSchool.name)})`;
        if ((isSuperAdmin || isDinas) && state.adminActingAsJurisdiction) title = `Dasbor (Konteks: ${encodeHTML(state.adminActingAsJurisdiction.name)})`;


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
                           ${backButtonHtml}
                           <button id="logoutBtn-ks" class="text-slate-500 hover:text-red-500 transition duration-300 p-2 rounded-full flex items-center gap-2 text-sm font-semibold">
                               <span>Logout</span>
                               <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                           </button>
                        </div>
                    </div>
                </div>

                <!-- Dashboard Navigation Tabs -->
                <div class="mb-6 p-1 bg-slate-100 rounded-lg flex flex-col sm:flex-row gap-1">
                    <button id="db-view-report" class="flex-1 py-2 px-4 rounded-md font-semibold text-sm transition ${activeView === 'report' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}">Laporan Siswa Tidak Hadir</button>
                    <button id="db-view-percentage" class="flex-1 py-2 px-4 rounded-md font-semibold text-sm transition ${activeView === 'percentage' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}">Persentase Kehadiran</button>
                    <button id="db-view-ai" class="flex-1 py-2 px-4 rounded-md font-semibold text-sm transition ${activeView === 'ai' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}">Rekomendasi AI</button>
                </div>

                <!-- Content Area -->
                <div id="dashboard-content-report" class="space-y-6 ${activeView === 'report' ? '' : 'hidden'}"></div>
                <div id="dashboard-content-percentage" class="${activeView === 'percentage' ? '' : 'hidden'}"></div>
                <div id="dashboard-content-ai" class="${activeView === 'ai' ? '' : 'hidden'}"></div>
             </div>
        </div>`;
    },
    parentDashboard: () => {
        const { isLoading, data } = state.parentDashboard;
        const profile = state.userProfile;

        if (isLoading) {
            return `<div class="screen active min-h-screen flex items-center justify-center"><div class="text-center"><div class="loader mx-auto"></div><p class="loader-text">Memuat data kehadiran anak Anda...</p></div></div>`;
        }

        if (!data || data.length === 0) {
            return `
            <div class="screen active p-4 md:p-8 max-w-4xl mx-auto">
                <div class="bg-white p-8 rounded-2xl shadow-lg">
                    <div class="flex items-center justify-between mb-6 pb-4 border-b">
                        <h1 class="text-2xl font-bold text-slate-800">Dasbor Orang Tua</h1>
                        <button id="parent-dashboard-back-btn" class="text-slate-500 hover:text-blue-500 transition duration-300 p-2 rounded-full -mr-2" title="Kembali ke Beranda">
                             <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                        </button>
                    </div>
                    <div class="text-center bg-slate-50 p-8 rounded-lg">
                        <h2 class="text-xl font-semibold text-slate-700">Tidak Ada Data Ditemukan</h2>
                        <p class="text-slate-500 mt-2">Email Anda (<span class="font-medium">${encodeHTML(profile.email)}</span>) tidak tertaut dengan data siswa mana pun, atau anak Anda belum memiliki catatan ketidakhadiran.</p>
                        <p class="text-slate-500 mt-1">Silakan hubungi pihak sekolah untuk memastikan email Anda telah didaftarkan dengan benar.</p>
                    </div>
                </div>
            </div>`;
        }

        return `
        <div class="screen active p-4 md:p-8 max-w-4xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 pb-4 border-b border-slate-200 gap-4">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Dasbor Orang Tua</h1>
                        <p class="text-slate-500">Selamat datang, ${encodeHTML(profile.name)}</p>
                    </div>
                   <button id="parent-dashboard-back-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm self-start sm:self-center">Kembali</button>
                </div>
                <div class="space-y-6">
                ${data.map(child => `
                    <div class="bg-slate-50 border border-slate-200 rounded-xl p-6">
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
                             <div>
                                 <h2 class="text-xl font-bold text-slate-800">${encodeHTML(child.student_name)}</h2>
                                 <p class="text-sm text-slate-500 font-medium">${encodeHTML(child.school_name)} - Kelas ${encodeHTML(child.class_name)}</p>
                             </div>
                             <p class="text-sm text-slate-600 mt-2 sm:mt-0">Total Absen: <span class="font-bold text-lg">${child.attendance_history.length}</span></p>
                        </div>
                        ${child.attendance_history.length > 0 ? `
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="text-left text-slate-500 border-b">
                                        <th class="py-2 pr-4 font-semibold">Tanggal</th>
                                        <th class="py-2 px-2 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                ${child.attendance_history.map(att => `
                                    <tr class="border-t border-slate-200">
                                        <td class="py-2 pr-4 text-slate-700">${new Date(att.date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                                        <td class="py-2 px-2">
                                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${att.status === 'S' ? 'bg-yellow-100 text-yellow-800' : att.status === 'I' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}">
                                                ${att.status === 'S' ? 'Sakit' : att.status === 'I' ? 'Izin' : 'Alpa'}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                                </tbody>
                            </table>
                        </div>
                        ` : `
                        <div class="text-center p-6 bg-white rounded-lg border border-dashed">
                            <p class="text-green-600 font-semibold">Ananda selalu hadir!</p>
                            <p class="text-slate-500 text-sm mt-1">Tidak ada catatan ketidakhadiran yang ditemukan.</p>
                        </div>
                        `}
                    </div>
                `).join('')}
                </div>
             </div>
        </div>
        `;
    },
    adminPanel: () => {
        const isSuperAdmin = state.userProfile?.primaryRole === 'SUPER_ADMIN';
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
                    <label for="group-by-school-toggle" class="flex items-center space-x-2 cursor-pointer text-sm text-slate-600">
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
            ? `Ubah daftar siswa untuk kelas <span class="font-semibold text-blue-600">${encodeHTML(className)}</span>. Hapus nama atau baris untuk mengurangi siswa.`
            : `Data siswa untuk <span class="font-semibold text-blue-600">${encodeHTML(className)}</span> belum ada. Silakan tambahkan di bawah ini.`;
        return `
        <div class="screen active p-4 md:p-8 max-w-4xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                <h1 class="text-2xl font-bold text-slate-800 mb-2">Tambah/Kurangi Data Siswa</h1>
                <p class="text-slate-500 mb-6">${message}</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <!-- Manual Input -->
                    <div class="border-r-0 md:border-r md:pr-8 border-slate-200">
                         <div class="flex justify-between items-center mb-4">
                            <h2 class="text-lg font-semibold text-slate-700">Daftar Siswa</h2>
                            <div class="flex text-sm">
                                <span class="w-1/2 text-slate-500 text-center">Nama Siswa</span>
                                <span class="w-1/2 text-slate-500 text-center">Email Orang Tua</span>
                            </div>
                         </div>
                         <div id="manual-input-container" class="space-y-3 mb-4 max-h-60 overflow-y-auto pr-2"></div>
                         <button id="add-student-row-btn" class="w-full text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">+ Tambah Baris</button>
                    </div>
                    <!-- Excel Import -->
                    <div>
                        <h2 class="text-lg font-semibold text-slate-700 mb-4">Impor dari File</h2>
                        <p class="text-sm text-slate-500 mb-4">Unggah file .xlsx atau .csv untuk <span class="font-bold">menimpa</span> daftar saat ini. Pastikan file memiliki 2 kolom: Nama Siswa dan Email Orang Tua.</p>
                        <button id="download-template-btn" class="w-full mb-3 text-sm bg-green-100 hover:bg-green-200 text-green-700 font-semibold py-2 px-4 rounded-lg transition">Unduh Template (.csv)</button>
                        <input type="file" id="excel-upload" class="hidden" accept=".xlsx, .xls, .csv"/>
                        <button id="import-excel-btn" class="w-full text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-2 px-4 rounded-lg transition">Pilih File untuk Diimpor</button>
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
                        <h1 class="text-2xl font-bold text-slate-800">Absensi Kelas ${encodeHTML(className)}</h1>
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
    success: () => {
        const { lastSaveContext } = state;
        const message = lastSaveContext
            ? `Absensi Kelas <strong>${encodeHTML(lastSaveContext.className)}</strong> telah berhasil disimpan oleh <strong>${encodeHTML(lastSaveContext.savedBy)}</strong>.`
            : `Data absensi telah berhasil disimpan di database cloud Anda.`;
        return `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4 text-center">
            <div class="bg-white p-8 md:p-12 rounded-2xl shadow-lg max-w-md w-full animate-fade-in">
                <div class="checkmark-wrapper mx-auto mb-6">
                    <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                        <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                    </svg>
                </div>
                <h1 class="text-3xl md:text-4xl font-bold text-slate-800 mb-3">Absensi Tersimpan!</h1>
                <p class="text-slate-500 mb-10">${message}</p>
                <div class="space-y-4">
                     <button id="success-back-to-start-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300 text-lg">Kembali ke Halaman Awal</button>
                     <button id="success-view-data-btn" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-lg w-full transition duration-300">Lihat Semua Riwayat</button>
                </div>
            </div>
        </div>`;
    },
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
                        <p class="block text-sm font-medium text-slate-700 mb-1">Rentang Tanggal</p>
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
                    <span class="text-sm font-medium text-slate-600">Urutkan:</span>
                    <button id="sort-by-total-btn" class="${state.recapSortOrder === 'total' ? 'bg-blue-500 text-white' : 'bg-white text-blue-700 border border-blue-500 hover:bg-blue-50'} font-semibold py-1 px-3 rounded-lg text-sm transition">Total Terbanyak</button>
                    <button id="sort-by-absen-btn" class="${state.recapSortOrder === 'absen' ? 'bg-blue-500 text-white' : 'bg-white text-blue-700 border border-blue-500 hover:bg-blue-50'} font-semibold py-1 px-3 rounded-lg text-sm transition">No. Absen</button>
                </div>
                <div id="recap-container" class="overflow-x-auto"></div>
             </div>
        </div>`,
    connectionFailed: (errorMessage) => `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4 text-center">
            <div class="bg-white p-8 md:p-12 rounded-2xl shadow-lg max-w-lg w-full animate-fade-in">
                <svg class="mx-auto h-16 w-16 text-red-500 mb-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <h1 class="text-3xl font-bold text-slate-800 mb-3">Gagal Terhubung</h1>
                <p class="text-slate-500 mb-6">Aplikasi tidak dapat terhubung ke server. Ini mungkin terjadi jika server atau database sedang dalam proses aktivasi setelah periode tidak aktif.</p>
                <div class="text-xs text-slate-500 bg-slate-100 p-3 rounded-lg mb-8 text-left font-mono">
                    <strong>Detail Error:</strong> ${encodeHTML(errorMessage) || 'Tidak ada detail error.'}
                </div>
                <button id="retry-connection-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300 text-lg">Coba Lagi</button>
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
    manageUserModal: (user, schools, jurisdictions) => {
        const assignedClasses = user.assigned_classes || [];
        const currentUserRole = state.userProfile.primaryRole;
        const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';
        const isTargetSuperAdmin = user.role === 'SUPER_ADMIN';

        let availableRoles = [
            { value: 'GURU', text: 'Guru' },
            { value: 'KEPALA_SEKOLAH', text: 'Kepala Sekolah' },
            { value: 'ADMIN_SEKOLAH', text: 'Admin Sekolah' },
        ];
        if (isSuperAdmin) {
            availableRoles.push({ value: 'DINAS_PENDIDIKAN', text: 'Analis Dinas Pendidikan' });
            availableRoles.push({ value: 'ADMIN_DINAS_PENDIDIKAN', text: 'Manajer Dinas Pendidikan' });
            availableRoles.push({ value: 'SUPER_ADMIN', text: 'Super Admin' });
        }
        
        const renderJurisdictionOptions = (items, prefix = '') => {
            let options = '';
            items.forEach(item => {
                options += `<option value="${item.id}" ${user.jurisdiction_id === item.id ? 'selected' : ''}>${prefix}${encodeHTML(item.name)}</option>`;
                if (item.children && item.children.length > 0) {
                    options += renderJurisdictionOptions(item.children, prefix + '-- ');
                }
            });
            return options;
        };

        return `
        <div id="manage-user-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style="z-index: 10001;">
             <div class="bg-white p-8 rounded-2xl shadow-lg max-w-lg w-full animate-fade-in">
                <h2 class="text-xl font-bold text-slate-800 mb-2">Kelola Pengguna</h2>
                <p class="text-slate-600 mb-6 font-semibold">${encodeHTML(user.name)}</p>
                
                <div class="space-y-4">
                    <div>
                        <label for="role-select-modal" class="block text-sm font-medium text-slate-700 mb-1">Peran Pengguna</label>
                        <select id="role-select-modal" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                           ${availableRoles.map(role => `<option value="${role.value}" ${user.role === role.value ? 'selected' : ''}>${getRoleDisplayName(role.value)}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div id="school-assignment-container" class="hidden">
                        <label for="school-select-modal" class="block text-sm font-medium text-slate-700 mb-1">Tugaskan ke Sekolah</label>
                        <select id="school-select-modal" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${isTargetSuperAdmin ? 'bg-slate-100 cursor-not-allowed' : ''}" ${isTargetSuperAdmin ? 'disabled' : ''}>
                            <option value="">-- Tidak Ditugaskan --</option>
                            ${schools.map(school => `<option value="${school.id}" ${user.school_id === school.id ? 'selected' : ''}>${encodeHTML(school.name)}</option>`).join('')}
                        </select>
                        ${isTargetSuperAdmin ? '<p class="text-xs text-slate-500 mt-1">Super Admin adalah peran global.</p>' : ''}
                    </div>

                    <div id="jurisdiction-assignment-container" class="hidden">
                         <label for="jurisdiction-select-modal" class="block text-sm font-medium text-slate-700 mb-1">Tugaskan ke Yurisdiksi</label>
                         <select id="jurisdiction-select-modal" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            <option value="">-- Tidak Ditugaskan --</option>
                            ${jurisdictions ? renderJurisdictionOptions(jurisdictions) : ''}
                         </select>
                    </div>
                </div>

                <div id="manage-classes-container" class="mt-6 pt-4 border-t border-slate-200 hidden">
                     <p class="block text-sm font-medium text-slate-700 mb-2">Tugaskan Kelas (untuk Guru)</p>
                     <div id="class-checkbox-container" class="grid grid-cols-3 sm:grid-cols-4 gap-4 max-h-48 overflow-y-auto border p-4 rounded-lg">
                        ${CLASSES.map(c => `
                            <label for="class-checkbox-${c}" class="flex items-center space-x-2 text-slate-700 cursor-pointer">
                                <input type="checkbox" id="class-checkbox-${c}" value="${c}" class="class-checkbox h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" ${assignedClasses.includes(c) ? 'checked' : ''}>
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
                <h2 class="text-xl font-bold text-slate-800 mb-4">${encodeHTML(title)}</h2>
                <p class="text-slate-600 mb-6">Pilih salah satu sekolah di bawah ini untuk melanjutkan.</p>
                <div id="school-list-container" class="space-y-2 max-h-60 overflow-y-auto mb-6 border-t border-b py-4">
                    ${schools.length > 0 
                        ? schools.map(school => `<button class="school-select-btn w-full text-left p-3 rounded-lg hover:bg-slate-100 transition" data-school-id="${school.id}" data-school-name="${encodeHTML(school.name)}">${encodeHTML(school.name)}</button>`).join('')
                        : '<p class="text-slate-500 text-center">Belum ada sekolah yang ditambahkan.</p>'
                    }
                </div>
                <div class="flex justify-end">
                    <button id="school-selector-cancel-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition">Batal</button>
                </div>
            </div>
        </div>
    `,
    jurisdictionSelectorModal: (jurisdictions, title) => {
        const renderOptions = (items, prefix = '') => {
            let html = '';
            items.forEach(item => {
                html += `<button class="jurisdiction-select-btn w-full text-left p-3 rounded-lg hover:bg-slate-100 transition" data-jurisdiction-id="${item.id}" data-jurisdiction-name="${encodeHTML(item.name)}">${prefix}${encodeHTML(item.name)}</button>`;
                if (item.children && item.children.length > 0) {
                    html += renderOptions(item.children, prefix + '&nbsp;&nbsp;&nbsp;&nbsp;');
                }
            });
            return html;
        };
        return `
        <div id="jurisdiction-selector-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style="z-index: 10001;">
             <div class="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full animate-fade-in">
                <h2 class="text-xl font-bold text-slate-800 mb-4">${encodeHTML(title)}</h2>
                <p class="text-slate-600 mb-6">Pilih salah satu yurisdiksi di bawah ini untuk melanjutkan.</p>
                <div id="jurisdiction-list-container" class="space-y-1 max-h-60 overflow-y-auto mb-6 border-t border-b py-4">
                    ${jurisdictions.length > 0 
                        ? renderOptions(jurisdictions)
                        : '<p class="text-slate-500 text-center">Belum ada yurisdiksi yang dibuat.</p>'
                    }
                </div>
                <div class="flex justify-end">
                    <button id="jurisdiction-selector-cancel-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition">Batal</button>
                </div>
            </div>
        </div>`;
    },
    jurisdictionPanel: () => `
        <div class="screen active p-4 md:p-8 max-w-7xl mx-auto">
             <div class="bg-white p-6 md:p-8 rounded-2xl shadow-lg">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 pb-4 border-b border-slate-200 gap-4">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Manajemen Yurisdiksi</h1>
                        <p class="text-slate-500">Kelola hierarki wilayah dan penugasan sekolah.</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="add-jurisdiction-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition text-sm">Tambah Yurisdiksi Baru</button>
                        <button id="jurisdiction-panel-back-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div id="jurisdiction-tree-container" class="md:col-span-5 lg:col-span-4 border rounded-lg p-4 bg-slate-50 min-h-[300px]">
                        <p class="text-center text-slate-500 py-8">Memuat struktur yurisdiksi...</p>
                    </div>
                    <div id="jurisdiction-details-container" class="md:col-span-7 lg:col-span-8">
                        <div class="h-full flex items-center justify-center text-center p-4 border-2 border-dashed rounded-lg">
                             <p class="text-slate-500">Pilih yurisdiksi dari daftar di sebelah kiri untuk melihat detail dan mengelola sekolah.</p>
                        </div>
                    </div>
                </div>
             </div>
        </div>
    `,
    manageJurisdictionModal: (jurisdiction = null, jurisdictions = []) => {
        const isEditing = !!jurisdiction;
        const title = isEditing ? 'Ubah Yurisdiksi' : 'Tambah Yurisdiksi Baru';

        const renderOptions = (items, prefix = '', currentParentId = null, selfId = null) => {
            let options = '';
            items.forEach(item => {
                if (item.id === selfId) return; // Prevent self-parenting
                options += `<option value="${item.id}" ${item.id === currentParentId ? 'selected' : ''}>${prefix}${encodeHTML(item.name)}</option>`;
                if (item.children && item.children.length > 0) {
                    options += renderOptions(item.children, prefix + '-- ', currentParentId, selfId);
                }
            });
            return options;
        };

        return `
        <div id="manage-jurisdiction-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style="z-index: 10001;">
             <div class="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full animate-fade-in">
                <h2 class="text-xl font-bold text-slate-800 mb-6">${title}</h2>
                <div class="space-y-4">
                    <div>
                        <label for="jur-name" class="block text-sm font-medium text-slate-700 mb-1">Nama Yurisdiksi</label>
                        <input type="text" id="jur-name" class="w-full p-2 border border-slate-300 rounded-lg" value="${encodeHTML(jurisdiction?.name || '')}">
                    </div>
                    <div>
                        <label for="jur-type" class="block text-sm font-medium text-slate-700 mb-1">Tingkat Yurisdiksi</label>
                        <select id="jur-type" class="w-full p-2 border border-slate-300 rounded-lg bg-white">
                            <option value="">-- Pilih Tingkat --</option>
                            ${['Provinsi', 'Kota', 'Kabupaten', 'Kecamatan', 'Gugus'].map(level => `
                                <option value="${level}" ${jurisdiction?.type === level ? 'selected' : ''}>${level}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div>
                        <label for="jur-parent" class="block text-sm font-medium text-slate-700 mb-1">Induk Yurisdiksi</label>
                        <select id="jur-parent" class="w-full p-2 border border-slate-300 rounded-lg bg-white">
                            <option value="">-- Tidak Ada Induk (Level Atas) --</option>
                            ${renderOptions(jurisdictions, '', jurisdiction?.parent_id, jurisdiction?.id)}
                        </select>
                    </div>
                </div>
                <div class="flex justify-end gap-4 mt-8">
                    <button id="jur-modal-cancel-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition">Batal</button>
                    <button id="jur-modal-save-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition">Simpan</button>
                </div>
            </div>
        </div>`;
    },
    assignSchoolsModal: (jurisdictionName, assigned, unassigned) => `
        <div id="assign-schools-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style="z-index: 10001;">
             <div class="bg-white p-8 rounded-2xl shadow-lg max-w-4xl w-full animate-fade-in max-h-[90vh] flex flex-col">
                <h2 class="text-xl font-bold text-slate-800 mb-2">Kelola Sekolah untuk ${encodeHTML(jurisdictionName)}</h2>
                <p class="text-slate-500 mb-6">Pindahkan sekolah antara daftar yang tersedia dan yang ditugaskan.</p>
                <div class="grid grid-cols-2 gap-6 flex-grow overflow-hidden">
                    <div class="flex flex-col"><h3 class="font-semibold text-slate-700 mb-2">Sekolah Tersedia</h3><div id="unassigned-schools-list" class="border rounded-lg p-2 space-y-1 overflow-y-auto bg-slate-50 flex-grow">${unassigned.map(s => `<div class="p-2 flex items-center justify-between"><span>${encodeHTML(s.name)}</span><button data-school-id="${s.id}" class="assign-school-btn text-blue-500 hover:text-blue-700">&rarr;</button></div>`).join('') || '<p class="p-4 text-center text-slate-400">Tidak ada sekolah tersedia.</p>'}</div></div>
                    <div class="flex flex-col"><h3 class="font-semibold text-slate-700 mb-2">Sekolah Ditugaskan</h3><div id="assigned-schools-list" class="border rounded-lg p-2 space-y-1 overflow-y-auto bg-green-50 flex-grow">${assigned.map(s => `<div class="p-2 flex items-center justify-between"><span>${encodeHTML(s.name)}</span><button data-school-id="${s.id}" class="unassign-school-btn text-red-500 hover:text-red-700">&larr;</button></div>`).join('') || '<p class="p-4 text-center text-slate-400">Belum ada sekolah ditugaskan.</p>'}</div></div>
                </div>
                <div class="flex justify-end mt-8">
                    <button id="assign-schools-close-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition">Tutup</button>
                </div>
            </div>
        </div>
    `,
    migrationTool: () => `
        <div class="screen active p-4 md:p-8 max-w-4xl mx-auto">
             <div class="bg-white p-8 rounded-2xl shadow-lg">
                <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
                    <h1 class="text-2xl font-bold text-slate-800">Alat Migrasi Data Lama</h1>
                    <button id="migration-back-btn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition text-sm">Kembali</button>
                </div>
                <p class="text-slate-600 mb-4">Gunakan alat ini untuk mengimpor data dari sistem lama ke dalam format <code class="text-sm bg-slate-100 p-1 rounded">change_log</code>. Pastikan data JSON yang ditempelkan valid dan sesuai dengan struktur lama.</p>
                <div class="space-y-4">
                    <div>
                        <label for="migration-school-id" class="block text-sm font-medium text-slate-700 mb-1">ID Sekolah Tujuan</label>
                        <input type="number" id="migration-school-id" placeholder="Contoh: 1" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition">
                    </div>
                     <div>
                        <label for="migration-user-email" class="block text-sm font-medium text-slate-700 mb-1">Email Pengguna Asli</label>
                        <input type="email" id="migration-user-email" placeholder="contoh@guru.belajar.id" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition">
                    </div>
                    <div>
                        <label for="migration-legacy-data" class="block text-sm font-medium text-slate-700 mb-1">Data Lama (JSON)</label>
                        <textarea id="migration-legacy-data" rows="10" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition font-mono text-xs" placeholder='Tempelkan konten JSON lama di sini (termasuk "students_by_class" dan "saved_logs")...'></textarea>
                    </div>
                </div>
                 <div class="mt-6 flex flex-col sm:flex-row justify-end items-center gap-4">
                    <p id="migration-result" class="text-sm font-semibold flex-grow text-left"></p>
                    <button id="migrate-data-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition w-full sm:w-auto">Mulai Migrasi</button>
                </div>
            </div>
        </div>
    `,
};
