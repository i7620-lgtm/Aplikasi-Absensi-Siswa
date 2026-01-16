
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
            <!-- Hero Section -->
            <div class="max-w-5xl mx-auto text-center py-16 px-4 sm:px-6 lg:py-24 lg:px-8 animate-fade-in">
                <h2 class="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl text-center">
                    <span class="block text-blue-600 mb-2">Absensi Online Siswa</span>
                    <span class="block">
                        ${state.logoutMessage ? encodeHTML(state.logoutMessage) : 'Manajemen Kehadiran Modern'}
                    </span>
                </h2>
                <p class="mt-4 text-xl leading-8 text-slate-500 max-w-2xl mx-auto">
                    ${state.logoutMessage ? 'Sesi Anda telah berakhir. Silakan masuk kembali.' : 'Sistem absensi cerdas, transparan, dan terintegrasi untuk masa depan pendidikan yang lebih baik.'}
                </p>
                <div class="mt-10 flex flex-col items-center justify-center gap-4">
                    <div id="gsi-button-container" class="min-h-[44px]">
                        <div class="flex items-center justify-center space-x-2 animate-pulse">
                            <div class="w-2 h-2 bg-blue-400 rounded-full"></div>
                            <div class="w-2 h-2 bg-blue-400 rounded-full"></div>
                            <div class="w-2 h-2 bg-blue-400 rounded-full"></div>
                        </div>
                    </div>
                    <a href="#pusat-bantuan" class="text-sm font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1">
                        Pelajari fitur & bantuan <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                    </a>
                </div>
                 <div id="auth-error-container" class="text-center text-sm mt-4 hidden"></div>
            </div>

            <!-- Role Section (Matriks Peran) -->
            <div class="py-16 bg-white">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="text-center mb-12">
                        <h2 class="text-base text-blue-600 font-semibold tracking-wide uppercase">Satu Aplikasi, Semua Pihak</h2>
                        <p class="mt-2 text-3xl font-extrabold text-slate-900">Akses Sesuai Peran Anda</p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:shadow-lg transition">
                            <div class="w-10 h-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-4">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                            </div>
                            <h3 class="text-lg font-bold text-slate-800 mb-3">Guru</h3>
                            <ul class="space-y-2 text-slate-600 text-xs">
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Catat kehadiran kelas harian dengan cepat.</li>
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Kelola daftar siswa per kelas mandiri.</li>
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Pantau riwayat absensi kelas sendiri.</li>
                            </ul>
                        </div>
                        <div class="bg-slate-50 p-6 rounded-2xl border border-blue-100 shadow-sm hover:shadow-lg transition ring-1 ring-blue-500 ring-opacity-10">
                            <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                            </div>
                            <h3 class="text-lg font-bold text-slate-800 mb-3">Kepala Sekolah</h3>
                            <ul class="space-y-2 text-slate-600 text-xs">
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Dasbor analitik visual seluruh sekolah.</li>
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Rekomendasi AI pola absensi kritis.</li>
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Ekspor laporan rekapitulasi ke Excel.</li>
                            </ul>
                        </div>
                        <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:shadow-lg transition">
                            <div class="w-10 h-10 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-4">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                            </div>
                            <h3 class="text-lg font-bold text-slate-800 mb-3">Orang Tua</h3>
                            <ul class="space-y-2 text-slate-600 text-xs">
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Pantau kehadiran anak real-time.</li>
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Lihat riwayat ketidakhadiran (S/I/A).</li>
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Akses aman data spesifik anak sendiri.</li>
                            </ul>
                        </div>
                        <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:shadow-lg transition">
                            <div class="w-10 h-10 bg-cyan-100 text-cyan-600 rounded-lg flex items-center justify-center mb-4">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                            </div>
                            <h3 class="text-lg font-bold text-slate-800 mb-3">Dinas Pendidikan</h3>
                            <ul class="space-y-2 text-slate-600 text-xs">
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-cyan-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Pantau tren absensi regional.</li>
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-cyan-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Agregasi data lintas sekolah.</li>
                                <li class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-cyan-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Laporan gabungan tingkat wilayah.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <!-- How it Works Section -->
            <div class="py-16 bg-slate-50">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="text-center mb-16">
                        <h2 class="text-base text-blue-600 font-semibold tracking-wide uppercase">Panduan</h2>
                        <p class="mt-2 text-3xl font-extrabold text-slate-900">Cara Menggunakan Aplikasi</p>
                    </div>
                    <div class="relative">
                        <div class="absolute top-12 left-1/2 -translate-x-1/2 w-full max-w-4xl h-0.5 bg-blue-100 hidden md:block"></div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
                            <div class="text-center">
                                <div class="w-24 h-24 bg-blue-600 text-white rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6 relative shadow-xl">1</div>
                                <h4 class="text-lg font-bold text-slate-800 mb-2">Masuk dengan Google</h4>
                                <p class="text-slate-500 text-sm">Gunakan akun belajar.id atau email pribadi untuk akses instan dan aman.</p>
                            </div>
                            <div class="text-center">
                                <div class="w-24 h-24 bg-blue-600 text-white rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6 relative shadow-xl">2</div>
                                <h4 class="text-lg font-bold text-slate-800 mb-2">Pilih/Daftar Sekolah</h4>
                                <p class="text-slate-500 text-sm">Cari sekolah Anda yang sudah ada atau daftarkan sekolah baru jika belum terdata.</p>
                            </div>
                            <div class="text-center">
                                <div class="w-24 h-24 bg-blue-600 text-white rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6 relative shadow-xl">3</div>
                                <h4 class="text-lg font-bold text-slate-800 mb-2">Mulai Kelola Absensi</h4>
                                <p class="text-slate-500 text-sm">Pilih kelas, masukkan data siswa, dan catat kehadiran dalam hitungan detik.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- FAQ Section -->
            <div id="pusat-bantuan" class="py-20 bg-white">
                <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="text-center mb-12">
                        <h2 class="text-base text-blue-600 font-semibold tracking-wide uppercase">Bantuan</h2>
                        <p class="mt-2 text-3xl font-extrabold text-slate-900">Pertanyaan Umum (FAQ)</p>
                    </div>
                    <div class="space-y-4">
                        <div class="faq-item border border-slate-200 rounded-xl overflow-hidden">
                            <button class="faq-trigger w-full flex items-center justify-between p-5 text-left bg-slate-50 hover:bg-slate-100 transition">
                                <span class="font-bold text-slate-800">Apakah data absensi saya aman?</span>
                                <svg class="w-5 h-5 text-slate-400 transform transition faq-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                            </button>
                            <div class="faq-content hidden p-5 border-t border-slate-200 text-slate-600 text-sm leading-relaxed">
                                Ya, data Anda disimpan di infrastruktur cloud yang aman. Kami tidak membagikan informasi pribadi atau data absensi sekolah Anda kepada pihak ketiga mana pun. Anda memiliki kontrol penuh atas data yang Anda masukkan.
                            </div>
                        </div>
                        <div class="faq-item border border-slate-200 rounded-xl overflow-hidden">
                            <button class="faq-trigger w-full flex items-center justify-between p-5 text-left bg-slate-50 hover:bg-slate-100 transition">
                                <span class="font-bold text-slate-800">Bagaimana jika sekolah saya belum terdaftar?</span>
                                <svg class="w-5 h-5 text-slate-400 transform transition faq-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                            </button>
                            <div class="faq-content hidden p-5 border-t border-slate-200 text-slate-600 text-sm leading-relaxed">
                                Jangan khawatir! Anda dapat mendaftarkan sekolah baru secara mandiri setelah login. Anda otomatis akan menjadi Admin pertama sekolah tersebut dan bisa mulai mengundang rekan guru lainnya.
                            </div>
                        </div>
                        <div class="faq-item border border-slate-200 rounded-xl overflow-hidden">
                            <button class="faq-trigger w-full flex items-center justify-between p-5 text-left bg-slate-50 hover:bg-slate-100 transition">
                                <span class="font-bold text-slate-800">Dapatkah aplikasi bekerja secara offline?</span>
                                <svg class="w-5 h-5 text-slate-400 transform transition faq-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                            </button>
                            <div class="faq-content hidden p-5 border-t border-slate-200 text-slate-600 text-sm leading-relaxed">
                                Tentu. Aplikasi ini menggunakan teknologi PWA yang memungkinkan pengisian absensi tetap berjalan meskipun koneksi internet terputus. Data akan otomatis tersinkron ke cloud saat Anda kembali online.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Contact Section -->
            <div class="py-16 bg-blue-600 text-white">
                <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h2 class="text-3xl font-extrabold mb-4">Masih Punya Pertanyaan?</h2>
                    <p class="text-blue-100 mb-10 text-lg">Jika Anda memerlukan bantuan khusus atau pertanyaan mengenai kerja sama, tim pengembang kami siap membantu Anda.</p>
                    <div class="flex flex-col sm:flex-row items-center justify-center gap-6">
                        <a id="contact-email-btn" href="mailto:i7620@guru.sd.belajar.id?subject=Tanya%20Aplikasi%20Absensi" class="bg-white text-blue-600 px-8 py-4 rounded-xl font-bold hover:bg-blue-50 transition shadow-lg flex items-center gap-2">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                            Kirim Email Sekarang
                        </a>
                        <div class="text-sm text-blue-200 font-medium">
                            i7620@guru.sd.belajar.id
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Footer -->
            <footer class="bg-slate-900 py-12 text-center text-slate-400">
                <p class="mb-4">© 2025 Aplikasi Absensi Online Siswa</p>
                <div class="flex justify-center gap-6 text-sm font-semibold">
                    <a href="/privacy.html" class="hover:text-white transition">Kebijakan Privasi</a>
                    <a href="/terms.html" class="hover:text-white transition">Ketentuan Layanan</a>
                </div>
            </footer>
        </div>
    `,
    onboarding: () => `
        <div class="screen active min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
            <div class="bg-white p-8 rounded-2xl shadow-lg max-w-lg w-full">
                <div class="flex items-center justify-between mb-2">
                    <h1 class="text-2xl font-bold text-slate-800">Selamat Datang!</h1>
                    <button id="logoutBtn" class="text-slate-500 hover:text-red-500 transition duration-300 p-2 rounded-full -mr-2" title="Logout">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    </button>
                </div>
                <p class="text-slate-500 mb-8">Untuk memulai, silakan pilih status sekolah Anda saat ini.</p>

                <!-- Initial Choice -->
                <div id="onboarding-choice-view" class="space-y-4">
                    <button id="btn-join-school" class="w-full bg-white border-2 border-blue-100 hover:border-blue-500 p-6 rounded-xl flex items-center gap-4 transition group text-left">
                        <div class="bg-blue-100 text-blue-600 p-3 rounded-full group-hover:bg-blue-600 group-hover:text-white transition">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800">Saya Ingin Bergabung ke Sekolah</h3>
                            <p class="text-sm text-slate-500">Cari sekolah yang sudah terdaftar dan minta akses.</p>
                        </div>
                    </button>

                    <button id="btn-create-school" class="w-full bg-white border-2 border-green-100 hover:border-green-500 p-6 rounded-xl flex items-center gap-4 transition group text-left">
                        <div class="bg-green-100 text-green-600 p-3 rounded-full group-hover:bg-green-600 group-hover:text-white transition">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800">Saya Ingin Mendaftarkan Sekolah Baru</h3>
                            <p class="text-sm text-slate-500">Jadilah admin pertama untuk sekolah Anda.</p>
                        </div>
                    </button>
                </div>

                <!-- Search View (Hidden by default) -->
                <div id="onboarding-search-view" class="hidden space-y-4">
                    <button id="back-to-choice-from-search" class="text-sm text-slate-500 hover:text-blue-600 mb-2 flex items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg> Kembali
                    </button>
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Cari Nama Sekolah</label>
                        <div class="relative">
                            <input type="text" id="school-search-input" class="w-full p-3 pl-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Contoh: SD Negeri 1...">
                            <svg class="w-5 h-5 text-slate-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>
                    </div>
                    <div id="school-search-results" class="space-y-2 max-h-60 overflow-y-auto">
                        <!-- Results injected here -->
                    </div>
                    
                    <div id="school-found-msg" class="hidden bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 class="font-bold text-blue-800 mb-1">Sekolah Terdaftar!</h4>
                        <p class="text-sm text-blue-700 mb-3">Sekolah <span id="found-school-name" class="font-bold"></span> sudah ada di sistem.</p>
                        
                        <div class="bg-white p-3 rounded-lg border border-blue-100 mb-3 shadow-sm">
                            <p class="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Admin Sekolah</p>
                            <p id="found-admin-name" class="font-bold text-slate-800"></p>
                            <p id="found-admin-email" class="text-sm text-slate-600 font-mono break-all"></p>
                        </div>

                        <a id="contact-admin-btn" href="#" class="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition shadow-sm flex items-center justify-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                            Kirim Permintaan Akses
                        </a>
                        <p class="text-xs text-blue-600 mt-2 text-center opacity-80">Klik tombol di atas untuk mengirim email ke admin.</p>
                    </div>

                    <div id="school-not-found-msg" class="hidden text-center py-4">
                        <p class="text-slate-500 mb-2">Sekolah tidak ditemukan?</p>
                        <button id="btn-redirect-create" class="text-blue-600 font-bold hover:underline">Daftarkan Sekolah Baru Sekarang</button>
                    </div>
                </div>

                <!-- Create View (Hidden by default) -->
                <div id="onboarding-create-view" class="hidden space-y-4">
                    <button id="back-to-choice-from-create" class="text-sm text-slate-500 hover:text-blue-600 mb-2 flex items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg> Kembali
                    </button>
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                        <p class="text-sm text-green-800">Anda akan terdaftar sebagai <strong>Admin Sekolah</strong> untuk sekolah ini.</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Nama Sekolah Resmi</label>
                        <input type="text" id="new-school-name" class="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500" placeholder="Nama Sekolah Lengkap">
                    </div>
                    <button id="btn-confirm-create" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition shadow-lg">Buat & Masuk</button>
                </div>

            </div>
        </div>
    `,
    setup: () => {
        const isAdmin = ['SUPER_ADMIN', 'ADMIN_SEKOLAH'].includes(state.userProfile?.primaryRole);
        const isTeacher = state.userProfile?.primaryRole === 'GURU';
        const assignedClasses = state.userProfile?.assigned_classes || [];
        const needsAssignment = isTeacher && (!state.userProfile.assigned_classes || state.userProfile.assigned_classes.length === 0);
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
    
    // --- MISSING TEMPLATES ADDED BELOW ---

    confirmation: (message) => `
        <div id="confirmation-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center">
                <div class="mb-4">
                     <svg class="mx-auto h-12 w-12 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h3 class="text-lg font-bold text-gray-800 mb-2">Konfirmasi</h3>
                <p class="text-gray-600 mb-6">${encodeHTML(message)}</p>
                <div class="flex justify-center space-x-4">
                    <button id="confirm-no-btn" class="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Batal</button>
                    <button id="confirm-yes-btn" class="px-4 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 font-medium transition focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-lg shadow-blue-500/30">Ya, Lanjutkan</button>
                </div>
            </div>
        </div>
    `,

    schoolSelectorModal: (schools, title = 'Pilih Sekolah') => `
        <div id="school-selector-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                <div class="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h3 class="text-lg font-bold text-gray-800">${encodeHTML(title)}</h3>
                    <button id="school-selector-cancel-btn" class="text-gray-400 hover:text-gray-600 transition">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div class="max-h-96 overflow-y-auto p-2 space-y-2">
                    ${schools.length === 0 ? '<p class="text-center text-gray-500 py-4">Belum ada sekolah terdaftar.</p>' : ''}
                    ${schools.map(s => `
                        <button class="school-select-btn w-full text-left p-4 hover:bg-blue-50 rounded-lg transition duration-200 border border-transparent hover:border-blue-100 group" data-school-id="${s.id}" data-school-name="${encodeHTML(s.name)}">
                            <div class="flex items-center justify-between">
                                <span class="font-semibold text-gray-700 group-hover:text-blue-700">${encodeHTML(s.name)}</span>
                                <svg class="w-5 h-5 text-gray-300 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                            </div>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>
    `,

    jurisdictionSelectorModal: (tree, title = 'Pilih Yurisdiksi') => {
        const renderTree = (nodes, level = 0) => {
            return nodes.map(node => `
                <div class="ml-${level * 4}">
                    <button class="jurisdiction-select-btn w-full text-left p-3 hover:bg-blue-50 rounded-lg transition duration-200 border border-transparent hover:border-blue-100 mb-1" data-jurisdiction-id="${node.id}" data-jurisdiction-name="${encodeHTML(node.name)}">
                         <span class="font-semibold text-gray-700">${encodeHTML(node.name)} <span class="text-xs text-gray-400 font-normal">(${encodeHTML(node.type)})</span></span>
                    </button>
                    ${node.children && node.children.length > 0 ? `<div class="border-l-2 border-gray-100 ml-3 pl-1">${renderTree(node.children, level + 1)}</div>` : ''}
                </div>
            `).join('');
        };
        
        return `
        <div id="jurisdiction-selector-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                <div class="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h3 class="text-lg font-bold text-gray-800">${encodeHTML(title)}</h3>
                    <button id="jurisdiction-selector-cancel-btn" class="text-gray-400 hover:text-gray-600 transition">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div class="max-h-96 overflow-y-auto p-4">
                    ${tree.length === 0 ? '<p class="text-center text-gray-500 py-4">Belum ada yurisdiksi terdaftar.</p>' : renderTree(tree)}
                </div>
            </div>
        </div>
        `;
    },

    roleSelectorModal: (availableRoles) => `
        <div id="role-selector-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">Pilih Peran Baru</h3>
                <select id="role-select-bulk-modal" class="w-full p-3 border border-gray-300 rounded-lg mb-6 focus:ring-2 focus:ring-blue-500 bg-white">
                    ${availableRoles.map(r => `<option value="${r.value}">${r.text}</option>`).join('')}
                </select>
                <div class="flex justify-end space-x-3">
                    <button id="role-selector-cancel-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">Batal</button>
                    <button id="role-selector-confirm-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-500/30">Simpan</button>
                </div>
            </div>
        </div>
    `,
    
    adminPanel: () => `
        <div class="screen active min-h-screen bg-slate-100 p-4 md:p-8">
            <div class="max-w-6xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden min-h-[600px] flex flex-col">
                 <div class="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50">
                    <div class="flex items-center gap-4">
                        <button id="admin-panel-back-btn" class="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                        </button>
                        <h1 class="text-2xl font-bold text-slate-800">Manajemen Pengguna</h1>
                    </div>
                    ${state.userProfile.primaryRole === 'SUPER_ADMIN' ? `
                    <div class="flex items-center gap-2">
                         <div class="flex items-center mr-4">
                            <input id="group-by-school-toggle" type="checkbox" class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
                            <label for="group-by-school-toggle" class="ml-2 text-sm font-medium text-gray-900">Kelompokkan per Sekolah</label>
                        </div>
                        <button id="add-school-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition text-sm">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                            Tambah Sekolah
                        </button>
                    </div>` : ''}
                </div>
                
                <div id="admin-bulk-actions-container" class="px-6 pt-4"></div>

                <div class="p-6 flex-grow overflow-x-auto">
                    <div id="admin-panel-container" class="min-w-full">
                         <!-- Table will be rendered here -->
                    </div>
                </div>
                
                <div id="admin-pagination-container" class="p-4 border-t border-slate-100 flex justify-center items-center gap-4 bg-slate-50"></div>
            </div>
        </div>
    `,

    bulkActionsBar: (selectedCount) => `
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-4 animate-fade-in">
            <span class="font-semibold text-blue-800 text-sm">${selectedCount} pengguna dipilih</span>
            <div class="flex gap-2">
                ${state.userProfile.primaryRole === 'SUPER_ADMIN' ? `<button id="bulk-assign-school-btn" class="bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded text-sm font-medium transition">Tugaskan Sekolah</button>` : ''}
                <button id="bulk-change-role-btn" class="bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded text-sm font-medium transition">Ubah Peran</button>
            </div>
        </div>
    `,

    manageUserModal: (user, schools, jurisdictions) => {
        const currentUserRole = state.userProfile.primaryRole;
        const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';
        const isDinas = ['ADMIN_DINAS_PENDIDIKAN', 'DINAS_PENDIDIKAN'].includes(currentUserRole);

        let roles = [];
        if (isSuperAdmin) roles = ['GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN', 'SUPER_ADMIN'];
        else if (isDinas) roles = ['GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'];
        else roles = ['GURU', 'KEPALA_SEKOLAH'];

        // Helper to render jurisdiction options recursively
        const renderJurOptions = (nodes, level = 0) => nodes.map(node => `
            <option value="${node.id}" ${user.jurisdiction_id === node.id ? 'selected' : ''}>
                ${'&nbsp;'.repeat(level * 4)}${encodeHTML(node.name)} (${encodeHTML(node.type)})
            </option>
            ${node.children ? renderJurOptions(node.children, level + 1) : ''}
        `).join('');

        return `
        <div id="manage-user-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
                <h3 class="text-xl font-bold text-gray-800 mb-1">Kelola Pengguna</h3>
                <p class="text-gray-500 text-sm mb-6">${encodeHTML(user.email)}</p>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Peran</label>
                        <select id="role-select-modal" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                             ${roles.map(r => `<option value="${r}" ${user.role === r ? 'selected' : ''}>${getRoleDisplayName(r)}</option>`).join('')}
                        </select>
                    </div>

                    <div id="jurisdiction-assignment-container" class="${(['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(user.role)) ? '' : 'hidden'}">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Yurisdiksi</label>
                         <select id="jurisdiction-select-modal" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="">-- Tidak Ada --</option>
                            ${renderJurOptions(jurisdictions)}
                        </select>
                        <p class="text-xs text-gray-500 mt-1">Hanya berlaku untuk peran Dinas Pendidikan.</p>
                    </div>

                    <div id="school-assignment-container" class="${(['GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(user.role)) ? '' : 'hidden'}">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Sekolah</label>
                        <select id="school-select-modal" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white" ${(!isSuperAdmin && user.role !== 'ADMIN_SEKOLAH') ? 'disabled' : ''}>
                            <option value="">-- Tidak Ada --</option>
                            ${schools.map(s => `<option value="${s.id}" ${user.school_id === s.id ? 'selected' : ''}>${encodeHTML(s.name)}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div id="manage-classes-container" class="${user.role === 'GURU' ? '' : 'hidden'}">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Kelas yang Ditugaskan</label>
                        <div class="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-2 border border-gray-200 rounded-lg bg-gray-50">
                            ${CLASSES.map(cls => `
                                <label class="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" value="${cls}" class="class-checkbox rounded text-blue-600 focus:ring-blue-500" ${(user.assigned_classes || []).includes(cls) ? 'checked' : ''}>
                                    <span>${cls}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="flex justify-end space-x-3 mt-8 pt-4 border-t border-gray-100">
                    <button id="manage-user-cancel-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">Batal</button>
                    <button id="manage-user-save-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-500/30">Simpan Perubahan</button>
                </div>
            </div>
        </div>
        `;
    },

    addStudents: (className) => `
        <div class="screen active min-h-screen bg-slate-100 p-4 flex flex-col items-center">
             <div class="bg-white p-8 rounded-xl shadow-lg w-full max-w-3xl">
                <h1 class="text-2xl font-bold text-slate-800 mb-6">Kelola Siswa Kelas ${encodeHTML(className)}</h1>
                
                <div class="mb-8 p-6 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 text-center">
                    <svg class="mx-auto h-12 w-12 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    <p class="text-sm text-slate-500 mb-4">Unggah file Excel/CSV untuk mengisi data otomatis.<br>Format: Kolom A (Nama), Kolom B (Email Orang Tua - Opsional)</p>
                    <div class="flex justify-center gap-4">
                        <button id="download-template-btn" class="text-blue-600 hover:text-blue-800 text-sm font-semibold underline">Unduh Template</button>
                        <input type="file" id="excel-upload" accept=".xlsx, .xls, .csv" class="hidden" />
                        <button id="import-excel-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition text-sm">Impor Excel</button>
                    </div>
                </div>

                <div class="mb-4 flex justify-between items-center">
                    <h2 class="text-lg font-semibold text-slate-700">Daftar Siswa Manual</h2>
                    <button id="add-student-row-btn" class="text-blue-600 hover:text-blue-800 font-semibold text-sm">+ Tambah Baris</button>
                </div>

                <div id="manual-input-container" class="space-y-3 mb-8 max-h-96 overflow-y-auto pr-2">
                    <!-- Rows injected here -->
                </div>

                <div class="flex gap-4 pt-4 border-t border-slate-100">
                    <button id="cancel-add-students-btn" class="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-lg transition">Batal</button>
                    <button id="save-students-btn" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-blue-500/30">Simpan Daftar Siswa</button>
                </div>
             </div>
        </div>
    `,

    attendance: (className, date) => `
        <div class="screen active min-h-screen bg-slate-100 p-4">
            <div class="max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden flex flex-col min-h-[80vh]">
                <div class="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center sticky top-0 z-10">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Absensi Kelas ${encodeHTML(className)}</h1>
                        <p class="text-slate-500 text-sm mt-1">${new Date(date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <button id="back-to-setup-btn" class="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-200 transition">
                         <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                
                <div class="flex-grow overflow-auto">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-white sticky top-0 shadow-sm z-10">
                            <tr>
                                <th class="p-3 w-12 text-sm font-semibold text-slate-500 border-b">No</th>
                                <th class="p-3 text-sm font-semibold text-slate-500 border-b">Nama Siswa</th>
                                <th class="p-3 w-16 text-center text-sm font-semibold text-green-600 border-b">Hadir</th>
                                <th class="p-3 w-16 text-center text-sm font-semibold text-yellow-600 border-b">Sakit</th>
                                <th class="p-3 w-16 text-center text-sm font-semibold text-blue-600 border-b">Izin</th>
                                <th class="p-3 w-16 text-center text-sm font-semibold text-red-600 border-b">Alpa</th>
                            </tr>
                        </thead>
                        <tbody id="attendance-table-body" class="divide-y divide-slate-100">
                            <!-- Rows injected here -->
                        </tbody>
                    </table>
                </div>

                <div class="p-4 border-t border-slate-200 bg-slate-50 sticky bottom-0 z-20">
                    <button id="save-attendance-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg transition shadow-lg shadow-blue-500/30 text-lg">Simpan Absensi</button>
                </div>
            </div>
        </div>
    `,

    success: () => `
        <div class="screen active min-h-screen flex items-center justify-center bg-slate-100 p-4">
            <div class="bg-white p-10 rounded-2xl shadow-xl text-center max-w-md w-full animate-fade-in relative overflow-hidden">
                <div class="checkmark-wrapper mb-6">
                    <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
                        <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                    </svg>
                </div>
                <h2 class="text-3xl font-bold text-slate-800 mb-2">Berhasil Disimpan!</h2>
                <p class="text-slate-500 mb-8">Data absensi telah berhasil dicatat ke dalam sistem.</p>
                 ${state.lastSaveContext ? `
                <div class="bg-slate-50 rounded-lg p-4 mb-8 text-sm text-left border border-slate-100">
                    <p class="mb-1"><span class="font-semibold text-slate-700">Penyimpan:</span> ${encodeHTML(state.lastSaveContext.savedBy)}</p>
                    <p><span class="font-semibold text-slate-700">Kelas:</span> ${encodeHTML(state.lastSaveContext.className)}</p>
                </div>
                ` : ''}
                <div class="space-y-3">
                    <button id="success-back-to-start-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-blue-500/30">Kembali ke Menu Utama</button>
                    <button id="success-view-data-btn" class="w-full bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-3 rounded-lg transition">Lihat Riwayat Data</button>
                </div>
            </div>
        </div>
    `,

    data: () => `
        <div class="screen active min-h-screen bg-slate-100 p-4">
            <div class="max-w-3xl mx-auto bg-white rounded-xl shadow-lg min-h-[80vh] flex flex-col">
                <div class="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <div>
                         <h1 id="data-title" class="text-2xl font-bold text-slate-800">Riwayat Absensi</h1>
                    </div>
                    <button id="data-back-to-start-btn" class="text-slate-500 hover:text-blue-500 p-2 rounded-full hover:bg-slate-200 transition">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                    </button>
                </div>
                
                <div class="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input type="text" id="filter-student-name" placeholder="Cari Nama Siswa..." class="p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <select id="filter-status" class="p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="all">Semua Status</option>
                        <option value="S">Sakit</option>
                        <option value="I">Izin</option>
                        <option value="A">Alpa</option>
                    </select>
                    <input type="date" id="filter-start-date" class="p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <input type="date" id="filter-end-date" class="p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <button id="clear-filters-btn" class="sm:col-span-2 lg:col-span-4 text-xs text-blue-600 hover:underline text-right">Reset Filter</button>
                </div>

                <div id="data-container" class="p-6 flex-grow overflow-y-auto">
                    <!-- History logs injected here -->
                </div>
            </div>
        </div>
    `,

    recap: () => `
        <div class="screen active min-h-screen bg-slate-100 p-4">
            <div class="max-w-5xl mx-auto bg-white rounded-xl shadow-lg min-h-[80vh] flex flex-col">
                <div class="p-6 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
                    <h1 class="text-2xl font-bold text-slate-800">Rekapitulasi Absensi</h1>
                    <div class="flex gap-2">
                        <div class="flex bg-white rounded-lg border border-slate-300 overflow-hidden">
                            <button id="sort-by-total-btn" class="px-3 py-2 text-sm font-medium ${state.recapSortOrder === 'total' ? 'bg-blue-100 text-blue-800' : 'text-slate-600 hover:bg-slate-50'} border-r border-slate-200">Urut Total Absen</button>
                            <button id="sort-by-absen-btn" class="px-3 py-2 text-sm font-medium ${state.recapSortOrder === 'absen' ? 'bg-blue-100 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}">Urut Nomor Absen</button>
                        </div>
                        <button id="recap-back-to-start-btn" class="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>
                
                <div class="flex-grow overflow-auto p-4">
                    <div id="recap-container" class="min-w-full">
                         <!-- Table injected here -->
                    </div>
                </div>
            </div>
        </div>
    `,

    jurisdictionPanel: () => `
        <div class="screen active min-h-screen bg-slate-100 p-4 md:p-8">
            <div class="max-w-6xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden min-h-[600px] flex flex-col">
                <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div class="flex items-center gap-4">
                        <button id="jurisdiction-panel-back-btn" class="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                        </button>
                        <h1 class="text-2xl font-bold text-slate-800">Manajemen Yurisdiksi</h1>
                    </div>
                    <button id="add-jurisdiction-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition text-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        Tambah Yurisdiksi
                    </button>
                </div>
                <div class="flex flex-col md:flex-row h-full flex-grow">
                    <div class="w-full md:w-1/3 border-r border-slate-100 p-4 overflow-y-auto bg-slate-50">
                        <h3 class="font-bold text-slate-600 mb-4 uppercase text-xs tracking-wider">Struktur Wilayah</h3>
                        <div id="jurisdiction-tree-container" class="space-y-1"></div>
                    </div>
                    <div class="w-full md:w-2/3 p-6 bg-white">
                        <div id="jurisdiction-details-container" class="h-full">
                            <div class="h-full flex items-center justify-center text-center p-4 border-2 border-dashed rounded-lg">
                                <p class="text-slate-500">Pilih yurisdiksi dari daftar untuk melihat detail.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,

    manageJurisdictionModal: (jurisdiction, allJurisdictions) => {
        // Flatten options or use tree rendering logic as needed. For simplicity, plain list with indentation.
        const renderOptions = (nodes, level = 0) => nodes.map(node => `
            <option value="${node.id}" ${jurisdiction && jurisdiction.parent_id === node.id ? 'selected' : ''} ${jurisdiction && jurisdiction.id === node.id ? 'disabled' : ''}>
                ${'&nbsp;'.repeat(level * 4)}${encodeHTML(node.name)}
            </option>
            ${node.children ? renderOptions(node.children, level + 1) : ''}
        `).join('');

        return `
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-6">${jurisdiction ? 'Edit Yurisdiksi' : 'Tambah Yurisdiksi Baru'}</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Nama Wilayah</label>
                        <input type="text" id="jur-name" value="${jurisdiction ? encodeHTML(jurisdiction.name) : ''}" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Tingkat</label>
                        <select id="jur-type" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="PROVINSI" ${jurisdiction && jurisdiction.type === 'PROVINSI' ? 'selected' : ''}>Provinsi</option>
                            <option value="KABUPATEN" ${jurisdiction && jurisdiction.type === 'KABUPATEN' ? 'selected' : ''}>Kabupaten/Kota</option>
                            <option value="KECAMATAN" ${jurisdiction && jurisdiction.type === 'KECAMATAN' ? 'selected' : ''}>Kecamatan</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Induk Wilayah</label>
                        <select id="jur-parent" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="">-- Paling Atas --</option>
                            ${renderOptions(allJurisdictions)}
                        </select>
                    </div>
                </div>
                <div class="flex justify-end space-x-3 mt-8">
                    <button id="jur-modal-cancel-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">Batal</button>
                    <button id="jur-modal-save-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Simpan</button>
                </div>
            </div>
        </div>
        `;
    },
    
    assignSchoolsModal: (jurName, assigned, unassigned) => `
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 flex flex-col h-[80vh]">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-gray-800">Kelola Sekolah di ${encodeHTML(jurName)}</h3>
                    <button id="assign-schools-close-btn" class="text-gray-400 hover:text-gray-600"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </div>
                <div class="flex flex-1 gap-4 overflow-hidden">
                    <div class="w-1/2 flex flex-col">
                        <h4 class="font-semibold text-green-700 mb-2">Terdaftar (${assigned.length})</h4>
                        <div class="flex-1 overflow-y-auto border rounded-lg p-2 bg-green-50 space-y-1">
                            ${assigned.map(s => `<div class="flex justify-between items-center bg-white p-2 rounded shadow-sm border border-green-100"><span class="text-sm">${encodeHTML(s.name)}</span><button class="unassign-school-btn text-red-500 hover:bg-red-50 p-1 rounded" data-school-id="${s.id}">&times;</button></div>`).join('')}
                        </div>
                    </div>
                    <div class="w-1/2 flex flex-col">
                        <h4 class="font-semibold text-slate-700 mb-2">Tersedia (${unassigned.length})</h4>
                        <div class="flex-1 overflow-y-auto border rounded-lg p-2 bg-slate-50 space-y-1">
                             ${unassigned.map(s => `<div class="flex justify-between items-center bg-white p-2 rounded shadow-sm border border-slate-200"><span class="text-sm text-slate-600">${encodeHTML(s.name)}</span><button class="assign-school-btn text-green-600 hover:bg-green-50 p-1 rounded font-bold" data-school-id="${s.id}">+</button></div>`).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,

    dashboard: () => `
        <div class="screen active min-h-screen bg-slate-100 p-4">
            <div class="max-w-6xl mx-auto space-y-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Dasbor Analitik</h1>
                        <p id="dashboard-header-date" class="text-slate-500 text-sm mt-1">Memuat...</p>
                    </div>
                    <div class="flex flex-col items-end gap-2 mt-4 md:mt-0">
                        <div class="relative">
                            <button id="date-picker-trigger" class="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg transition border border-slate-200">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <span id="date-picker-display">Pilih Tanggal</span>
                            </button>
                            <!-- Custom Date Picker Popover -->
                            <div id="date-picker-popover" class="hidden absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-100 p-4 z-50">
                                <!-- Calendar rendered by JS -->
                            </div>
                        </div>
                        <div class="flex gap-2">
                             <button id="dashboard-back-btn" data-target="multiRoleHome" class="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">Kembali</button>
                             <button id="logoutBtn-ks" class="bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2 px-4 rounded-lg transition">Logout</button>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <!-- Navigation Cards -->
                    <div id="db-view-report" class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition group">
                        <div class="flex items-center gap-4">
                            <div class="p-3 bg-blue-100 text-blue-600 rounded-full group-hover:bg-blue-600 group-hover:text-white transition">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-800 text-lg">Laporan Harian</h3>
                                <p class="text-sm text-slate-500">Rekap status absensi hari ini.</p>
                            </div>
                        </div>
                    </div>
                    <div id="db-view-percentage" class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition group">
                         <div class="flex items-center gap-4">
                            <div class="p-3 bg-cyan-100 text-cyan-600 rounded-full group-hover:bg-cyan-600 group-hover:text-white transition">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-800 text-lg">Persentase & Tren</h3>
                                <p class="text-sm text-slate-500">Visualisasi data statistik.</p>
                            </div>
                        </div>
                    </div>
                    <div id="db-view-ai" class="bg-white p-6 rounded-2xl shadow-lg border border-slate-200 cursor-pointer hover:shadow-md transition group">
                         <div class="flex items-center gap-4">
                            <div class="p-3 bg-purple-100 text-purple-600 rounded-full group-hover:bg-purple-600 group-hover:text-white transition">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-800 text-lg">Analisis AI</h3>
                                <p class="text-sm text-slate-500">Rekomendasi cerdas otomatis.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-2xl shadow-lg min-h-[400px]">
                    <div id="dashboard-content-report" class="${state.dashboard.activeView === 'report' ? '' : 'hidden'}">
                        <!-- Report Content Injected Here -->
                    </div>
                    <div id="dashboard-content-percentage" class="${state.dashboard.activeView === 'percentage' ? '' : 'hidden'}">
                        <!-- Charts Injected Here -->
                    </div>
                    <div id="dashboard-content-ai" class="${state.dashboard.activeView === 'ai' ? '' : 'hidden'}">
                         <!-- AI Content Injected Here -->
                    </div>
                </div>
            </div>
        </div>
    `,
    
    parentDashboard: () => `
        <div class="screen active min-h-screen bg-slate-100 p-4">
             <div class="max-w-4xl mx-auto bg-white rounded-xl shadow-lg flex flex-col min-h-[80vh]">
                <div class="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h1 class="text-2xl font-bold text-slate-800">Dasbor Orang Tua</h1>
                    <button id="parent-dashboard-back-btn" class="text-slate-500 hover:text-blue-500 p-2 rounded-full hover:bg-slate-200 transition">
                         <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div id="parent-content-container" class="p-6 flex-grow overflow-y-auto">
                    ${state.parentDashboard.isLoading 
                        ? `<div class="text-center text-slate-500 py-10"><div class="loader mx-auto mb-4"></div><p>Memuat data anak Anda...</p></div>` 
                        : (state.parentDashboard.data && state.parentDashboard.data.length > 0)
                            ? `<div class="space-y-8">
                                ${state.parentDashboard.data.map(child => `
                                    <div class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                                        <div class="bg-blue-50 p-4 border-b border-blue-100">
                                            <h3 class="font-bold text-lg text-blue-900">${encodeHTML(child.student_name)}</h3>
                                            <p class="text-sm text-blue-700">${encodeHTML(child.school_name)} - Kelas ${encodeHTML(child.class_name)}</p>
                                        </div>
                                        <div class="p-4">
                                            <h4 class="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Riwayat Ketidakhadiran</h4>
                                            ${child.attendance_history.length === 0 
                                                ? `<p class="text-sm text-green-600 bg-green-50 p-3 rounded-lg border border-green-100 flex items-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Tidak ada catatan absen (Sakit/Izin/Alpa). Bagus!</p>`
                                                : `<ul class="space-y-2">
                                                    ${child.attendance_history.map(log => `
                                                        <li class="flex items-center justify-between bg-white p-3 rounded border border-slate-100 shadow-sm">
                                                            <span class="text-slate-700 text-sm font-medium">${new Date(log.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                                            <span class="px-3 py-1 rounded-full text-xs font-bold ${log.status === 'S' ? 'bg-yellow-100 text-yellow-800' : log.status === 'I' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}">
                                                                ${log.status === 'S' ? 'Sakit' : log.status === 'I' ? 'Izin' : 'Alpa'}
                                                            </span>
                                                        </li>
                                                    `).join('')}
                                                   </ul>`
                                            }
                                        </div>
                                    </div>
                                `).join('')}
                               </div>`
                            : `<div class="text-center py-10 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                                 <svg class="mx-auto h-12 w-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21v-1.5a2.5 2.5 0 00-5 0V21M3 21v-1.5a2.5 2.5 0 015 0V21"></path></svg>
                                 <h3 class="text-lg font-medium text-slate-900">Data Tidak Ditemukan</h3>
                                 <p class="text-slate-500 max-w-sm mx-auto mt-2">Belum ada data siswa yang tertaut dengan email ini. Pastikan sekolah telah mendaftarkan email Anda dengan benar pada data siswa.</p>
                               </div>`
                    }
                </div>
             </div>
        </div>
    `,

    migrationTool: () => `
        <div class="screen active min-h-screen bg-slate-100 p-4">
            <div class="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-6">
                <div class="flex items-center gap-4 mb-6 border-b pb-4">
                     <button id="migration-back-btn" class="p-2 rounded-full hover:bg-slate-100 text-slate-500">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    </button>
                    <h1 class="text-2xl font-bold text-slate-800">Migrasi Data Lama</h1>
                </div>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">ID Sekolah Target</label>
                        <input type="number" id="migration-school-id" class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500" placeholder="Contoh: 1">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Email Pengguna (Pemilik Data)</label>
                        <input type="email" id="migration-user-email" class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500" placeholder="guru@sekolah.id">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Data JSON Lama</label>
                        <textarea id="migration-legacy-data" rows="10" class="w-full p-2 border rounded font-mono text-xs focus:ring-2 focus:ring-blue-500" placeholder='Paste full JSON here...'></textarea>
                        <p class="text-xs text-slate-500 mt-1">Format yang didukung: Objek dengan "students_by_class" dan "saved_logs", atau array log.</p>
                    </div>
                    
                    <button id="migrate-data-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition shadow-lg">Mulai Migrasi</button>
                </div>
                
                <div class="mt-6 p-4 bg-slate-50 rounded border border-slate-200">
                    <h3 class="font-bold text-sm text-slate-700 mb-2">Log Hasil:</h3>
                    <pre id="migration-result" class="text-xs text-slate-600 whitespace-pre-wrap"></pre>
                </div>
            </div>
        </div>
    `
};
