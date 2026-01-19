

import { state, setState, navigateTo, handleStartAttendance, handleManageStudents, handleViewHistory, handleDownloadData, handleSaveNewStudents, handleExcelImport, handleDownloadTemplate, handleSaveAttendance, handleGenerateAiRecommendation, handleCreateSchool, handleViewRecap, handleDownloadFullSchoolReport, handleMigrateLegacyData, handleDownloadJurisdictionReport, handleManageHoliday, handleSaveSchoolSettings, handleMarkClassAsHoliday, handleSelectSchoolForConfig } from './main.js';
import { apiService } from './api.js';
import { templates, getRoleDisplayName, encodeHTML } from './templates.js';
import { handleSignOut, renderSignInButton } from './auth.js';

const appContainer = document.getElementById('app-container');
const notificationEl = document.getElementById('notification');
const offlineIndicator = document.getElementById('offline-indicator');

// --- POLLING & PAGINATION CONFIGURATION ---
const POLLING_BACKOFF_SEQUENCE = [10000, 20000, 40000, 80000, 150000, 300000];
const INITIAL_POLLING_INTERVAL = POLLING_BACKOFF_SEQUENCE[0]; 
const USERS_PER_PAGE = 10;

function getNextInterval(currentInterval) {
    const currentIndex = POLLING_BACKOFF_SEQUENCE.indexOf(currentInterval);
    if (currentIndex === -1 || currentIndex >= POLLING_BACKOFF_SEQUENCE.length - 1) {
        return POLLING_BACKOFF_SEQUENCE[POLLING_BACKOFF_SEQUENCE.length - 1];
    }
    return POLLING_BACKOFF_SEQUENCE[currentIndex + 1];
}

export function showLoader(message) {
    const loaderWrapper = document.getElementById('loader-wrapper');
    if (loaderWrapper) {
        const textEl = loaderWrapper.querySelector('.loader-text');
        if (textEl) textEl.textContent = message;
        loaderWrapper.style.display = 'flex';
        setTimeout(() => loaderWrapper.style.opacity = '1', 10);
    }
}

export function updateLoaderText(message) {
    const loaderWrapper = document.getElementById('loader-wrapper');
    if (loaderWrapper) {
        const loaderText = loaderWrapper.querySelector('.loader-text');
        if (loaderText) {
            loaderText.textContent = message;
        }
    }
}

export function hideLoader() {
    const loaderWrapper = document.getElementById('loader-wrapper');
    if (loaderWrapper) {
        loaderWrapper.style.opacity = '0';
        setTimeout(() => {
            loaderWrapper.style.display = 'none';
            const textEl = loaderWrapper.querySelector('.loader-text');
            if(textEl) textEl.textContent = 'Memuat...';
        }, 300);
    }
}

export function showNotification(message, type = 'success') {
    notificationEl.textContent = message;
    notificationEl.className = '';
    notificationEl.classList.add(type);
    notificationEl.classList.add('show');
    setTimeout(() => {
        notificationEl.classList.remove('show');
    }, 5000);
}

