




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
    landingPage: () => `
        <div class="screen active">
            <div class="max-w-5xl mx-auto text-center py-12 px-4 sm:px-6 lg:py-16 lg:px-8">
                <h2 class="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                    <span class="block">
                        ${state.logoutMessage ? encodeHTML(state.logoutMessage) : 'Manajemen Kehadiran Jadi Lebih Mudah'}
                    </span>
                </h2>
                <p class="mt-4 text-lg leading-6 text-slate-500 max-w-2xl mx-auto">
                    ${state.logoutMessage ? 'Anda telah keluar dari sesi. Silakan masuk kembali untuk melanjutkan.' : 'Aplikasi absensi modern yang dirancang untuk efisiensi, transparansi, dan analisis cerdas bagi sekolah Anda.'}
                </p>
                <div class="mt-8 flex justify-center px-4">
                    <div id="gsi-button-container" class="min-h-[44px]">
                        <!-- Placeholder Spinner while Google Script loads -->
                        <div class="flex items-center justify-center space-x-2 animate-pulse">
                            <div class="w-2 h-2 bg-blue-400 rounded-full"></div>
                            <div class="w-2 h-2 bg-blue-400 rounded-full"></div>
                            <div class="w-2 h-2 bg-blue-400 rounded-full"></div>
                        </div>
                    </div>
                </div>
                 <div id="auth-error-container" class="text-center text-sm mt-4 hidden"></div>
            </div>
            
            <div class="mt-10 pb-12 bg-white">
                <div class="relative">
                    <div class="absolute inset-0 h-1/2 bg-slate-100"></div>
                    <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div class="max-w-4xl mx-auto">
                            <dl class="rounded-lg bg-white shadow-lg sm:grid sm:grid-cols-3">
                                <div class="flex flex-col border-b border-slate-100 p-6 text-center sm:border-0 sm:border-r">
                                    <dt class="order-2 mt-2 text-lg leading-6 font-medium text-slate-500">Efisien</dt>
                                    <dd class="order-1 text-4xl font-extrabold text-blue-600">Cepat</dd>
                                </div>
                                <div class="flex flex-col border-t border-b border-slate-100 p-6 text-center sm:border-0 sm:border-l sm:border-r">
                                    <dt class="order-2 mt-2 text-lg leading-6 font-medium text-slate-500">Informatif</dt>
                                    <dd class="order-1 text-4xl font-extrabold text-blue-600">Akurat</dd>
                                </div>
                                <div class="flex flex-col border-t border-slate-100 p-6 text-center sm:border-0 sm:border-l">
                                    <dt class="order-2 mt-2 text-lg leading-6 font-medium text-slate-500">Modern</dt>
                                    <dd class="order-1 text-4xl font-extrabold text-blue-600">Cerdas</dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>

            <div class="py-12 bg-slate-50">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="lg:text-center">
                        <h2 class="text-base text-blue-600 font-semibold tracking-wide uppercase">Fitur Unggulan</h2>
                        <p class="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                            Semua yang Anda Butuhkan untuk Manajemen Kehadiran
                        </p>
                    </div>

                    <div class="mt-10">
                        <dl class="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
                            <div class="relative">
                                <dt>
                                    <div class="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                    </div>
                                    <p class="ml-16 text-lg leading-6 font-medium text-gray-900">Pencatatan Cepat & Mudah</p>
                                </dt>
                                <dd class="mt-2 ml-16 text-base text-gray-500">
                                    Catat kehadiran (Hadir, Sakit, Izin, Alpa) hanya dengan beberapa klik. Antarmuka intuitif mempercepat pekerjaan guru.
                                </dd>
                            </div>
                            <div class="relative">
                                <dt>
                                    <div class="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" /></svg>
                                    </div>
                                    <p class="ml-16 text-lg leading-6 font-medium text-gray-900">Dasbor Analitik Visual</p>
                                </dt>
                                <dd class="mt-2 ml-16 text-base text-gray-500">
                                    Pantau tren kehadiran sekolah atau regional secara real-time. Dapatkan wawasan mendalam dari data visual yang mudah dipahami.
                                </dd>
                            </div>
                            <div class="relative">
                                <dt>
                                    <div class="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                                       <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                    </div>
                                    <p class="ml-16 text-lg leading-6 font-medium text-gray-900">Rekomendasi Cerdas AI</p>
                                </dt>
                                <dd class="mt-2 ml-16 text-base text-gray-500">
                                    Manfaatkan kekuatan AI untuk mengidentifikasi pola absensi siswa yang memerlukan perhatian khusus dan dapatkan rekomendasi tindak lanjut.
                                </dd>
                            </div>
                            <div class="relative">
                                <dt>
                                    <div class="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21v-1.5a2.5 2.5 0 00-5 0V21M3 21v-1.5a2.5 2.5 0 015 0V21" /></svg>
                                    </div>
                                    <p class="ml-16 text-lg leading-6 font-medium text-gray-900">Sistem Multi-Peran</p>
                                </dt>
                                <dd class="mt-2 ml-16 text-base text-gray-500">
                                    Akses disesuaikan untuk Guru, Kepala Sekolah, Admin, hingga Orang Tua, memastikan setiap pihak mendapatkan informasi yang relevan.
                                </dd>
                            </div>
                             <div class="relative">
                                <dt>
                                    <div class="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </div>
                                    <p class="ml-16 text-lg leading-6 font-medium text-gray-900">Bekerja Secara Offline</p>
                                </dt>
                                <dd class="mt-2 ml-16 text-base text-gray-500">
                                    Tetap produktif bahkan tanpa koneksi internet. Data akan disimpan secara lokal dan disinkronkan otomatis saat kembali online.
                                </dd>
                            </div>
                             <div class="relative">
                                <dt>
                                    <div class="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    </div>
                                    <p class="ml-16 text-lg leading-6 font-medium text-gray-900">Laporan & Ekspor Data</p>
                                </dt>
                                <dd class="mt-2 ml-16 text-base text-gray-500">
                                    Unduh rekapitulasi absensi dalam format Excel untuk keperluan arsip, pelaporan, atau analisis lebih lanjut.
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </div>
        </div>
    `,
    setup: () => {
        const isAdmin = ['SUPER_ADMIN', 'ADMIN_SEKOLAH'].includes(state.userProfile?.primaryRole);
        const isTeacher = state.userProfile?.primaryRole === 'GURU';
        const assignedClasses = state.userProfile?.assigned_classes || [];
        const needsAssignment = isTeacher && assignedClasses.length === 0;
        const isSuperAdminInContext = state.userProfile?.primaryRole === 'SUPER_ADMIN' && state.adminActingAsSchool;
        const title = isSuperAdminInContext 
            ? `Absensi Sekolah`
            : "Absensi Online Siswa";
        
        // The setup screen is now only for logged-in users.
        // The login prompt is moved to the landing page.
        if (!state.userProfile) {
            return ``; // Should navigate to landing page instead.
        }

        // --- NEW: Generate Dropdown Options Logic ---
        let optionsHtml = '';
        
        if (isAdmin) {
            // Get active class keys from studentsByClass and sort alphanumerically
            const activeClassKeys = Object.keys(state.studentsByClass || {}).sort((a, b) => {
                return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
            });
            
            // Filter CLASSES to exclude active ones, creating the "Inactive" list
            const inactiveClasses = CLASSES.filter(c => !activeClassKeys.includes(c));

            if (activeClassKeys.length > 0) {
                // Group 1: Active Classes (Prioritized)
                optionsHtml += `<optgroup label="Kelas Aktif di Sekolah (Ada Data)">`;
                activeClassKeys.forEach(c => {
                    optionsHtml += `<option value="${c}" ${c === state.selectedClass ? 'selected' : ''}>${c}</option>`;
                });
                optionsHtml += `</optgroup>`;
                
                // Group 2: All other classes (for creating new ones)
                optionsHtml += `<optgroup label="Buat Kelas Baru (Pilih dari daftar)">`;
                inactiveClasses.forEach(c => {
                    optionsHtml += `<option value="${c}" ${c === state.selectedClass ? 'selected' : ''}>${c}</option>`;
                });
                optionsHtml += `</optgroup>`;
            } else {
                // Fallback for brand new schools with no data yet
                optionsHtml += `<option disabled>Belum ada data kelas aktif</option>`;
                optionsHtml += `<optgroup label="Silakan pilih kelas untuk memulai">`;
                CLASSES.forEach(c => {
                    optionsHtml += `<option value="${c}" ${c === state.selectedClass ? 'selected' : ''}>${c}</option>`;
                });
                optionsHtml += `</optgroup>`;
            }
        } else {
            // Teacher Logic (unchanged, strictly assigned classes)
            if (assignedClasses.length > 0) {
                 assignedClasses.forEach(c => {
                    optionsHtml += `<option value="${c}" ${c === state.selectedClass ? 'selected' : ''}>${c}</option>`;
                });
            } else {
                 optionsHtml = `<option>Tidak ada kelas ditugaskan</option>`;
            }
        }
        // --- END Logic ---

        return `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4">
            <div class="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full">
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
                ${
                    (('Notification' in window) && Notification.permission === 'default' && !localStorage.getItem('notificationBannerDismissed'))
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
                    <h2 class="text-lg font-semibold text-slate-700 mb-4 pt-4 border-t border-slate-200">Pilih Kelas & Tanggal</h2>
                    <div class="space-y-4">
                        <div>
                            <label for="class-select" class="block text-sm font-medium text-slate-700 mb-1">Pilih Kelas</label>
                            <select id="class-select" class="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" ${(!isAdmin && assignedClasses.length === 0) ? 'disabled' : ''}>
                                ${optionsHtml}
                            </select>
                        </div>
                        <div>
                            <label for="date-input" class="block text-sm font-medium text-slate-700 mb-1">Tanggal</label>
                            <input type="date" id="date-input" value="${state.selectedDate}" class="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"/>
                        </div>
                    </div>
                    <div class="mt-6 space-y-3">
                         <button id="startBtn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${needsAssignment ? 'disabled' : ''}>Mulai Absensi</button>
                         <button id="historyBtn" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${needsAssignment ? 'disabled' : ''}>Lihat Riwayat Kelas Ini</button>
                         <button id="recapBtn" class="bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${needsAssignment ? 'disabled' : ''}>Rekap Absensi Siswa</button>
                         <button id="manageStudentsBtn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${needsAssignment ? 'disabled' : ''}>Tambah/Kurangi Data Siswa</button>
                         <button id="downloadDataBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg w-full transition duration-300" ${needsAssignment ? 'disabled' : ''}>Unduh Rekap Kelas (Excel)</button>
                    </div>
                `}
                <p id="setup-status" class="text-center text-sm text-slate-500 mt-4 h-5">Data disimpan secara otomatis di cloud.</p>
            </div>
        </div>`;
    },
    multiRoleHome: () => {
        if (!state.userProfile) return ``; // Should not happen, but a safeguard.
        const { name, email, picture, primaryRole, isParent, jurisdiction_name } = state.userProfile;
        
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
        const isDinas = ['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(primaryRole);
        const reportCardRoles = ['KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN', 'SUPER_ADMIN'];

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

                    <!-- Dashboard Actions for Non-Super Admins -->
                     ${['KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(primaryRole) ? `
                    <button id="view-dashboard-btn" class="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg><div><p class="font-bold">Lihat Dasbor Analitik</p><p class="text-sm font-normal opacity-90">Analisis data kehadiran, persentase, dan dapatkan rekomendasi AI.</p></div></button>
                    ` : ''}

                    <!-- Dashboard Actions for Super Admin -->
                    ${primaryRole === 'SUPER_ADMIN' ? `
                    <button id="view-school-dashboard-btn" class="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg><div><p class="font-bold">Dasbor Analitik Sekolah</p><p class="text-sm font-normal opacity-90">Analisis data kehadiran mendalam per sekolah.</p></div></button>
                    <button id="view-jurisdiction-dashboard-btn" class="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg><div><p class="font-bold">Dasbor Analitik Regional</p><p class="text-sm font-normal opacity-90">Analisis data agregat untuk seluruh wilayah.</p></div></button>
                    ` : ''}

                    <!-- Parent Action -->
                    ${isParent ? `
                    <button id="view-parent-dashboard-btn" class="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg><div><p class="font-bold">Dasbor Orang Tua</p><p class="text-sm font-normal opacity-90">Lihat riwayat kehadiran anak Anda.</p></div></button>
                    ` : ''}
                    
                    <!-- NEW REPORTING CARD -->
                    ${reportCardRoles.includes(primaryRole) && primaryRole !== 'SUPER_ADMIN' ? `
                    <button id="download-scoped-report-btn" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left">
                        <svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <div>
                            <p class="font-bold">${isDinas ? 'Unduh Laporan Regional' : 'Unduh Laporan Sekolah'}</p>
                            <p class="text-sm font-normal opacity-90">
                                ${isDinas 
                                    ? `Unduh rekap Excel untuk semua sekolah di ${encodeHTML(jurisdiction_name) || 'yurisdiksi Anda'}.`
                                    : 'Unduh rekapitulasi absensi lengkap untuk sekolah Anda.'
                                }
                            </p>
                        </div>
                    </button>
                    ` : ''}
                    
                    ${primaryRole === 'SUPER_ADMIN' ? `
                    <button id="download-school-report-btn" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left">
                        <svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <div><p class="font-bold">Unduh Laporan Sekolah Spesifik</p><p class="text-sm font-normal opacity-90">Pilih satu sekolah untuk mengunduh rekap Excel lengkap.</p></div>
                    </button>
                     <button id="download-jurisdiction-report-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left">
                        <svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <div><p class="font-bold">Unduh Laporan Regional</p><p class="text-sm font-normal opacity-90">Pilih yurisdiksi untuk mengunduh rekap gabungan.</p></div>
                    </button>
                    ` : ''}
                    
                    <!-- Admin Panels -->
                    ${['SUPER_ADMIN', 'ADMIN_DINAS_PENDIDIKAN'].includes(primaryRole) ? `
                    <button id="view-admin-panel-btn" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.282-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.124-1.282.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg><div><p class="font-bold">Panel Manajemen Pengguna</p><p class="text-sm font-normal opacity-90">Kelola pengguna dan penetapan peran.</p></div></button>
                    ` : ''}

                    ${primaryRole === 'SUPER_ADMIN' ? `
                    <button id="view-jurisdiction-panel-btn" class="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg><div><p class="font-bold">Panel Manajemen Yurisdiksi</p><p class="text-sm font-normal opacity-90">Kelola hierarki wilayah dan sekolah.</p></div></button>
                    <button id="go-to-migration-tool-btn" class="w-full bg-gray-700 hover:bg-gray-800 text-white font-bold py-4 px-6 rounded-lg transition flex items-center gap-4 text-left"><svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10m16-10v10M4 17h16M4 7h16M9 4v3m6-3v3m-3 14v-3"></path></svg><div><p class="font-bold">Alat Migrasi Data Lama</p><p class="text-sm font-normal opacity-90">Unggah data dari sistem lama ke format baru.</p></div></button>
                    ` : ''}

                </div>
            </div>
        </div>
        `;
    },
};