export function updateOnlineStatus(isOnline) {
    if (isOnline) {
        offlineIndicator.classList.remove('show');
    } else {
        offlineIndicator.classList.add('show');
    }
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

export function showSchoolSelectorModal(title) {
    return new Promise(async (resolve) => {
        showLoader('Memuat daftar sekolah...');
        try {
            const { allSchools } = await apiService.getAllSchools();
            hideLoader();

            const existingModal = document.getElementById('school-selector-modal');
            if (existingModal) existingModal.remove();

            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = templates.schoolSelectorModal(allSchools, title);
            document.body.appendChild(modalContainer);

            const cleanup = () => {
                if(document.body.contains(modalContainer)){
                    document.body.removeChild(modalContainer);
                }
            };

            document.querySelectorAll('.school-select-btn').forEach(button => {
                button.onclick = (e) => {
                    const school = {
                        id: e.currentTarget.dataset.schoolId,
                        name: e.currentTarget.dataset.schoolName,
                    };
                    cleanup();
                    resolve(school);
                };
            });

            document.getElementById('school-selector-cancel-btn').onclick = () => {
                cleanup();
                resolve(null);
            };

        } catch (error) {
            hideLoader();
            showNotification(error.message, 'error');
            resolve(null);
        }
    });
}

function showJurisdictionSelectorModal(title) {
    return new Promise(async (resolve) => {
        showLoader('Memuat daftar yurisdiksi...');
        try {
            const { tree } = await apiService.getJurisdictionTree();
            hideLoader();

            const existingModal = document.getElementById('jurisdiction-selector-modal');
            if (existingModal) existingModal.remove();

            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = templates.jurisdictionSelectorModal(tree, title);
            document.body.appendChild(modalContainer);

            const cleanup = () => {
                if(document.body.contains(modalContainer)){
                    document.body.removeChild(modalContainer);
                }
            };

            document.querySelectorAll('.jurisdiction-select-btn').forEach(button => {
                button.onclick = (e) => {
                    const jurisdiction = {
                        id: e.currentTarget.dataset.jurisdictionId,
                        name: e.currentTarget.dataset.jurisdictionName,
                    };
                    cleanup();
                    resolve(jurisdiction);
                };
            });

            document.getElementById('jurisdiction-selector-cancel-btn').onclick = () => {
                cleanup();
                resolve(null);
            };

        } catch (error) {
            hideLoader();
            showNotification(error.message, 'error');
            resolve(null);
        }
    });
}

function showRoleSelectorModal() {
    return new Promise((resolve) => {
        const currentUserRole = state.userProfile.primaryRole;
        const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';

        const availableRoles = [
            { value: 'GURU', text: 'Guru' },
            { value: 'KEPALA_SEKOLAH', text: 'Kepala Sekolah' },
        ];
        if (isSuperAdmin) {
            availableRoles.push({ value: 'ADMIN_SEKOLAH', text: 'Admin Sekolah' });
        }
        
        const existingModal = document.getElementById('role-selector-modal');
        if (existingModal) existingModal.remove();

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = templates.roleSelectorModal(availableRoles);
        document.body.appendChild(modalContainer);

        const cleanup = () => {
            if (document.body.contains(modalContainer)) {
                document.body.removeChild(modalContainer);
            }
        };

        document.getElementById('role-selector-confirm-btn').onclick = () => {
            const selectedRole = document.getElementById('role-select-bulk-modal').value;
            cleanup();
            resolve(selectedRole);
        };
        document.getElementById('role-selector-cancel-btn').onclick = () => {
            cleanup();
            resolve(null);
        };
    });
}

export function displayAuthError(message, error = null) {
    const errorContainer = document.getElementById('auth-error-container');
    if (!errorContainer) return;

    if (error === null) {
        errorContainer.innerHTML = message;
        errorContainer.classList.remove('hidden');
        return;
    }

    const isDbError = error && (error.status === 503 || (error.message && error.message.toLowerCase().includes('database')));

    if (isDbError) {
         errorContainer.innerHTML = `
            <div class="bg-amber-50 p-4 rounded-lg border border-amber-200 text-left flex items-start gap-4">
                <div class="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <div>
                    <h3 class="font-bold text-amber-800">Layanan Sedang Mengalami Gangguan</h3>
                    <p class="text-sm text-amber-700 mt-1">
                        Sistem kami sedang mengalami kendala teknis dan tidak dapat memproses login Anda saat ini. Ini bukan kesalahan Anda.
                    </p>
                    <p class="text-sm text-amber-700 mt-2">
                        Silakan coba masuk kembali dalam beberapa saat.
                    </p>
                </div>
            </div>`;
    } else {
         let details = error.message || (typeof error === 'string' ? error : JSON.stringify(error));
         details = encodeHTML(details); 
         errorContainer.innerHTML = `<div class="bg-red-50 p-3 rounded-lg border border-red-200"><p class="text-red-700 font-semibold">${encodeHTML(message)}</p><p class="text-slate-500 text-xs mt-2">${details}</p></div>`;
    }
    errorContainer.classList.remove('hidden');
}

async function teacherProfilePoller() {
    if (state.currentScreen !== 'setup' || state.userProfile?.primaryRole !== 'GURU') return;
    console.log(`Teacher profile polling...`);
    
    if (state.setup.polling.timeoutId) clearTimeout(state.setup.polling.timeoutId);
    let nextInterval = getNextInterval(state.setup.polling.interval);

    try {
        const { userProfile: latestProfile } = await apiService.getUserProfile();
        if (JSON.stringify(latestProfile.assigned_classes) !== JSON.stringify(state.userProfile.assigned_classes)) {
            await setState({ 
                userProfile: latestProfile,
                setup: { ...state.setup, polling: { ...state.setup.polling, interval: INITIAL_POLLING_INTERVAL } }
            });
            showNotification('Hak akses kelas Anda telah diperbarui oleh admin.', 'info');
            renderScreen('setup'); 
            return; 
        }
    } catch (error) {
        console.error("Failed to poll teacher profile:", error);
    }

    const newTimeoutId = setTimeout(teacherProfilePoller, state.setup.polling.interval);
    state.setup.polling.timeoutId = newTimeoutId;
    state.setup.polling.interval = nextInterval;
}

function renderLandingPageScreen() {
    appContainer.innerHTML = templates.landingPage();
    renderSignInButton();

    const faqTriggers = document.querySelectorAll('.faq-trigger');
    faqTriggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
            const content = trigger.nextElementSibling;
            const icon = trigger.querySelector('.faq-icon');
            const isHidden = content.classList.toggle('hidden');
            
            if (isHidden) {
                icon.style.transform = 'rotate(0deg)';
            } else {
                icon.style.transform = 'rotate(180deg)';
            }
            
            faqTriggers.forEach(other => {
                if (other !== trigger) {
                    other.nextElementSibling.classList.add('hidden');
                    other.querySelector('.faq-icon').style.transform = 'rotate(0deg)';
                }
            });
        });
    });

    const contactBtn = document.getElementById('contact-email-btn');
    if (contactBtn) {
        const email = 'i7620@guru.sd.belajar.id';
        const subject = 'Tanya Aplikasi Absensi';
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            contactBtn.setAttribute('href', `mailto:${email}?subject=${encodeURIComponent(subject)}`);
        } else {
            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${encodeURIComponent(subject)}`;
            contactBtn.setAttribute('href', gmailUrl);
            contactBtn.setAttribute('target', '_blank');
            contactBtn.setAttribute('rel', 'noopener noreferrer');
        }
    }

    if (state.logoutMessage) {
        setTimeout(() => {
            setState({ logoutMessage: null });
        }, 0);
    }
}

function renderSetupScreen() {
    if (state.userProfile && !state.userProfile.school_id && !state.userProfile.jurisdiction_id && !state.userProfile.isParent && state.userProfile.primaryRole !== 'SUPER_ADMIN') {
        appContainer.innerHTML = templates.onboarding();
        document.getElementById('logoutBtn').addEventListener('click', handleSignOut);
        
        const choiceView = document.getElementById('onboarding-choice-view');
        const searchView = document.getElementById('onboarding-search-view');
        const createView = document.getElementById('onboarding-create-view');
        
        const showView = (view) => {
            [choiceView, searchView, createView].forEach(v => v.classList.add('hidden'));
            view.classList.remove('hidden');
        };

        document.getElementById('btn-create-school').addEventListener('click', () => showView(createView));
        document.getElementById('back-to-choice-from-create').addEventListener('click', () => showView(choiceView));
        
        document.getElementById('btn-join-school').addEventListener('click', () => showView(searchView));
        document.getElementById('back-to-choice-from-search').addEventListener('click', () => showView(choiceView));
        document.getElementById('btn-redirect-create').addEventListener('click', () => showView(createView));

        const searchInput = document.getElementById('school-search-input');
        const resultsContainer = document.getElementById('school-search-results');
        let searchTimeout;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);
            
            document.getElementById('school-found-msg').classList.add('hidden');
            document.getElementById('school-not-found-msg').classList.add('hidden');
            resultsContainer.innerHTML = '';

            if (query.length < 3) return;

            searchTimeout = setTimeout(async () => {
                resultsContainer.innerHTML = `<p class="text-xs text-slate-400 text-center">Mencari...</p>`;
                try {
                    const { results } = await apiService.searchSchools(query);
                    resultsContainer.innerHTML = '';
                    
                    if (results.length === 0) {
                        document.getElementById('school-not-found-msg').classList.remove('hidden');
                    } else {
                        results.forEach(school => {
                            const btn = document.createElement('button');
                            btn.className = "w-full text-left p-3 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition group";
                            btn.innerHTML = `
                                <div class="flex justify-between items-center">
                                    <span class="font-bold text-slate-700 group-hover:text-blue-700">${encodeHTML(school.name)}</span>
                                    <span class="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">Pilih</span>
                                </div>
                            `;
                            btn.onclick = () => {
                                document.getElementById('found-school-name').textContent = school.name;
                                document.getElementById('found-admin-name').textContent = school.admin_name || "Belum ada Admin";
                                
                                const emailEl = document.getElementById('found-admin-email');
                                const contactBtn = document.getElementById('contact-admin-btn');
                                
                                if (school.admin_email) {
                                    emailEl.textContent = school.admin_email;
                                    emailEl.parentElement.classList.remove('hidden');
                                    
                                    const subject = encodeURIComponent(`Permintaan Akses Aplikasi Absensi - ${state.userProfile.name}`);
                                    const body = encodeURIComponent(`Halo Admin ${school.name},\n\nSaya ${state.userProfile.name} (${state.userProfile.email}) ingin meminta akses masuk dan penugasan kelas di aplikasi absensi sekolah.\n\nMohon bantuannya.\n\nTerima kasih.`);
                                    
                                    contactBtn.href = `mailto:${school.admin_email}?subject=${subject}&body=${body}`;
                                    contactBtn.classList.remove('hidden');
                                } else {
                                    emailEl.textContent = "Email tidak tersedia";
                                    contactBtn.classList.add('hidden');
                                }
                                
                                document.getElementById('school-found-msg').classList.remove('hidden');
                                resultsContainer.innerHTML = ''; 
                            };
                            resultsContainer.appendChild(btn);
                        });
                    }
                } catch (error) {
                    console.error("Search failed", error);
                    resultsContainer.innerHTML = `<p class="text-xs text-red-400 text-center">Gagal mencari.</p>`;
                }
            }, 500);
        });

        document.getElementById('btn-confirm-create').addEventListener('click', async () => {
            const name = document.getElementById('new-school-name').value.trim();
            if (!name) {
                showNotification("Nama sekolah tidak boleh kosong", 'error');
                return;
            }
            
            showLoader("Mendaftarkan sekolah...");
            try {
                await apiService.createSchool(name);
                
                const { userProfile } = await apiService.getUserProfile();
                await setState({ userProfile });
                
                hideLoader();
                showNotification("Sekolah berhasil dibuat! Anda sekarang adalah Admin.", 'success');
                renderScreen('setup'); 
            } catch (error) {
                hideLoader();
                showNotification(error.message, 'error');
            }
        });

        return; 
    }

    appContainer.innerHTML = templates.setup();
    if (!state.userProfile) {
        return;
    }

    const isAdmin = ['SUPER_ADMIN', 'ADMIN_SEKOLAH'].includes(state.userProfile?.primaryRole);
    const isTeacher = state.userProfile?.primaryRole === 'GURU';
    const needsAssignment = isTeacher && (!state.userProfile.assigned_classes || state.userProfile.assigned_classes.length === 0);

    document.getElementById('logoutBtn').addEventListener('click', handleSignOut);
    document.getElementById('back-to-main-home-btn').addEventListener('click', () => navigateTo('multiRoleHome'));
    
    const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
    if (enableNotificationsBtn) {
        enableNotificationsBtn.addEventListener('click', () => {
            Notification.requestPermission().then(permission => {
                const banner = document.getElementById('notification-permission-banner');
                if (banner) banner.remove();
                if (permission === 'granted') showNotification('Notifikasi diaktifkan!', 'success');
                else localStorage.setItem('notificationBannerDismissed', 'true');
            });
        });
    }

    const dismissBannerBtn = document.getElementById('dismiss-notification-banner-btn');
    if (dismissBannerBtn) {
        dismissBannerBtn.addEventListener('click', () => {
            localStorage.setItem('notificationBannerDismissed', 'true');
            document.getElementById('notification-permission-banner')?.remove();
        });
    }
    
    if (!needsAssignment) {
        document.getElementById('startBtn').addEventListener('click', () => handleStartAttendance());
        document.getElementById('historyBtn').addEventListener('click', () => handleViewHistory(true));
        document.getElementById('recapBtn').addEventListener('click', handleViewRecap);
        document.getElementById('manageStudentsBtn').addEventListener('click', handleManageStudents);
        document.getElementById('downloadDataBtn').addEventListener('click', handleDownloadData);

        const classSelect = document.getElementById('class-select');
        if (classSelect && !classSelect.value && classSelect.options.length > 0) {
             classSelect.selectedIndex = 0;
             state.selectedClass = classSelect.value;
        }
        if (classSelect) {
            classSelect.addEventListener('change', (e) => {
                state.selectedClass = e.target.value;
            });
        }
    }
    
    if (isTeacher) {
        teacherProfilePoller();
    }
}

async function renderMultiRoleHomeScreen() {
    appContainer.innerHTML = templates.multiRoleHome();
    document.getElementById('logoutBtn').addEventListener('click', handleSignOut);

    const { primaryRole } = state.userProfile;
    const isSuperAdmin = primaryRole === 'SUPER_ADMIN';
    const isDinas = ['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(primaryRole);

    document.getElementById('go-to-attendance-btn')?.addEventListener('click', async () => {
        if (isSuperAdmin) {
            const selectedSchool = await showSchoolSelectorModal('Pilih Sekolah untuk Absensi');
            if (selectedSchool) {
                showLoader('Memuat data sekolah...');
                try {
                    const { aggregatedStudentsByClass, settings } = await apiService.getSchoolStudentData(selectedSchool.id);
                    await setState({ 
                        adminActingAsSchool: selectedSchool, 
                        adminActingAsJurisdiction: null,
                        studentsByClass: aggregatedStudentsByClass || {},
                        // Update settings state to reflect the target school
                        schoolSettings: settings || { workDays: [1, 2, 3, 4, 5, 6] },
                        dashboard: { 
                            ...state.dashboard, 
                            data: null, 
                            isLoading: true,
                            aiRecommendation: { isLoading: false, result: null, error: null, selectedRange: 'last30days' }
                        }  
                    });
                    hideLoader();
                    navigateTo('setup');
                } catch (error) {
                    hideLoader();
                    showNotification('Gagal memuat data sekolah: ' + error.message, 'error');
                }
            }
        } else {
            navigateTo('setup');
        }
    });

    document.getElementById('view-dashboard-btn')?.addEventListener('click', async () => {
        await setState({ dashboard: { ...state.dashboard, activeView: 'report' } });
        navigateTo('dashboard');
        dashboardPoller();
    });

    document.getElementById('view-school-dashboard-btn')?.addEventListener('click', async () => {
        const selectedSchool = await showSchoolSelectorModal('Pilih Sekolah untuk Dasbor');
        if (selectedSchool) {
            await setState({ 
                adminActingAsSchool: selectedSchool, 
                adminActingAsJurisdiction: null,
                dashboard: { 
                    ...state.dashboard, 
                    data: null, 
                    isLoading: true, 
                    activeView: 'report',
                    aiRecommendation: { isLoading: false, result: null, error: null, selectedRange: 'last30days' }
                } 
            });
            navigateTo('dashboard');
            dashboardPoller();
        }
    });

    document.getElementById('view-jurisdiction-dashboard-btn')?.addEventListener('click', async () => {
        const selectedJurisdiction = await showJurisdictionSelectorModal('Pilih Yurisdiksi untuk Dasbor');
        if (selectedJurisdiction) {
            await setState({ 
                adminActingAsJurisdiction: selectedJurisdiction, 
                adminActingAsSchool: null,
                dashboard: { 
                    ...state.dashboard, 
                    data: null, 
                    isLoading: true, 
                    activeView: 'report',
                    aiRecommendation: { isLoading: false, result: null, error: null, selectedRange: 'last30days' }
                } 
            });
            navigateTo('dashboard');
            dashboardPoller();
        }
    });
    
    document.getElementById('download-scoped-report-btn')?.addEventListener('click', () => {
        if (isDinas) {
            handleDownloadJurisdictionReport(state.userProfile.jurisdiction_id, state.userProfile.jurisdiction_name);
        } else { 
            handleDownloadFullSchoolReport();
        }
    });

    document.getElementById('download-school-report-btn')?.addEventListener('click', async () => {
        const school = await showSchoolSelectorModal('Pilih Sekolah untuk Laporan');
        if (school) {
            handleDownloadFullSchoolReport(school.id, school.name);
        }
    });
    document.getElementById('download-jurisdiction-report-btn')?.addEventListener('click', async () => {
        const jurisdiction = await showJurisdictionSelectorModal('Pilih Yurisdiksi untuk Laporan');
        if (jurisdiction) {
            handleDownloadJurisdictionReport(jurisdiction.id, jurisdiction.name);
        }
    });


    document.getElementById('view-parent-dashboard-btn')?.addEventListener('click', () => navigateTo('parentDashboard'));
    document.getElementById('view-admin-panel-btn')?.addEventListener('click', () => navigateTo('adminPanel'));
    document.getElementById('view-jurisdiction-panel-btn')?.addEventListener('click', () => navigateTo('jurisdictionPanel'));
    document.getElementById('manage-holidays-btn')?.addEventListener('click', () => navigateTo('holidaySettings'));

    if (isSuperAdmin) {
        document.getElementById('go-to-migration-tool-btn')?.addEventListener('click', () => navigateTo('migrationTool'));
    }
}

// --- DASHBOARD LOGIC ---

function getWeekRange(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dayOfWeek = d.getDay(); 
    const diffToMonday = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diffToMonday));
    const sunday = new Date(new Date(monday).setDate(monday.getDate() + 6));
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return `${monday.toLocaleDateString('id-ID', options)} - ${sunday.toLocaleDateString('id-ID', options)}`;
}

function updateDashboardDateDisplay() {
    const dateDisplay = document.getElementById('dashboard-header-date');
    if (!dateDisplay) return;
    const { chartViewMode, selectedDate } = state.dashboard;
    const dateObj = new Date(selectedDate);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    
    if (chartViewMode === 'weekly') {
        dateDisplay.textContent = getWeekRange(selectedDate);
    } else if (chartViewMode === 'monthly') {
        dateDisplay.textContent = dateObj.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } else if (chartViewMode === 'yearly') {
        dateDisplay.textContent = `Tahun ${dateObj.getFullYear()}`;
    } else if (chartViewMode.startsWith('semester')) {
        const year = dateObj.getFullYear();
        dateDisplay.textContent = chartViewMode === 'semester1' ? `Semester I (${year})` : `Semester II (${year})`;
    } else {
        dateDisplay.textContent = dateObj.toLocaleDateString('id-ID', options);
    }
    
    const pickerDisplay = document.getElementById('date-picker-display');
    if (pickerDisplay) pickerDisplay.textContent = dateObj.toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderCalendar(container, currentDate, onSelect) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    let html = `
        <div class="flex justify-between items-center mb-4">
            <button id="prev-month" class="p-1 hover:bg-slate-100 rounded">&lt;</button>
            <span class="font-bold text-slate-700">${monthNames[month]} ${year}</span>
            <button id="next-month" class="p-1 hover:bg-slate-100 rounded">&gt;</button>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500 mb-2">
            <div>Min</div><div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div>
        </div>
        <div class="grid grid-cols-7 gap-1 text-sm">
    `;
    
    for (let i = 0; i < firstDay; i++) {
        html += `<div></div>`;
    }
    
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const isToday = date.toDateString() === today.toDateString();
        const isSelected = date.toDateString() === currentDate.toDateString();
        const dayClass = `calendar-day p-2 rounded cursor-pointer ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`;
        html += `<div class="${dayClass}" data-date="${date.toISOString().split('T')[0]}">${day}</div>`;
    }
    
    html += `</div>`;
    container.innerHTML = html;
    
    container.querySelectorAll('.calendar-day').forEach(el => {
        el.onclick = () => onSelect(el.dataset.date);
    });
    
    container.querySelector('#prev-month').onclick = (e) => {
        e.stopPropagation();
        onSelect(new Date(year, month - 1, 1).toISOString().split('T')[0], true);
    };
    container.querySelector('#next-month').onclick = (e) => {
        e.stopPropagation();
        onSelect(new Date(year, month + 1, 1).toISOString().split('T')[0], true);
    };
}

function attachDatePickerListeners() {
    const trigger = document.getElementById('date-picker-trigger');
    const popover = document.getElementById('date-picker-popover');
    
    if (!trigger || !popover) return;
    
    const togglePicker = () => {
        const isHidden = popover.classList.contains('hidden');
        if (isHidden) {
            popover.classList.remove('hidden');
            renderCalendar(popover, new Date(state.dashboard.selectedDate), async (newDate, keepOpen = false) => {
                await setState({ dashboard: { ...state.dashboard, selectedDate: newDate, aiRecommendation: { ...state.dashboard.aiRecommendation, result: null, error: null } } });
                updateDashboardDateDisplay();
                if (!keepOpen) popover.classList.add('hidden');
                else renderCalendar(popover, new Date(newDate), arguments.callee);
                
                updateDashboardContent(state.dashboard.data);
                dashboardPoller(); 
            });
        } else {
            popover.classList.add('hidden');
        }
    };
    
    trigger.onclick = (e) => {
        e.stopPropagation();
        togglePicker();
    };
    
    document.addEventListener('click', (e) => {
        if (!trigger.contains(e.target) && !popover.contains(e.target)) {
            popover.classList.add('hidden');
        }
    });
}

function renderStructuredAiResponse(markdownText) {
    const icons = {
        'Ringkasan': `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
        'Peringatan Dini': `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`,
        'Pola Utama': `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`,
        'Rekomendasi Tindak Lanjut': `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>`
    };
    
    const splitRegex = new RegExp(`(?<=\\n)(?=(?:###\\s*)?(?:Ringkasan|Peringatan Dini|Analisis Pola Utama|Rekomendasi Tindak Lanjut))`, 'g');
    const parts = markdownText.split(splitRegex).filter(p => p.trim());
    
    if (parts.length < 2) {
        return `<div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm gemini-response prose prose-slate max-w-none prose-sm">${marked.parse(markdownText)}</div>`;
    }

    const sections = parts.map(part => {
        const lines = part.trim().split('\n');
        const title = lines[0].replace(/###\s*/, '').trim();
        const content = lines.slice(1).join('\n').trim();
        return { title, content: marked.parse(content) };
    });
    
    return `<div class="space-y-4 gemini-response">
        ${sections.map(section => {
            const iconKey = Object.keys(icons).find(key => section.title.includes(key));
            const icon = iconKey ? icons[iconKey] : icons['Ringkasan'];
            return `
            <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition hover:shadow-md">
                <h3 class="flex items-center gap-3 font-bold text-slate-800 text-base mb-3">
                    ${icon}
                    <span>${encodeHTML(section.title)}</span>
                </h3>
                <div class="pl-9 card-content">${section.content}</div>
            </div>
            `;
        }).join('')}
    </div>`;
}

function calculatePercentageData(logs, viewMode, filterValue, schoolInfo, selectedDate, isRegional) {
    if (!logs || !schoolInfo) return { finalCounts: { H: 0, S: 0, I: 0, A: 0, Unreported: 0 }, percentageDenominator: 0 };
    
    const d = new Date(selectedDate + 'T00:00:00');
    let startDate, endDate;

    switch (viewMode) {
        case 'daily':
            startDate = endDate = d;
            break;
        case 'weekly': {
            const dayOfWeek = d.getDay();
            const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            startDate = new Date(d.setDate(diff));
            endDate = new Date(new Date(startDate).setDate(startDate.getDate() + 6));
            break;
        }
        case 'monthly': {
            startDate = new Date(d.getFullYear(), d.getMonth(), 1);
            endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            break;
        }
        case 'semester1':
            startDate = new Date(d.getFullYear(), 6, 1); 
            endDate = new Date(d.getFullYear(), 11, 31); 
            break;
        case 'semester2':
            startDate = new Date(d.getFullYear(), 0, 1); 
            endDate = new Date(d.getFullYear(), 5, 30); 
            break;
        case 'yearly': {
            let yearStart = new Date(d.getFullYear(), 6, 1);
            if (d.getMonth() < 6) { yearStart.setFullYear(d.getFullYear() - 1); }
            startDate = yearStart;
            endDate = new Date(yearStart.getFullYear() + 1, 5, 30);
            break;
        }
        default:
             startDate = endDate = d;
    }
    startDate.setHours(0,0,0,0);
    endDate.setHours(0,0,0,0);

    const relevantLogs = logs.filter(log => {
        const logDate = new Date(log.date + 'T00:00:00');
        const isInDateRange = logDate >= startDate && logDate <= endDate;
        
        let isInFilter = false;
        if (isRegional) {
            isInFilter = filterValue === 'all' || log.school_id.toString() === filterValue;
        } else {
            isInFilter = filterValue === 'all' || log.class === filterValue;
        }
        return isInDateRange && isInFilter;
    });

    const finalCounts = { H: 0, S: 0, I: 0, A: 0 };
    relevantLogs.forEach(log => {
        Object.values(log.attendance).forEach(status => {
            if (finalCounts[status] !== undefined) {
                finalCounts[status]++;
            }
        });
    });
    
    let numStudentsInScope = 0;
    if (filterValue === 'all') {
        numStudentsInScope = schoolInfo.totalStudents || 0;
    } else {
        if (isRegional) {
            numStudentsInScope = schoolInfo.studentsPerSchool[filterValue] || 0;
        } else {
            numStudentsInScope = schoolInfo.studentsPerClass[filterValue] || 0;
        }
    }

    let percentageDenominator = 0;
    if (viewMode === 'daily') {
        percentageDenominator = numStudentsInScope;
    } else {
        const uniqueSchoolDays = new Set(relevantLogs.map(log => log.date)).size;
        percentageDenominator = uniqueSchoolDays * numStudentsInScope;
    }
    
    const totalReported = finalCounts.H + finalCounts.S + finalCounts.I + finalCounts.A;
    const unreported = Math.max(0, percentageDenominator - totalReported);
    finalCounts.Unreported = unreported;

    return {
        finalCounts,
        percentageDenominator: percentageDenominator > 0 ? percentageDenominator : numStudentsInScope, 
    };
}

function updateDashboardContent(data) {
    const { activeView, selectedDate, aiRecommendation, chartViewMode, chartClassFilter, chartSchoolFilter } = state.dashboard;
    
    const reportContent = document.getElementById('dashboard-content-report');
    const percentageContent = document.getElementById('dashboard-content-percentage');
    const aiContent = document.getElementById('dashboard-content-ai');

    if (!reportContent || !percentageContent || !aiContent) return;

    const emptyStateHtml = (isRegional) => `
        <div class="text-center p-8 bg-slate-50 rounded-lg border-2 border-dashed">
            <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 class="mt-4 text-xl font-semibold text-slate-700">${isRegional ? 'Data Wilayah Masih Kosong' : 'Data Sekolah Masih Kosong'}</h3>
            <p class="mt-2 text-sm text-slate-500">
                ${isRegional 
                    ? 'Sepertinya belum ada data sekolah, siswa, atau absensi di wilayah yurisdiksi ini.'
                    : 'Sepertinya belum ada data siswa atau absensi untuk sekolah ini. Mulai dengan menambahkan daftar siswa.'
                }
            </p>
        </div>`;
    
    const unassignedMessage = (isDinas) => {
        const title = isDinas ? "Menunggu Penugasan Yurisdiksi" : "Menunggu Penugasan Sekolah";
        const message1 = isDinas ? "Akun Anda aktif tetapi belum ditugaskan ke wilayah yurisdiksi." : "Akun Anda aktif tetapi belum ditugaskan ke sekolah.";
        return `<div class="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-lg"><div class="flex"><div class="py-1"><svg class="w-8 h-8 text-yellow-500 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div><div><p class="font-bold text-yellow-800 text-lg">${title}</p><p class="text-sm text-yellow-700 mt-2">${message1} Data dasbor tidak dapat ditampilkan.</p><p class="text-sm text-yellow-700 mt-1">Silakan hubungi Super Admin untuk mendapatkan akses.</p></div></div></div>`;
    };

    if (!data) {
        const errorHtml = `<p class="text-center text-red-500 py-8">Gagal memuat data dasbor.</p>`;
        reportContent.innerHTML = errorHtml;
        percentageContent.innerHTML = errorHtml;
        aiContent.innerHTML = errorHtml;
        return;
    }

    if (data.isUnassigned) {
        const isDinas = ['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(state.userProfile.primaryRole);
        const unassignedHtml = unassignedMessage(isDinas);
        reportContent.innerHTML = unassignedHtml;
        percentageContent.innerHTML = unassignedHtml;
        aiContent.innerHTML = unassignedHtml;
        return;
    }
    
    const isRegionalView = data.isRegionalView;

    if (data.schoolInfo && data.schoolInfo.totalStudents === 0) {
        const emptyHtml = emptyStateHtml(isRegionalView);
        reportContent.innerHTML = emptyHtml;
        percentageContent.innerHTML = emptyHtml;
        aiContent.innerHTML = emptyHtml;
        return;
    }

    if (activeView === 'report' && data.schoolInfo && data.allLogsForYear) {
        const dailyStats = calculatePercentageData(data.allLogsForYear, 'daily', 'all', data.schoolInfo, selectedDate, isRegionalView);
        const summaryStats = {
            totalStudents: data.schoolInfo.totalStudents || 0,
            totalPresent: dailyStats.finalCounts.H,
            S: dailyStats.finalCounts.S,
            I: dailyStats.finalCounts.I,
            A: dailyStats.finalCounts.A,
        };

        const summaryStatsHtml = `<div id="dashboard-summary-stats" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">${Object.entries({'Total Siswa':{count:summaryStats.totalStudents,color:'slate'},Hadir:{count:summaryStats.totalPresent,color:'green'},Sakit:{count:summaryStats.S,color:'yellow'},Izin:{count:summaryStats.I,color:'blue'},Alpa:{count:summaryStats.A,color:'red'}}).map(([label,{count,color}])=>`<div class="bg-${color}-100 p-4 rounded-xl text-center"><p class="text-sm font-semibold text-${color}-700">${label}</p><p class="text-3xl font-bold text-${color}-800">${count}</p></div>`).join('')}</div>`;
        
        let detailedReportHtml = '';
        if (isRegionalView) {
            const { schoolCompletionStatus } = data.reportData;
            if (!schoolCompletionStatus || schoolCompletionStatus.length === 0) {
                 detailedReportHtml = `<div class="p-4 bg-slate-50 rounded-lg"><p class="text-center text-slate-500 py-4">Tidak ada data sekolah yang ditemukan di yurisdiksi ini.</p></div>`;
            } else {
                 detailedReportHtml = `<h2 class="text-lg font-bold text-slate-700 mb-4">Laporan Penyelesaian Absensi Harian</h2><div class="space-y-4">${schoolCompletionStatus.map(item => {
                    const completionRate = item.totalClasses > 0 ? (item.submittedClasses / item.totalClasses) * 100 : 0;
                    const isComplete = completionRate === 100;
                    const color = isComplete ? 'green' : (item.submittedClasses > 0 ? 'yellow' : 'slate');
                    return `<div class="bg-${color}-50 p-4 rounded-lg border border-${color}-200"><div class="flex justify-between items-center"><h3 class="font-bold text-${color}-700">${encodeHTML(item.schoolName)}</h3><span class="px-2 py-1 text-xs font-semibold bg-${color}-200 text-${color}-800 rounded-full">Selesai ${item.submittedClasses}/${item.totalClasses || '?'} kelas</span></div><p class="text-sm text-${color}-600 mt-2">${isComplete ? 'Semua kelas telah melakukan absensi.' : 'Beberapa kelas belum melakukan absensi.'}</p></div>`;
                }).join('')}</div>`;
            }
        } else { // School View
            const { classCompletionStatus } = data;
            if (!classCompletionStatus || classCompletionStatus.length === 0) {
                detailedReportHtml = `<div class="p-4 bg-slate-50 rounded-lg"><p class="text-center text-slate-500 py-4">Tidak ada data kelas yang ditemukan.</p></div>`;
            } else {
                // --- SORTING UPDATE: Unsubmitted First ---
                const sortedClassStatus = [...classCompletionStatus].sort((a, b) => {
                    // isSubmitted: false comes before true
                    if (a.isSubmitted === b.isSubmitted) {
                        return a.className.localeCompare(b.className);
                    }
                    return a.isSubmitted ? 1 : -1;
                });

                detailedReportHtml = `<h2 class="text-lg font-bold text-slate-700 mb-4">Laporan Kehadiran Harian</h2><div class="space-y-4">${sortedClassStatus.map(item=>item.isSubmitted?item.allPresent?`<div class="bg-green-50 p-4 rounded-lg border border-green-200"><div class="flex justify-between items-center"><h3 class="font-bold text-green-700">Kelas ${encodeHTML(item.className)}</h3><p class="text-xs text-slate-400 font-medium">Oleh: ${encodeHTML(item.teacherName)}</p></div><p class="text-sm text-green-600 mt-2 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg> Semua siswa hadir.</p></div>`:`<div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm"><div class="flex justify-between items-center mb-2"><h3 class="font-bold text-blue-600">Kelas ${encodeHTML(item.className)}</h3><p class="text-xs text-slate-400 font-medium">Oleh: ${encodeHTML(item.teacherName)}</p></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-slate-500"><th class="py-1 pr-4 font-medium">Nama Siswa</th><th class="py-1 px-2 font-medium">Status</th></tr></thead><tbody>${item.absentStudents.map(s=>`<tr class="border-t border-slate-200"><td class="py-2 pr-4 text-slate-700">${encodeHTML(s.name)}</td><td class="py-2 px-2"><span class="px-2 py-1 rounded-full text-xs font-semibold ${s.status==='S'?'bg-yellow-100 text-yellow-800':s.status==='I'?'bg-blue-100 text-blue-800':'bg-red-100 text-red-800'}">${s.status}</span></td></tr>`).join('')}</tbody></table></div></div>`:`<div class="bg-slate-100 p-4 rounded-lg border border-slate-200"><div class="flex justify-between items-center"><h3 class="font-bold text-slate-600">Kelas ${encodeHTML(item.className)}</h3><span class="px-2 py-1 text-xs font-semibold bg-slate-200 text-slate-600 rounded-full">Belum Diisi</span></div><p class="text-sm text-slate-500 mt-2">Guru belum melakukan absensi.</p></div>`).join('')}</div>`;
            }
        }
        reportContent.innerHTML = summaryStatsHtml + detailedReportHtml;
    }

    if (activeView === 'percentage' && data.allLogsForYear && data.schoolInfo) {
        const filterValue = isRegionalView ? chartSchoolFilter : chartClassFilter;
        const { finalCounts, percentageDenominator } = calculatePercentageData(data.allLogsForYear, chartViewMode, filterValue, data.schoolInfo, selectedDate, isRegionalView);

        const timeFilters = [{id:'daily',text:'Harian'},{id:'weekly',text:'Mingguan'},{id:'monthly',text:'Bulanan'},{id:'semester1',text:'Semester I'},{id:'semester2',text:'Semester II'},{id:'yearly',text:'Tahun Ajaran'}];
        
        let filterHtml;
        if (isRegionalView) {
            const { allSchools = [] } = data.schoolInfo;
            filterHtml = `<div class="flex-1 md:max-w-xs"><label for="chart-school-filter" class="block text-sm font-medium text-slate-700 mb-2">Lingkup Sekolah</label><select id="chart-school-filter" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"><option value="all">Seluruh Wilayah</option>${allSchools.map(s=>`<option value="${s.id}" ${state.dashboard.chartSchoolFilter === s.id.toString() ? 'selected':''}>${encodeHTML(s.name)}</option>`).join('')}</select></div>`;
        } else {
            const { allClasses = [] } = data.schoolInfo;
            filterHtml = `<div class="flex-1 md:max-w-xs"><label for="chart-class-filter" class="block text-sm font-medium text-slate-700 mb-2">Lingkup Kelas</label><select id="chart-class-filter" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"><option value="all">Seluruh Sekolah</option>${allClasses.map(c=>`<option value="${c}" ${state.dashboard.chartClassFilter===c?'selected':''}>Kelas ${c}</option>`).join('')}</select></div>`;
        }
        
        percentageContent.innerHTML = `<div class="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-slate-100 rounded-lg border border-slate-200"><div class="flex-1"><p class="block text-sm font-medium text-slate-700 mb-2">Periode Waktu</p><div id="chart-time-filter" class="flex flex-wrap gap-2">${timeFilters.map(f=>`<button data-mode="${f.id}" class="chart-time-btn flex-grow sm:flex-grow-0 text-sm font-semibold py-2 px-4 rounded-lg transition ${state.dashboard.chartViewMode===f.id?'bg-blue-600 text-white':'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'}">${f.text}</button>`).join('')}</div></div>${filterHtml}</div><div class="flex flex-col md:flex-row items-center justify-center gap-8 p-4"><div id="chart-container" class="relative w-full md:w-1/2" style="max-width: 400px; max-height: 400px;"><canvas id="dashboard-pie-chart"></canvas><div id="chart-no-data" class="hidden absolute inset-0 flex items-center justify-center"><p class="text-slate-500 bg-white p-4 rounded-lg">Tidak ada data untuk filter ini.</p></div></div><div id="custom-legend-container" class="w-full md:w-1/2 max-w-xs"></div></div>`;
        
        document.querySelectorAll('.chart-time-btn').forEach(btn => btn.onclick = async (e) => { await setState({ dashboard: { ...state.dashboard, chartViewMode: e.currentTarget.dataset.mode } }); updateDashboardContent(state.dashboard.data); });
        
        if (isRegionalView) {
             document.getElementById('chart-school-filter').onchange = async (e) => { await setState({ dashboard: { ...state.dashboard, chartSchoolFilter: e.target.value } }); updateDashboardContent(state.dashboard.data); };
        } else {
             document.getElementById('chart-class-filter').onchange = async (e) => { await setState({ dashboard: { ...state.dashboard, chartClassFilter: e.target.value } }); updateDashboardContent(state.dashboard.data); };
        }

        const chartData = [
            { label: 'Hadir', value: finalCounts.H, color: '#22c55e' },
            { label: 'Sakit', value: finalCounts.S, color: '#fbbf24' },
            { label: 'Izin', value: finalCounts.I, color: '#3b82f6' },
            { label: 'Alpa', value: finalCounts.A, color: '#ef4444' },
            { label: 'Belum Diisi', value: finalCounts.Unreported, color: '#94a3b8' } 
        ];
        const chartCanvas = document.getElementById('dashboard-pie-chart');
        if (window.dashboardPieChart instanceof Chart) window.dashboardPieChart.destroy();

        const totalChartValue = Object.values(finalCounts).reduce((a, b) => a + b, 0);

        if (totalChartValue > 0 && chartCanvas) {
            chartCanvas.style.display = 'block';
            document.getElementById('chart-no-data').classList.add('hidden');
            document.getElementById('custom-legend-container').innerHTML = chartData.map(item => {
                if (item.value === 0) return ''; 
                const percentage = percentageDenominator > 0 ? ((item.value / percentageDenominator) * 100).toFixed(2) : '0.00';
                return `<div class="flex items-center justify-between p-3 rounded-lg"><div class="flex items-center gap-3"><span class="w-4 h-4 rounded-full" style="background-color: ${item.color};"></span><span class="font-semibold text-slate-700">${item.label}</span></div><div class="text-right"><span class="font-bold text-slate-800">${item.value}</span><span class="text-sm text-slate-500 ml-2">(${percentage}%)</span></div></div>`;
            }).join('');
            
            window.dashboardPieChart = new Chart(chartCanvas.getContext('2d'), {
                type: 'pie',
                data: {
                    labels: chartData.map(d => d.label),
                    datasets: [{
                        data: chartData.map(d => d.value),
                        backgroundColor: chartData.map(d => d.color),
                        borderColor: '#ffffff',
                        borderWidth: 3
                    }]
                },
                options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } } }
            });
        } else {
            chartCanvas.style.display = 'none';
            document.getElementById('chart-no-data').classList.remove('hidden');
            document.getElementById('custom-legend-container').innerHTML = `<p class="text-center text-slate-500 py-8">Tidak ada data untuk legenda.</p>`;
        }
    }

    if (activeView === 'ai') {
        const { isLoading: isAiLoading, result, error, selectedRange } = aiRecommendation;
        const aiRanges = [{id:'last30days',text:'30 Hari Terakhir'},{id:'semester',text:'Semester Ini'},{id:'year',text:'Tahun Ajaran Ini'}];
        const getAiBtnClass = (rangeId) => selectedRange === rangeId ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-300';
        let contentHtml = `<div class="mb-6 p-4 bg-slate-100 rounded-lg border border-slate-200"><p class="block text-sm font-medium text-slate-700 mb-2">Pilih Periode Analisis</p><div id="ai-range-filter" class="flex flex-wrap gap-2">${aiRanges.map(r=>`<button data-range="${r.id}" class="ai-range-btn flex-grow sm:flex-grow-0 text-sm font-semibold py-2 px-4 rounded-lg transition ${getAiBtnClass(r.id)}">${r.text}</button>`).join('')}</div></div>`;
        if (isAiLoading) contentHtml += `<div class="text-center py-8"><div class="loader mx-auto"></div><p class="loader-text">Menganalisis data...</p></div>`;
        else if (error) contentHtml += `<div class="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200"><p class="font-bold">Terjadi Kesalahan</p><p>${encodeHTML(error)}</p><button id="retry-ai-btn" class="mt-4 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg">Coba Lagi</button></div>`;
        else if (result) contentHtml += renderStructuredAiResponse(result);
        else contentHtml += `<div class="text-center p-8 bg-slate-50 rounded-lg"><h3 class="text-lg font-bold text-slate-800">Dapatkan Wawasan dengan AI</h3><p class="text-slate-500 my-4">Pilih periode, lalu klik untuk meminta Gemini menganalisis data.</p><button id="generate-ai-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg transition">Buat Rekomendasi</button></div>`;
        aiContent.innerHTML = contentHtml;
        document.querySelectorAll('.ai-range-btn').forEach(btn => btn.addEventListener('click', async (e) => { await setState({ dashboard: { ...state.dashboard, aiRecommendation: { ...state.dashboard.aiRecommendation, selectedRange: e.currentTarget.dataset.range, result: null, error: null } } }); updateDashboardContent(state.dashboard.data); }));
        document.getElementById('generate-ai-btn')?.addEventListener('click', handleGenerateAiRecommendation);
        document.getElementById('retry-ai-btn')?.addEventListener('click', handleGenerateAiRecommendation);
    }
}

async function dashboardPoller() {
    if (state.currentScreen !== 'dashboard') return;
    if (state.dashboard.polling.timeoutId) clearTimeout(state.dashboard.polling.timeoutId);
    let nextInterval = getNextInterval(state.dashboard.polling.interval);

    try {
        const schoolId = state.userProfile.primaryRole === 'SUPER_ADMIN' ? state.adminActingAsSchool?.id : state.userProfile.school_id;
        const jurisdictionId = (state.userProfile.primaryRole === 'SUPER_ADMIN' && state.adminActingAsJurisdiction) 
            ? state.adminActingAsJurisdiction.id 
            : (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(state.userProfile.primaryRole) ? state.userProfile.jurisdiction_id : null);

        if (!schoolId && !jurisdictionId) {
            updateDashboardContent({ isUnassigned: true });
            return;
        }

        const dashboardData = await apiService.getDashboardData({ 
            schoolId,
            jurisdictionId,
            selectedDate: state.dashboard.selectedDate 
        });
        
        await setState({ 
            dashboard: { 
                ...state.dashboard, 
                data: dashboardData, 
                isLoading: false,
                polling: { ...state.dashboard.polling, interval: INITIAL_POLLING_INTERVAL } 
            } 
        });
        updateDashboardContent(dashboardData);
        updateDashboardDateDisplay();
    } catch (error) {
        console.error("Polling failed:", error);
    }

    const newTimeoutId = setTimeout(dashboardPoller, state.dashboard.polling.interval);
    state.dashboard.polling.timeoutId = newTimeoutId;
    state.dashboard.polling.interval = nextInterval;
}

function renderDashboardScreen() {
    appContainer.innerHTML = templates.dashboard();
    updateDashboardDateDisplay();
    attachDatePickerListeners();
    document.getElementById('dashboard-back-btn')?.addEventListener('click', () => navigateTo('multiRoleHome'));
    document.getElementById('logoutBtn-ks')?.addEventListener('click', handleSignOut);
    
    document.getElementById('db-view-report')?.addEventListener('click', async () => { await setState({ dashboard: { ...state.dashboard, activeView: 'report' } }); updateDashboardContent(state.dashboard.data); });
    document.getElementById('db-view-percentage')?.addEventListener('click', async () => { await setState({ dashboard: { ...state.dashboard, activeView: 'percentage' } }); updateDashboardContent(state.dashboard.data); });
    document.getElementById('db-view-ai')?.addEventListener('click', async () => { await setState({ dashboard: { ...state.dashboard, activeView: 'ai' } }); updateDashboardContent(state.dashboard.data); });

    dashboardPoller();
}

function renderBulkActionsBar() {
    const container = document.getElementById('admin-bulk-actions-container');
    if (!container) return;
    
    const selectedCount = state.adminPanel.selectedUsers.length;
    if (selectedCount === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = templates.bulkActionsBar(selectedCount);
    
    document.getElementById('bulk-change-role-btn')?.addEventListener('click', async () => {
        const newRole = await showRoleSelectorModal();
        if (newRole) {
            const confirmed = await showConfirmation(`Ubah peran untuk ${selectedCount} pengguna menjadi ${getRoleDisplayName(newRole)}?`);
            if (confirmed) {
                showLoader('Memproses...');
                try {
                    await apiService.updateUsersBulkConfiguration({ targetEmails: state.adminPanel.selectedUsers, newRole });
                    showNotification('Peran berhasil diperbarui.');
                    state.adminPanel.selectedUsers = [];
                    adminPanelPoller();
                } catch (e) {
                    showNotification(e.message, 'error');
                } finally {
                    hideLoader();
                }
            }
        }
    });

    document.getElementById('bulk-assign-school-btn')?.addEventListener('click', async () => {
        const school = await showSchoolSelectorModal('Pilih Sekolah Baru');
        if (school) {
            const confirmed = await showConfirmation(`Pindahkan ${selectedCount} pengguna ke ${school.name}?`);
            if (confirmed) {
                showLoader('Memproses...');
                try {
                    await apiService.updateUsersBulkConfiguration({ targetEmails: state.adminPanel.selectedUsers, newSchoolId: school.id });
                    showNotification('Sekolah pengguna berhasil diperbarui.');
                    state.adminPanel.selectedUsers = [];
                    adminPanelPoller();
                } catch (e) {
                    showNotification(e.message, 'error');
                } finally {
                    hideLoader();
                }
            }
        }
    });
}

function renderAdminPanelTable() {
    const container = document.getElementById('admin-panel-container');
    const paginationContainer = document.getElementById('admin-pagination-container');
    if (!container || !paginationContainer) return;

    let users = state.adminPanel.users;
    if (state.adminPanel.groupBySchool) {
        users.sort((a, b) => (a.school_name || '').localeCompare(b.school_name || ''));
    }

    const totalPages = Math.ceil(users.length / USERS_PER_PAGE);
    const startIndex = (state.adminPanel.currentPage - 1) * USERS_PER_PAGE;
    const paginatedUsers = users.slice(startIndex, startIndex + USERS_PER_PAGE);

    const isAllSelected = paginatedUsers.length > 0 && paginatedUsers.every(u => state.adminPanel.selectedUsers.includes(u.email));

    let html = `
        <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-10">
                        <input type="checkbox" id="select-all-users" class="rounded text-blue-600 focus:ring-blue-500" ${isAllSelected ? 'checked' : ''}>
                    </th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nama & Email</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Peran</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Sekolah / Yurisdiksi</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Aksi</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-slate-200">
    `;

    if (paginatedUsers.length === 0) {
        html += `<tr><td colspan="5" class="px-6 py-4 text-center text-sm text-slate-500">Tidak ada pengguna ditemukan.</td></tr>`;
    } else {
        html += paginatedUsers.map(u => {
            const isSelected = state.adminPanel.selectedUsers.includes(u.email);
            return `
            <tr class="hover:bg-slate-50 transition">
                <td class="px-6 py-4 whitespace-nowrap">
                    <input type="checkbox" class="user-checkbox rounded text-blue-600 focus:ring-blue-500" data-email="${u.email}" ${isSelected ? 'checked' : ''}>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <img class="h-8 w-8 rounded-full" src="${encodeHTML(u.picture)}" alt="">
                        <div class="ml-4">
                            <div class="text-sm font-medium text-slate-900">${encodeHTML(u.name)}</div>
                            <div class="text-sm text-slate-500">${encodeHTML(u.email)}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">${getRoleDisplayName(u.role)}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    ${u.school_name ? encodeHTML(u.school_name) : (u.jurisdiction_name ? encodeHTML(u.jurisdiction_name) : '-')}
                    ${u.is_unmanaged ? '<span class="ml-2 text-red-500 text-xs">(Perlu Tindakan)</span>' : ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button class="text-indigo-600 hover:text-indigo-900 manage-user-btn" data-email="${u.email}">Kelola</button>
                </td>
            </tr>`;
        }).join('');
    }
    html += `</tbody></table>`;
    container.innerHTML = html;

    // Pagination Controls
    paginationContainer.innerHTML = `
        <button id="prev-page-btn" class="px-3 py-1 rounded border ${state.adminPanel.currentPage === 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'}" ${state.adminPanel.currentPage === 1 ? 'disabled' : ''}>Sebelumnya</button>
        <span class="text-sm text-slate-600">Halaman ${state.adminPanel.currentPage} dari ${totalPages || 1}</span>
        <button id="next-page-btn" class="px-3 py-1 rounded border ${state.adminPanel.currentPage >= totalPages ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'}" ${state.adminPanel.currentPage >= totalPages ? 'disabled' : ''}>Berikutnya</button>
    `;

    document.getElementById('prev-page-btn').onclick = () => { if(state.adminPanel.currentPage > 1) { state.adminPanel.currentPage--; renderAdminPanelTable(); renderBulkActionsBar(); } };
    document.getElementById('next-page-btn').onclick = () => { if(state.adminPanel.currentPage < totalPages) { state.adminPanel.currentPage++; renderAdminPanelTable(); renderBulkActionsBar(); } };

    document.getElementById('select-all-users')?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const pageEmails = paginatedUsers.map(u => u.email);
        if (isChecked) {
            state.adminPanel.selectedUsers = [...new Set([...state.adminPanel.selectedUsers, ...pageEmails])];
        } else {
            state.adminPanel.selectedUsers = state.adminPanel.selectedUsers.filter(email => !pageEmails.includes(email));
        }
        renderAdminPanelTable();
        renderBulkActionsBar();
    });

    document.querySelectorAll('.user-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const email = e.target.dataset.email;
            if (e.target.checked) state.adminPanel.selectedUsers.push(email);
            else state.adminPanel.selectedUsers = state.adminPanel.selectedUsers.filter(e => e !== email);
            renderAdminPanelTable(); // Re-render to update "select all" state
            renderBulkActionsBar();
        });
    });

    document.querySelectorAll('.manage-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const user = state.adminPanel.users.find(u => u.email === e.target.dataset.email);
            showManageUserModal(user);
        });
    });
}

async function adminPanelPoller() {
    if (state.currentScreen !== 'adminPanel') return;
    if (state.adminPanel.polling.timeoutId) clearTimeout(state.adminPanel.polling.timeoutId);
    let nextInterval = getNextInterval(state.adminPanel.polling.interval);

    try {
        const { allUsers } = await apiService.getAllUsers();
        const { allSchools } = await apiService.getAllSchools();
        
        await setState({ 
            adminPanel: { 
                ...state.adminPanel, 
                users: allUsers, 
                schools: allSchools, 
                isLoading: false, 
                polling: { ...state.adminPanel.polling, interval: INITIAL_POLLING_INTERVAL }
            } 
        });
        renderAdminPanelTable();
    } catch (error) {
        console.error("Admin polling failed:", error);
    }

    const newTimeoutId = setTimeout(adminPanelPoller, state.adminPanel.polling.interval);
    state.adminPanel.polling.timeoutId = newTimeoutId;
    state.adminPanel.polling.interval = nextInterval;
}

function renderAdminPanelScreen() {
    appContainer.innerHTML = templates.adminPanel();
    document.getElementById('admin-panel-back-btn')?.addEventListener('click', () => navigateTo('multiRoleHome'));
    document.getElementById('group-by-school-toggle')?.addEventListener('change', (e) => {
        state.adminPanel.groupBySchool = e.target.checked;
        state.adminPanel.currentPage = 1;
        renderAdminPanelTable();
    });
    document.getElementById('add-school-btn')?.addEventListener('click', handleCreateSchool);
    
    renderAdminPanelTable(); 
    renderBulkActionsBar();
    adminPanelPoller(); 
}

async function showManageUserModal(user) {
    // We need fresh jurisdiction tree and school list
    showLoader('Memuat data...');
    let jurisdictions = [];
    try {
        const { tree } = await apiService.getJurisdictionTree();
        jurisdictions = tree;
    } catch(e) { console.error(e); }
    hideLoader();

    const existingModal = document.getElementById('manage-user-modal');
    if (existingModal) existingModal.remove();

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = templates.manageUserModal(user, state.adminPanel.schools, jurisdictions);
    document.body.appendChild(modalContainer);

    const roleSelect = document.getElementById('role-select-modal');
    const schoolContainer = document.getElementById('school-assignment-container');
    const jurContainer = document.getElementById('jurisdiction-assignment-container');
    const classContainer = document.getElementById('manage-classes-container');

    roleSelect.addEventListener('change', (e) => {
        const newRole = e.target.value;
        if (['GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(newRole)) {
            schoolContainer.classList.remove('hidden');
            jurContainer.classList.add('hidden');
        } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(newRole)) {
            schoolContainer.classList.add('hidden');
            jurContainer.classList.remove('hidden');
        } else {
            schoolContainer.classList.add('hidden');
            jurContainer.classList.add('hidden');
        }
        
        if (newRole === 'GURU') classContainer.classList.remove('hidden');
        else classContainer.classList.add('hidden');
    });

    document.getElementById('manage-user-cancel-btn').onclick = () => {
        modalContainer.remove();
    };

    document.getElementById('manage-user-save-btn').onclick = async () => {
        const newRole = roleSelect.value;
        const newSchoolId = document.getElementById('school-select-modal').value;
        const newJurId = document.getElementById('jurisdiction-select-modal').value;
        
        const newClasses = [];
        document.querySelectorAll('.class-checkbox:checked').forEach(cb => newClasses.push(cb.value));

        showLoader('Menyimpan konfigurasi pengguna...');
        try {
            await apiService.updateUserConfiguration(user.email, newRole, newSchoolId, newClasses, newJurId);
            showNotification('Pengguna berhasil diperbarui.');
            modalContainer.remove();
            adminPanelPoller(); 
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
    document.getElementById('cancel-add-students-btn').addEventListener('click', () => navigateTo('setup'));
    document.getElementById('save-students-btn').addEventListener('click', handleSaveNewStudents);
    
    document.getElementById('download-template-btn').addEventListener('click', handleDownloadTemplate);
    const fileInput = document.getElementById('excel-upload');
    document.getElementById('import-excel-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleExcelImport);
}

function renderStudentInputRows() {
    const container = document.getElementById('manual-input-container');
    container.innerHTML = '';
    state.newStudents.forEach((student, index) => {
        const div = document.createElement('div');
        div.className = "flex gap-2 items-center";
        div.innerHTML = `
            <span class="text-slate-400 font-mono w-6 text-right">${index + 1}.</span>
            <input type="text" placeholder="Nama Siswa" value="${encodeHTML(student.name)}" class="student-name-input flex-1 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition" data-index="${index}" />
            <input type="email" placeholder="Email Orang Tua (Opsional)" value="${encodeHTML(student.parentEmail || '')}" class="student-email-input flex-1 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition" data-index="${index}" />
            <button class="remove-student-btn text-red-400 hover:text-red-600 p-2" data-index="${index}" title="Hapus Baris"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
        `;
        container.appendChild(div);
    });

    document.querySelectorAll('.student-name-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            state.newStudents[idx].name = e.target.value;
        });
    });
    
    document.querySelectorAll('.student-email-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            state.newStudents[idx].parentEmail = e.target.value;
        });
    });

    document.querySelectorAll('.remove-student-btn').forEach(btn => {
        btn.addEventListener('click', removeStudentInputRow);
    });
}

function addStudentInputRow() {
    state.newStudents.push({ name: '', parentEmail: '' });
    renderStudentInputRows();
}

function removeStudentInputRow(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    if (state.newStudents.length > 1) {
        state.newStudents.splice(index, 1);
        renderStudentInputRows();
    } else {
        showNotification('Minimal satu baris siswa diperlukan.', 'error');
    }
}

async function filterAndRenderHistory() {
    const { historyClassFilter, dataScreenFilters, adminAllLogsView } = state;
    
    showLoader('Memuat data...');
    try {
        const payload = { 
            isClassSpecific: !!historyClassFilter, 
            classFilter: historyClassFilter, 
            isGlobalView: adminAllLogsView,
            schoolId: state.adminActingAsSchool?.id || state.userProfile.school_id
        };
        const { allLogs } = await apiService.getHistoryData(payload);
        
        state.allHistoryLogs = allLogs;
        
        const filtered = allLogs.filter(log => {
            const matchName = dataScreenFilters.studentName ? Object.keys(log.attendance).some(name => name.toLowerCase().includes(dataScreenFilters.studentName.toLowerCase())) : true;
            const matchStatus = dataScreenFilters.status !== 'all' ? Object.values(log.attendance).includes(dataScreenFilters.status) : true;
            const logDate = new Date(log.date);
            const matchStart = dataScreenFilters.startDate ? logDate >= new Date(dataScreenFilters.startDate) : true;
            const matchEnd = dataScreenFilters.endDate ? logDate <= new Date(dataScreenFilters.endDate) : true;
            return matchName && matchStatus && matchStart && matchEnd;
        });

        const container = document.getElementById('data-container');
        if (container) {
            container.innerHTML = filtered.length ? filtered.map(log => {
                const dateObj = new Date(log.date);
                const dateStr = dateObj.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                const statuses = Object.values(log.attendance);
                const s = statuses.filter(x => x === 'S').length;
                const i = statuses.filter(x => x === 'I').length;
                const a = statuses.filter(x => x === 'A').length;
                const h = statuses.filter(x => x === 'H').length;
                const isHoliday = statuses.every(x => x === 'L');

                return `
                <div class="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md transition mb-4">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h3 class="font-bold text-slate-800 text-lg">Kelas ${encodeHTML(log.class)}</h3>
                            <p class="text-slate-500 text-sm">${dateStr}</p>
                            <p class="text-xs text-slate-400 mt-1">Dicatat oleh: ${encodeHTML(log.teacherName || 'Guru')}</p>
                        </div>
                        ${isHoliday 
                            ? `<span class="bg-orange-100 text-orange-800 text-xs font-bold px-3 py-1 rounded-full">LIBUR</span>`
                            : `<div class="flex gap-2 text-xs font-bold">
                                <span class="bg-green-100 text-green-800 px-2 py-1 rounded">H: ${h}</span>
                                <span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">S: ${s}</span>
                                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded">I: ${i}</span>
                                <span class="bg-red-100 text-red-800 px-2 py-1 rounded">A: ${a}</span>
                               </div>`
                        }
                    </div>
                    <div class="mt-3 border-t border-slate-100 pt-2">
                        <button class="text-blue-600 hover:text-blue-800 text-sm font-semibold edit-log-btn" data-class="${log.class}" data-date="${log.date}">Edit Absensi</button>
                    </div>
                </div>`;
            }).join('') : '<div class="text-center py-10 text-slate-500">Tidak ada data ditemukan.</div>';
            
            document.querySelectorAll('.edit-log-btn').forEach(btn => {
                btn.onclick = () => {
                    handleStartAttendance(btn.dataset.class, btn.dataset.date);
                };
            });
        }
    } catch(e) {
        showNotification("Gagal memuat riwayat: " + e.message, 'error');
    } finally {
        hideLoader();
    }
}

function renderDataScreen() {
    appContainer.innerHTML = templates.data();
    if (state.historyClassFilter) {
        document.getElementById('data-title').textContent = `Riwayat Absensi Kelas ${state.historyClassFilter}`;
    } else {
        document.getElementById('data-title').textContent = `Riwayat Absensi Semua Kelas`;
    }
    
    document.getElementById('data-back-to-start-btn').addEventListener('click', () => navigateTo(state.adminAllLogsView ? 'adminPanel' : 'setup'));
    document.getElementById('clear-filters-btn').addEventListener('click', () => {
        state.dataScreenFilters = { studentName: '', status: 'all', startDate: '', endDate: '' };
        document.getElementById('filter-student-name').value = '';
        document.getElementById('filter-status').value = 'all';
        document.getElementById('filter-start-date').value = '';
        document.getElementById('filter-end-date').value = '';
        filterAndRenderHistory();
    });

    ['filter-student-name', 'filter-status', 'filter-start-date', 'filter-end-date'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            if (id === 'filter-student-name') state.dataScreenFilters.studentName = e.target.value;
            if (id === 'filter-status') state.dataScreenFilters.status = e.target.value;
            if (id === 'filter-start-date') state.dataScreenFilters.startDate = e.target.value;
            if (id === 'filter-end-date') state.dataScreenFilters.endDate = e.target.value;
            filterAndRenderHistory();
        });
    });

    filterAndRenderHistory();
}

function generateSemesterOptions() {
    const currentYear = new Date().getFullYear();
    return [
        { label: `Semester Ganjil ${currentYear}/${currentYear+1}`, value: `${currentYear}-1` },
        { label: `Semester Genap ${currentYear}/${currentYear+1}`, value: `${currentYear}-2` },
        { label: `Semester Genap ${currentYear-1}/${currentYear}`, value: `${currentYear-1}-2` },
    ];
}

function renderRecapScreen() {
    appContainer.innerHTML = templates.recap();
    const container = document.getElementById('recap-container');
    const headerEl = document.querySelector('h1'); // Find the H1
    
    // Add Period Selector
    const periodSelect = document.createElement('select');
    periodSelect.className = "ml-4 p-2 border rounded text-sm";
    generateSemesterOptions().forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (state.recapPeriod === opt.value) option.selected = true;
        periodSelect.appendChild(option);
    });
    // Set default if null
    if (!state.recapPeriod) {
        const today = new Date();
        const m = today.getMonth();
        const y = today.getFullYear();
        state.recapPeriod = (m >= 6) ? `${y}-1` : `${y}-2`;
        periodSelect.value = state.recapPeriod;
    }
    
    periodSelect.onchange = (e) => {
        state.recapPeriod = e.target.value;
        loadRecap();
    };
    headerEl.parentNode.insertBefore(periodSelect, headerEl.nextSibling);

    const loadRecap = async () => {
        showLoader('Menghitung rekap...');
        try {
            const [year, sem] = state.recapPeriod.split('-').map(Number);
            let startDate, endDate;
            if (sem === 1) { // Ganjil: July - Dec
                startDate = `${year}-07-01`;
                endDate = `${year}-12-31`;
            } else { // Genap: Jan - June
                startDate = `${year}-01-01`;
                endDate = `${year}-06-30`;
            }

            const payload = { 
                classFilter: state.selectedClass, 
                schoolId: state.adminActingAsSchool?.id || state.userProfile.school_id,
                startDate,
                endDate
            };
            
            const { recapData } = await apiService.getRecapData(payload);
            
            if (state.recapSortOrder === 'total') {
                recapData.sort((a, b) => b.total - a.total);
            } else {
                recapData.sort((a, b) => (a.originalIndex || 0) - (b.originalIndex || 0));
            }

            if (recapData.length === 0) {
                container.innerHTML = '<div class="text-center py-10 text-slate-500">Belum ada data absensi untuk periode ini.</div>';
            } else {
                let html = `
                    <div class="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
                    <table class="min-w-full bg-white text-sm">
                        <thead class="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th class="py-3 px-4 text-left font-semibold text-slate-600">No</th>
                                <th class="py-3 px-4 text-left font-semibold text-slate-600">Nama Siswa</th>
                                <th class="py-3 px-4 text-center font-semibold text-yellow-600">Sakit</th>
                                <th class="py-3 px-4 text-center font-semibold text-blue-600">Izin</th>
                                <th class="py-3 px-4 text-center font-semibold text-red-600">Alpa</th>
                                <th class="py-3 px-4 text-center font-semibold text-slate-800">Total Absen</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                `;
                html += recapData.map((s, i) => `
                    <tr class="hover:bg-slate-50">
                        <td class="py-2 px-4 text-slate-500">${i + 1}</td>
                        <td class="py-2 px-4 font-medium text-slate-800">${encodeHTML(s.name)}</td>
                        <td class="py-2 px-4 text-center">${s.S > 0 ? `<span class="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded font-bold">${s.S}</span>` : '-'}</td>
                        <td class="py-2 px-4 text-center">${s.I > 0 ? `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">${s.I}</span>` : '-'}</td>
                        <td class="py-2 px-4 text-center">${s.A > 0 ? `<span class="bg-red-100 text-red-800 px-2 py-0.5 rounded font-bold">${s.A}</span>` : '-'}</td>
                        <td class="py-2 px-4 text-center font-bold text-slate-700">${s.total}</td>
                    </tr>
                `).join('');
                html += `</tbody></table></div>`;
                container.innerHTML = html;
            }
        } catch (e) {
            showNotification(e.message, 'error');
        } finally {
            hideLoader();
        }
    };

    loadRecap();

    document.getElementById('recap-back-to-start-btn').addEventListener('click', () => navigateTo('setup'));
    document.getElementById('sort-by-total-btn').addEventListener('click', () => { state.recapSortOrder = 'total'; renderRecapScreen(); });
    document.getElementById('sort-by-absen-btn').addEventListener('click', () => { state.recapSortOrder = 'absen'; renderRecapScreen(); });
}

function renderJurisdictionPanelScreen() {
    appContainer.innerHTML = templates.jurisdictionPanel();
    document.getElementById('jurisdiction-panel-back-btn').addEventListener('click', () => navigateTo('multiRoleHome'));
    
    const treeContainer = document.getElementById('jurisdiction-tree-container');
    const detailsContainer = document.getElementById('jurisdiction-details-container');
    
    // Load Tree
    const loadTree = async () => {
        try {
            const { tree } = await apiService.getJurisdictionTree();
            const renderNodes = (nodes, level = 0) => {
                let html = '';
                nodes.forEach(node => {
                    html += `
                        <div class="ml-${level * 2} mb-1">
                            <button class="w-full text-left p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 flex justify-between items-center group jur-node-btn" data-id="${node.id}">
                                <span class="text-sm font-medium text-slate-700 group-hover:text-blue-600">${encodeHTML(node.name)}</span>
                                <span class="text-xs text-slate-400 bg-slate-100 px-1 rounded">${node.type}</span>
                            </button>
                            ${node.children.length > 0 ? `<div class="border-l-2 border-slate-200 ml-2 pl-1 mt-1 space-y-1">${renderNodes(node.children, level + 1)}</div>` : ''}
                        </div>
                    `;
                });
                return html;
            };
            treeContainer.innerHTML = renderNodes(tree);
            
            document.querySelectorAll('.jur-node-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    loadDetails(id);
                });
            });
        } catch (e) {
            treeContainer.innerHTML = '<p class="text-red-500 text-xs">Gagal memuat data.</p>';
        }
    };

    const loadDetails = async (id) => {
        showLoader('Memuat detail...');
        try {
            // We reuse getJurisdictionTree to find the specific node for details (client-side find is simpler here)
            // Ideally, an endpoint like getJurisdiction(id) exists, but we can search the tree.
            // For now, let's fetch schools.
            const { assignedSchools, unassignedSchools } = await apiService.getSchoolsForJurisdiction(id);
            
            detailsContainer.innerHTML = `
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <h2 class="text-xl font-bold text-slate-800">Detail Wilayah</h2>
                        <p class="text-slate-500 text-sm">ID: ${id}</p>
                    </div>
                    <div class="flex gap-2">
                        <button id="assign-school-modal-btn" class="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700">Kelola Sekolah</button>
                        <button id="delete-jur-btn" class="bg-red-100 text-red-600 px-3 py-1.5 rounded text-sm hover:bg-red-200">Hapus Wilayah</button>
                    </div>
                </div>
                <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <h3 class="font-bold text-slate-700 mb-2">Sekolah Terdaftar (${assignedSchools.length})</h3>
                    ${assignedSchools.length === 0 ? '<p class="text-slate-400 text-sm">Belum ada sekolah.</p>' : 
                        `<ul class="grid grid-cols-1 md:grid-cols-2 gap-2">${assignedSchools.map(s => `<li class="bg-white p-2 rounded border border-slate-200 text-sm text-slate-700">${encodeHTML(s.name)}</li>`).join('')}</ul>`
                    }
                </div>
            `;
            
            document.getElementById('assign-school-modal-btn').onclick = () => {
                const modal = document.createElement('div');
                modal.innerHTML = templates.assignSchoolsModal('Wilayah Ini', assignedSchools, unassignedSchools);
                document.body.appendChild(modal);
                
                document.getElementById('assign-schools-close-btn').onclick = () => { modal.remove(); loadDetails(id); };
                
                document.querySelectorAll('.assign-school-btn').forEach(btn => {
                    btn.onclick = async (e) => {
                        const sId = e.currentTarget.dataset.schoolId;
                        await apiService.assignSchoolToJurisdiction(sId, id);
                        e.currentTarget.parentElement.remove();
                    };
                });
                
                document.querySelectorAll('.unassign-school-btn').forEach(btn => {
                    btn.onclick = async (e) => {
                        const sId = e.currentTarget.dataset.schoolId;
                        await apiService.assignSchoolToJurisdiction(sId, null); // Unassign
                        e.currentTarget.parentElement.remove();
                    };
                });
            };

            document.getElementById('delete-jur-btn').onclick = async () => {
                if (await showConfirmation('Hapus wilayah ini? Pastikan tidak ada sub-wilayah atau sekolah tertaut.')) {
                    try {
                        await apiService.deleteJurisdiction(id);
                        showNotification('Berhasil dihapus.');
                        loadTree();
                        detailsContainer.innerHTML = '';
                    } catch (e) {
                        showNotification(e.message, 'error');
                    }
                }
            };

        } catch(e) {
            console.error(e);
        } finally {
            hideLoader();
        }
    };

    document.getElementById('add-jurisdiction-btn').addEventListener('click', async () => {
        // Need to pass full flat list for parent selection?
        // Using tree for now to flatten.
        showLoader('Menyiapkan...');
        const { tree } = await apiService.getJurisdictionTree();
        hideLoader();
        
        const modal = document.createElement('div');
        modal.innerHTML = templates.manageJurisdictionModal(null, tree); // Flatten logic inside template helper
        document.body.appendChild(modal);
        
        document.getElementById('jur-modal-cancel-btn').onclick = () => modal.remove();
        document.getElementById('jur-modal-save-btn').onclick = async () => {
            const name = document.getElementById('jur-name').value;
            const type = document.getElementById('jur-type').value;
            const parentId = document.getElementById('jur-parent').value;
            
            try {
                await apiService.createJurisdiction(name, type, parentId);
                showNotification('Berhasil dibuat.');
                modal.remove();
                loadTree();
            } catch(e) {
                showNotification(e.message, 'error');
            }
        };
    });

    loadTree();
}

function renderParentDashboardScreen() {
    appContainer.innerHTML = templates.parentDashboard();
    document.getElementById('parent-dashboard-back-btn').addEventListener('click', () => navigateTo('multiRoleHome'));
    
    const loadParentData = async () => {
        try {
            const { parentData } = await apiService.getParentData();
            await setState({ parentDashboard: { isLoading: false, data: parentData } });
            // Re-render only content part to avoid flicker? Or full screen.
            // Simplified: Re-render screen content logic is inside template via state check, so re-call render.
            appContainer.innerHTML = templates.parentDashboard();
            document.getElementById('parent-dashboard-back-btn').addEventListener('click', () => navigateTo('multiRoleHome'));
        } catch (e) {
            console.error(e);
            showNotification("Gagal memuat data anak.", 'error');
        }
    };
    
    if (state.parentDashboard.isLoading) {
        loadParentData();
    }
}

function renderMigrationToolScreen() {
    appContainer.innerHTML = templates.migrationTool();
    document.getElementById('migration-back-btn').addEventListener('click', () => navigateTo('multiRoleHome'));
    document.getElementById('migrate-data-btn').addEventListener('click', handleMigrateLegacyData);
}

// --- MODIFIED RENDER FUNCTIONS ---

function renderAttendanceScreen() {
    appContainer.innerHTML = templates.attendance(state.selectedClass, state.selectedDate);
    const tbody = document.getElementById('attendance-table-body');
    tbody.innerHTML = state.students.map((student, index) => {
        const status = state.attendance[student.name] || 'H';
        return `<tr class="border-b hover:bg-slate-50">
            <td class="p-3 text-sm text-slate-500">${index + 1}</td>
            <td class="p-3 font-medium text-slate-800">${encodeHTML(student.name)}</td>
            ${['H', 'S', 'I', 'A', 'L'].map(s => `
                <td class="p-3 text-center">
                    <input type="radio" name="status-${index}" value="${s}" class="w-5 h-5 accent-blue-500" ${status === s ? 'checked' : ''} data-student-name="${student.name}">
                </td>
            `).join('')}
        </tr>`;
    }).join('');

    tbody.addEventListener('change', (e) => {
        if (e.target.type === 'radio') {
            state.attendance[e.target.dataset.studentName] = e.target.value;
        }
    });

    document.getElementById('back-to-setup-btn').addEventListener('click', () => navigateTo('setup'));
    document.getElementById('save-attendance-btn').addEventListener('click', handleSaveAttendance);
    document.getElementById('mark-holiday-btn').addEventListener('click', handleMarkClassAsHoliday);
}

function renderHolidaySettingsScreen() {
    appContainer.innerHTML = templates.holidaySettings();
    document.getElementById('settings-back-btn').addEventListener('click', () => navigateTo('multiRoleHome'));
    
    // --- Logic for Super Admin Context Selector ---
    const settingsPanel = document.querySelector('.bg-white.rounded-xl.border.p-6.shadow-sm');
    if (state.userProfile.primaryRole === 'SUPER_ADMIN') {
        if (!state.adminActingAsSchool) {
            if (settingsPanel) {
                settingsPanel.innerHTML = `
                    <h2 class="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                         <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                         Hari Sekolah Aktif
                    </h2>
                    <p class="text-sm text-slate-500 mb-4">Silakan pilih sekolah terlebih dahulu untuk mengatur hari kerja spesifik.</p>
                    <button id="select-school-config-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition">Pilih Sekolah</button>
                `;
                document.getElementById('select-school-config-btn').addEventListener('click', handleSelectSchoolForConfig);
            }
        } else {
            // Update Title to reflect context
            const titleEl = settingsPanel.querySelector('h2');
            if (titleEl) {
                titleEl.innerHTML += ` <span class="ml-2 text-sm font-normal text-blue-600 bg-blue-50 px-2 py-1 rounded">(${encodeHTML(state.adminActingAsSchool.name)})</span>`;
                // Add button to change school
                const changeBtn = document.createElement('button');
                changeBtn.className = "text-xs text-blue-500 hover:underline ml-auto block mt-2";
                changeBtn.textContent = "Ganti Sekolah";
                changeBtn.onclick = handleSelectSchoolForConfig;
                titleEl.parentNode.insertBefore(changeBtn, titleEl.nextSibling);
            }
        }
    }
    // --- End Logic ---

    // School Settings (Work Days)
    const workDayCheckboxes = document.querySelectorAll('.work-day-checkbox');
    const saveSettingsBtn = document.getElementById('save-school-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const selectedDays = Array.from(workDayCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => parseInt(cb.value));
            handleSaveSchoolSettings(selectedDays);
        });
    }

    // Holiday Management
    document.getElementById('add-holiday-btn').addEventListener('click', () => {
        document.getElementById('add-holiday-modal').classList.remove('hidden');
    });
    document.getElementById('cancel-holiday-modal').addEventListener('click', () => {
        document.getElementById('add-holiday-modal').classList.add('hidden');
    });
    
    document.getElementById('confirm-add-holiday').addEventListener('click', async () => {
        const date = document.getElementById('new-holiday-date').value;
        const desc = document.getElementById('new-holiday-desc').value;
        const success = await handleManageHoliday('ADD', date, desc);
        if (success) {
            document.getElementById('add-holiday-modal').classList.add('hidden');
            renderScreen('holidaySettings'); // Re-render to show new holiday
        }
    });

    document.querySelectorAll('.delete-holiday-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            const confirmed = await showConfirmation('Anda yakin ingin menghapus libur ini?');
            if (confirmed) {
                await handleManageHoliday('DELETE', null, null, id);
                renderScreen('holidaySettings');
            }
        });
    });
}

// --- MAIN RENDERER (Updated Switch) ---

export function renderScreen(screen) {
    appContainer.innerHTML = '';
    
    const screenRenderers = {
        'landingPage': renderLandingPageScreen,
        'setup': renderSetupScreen,
        'multiRoleHome': renderMultiRoleHomeScreen,
        'dashboard': renderDashboardScreen,
        'parentDashboard': renderParentDashboardScreen,
        'adminPanel': renderAdminPanelScreen,
        'jurisdictionPanel': renderJurisdictionPanelScreen,
        'migrationTool': renderMigrationToolScreen,
        'add-students': renderAddStudentsScreen,
        'attendance': renderAttendanceScreen,
        'holidaySettings': renderHolidaySettingsScreen, // New Screen
        'success': () => {
             appContainer.innerHTML = templates.success();
             document.getElementById('success-back-to-start-btn').addEventListener('click', () => {
                 setState({ lastSaveContext: null }); 
                 navigateTo('setup');
             });
             document.getElementById('success-view-data-btn').addEventListener('click', () => {
                 const classToView = state.lastSaveContext?.className || state.selectedClass;
                 setState({ lastSaveContext: null }); 
                 handleViewHistory(classToView);
             });
        },
        'data': renderDataScreen,
        'recap': renderRecapScreen,
    };

    (screenRenderers[screen] || renderLandingPageScreen)();
    hideLoader();
}

export function stopAllPollers() {
    if (state.dashboard.polling.timeoutId) {
        clearTimeout(state.dashboard.polling.timeoutId);
        setState({ dashboard: { ...state.dashboard, polling: { ...state.dashboard.polling, timeoutId: null } } });
        console.log('Dashboard polling stopped.');
    }
    if (state.adminPanel.polling.timeoutId) {
        clearTimeout(state.adminPanel.polling.timeoutId);
        setState({ adminPanel: { ...state.adminPanel, polling: { ...state.adminPanel.polling, timeoutId: null } } });
        console.log('Admin Panel polling stopped.');
    }
    if (state.setup.polling.timeoutId) {
        clearTimeout(state.setup.polling.timeoutId);
        setState({ setup: { ...state.setup, polling: { ...state.setup.polling, timeoutId: null } } });
        console.log('Setup Screen (Teacher) polling stopped.');
    }
}

export function resumePollingForCurrentScreen() {
    if (!state.userProfile) return; 

    console.log(`Page is visible again. Resuming polling for screen: ${state.currentScreen}`);
    
    switch (state.currentScreen) {
        case 'dashboard':
            setState({ dashboard: { ...state.dashboard, polling: { ...state.dashboard.polling, interval: INITIAL_POLLING_INTERVAL } } });
            dashboardPoller();
            break;
        case 'adminPanel':
            setState({ adminPanel: { ...state.adminPanel, polling: { ...state.adminPanel.polling, interval: INITIAL_POLLING_INTERVAL } } });
            adminPanelPoller();
            break;
        case 'setup':
             if (state.userProfile.primaryRole === 'GURU') {
                setState({ setup: { ...state.setup, polling: { ...state.setup.polling, interval: INITIAL_POLLING_INTERVAL } } });
                teacherProfilePoller();
             }
            break;
        default:
            break;
    }
}
