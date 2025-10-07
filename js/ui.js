import { state, setState, navigateTo, handleStartAttendance, handleManageStudents, handleViewHistory, handleDownloadData, handleSaveNewStudents, handleExcelImport, handleDownloadTemplate, handleSaveAttendance, handleGenerateAiRecommendation, handleCreateSchool, CLASSES, handleViewRecap, handleDownloadFullSchoolReport, handleMigrateLegacyData, handleDownloadJurisdictionReport } from './main.js';
import { templates, getRoleDisplayName, encodeHTML } from './templates.js';
import { handleSignOut, renderSignInButton } from './auth.js';
import { apiService } from './api.js';

const appContainer = document.getElementById('app-container');
const loaderWrapper = document.getElementById('loader-wrapper');
const notificationEl = document.getElementById('notification');
const offlineIndicator = document.getElementById('offline-indicator');

// --- POLLING & PAGINATION CONFIGURATION ---
// New: Exponential backoff sequence for polling intervals as requested.
const POLLING_BACKOFF_SEQUENCE = [10000, 20000, 40000, 80000, 150000, 300000];
const INITIAL_POLLING_INTERVAL = POLLING_BACKOFF_SEQUENCE[0]; // Start with 10 seconds
const USERS_PER_PAGE = 10;

function getNextInterval(currentInterval) {
    const currentIndex = POLLING_BACKOFF_SEQUENCE.indexOf(currentInterval);
    // If the current interval isn't found, or if it's already the last one, stay at the max interval.
    if (currentIndex === -1 || currentIndex >= POLLING_BACKOFF_SEQUENCE.length - 1) {
        return POLLING_BACKOFF_SEQUENCE[POLLING_BACKOFF_SEQUENCE.length - 1];
    }
    // Return the next interval in the sequence.
    return POLLING_BACKOFF_SEQUENCE[currentIndex + 1];
}


export function showLoader(message) {
    loaderWrapper.querySelector('.loader-text').textContent = message;
    loaderWrapper.style.display = 'flex';
    setTimeout(() => loaderWrapper.style.opacity = '1', 10);
}

export function updateLoaderText(message) {
    const loaderText = loaderWrapper.querySelector('.loader-text');
    if (loaderText) {
        loaderText.textContent = message;
    }
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

    // --- NEW LOGIC ---
    // If no error object is passed, we assume the 'message' is pre-formatted, trusted HTML.
    // This allows for richer, diagnostic error messages from the auth module.
    if (error === null) {
        errorContainer.innerHTML = message;
        errorContainer.classList.remove('hidden');
        return;
    }

    // --- EXISTING LOGIC for when an actual error object is passed ---
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
         // Fallback to generic message encoding for safety
         let details = error.message || (typeof error === 'string' ? error : JSON.stringify(error));
         details = encodeHTML(details); // Sanitize error details
         errorContainer.innerHTML = `<div class="bg-red-50 p-3 rounded-lg border border-red-200"><p class="text-red-700 font-semibold">${encodeHTML(message)}</p><p class="text-slate-500 text-xs mt-2">${details}</p></div>`;
    }
    errorContainer.classList.remove('hidden');
}

// --- NEW: Extracted teacher profile poller for reusability ---
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
            renderScreen('setup'); // This re-render will re-trigger the poller.
            return; 
        }
    } catch (error) {
        console.error("Failed to poll teacher profile:", error);
    }

    const newTimeoutId = setTimeout(teacherProfilePoller, state.setup.polling.interval);
    // Use direct state mutation here for simplicity as setState would be overly complex
    // and this is an internal-only state update for the poller's own management.
    state.setup.polling.timeoutId = newTimeoutId;
    state.setup.polling.interval = nextInterval;
}


function renderLandingPageScreen() {
    appContainer.innerHTML = templates.landingPage();
    // This call is crucial. It ensures the button is re-rendered
    // every time the landing page is shown, especially after a logout.
    renderSignInButton();

    // This logic clears the one-time logout message after it has been displayed.
    if (state.logoutMessage) {
        // Use a timeout to ensure the state change happens after the current render cycle.
        setTimeout(() => {
            setState({ logoutMessage: null });
        }, 0);
    }
}

function renderSetupScreen() {
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
        document.getElementById('startBtn').addEventListener('click', handleStartAttendance);
        document.getElementById('historyBtn').addEventListener('click', () => handleViewHistory(true));
        document.getElementById('recapBtn').addEventListener('click', handleViewRecap);
        document.getElementById('manageStudentsBtn').addEventListener('click', handleManageStudents);
        document.getElementById('downloadDataBtn').addEventListener('click', handleDownloadData);

        const availableClasses = isAdmin ? CLASSES : (state.userProfile?.assigned_classes || []);
        document.getElementById('class-select').value = state.selectedClass || availableClasses[0] || '';
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

    // Event listeners for action cards
    document.getElementById('go-to-attendance-btn')?.addEventListener('click', async () => {
        if (isSuperAdmin) {
            const selectedSchool = await showSchoolSelectorModal('Pilih Sekolah untuk Absensi');
            if (selectedSchool) {
                // --- FIX: Ensure dashboard context is reset when entering a new context ---
                await setState({ 
                    adminActingAsSchool: selectedSchool, 
                    adminActingAsJurisdiction: null,
                    dashboard: { 
                        ...state.dashboard, 
                        data: null, 
                        isLoading: true,
                        aiRecommendation: { isLoading: false, result: null, error: null, selectedRange: 'last30days' }
                    }  
                });
                navigateTo('setup');
            }
        } else {
            navigateTo('setup');
        }
    });

    // Dashboard button for non-Super Admin roles
    document.getElementById('view-dashboard-btn')?.addEventListener('click', async () => {
        await setState({ dashboard: { ...state.dashboard, activeView: 'report' } });
        navigateTo('dashboard');
        dashboardPoller();
    });

    // Super Admin: School-context dashboard button
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

    // Super Admin: Jurisdiction-context dashboard button
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
    
    // Scoped Report Download Button (for non-Super Admins)
    document.getElementById('download-scoped-report-btn')?.addEventListener('click', () => {
        if (isDinas) {
            handleDownloadJurisdictionReport(state.userProfile.jurisdiction_id, state.userProfile.jurisdiction_name);
        } else { // Kepala Sekolah, Admin Sekolah
            handleDownloadFullSchoolReport();
        }
    });

    // Super Admin Report Download Buttons
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

    if (isSuperAdmin) {
        document.getElementById('go-to-migration-tool-btn')?.addEventListener('click', () => navigateTo('migrationTool'));
    }
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

function createCustomDatePicker(wrapper, initialDateStr, mode) {
    const displayInput = wrapper.querySelector('#ks-date-display');
    const popup = wrapper.querySelector('#ks-datepicker-popup');
    if (!displayInput || !popup) return;
    
    let viewDate = new Date(initialDateStr + 'T00:00:00');

    function renderCalendar() {
        popup.innerHTML = '';
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const selectedDate = new Date(state.dashboard.selectedDate + 'T00:00:00');
        
        let weekStart, weekEnd;
        if (mode === 'weekly') {
            const d = new Date(selectedDate);
            const dayOfWeek = d.getDay();
            const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            weekStart = new Date(d.setDate(diff));
            weekEnd = new Date(new Date(weekStart).setDate(weekStart.getDate() + 6));
            weekStart.setHours(0,0,0,0);
            weekEnd.setHours(0,0,0,0);
        }

        const header = document.createElement('div');
        header.className = 'datepicker-header';
        header.innerHTML = `
            <button class="nav-btn prev-month">&lt;</button>
            <span class="month-year">${viewDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span>
            <button class="nav-btn next-month">&gt;</button>
        `;

        const table = document.createElement('table');
        table.className = 'datepicker-grid';
        table.innerHTML = `
            <thead><tr><th>Min</th><th>Sen</th><th>Sel</th><th>Rab</th><th>Kam</th><th>Jum</th><th>Sab</th></tr></thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        let date = 1;
        for (let i = 0; i < 6; i++) {
            const row = document.createElement('tr');
            for (let j = 0; j < 7; j++) {
                const cell = document.createElement('td');
                if (i === 0 && j < firstDayOfMonth) {
                    // Empty cells for previous month
                } else if (date > daysInMonth) {
                    // Empty cells for next month
                } else {
                    const dayButton = document.createElement('button');
                    const currentDate = new Date(year, month, date);
                    let dayClasses = ['day'];
                    dayButton.disabled = false;

                    if (currentDate > today) {
                        dayClasses.push('disabled-future');
                        dayButton.disabled = true;
                    }
                    
                    if (!dayButton.disabled) {
                        if (currentDate.getTime() === today.getTime()) dayClasses.push('today');
                        if (currentDate.getTime() === selectedDate.getTime()) dayClasses.push('selected');
                        
                        if (mode === 'weekly' && currentDate >= weekStart && currentDate <= weekEnd) {
                            dayClasses.push('in-range');
                            if (currentDate.getTime() === weekStart.getTime()) dayClasses.push('range-start');
                            if (currentDate.getTime() === weekEnd.getTime()) dayClasses.push('range-end');
                        } else if (mode === 'monthly') {
                            const selectedMonth = selectedDate.getMonth();
                            const selectedYear = selectedDate.getFullYear();
                            if (currentDate.getMonth() === selectedMonth && currentDate.getFullYear() === selectedYear) {
                                dayClasses.push('in-range');
                            }
                        }
                    }
                    
                    dayButton.className = dayClasses.join(' ');
                    dayButton.textContent = date;
                    dayButton.onclick = async () => {
                        if (dayButton.disabled) return;
                        const newDateStr = currentDate.toISOString().split('T')[0];
                        popup.classList.add('hidden');
                        await setState({ dashboard: { ...state.dashboard, selectedDate: newDateStr, isLoading: true } });
                        renderDashboardScreen();
                        dashboardPoller(); // Trigger poll after date change
                    };
                    cell.appendChild(dayButton);
                    date++;
                }
                row.appendChild(cell);
            }
            tbody.appendChild(row);
        }

        popup.appendChild(header);
        popup.appendChild(table);

        header.querySelector('.prev-month').onclick = () => { viewDate.setMonth(viewDate.getMonth() - 1); renderCalendar(); };
        header.querySelector('.next-month').onclick = () => { viewDate.setMonth(viewDate.getMonth() + 1); renderCalendar(); };
    }

    displayInput.onclick = (e) => { e.stopPropagation(); popup.classList.toggle('hidden'); if (!popup.classList.contains('hidden')) renderCalendar(); };
    document.addEventListener('click', (e) => { if (!wrapper.contains(e.target)) popup.classList.add('hidden'); });
}

// --- REFACTORED: New calculation function to include "Unreported" students ---
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
            startDate = new Date(d.getFullYear(), 6, 1); // July 1
            endDate = new Date(d.getFullYear(), 11, 31); // Dec 31
            break;
        case 'semester2':
            startDate = new Date(d.getFullYear(), 0, 1); // Jan 1
            endDate = new Date(d.getFullYear(), 5, 30); // June 30
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
        // For a single day, the denominator is always the total number of students in scope.
        percentageDenominator = numStudentsInScope;
    } else {
        // For ranges, it's students * days where at least one report was filed.
        // This is an approximation, but the best we can do without knowing all school days.
        const uniqueSchoolDays = new Set(relevantLogs.map(log => log.date)).size;
        percentageDenominator = uniqueSchoolDays * numStudentsInScope;
    }
    
    const totalReported = finalCounts.H + finalCounts.S + finalCounts.I + finalCounts.A;
    const unreported = Math.max(0, percentageDenominator - totalReported);
    finalCounts.Unreported = unreported;

    return {
        finalCounts,
        percentageDenominator: percentageDenominator > 0 ? percentageDenominator : numStudentsInScope, // Fallback for empty ranges
    };
}

// --- NEW: Completely refactored function to handle both regional and school views ---
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

    // Render Report View
    if (activeView === 'report' && data.schoolInfo && data.allLogsForYear) {
        // --- NEW: Calculate summary stats on the frontend for consistency ---
        const dailyStats = calculatePercentageData(data.allLogsForYear, 'daily', 'all', data.schoolInfo, selectedDate, isRegionalView);
        const summaryStats = {
            totalStudents: data.schoolInfo.totalStudents || 0,
            totalPresent: dailyStats.finalCounts.H,
            S: dailyStats.finalCounts.S,
            I: dailyStats.finalCounts.I,
            A: dailyStats.finalCounts.A,
        };
        // --- END of new logic ---

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
                detailedReportHtml = `<h2 class="text-lg font-bold text-slate-700 mb-4">Laporan Kehadiran Harian</h2><div class="space-y-4">${classCompletionStatus.map(item=>item.isSubmitted?item.allPresent?`<div class="bg-green-50 p-4 rounded-lg border border-green-200"><div class="flex justify-between items-center"><h3 class="font-bold text-green-700">Kelas ${encodeHTML(item.className)}</h3><p class="text-xs text-slate-400 font-medium">Oleh: ${encodeHTML(item.teacherName)}</p></div><p class="text-sm text-green-600 mt-2 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg> Semua siswa hadir.</p></div>`:`<div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm"><div class="flex justify-between items-center mb-2"><h3 class="font-bold text-blue-600">Kelas ${encodeHTML(item.className)}</h3><p class="text-xs text-slate-400 font-medium">Oleh: ${encodeHTML(item.teacherName)}</p></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-slate-500"><th class="py-1 pr-4 font-medium">Nama Siswa</th><th class="py-1 px-2 font-medium">Status</th></tr></thead><tbody>${item.absentStudents.map(s=>`<tr class="border-t border-slate-200"><td class="py-2 pr-4 text-slate-700">${encodeHTML(s.name)}</td><td class="py-2 px-2"><span class="px-2 py-1 rounded-full text-xs font-semibold ${s.status==='S'?'bg-yellow-100 text-yellow-800':s.status==='I'?'bg-blue-100 text-blue-800':'bg-red-100 text-red-800'}">${s.status}</span></td></tr>`).join('')}</tbody></table></div></div>`:`<div class="bg-slate-100 p-4 rounded-lg border border-slate-200"><div class="flex justify-between items-center"><h3 class="font-bold text-slate-600">Kelas ${encodeHTML(item.className)}</h3><span class="px-2 py-1 text-xs font-semibold bg-slate-200 text-slate-600 rounded-full">Belum Diisi</span></div><p class="text-sm text-slate-500 mt-2">Guru belum melakukan absensi.</p></div>`).join('')}</div>`;
            }
        }
        reportContent.innerHTML = summaryStatsHtml + detailedReportHtml;
    }

    // Render Percentage View
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
            { label: 'Belum Diisi', value: finalCounts.Unreported, color: '#94a3b8' } // slate-400
        ];
        const chartCanvas = document.getElementById('dashboard-pie-chart');
        if (window.dashboardPieChart instanceof Chart) window.dashboardPieChart.destroy();

        const totalChartValue = Object.values(finalCounts).reduce((a, b) => a + b, 0);

        if (totalChartValue > 0 && chartCanvas) {
            chartCanvas.style.display = 'block';
            document.getElementById('chart-no-data').classList.add('hidden');
            document.getElementById('custom-legend-container').innerHTML = chartData.map(item => {
                if (item.value === 0) return ''; // Do not show legend item if its value is 0
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

    // Render AI View
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


async function renderDashboardScreen() {
    appContainer.innerHTML = templates.dashboard();
    updateDashboardContent(state.dashboard.data);

    document.getElementById('logoutBtn-ks').addEventListener('click', handleSignOut);
    const backBtn = document.getElementById('dashboard-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => navigateTo(backBtn.dataset.target));
    
    // --- UI ENHANCEMENT: Re-render the whole screen on tab click ---
    ['report', 'percentage', 'ai'].forEach(view => {
        document.getElementById(`db-view-${view}`).addEventListener('click', async () => {
            const updatedDashboardState = { ...state.dashboard, activeView: view };

            // Jika pengguna mengklik tab "Persentase", reset filter ke default.
            if (view === 'percentage') {
                updatedDashboardState.chartViewMode = 'daily';
                updatedDashboardState.chartClassFilter = 'all';
                updatedDashboardState.chartSchoolFilter = 'all';
            }
            
            // Jika pengguna mengklik tab "AI", reset filter dan hasil AI.
            if (view === 'ai') {
                updatedDashboardState.aiRecommendation = {
                    ...state.dashboard.aiRecommendation,
                    selectedRange: 'last30days', // Reset ke default
                    result: null, // Hapus hasil sebelumnya
                    error: null   // Hapus error sebelumnya
                };
            }

            await setState({ dashboard: updatedDashboardState });
            renderDashboardScreen();
        });
    });
    
    const datePickerWrapper = document.getElementById('ks-datepicker-wrapper');
    if (datePickerWrapper) {
        let mode = (state.dashboard.activeView === 'percentage' && (state.dashboard.chartViewMode === 'weekly' || state.dashboard.chartViewMode === 'monthly')) 
            ? state.dashboard.chartViewMode 
            : 'daily';
        createCustomDatePicker(datePickerWrapper, state.dashboard.selectedDate, mode);
    }
}


async function dashboardPoller() {
    if (state.currentScreen !== 'dashboard') return;
    if (state.dashboard.polling.timeoutId) clearTimeout(state.dashboard.polling.timeoutId);

    let nextInterval = getNextInterval(state.dashboard.polling.interval); // Default to backoff

    try {
        let schoolId = null;
        let jurisdictionId = null;

        if (state.userProfile.primaryRole === 'SUPER_ADMIN') {
            schoolId = state.adminActingAsSchool?.id;
            jurisdictionId = state.adminActingAsJurisdiction?.id;
        } else if (['KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(state.userProfile.primaryRole)) {
            schoolId = state.userProfile.school_id;
        } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(state.userProfile.primaryRole)) {
            jurisdictionId = state.userProfile.jurisdiction_id;
        }
        
        const dashboardData = await apiService.getDashboardData({ schoolId, jurisdictionId, selectedDate: state.dashboard.selectedDate });
        
        if (JSON.stringify(dashboardData) !== JSON.stringify(state.dashboard.data) || state.dashboard.isLoading) {
            await setState({ dashboard: { ...state.dashboard, data: dashboardData, isLoading: false } });
            updateDashboardContent(dashboardData);
            nextInterval = INITIAL_POLLING_INTERVAL; // Reset interval on change or initial load
        }

    } catch (error) {
        console.error("Dashboard poll failed:", error);
        showNotification('Gagal memperbarui data dasbor: ' + error.message, 'error');
        if (state.dashboard.isLoading) {
            await setState({ dashboard: { ...state.dashboard, isLoading: false, data: state.dashboard.data || null } });
            updateDashboardContent(state.dashboard.data);
        }
    }
    
    const newTimeoutId = setTimeout(dashboardPoller, state.dashboard.polling.interval);
    await setState({ dashboard: { ...state.dashboard, polling: { timeoutId: newTimeoutId, interval: nextInterval } } });
}


async function renderBulkActionsBar() {
    const container = document.getElementById('admin-bulk-actions-container');
    if (!container) return;
    
    const selectedCount = state.adminPanel.selectedUsers.length;

    if (selectedCount > 0) {
        container.innerHTML = templates.bulkActionsBar(selectedCount);
        
        document.getElementById('bulk-assign-school-btn').addEventListener('click', async () => {
            const selectedSchool = await showSchoolSelectorModal('Tugaskan Pengguna ke Sekolah');
            if (selectedSchool) {
                showLoader(`Menugaskan ${selectedCount} pengguna ke ${selectedSchool.name}...`);
                try {
                    await apiService.updateUsersBulkConfiguration({ targetEmails: state.adminPanel.selectedUsers, newSchoolId: selectedSchool.id });
                    showNotification('Pengguna berhasil ditugaskan.');
                    await setState({ adminPanel: { ...state.adminPanel, selectedUsers: [] } });
                    navigateTo('adminPanel');
                } catch (error) {
                    showNotification(error.message, 'error');
                } finally {
                    hideLoader();
                }
            }
        });
        
        document.getElementById('bulk-change-role-btn').addEventListener('click', async () => {
            const newRole = await showRoleSelectorModal();
            if (newRole) {
                showLoader(`Mengubah peran ${selectedCount} pengguna menjadi ${newRole}...`);
                 try {
                    await apiService.updateUsersBulkConfiguration({ targetEmails: state.adminPanel.selectedUsers, newRole: newRole });
                    showNotification('Peran pengguna berhasil diubah.');
                    await setState({ adminPanel: { ...state.adminPanel, selectedUsers: [] } });
                    navigateTo('adminPanel');
                } catch (error) {
                    showNotification(error.message, 'error');
                } finally {
                    hideLoader();
                }
            }
        });
    } else {
        container.innerHTML = '';
    }
}

function renderAdminPanelTable(container, allUsers, allSchools) {
    const { currentPage, groupBySchool, selectedUsers } = state.adminPanel;
    let usersToRender = [...allUsers];

    if (groupBySchool && state.userProfile.primaryRole === 'SUPER_ADMIN') {
        usersToRender.sort((a, b) => (a.school_name || 'zzz').localeCompare(b.school_name || 'zzz') || a.name.localeCompare(b.name));
    } else {
        usersToRender.sort((a, b) => a.name.localeCompare(b.name));
    }

    const totalPages = Math.ceil(usersToRender.length / USERS_PER_PAGE);
    const validCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1));
    const paginatedUsers = usersToRender.slice((validCurrentPage - 1) * USERS_PER_PAGE, validCurrentPage * USERS_PER_PAGE);
    const allVisibleSelected = paginatedUsers.length > 0 && paginatedUsers.every(u => selectedUsers.includes(u.email));

    let tableHtml = `<table class="w-full text-left"><thead><tr class="border-b bg-slate-50"><th class="p-3 w-12 text-center"><input type="checkbox" id="select-all-users-checkbox" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" ${allVisibleSelected ? 'checked' : ''} /></th><th class="p-3 text-sm font-semibold text-slate-600">Pengguna</th><th class="p-3 text-sm font-semibold text-slate-600">Peran</th><th class="p-3 text-sm font-semibold text-slate-600">Sekolah/Yurisdiksi</th><th class="p-3 text-sm font-semibold text-slate-600 text-center">Tindakan</th></tr></thead><tbody>`;
    
    if (paginatedUsers.length === 0) {
        tableHtml += `<tr><td colspan="5" class="text-center text-slate-500 py-8">Tidak ada pengguna yang cocok.</td></tr>`;
    } else {
        let currentSchoolName = null;
        paginatedUsers.forEach(user => {
            if (groupBySchool && state.userProfile.primaryRole === 'SUPER_ADMIN' && user.school_name !== currentSchoolName) {
                currentSchoolName = user.school_name;
                tableHtml += `<tr class="bg-slate-100 sticky top-0"><td colspan="5" class="p-2 font-bold text-slate-600">${encodeHTML(currentSchoolName) || 'Belum Ditugaskan'}</td></tr>`;
            }
            const newBadge = user.is_unmanaged ? `<span class="ml-2 px-2 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">BARU</span>` : '';
            const assignment = encodeHTML(user.school_name || user.jurisdiction_name) || '<span class="italic text-slate-400">Belum Ditugaskan</span>';
            const userImage = user.picture ? `<img src="${encodeHTML(user.picture)}" alt="${encodeHTML(user.name)}" class="w-10 h-10 rounded-full" onerror="this.replaceWith(generateAvatar('${encodeHTML(user.name)}'))"/>` : generateAvatar(user.name);
            
            tableHtml += `<tr class="border-b hover:bg-slate-50 transition"><td class="p-3 text-center"><input type="checkbox" class="user-select-checkbox h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" value="${user.email}" ${selectedUsers.includes(user.email) ? 'checked' : ''} /></td><td class="p-3"><div class="flex items-center gap-3">${userImage}<div><p class="font-medium text-slate-800">${encodeHTML(user.name)}${newBadge}</p><p class="text-xs text-slate-500">${encodeHTML(user.email)}</p></div></div></td><td class="p-3 text-sm text-slate-600">${getRoleDisplayName(user.role)}</td><td class="p-3 text-sm text-slate-600">${assignment}</td><td class="p-3 text-center"><button class="manage-user-btn bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold py-2 px-3 rounded-lg text-sm transition" data-user='${JSON.stringify(user)}'>Kelola</button></td></tr>`;
        });
    }
    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;

    const paginationContainer = document.getElementById('admin-pagination-container');
    if (paginationContainer && totalPages > 1) {
        paginationContainer.innerHTML = `<button id="prev-page-btn" class="font-semibold py-1 px-3 rounded-lg text-sm transition disabled:opacity-50" ${validCurrentPage === 1 ? 'disabled' : ''}>Sebelumnya</button><span>Halaman ${validCurrentPage} dari ${totalPages}</span><button id="next-page-btn" class="font-semibold py-1 px-3 rounded-lg text-sm transition disabled:opacity-50" ${validCurrentPage === totalPages ? 'disabled' : ''}>Berikutnya</button>`;
        document.getElementById('prev-page-btn')?.addEventListener('click', async () => { await setState({ adminPanel: { ...state.adminPanel, currentPage: state.adminPanel.currentPage - 1 }}); renderAdminPanelTable(container, allUsers, allSchools); });
        document.getElementById('next-page-btn')?.addEventListener('click', async () => { await setState({ adminPanel: { ...state.adminPanel, currentPage: state.adminPanel.currentPage + 1 }}); renderAdminPanelTable(container, allUsers, allSchools); });
    } else if (paginationContainer) {
        paginationContainer.innerHTML = '';
    }
}


async function adminPanelPoller() {
    if(state.currentScreen !== 'adminPanel') return;
    console.log(`Admin panel polling...`);
    if (state.adminPanel.polling.timeoutId) clearTimeout(state.adminPanel.polling.timeoutId);

    let nextInterval = getNextInterval(state.adminPanel.polling.interval);

    try {
        const [usersRes, schoolsRes] = await Promise.all([
            apiService.getAllUsers(),
            state.userProfile.primaryRole === 'SUPER_ADMIN' ? apiService.getAllSchools() : Promise.resolve({ allSchools: state.adminPanel.schools })
        ]);
        
        const newData = { users: usersRes.allUsers, schools: schoolsRes.allSchools };
        const container = document.getElementById('admin-panel-container');
        if (JSON.stringify({ u: state.adminPanel.users, s: state.adminPanel.schools }) !== JSON.stringify({ u: newData.users, s: newData.schools }) || state.adminPanel.isLoading) {
            const totalPages = Math.ceil(newData.users.length / USERS_PER_PAGE);
            const newCurrentPage = Math.min(state.adminPanel.currentPage, totalPages) || 1;
            await setState({ adminPanel: { ...state.adminPanel, ...newData, isLoading: false, currentPage: newCurrentPage } });
            if (container) {
                renderAdminPanelTable(container, newData.users, newData.schools);
                renderBulkActionsBar();
            }
            nextInterval = INITIAL_POLLING_INTERVAL; // Reset on change or initial load
        }
    } catch(error) {
        const container = document.getElementById('admin-panel-container');
        if (state.adminPanel.isLoading && container) {
            container.innerHTML = `<p class="text-center text-red-500 py-8">Gagal memuat data: ${error.message}</p>`;
        }
        await setState({ adminPanel: { ...state.adminPanel, isLoading: false } }); // Prevent infinite loop on error
    }
    
    const newTimeoutId = setTimeout(adminPanelPoller, nextInterval);
    // Use direct mutation for simplicity, as this is an internal state of the poller loop.
    state.adminPanel.polling.timeoutId = newTimeoutId;
    state.adminPanel.polling.interval = nextInterval;
}


async function renderAdminPanelScreen() {
    appContainer.innerHTML = templates.adminPanel();
    document.getElementById('admin-panel-back-btn').addEventListener('click', () => navigateTo('multiRoleHome'));
    document.getElementById('add-school-btn')?.addEventListener('click', handleCreateSchool);
    
    const groupBySchoolToggle = document.getElementById('group-by-school-toggle');
    if (groupBySchoolToggle) {
        groupBySchoolToggle.checked = state.adminPanel.groupBySchool;
        groupBySchoolToggle.addEventListener('change', async (e) => {
            await setState({ adminPanel: { ...state.adminPanel, groupBySchool: e.target.checked, currentPage: 1 } });
            renderAdminPanelTable(document.getElementById('admin-panel-container'), state.adminPanel.users, state.adminPanel.schools);
        });
    }
    
    const container = document.getElementById('admin-panel-container');
    container.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.classList.contains('user-select-checkbox')) {
            const currentSelected = new Set(state.adminPanel.selectedUsers);
            if (target.checked) currentSelected.add(target.value);
            else currentSelected.delete(target.value);
            await setState({ adminPanel: { ...state.adminPanel, selectedUsers: [...currentSelected] } });
            renderAdminPanelTable(container, state.adminPanel.users, state.adminPanel.schools);
            renderBulkActionsBar();
        } else if (target.id === 'select-all-users-checkbox') {
            const paginatedEmails = state.adminPanel.users.slice((state.adminPanel.currentPage - 1) * USERS_PER_PAGE, state.adminPanel.currentPage * USERS_PER_PAGE).map(u => u.email);
            const currentSelected = new Set(state.adminPanel.selectedUsers);
            if (target.checked) paginatedEmails.forEach(email => currentSelected.add(email));
            else paginatedEmails.forEach(email => currentSelected.delete(email));
            await setState({ adminPanel: { ...state.adminPanel, selectedUsers: [...currentSelected] } });
            renderAdminPanelTable(container, state.adminPanel.users, state.adminPanel.schools);
            renderBulkActionsBar();
        } else if (target.classList.contains('manage-user-btn')) {
            showManageUserModal(JSON.parse(target.dataset.user), state.adminPanel.schools);
        }
    });

    await setState({ adminPanel: { ...state.adminPanel, isLoading: true } });
    container.innerHTML = `<p class="text-center text-slate-500 py-8">Memuat daftar pengguna...</p>`;
    
    adminPanelPoller();
}

async function showManageUserModal(user, schools) {
    document.getElementById('manage-user-modal')?.parentElement.remove();
    
    const { tree: jurisdictions } = state.userProfile.primaryRole === 'SUPER_ADMIN' 
        ? await apiService.getJurisdictionTree() 
        : { tree: [] };

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = templates.manageUserModal(user, schools, jurisdictions);
    document.body.appendChild(modalContainer);

    const closeModal = () => modalContainer.remove();
    const roleSelect = document.getElementById('role-select-modal');
    const classesContainer = document.getElementById('manage-classes-container');
    const schoolContainer = document.getElementById('school-assignment-container');
    const jurisdictionContainer = document.getElementById('jurisdiction-assignment-container');

    const toggleContainers = () => {
        const selectedRole = roleSelect.value;
        const isDinasRole = ['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(selectedRole);
        const isSchoolRole = ['GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(selectedRole);
        
        jurisdictionContainer.classList.toggle('hidden', !isDinasRole);
        schoolContainer.classList.toggle('hidden', !isSchoolRole);
        classesContainer.classList.toggle('hidden', selectedRole !== 'GURU');
    };
    
    toggleContainers(); // Initial call
    roleSelect.addEventListener('change', toggleContainers);

    document.getElementById('manage-user-cancel-btn').onclick = closeModal;
    document.getElementById('manage-user-save-btn').onclick = async () => {
        const newRole = document.getElementById('role-select-modal').value;
        const newSchoolId = document.getElementById('school-select-modal').value;
        const newJurisdictionId = document.getElementById('jurisdiction-select-modal').value;
        const newClasses = Array.from(document.querySelectorAll('.class-checkbox:checked')).map(cb => cb.value);

        showLoader('Menyimpan perubahan...');
        try {
            await apiService.updateUserConfiguration(user.email, newRole, newSchoolId, newClasses, newJurisdictionId);
            showNotification('Konfigurasi pengguna berhasil diperbarui.');
            closeModal();
            // Invalidate current poll and trigger a new one
            await setState({ adminPanel: { ...state.adminPanel, polling: {...state.adminPanel.polling, timeoutId: null, interval: 100} } });
            navigateTo('adminPanel');
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
    container.innerHTML = state.newStudents.map((student, index) => `
        <div class="flex items-center gap-2">
            <input type="text" value="${encodeHTML(student.name)}" data-index="${index}" class="student-name-input w-1/2 p-2 border border-slate-300 rounded-lg" placeholder="Nama Siswa ${index + 1}">
            <input type="email" value="${encodeHTML(student.parentEmail || '')}" data-index="${index}" class="parent-email-input w-1/2 p-2 border border-slate-300 rounded-lg" placeholder="Email Orang Tua">
            <button data-index="${index}" class="remove-student-row-btn text-slate-400 hover:text-red-500 p-1 text-2xl">&times;</button>
        </div>`).join('');
    
    container.querySelectorAll('.student-name-input').forEach(input => input.addEventListener('input', (e) => state.newStudents[e.target.dataset.index].name = e.target.value));
    container.querySelectorAll('.parent-email-input').forEach(input => input.addEventListener('input', (e) => state.newStudents[e.target.dataset.index].parentEmail = e.target.value));
    container.querySelectorAll('.remove-student-row-btn').forEach(button => button.addEventListener('click', (e) => removeStudentInputRow(e.target.dataset.index)));
}

function addStudentInputRow() {
    state.newStudents.push({ name: '', parentEmail: '' });
    renderStudentInputRows();
    const inputs = document.querySelectorAll('.student-name-input');
    inputs[inputs.length - 1].focus();
}

function removeStudentInputRow(index) {
    state.newStudents.splice(index, 1);
    if (state.newStudents.length === 0) state.newStudents.push({ name: '', parentEmail: '' });
    renderStudentInputRows();
}

function renderAttendanceScreen() {
    appContainer.innerHTML = templates.attendance(state.selectedClass, state.selectedDate);
    const tbody = document.getElementById('attendance-table-body');
    tbody.innerHTML = state.students.map((student, index) => {
        const status = state.attendance[student.name] || 'H';
        return `<tr class="border-b hover:bg-slate-50">
            <td class="p-3 text-sm text-slate-500">${index + 1}</td>
            <td class="p-3 font-medium text-slate-800">${encodeHTML(student.name)}</td>
            ${['H', 'S', 'I', 'A'].map(s => `<td class="p-3 text-center"><input type="radio" name="status-${index}" value="${s}" class="w-5 h-5 accent-blue-500" ${status === s ? 'checked' : ''} data-student-name="${student.name}"></td>`).join('')}
        </tr>`;
    }).join('');

    tbody.addEventListener('change', (e) => {
        if (e.target.type === 'radio') {
            state.attendance[e.target.dataset.studentName] = e.target.value;
        }
    });

    document.getElementById('back-to-setup-btn').addEventListener('click', () => navigateTo('setup'));
    document.getElementById('save-attendance-btn').addEventListener('click', handleSaveAttendance);
}


function filterAndRenderHistory(container) {
    const { allHistoryLogs, dataScreenFilters } = state;
    const { studentName, status, startDate, endDate } = dataScreenFilters;
    
    // 1. Filter logs based on date range
    let filteredByDate = allHistoryLogs;
    if (startDate) {
        filteredByDate = filteredByDate.filter(log => log.date >= startDate);
    }
    if (endDate) {
        filteredByDate = filteredByDate.filter(log => log.date <= endDate);
    }
    
    // 2. Process the remaining logs to find matching absences
    const logsByDate = {};
    filteredByDate.forEach(log => {
        const filteredAbsences = Object.entries(log.attendance)
            .filter(([name, stts]) => {
                const nameMatch = !studentName || name.toLowerCase().includes(studentName.toLowerCase());
                const statusMatch = stts !== 'H' && (status === 'all' || stts === status);
                return nameMatch && statusMatch;
            })
            .map(([name, stts]) => ({ name, status: stts }));

        if (filteredAbsences.length > 0) {
            if (!logsByDate[log.date]) {
                logsByDate[log.date] = [];
            }
            logsByDate[log.date].push({
                ...log,
                filteredAbsences,
            });
        }
    });

    // 3. Render the results
    const sortedDates = Object.keys(logsByDate).sort((a, b) => b.localeCompare(a));

    if (sortedDates.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500">Tidak ada riwayat absensi yang cocok dengan filter.</p>`;
        return;
    }

    container.innerHTML = sortedDates.map(date => {
        const logGroupsForDate = logsByDate[date];
        const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        const logsHtml = logGroupsForDate.map(logGroup => {
            const contentHtml = `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-slate-500"><th class="py-1 pr-4 font-medium">Nama Siswa</th><th class="py-1 px-2 font-medium">Status</th></tr></thead><tbody>${logGroup.filteredAbsences.map(s => `<tr class="border-t border-slate-200"><td class="py-2 pr-4 text-slate-700">${encodeHTML(s.name)}</td><td class="py-2 px-2"><span class="px-2 py-1 rounded-full text-xs font-semibold ${s.status === 'S' ? 'bg-yellow-100 text-yellow-800' : s.status === 'I' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}">${s.status}</span></td></tr>`).join('')}</tbody></table></div>`;
            return `<div class="bg-slate-50 p-4 rounded-lg"><div class="flex justify-between items-center mb-2"><h3 class="font-bold text-blue-600">Kelas ${encodeHTML(logGroup.class)}</h3>${logGroup.teacherName ? `<p class="text-xs text-slate-400">Oleh: ${encodeHTML(logGroup.teacherName)}</p>` : ''}</div>${contentHtml}</div>`;
        }).join('');

        return `<div><h2 class="text-lg font-semibold text-slate-700 mb-3">${displayDate}</h2><div class="space-y-4">${logsHtml}</div></div>`;
    }).join('');
}


async function renderDataScreen() {
    appContainer.innerHTML = templates.data();
    
    const container = document.getElementById('data-container');
    const titleEl = document.getElementById('data-title');
    const studentNameInput = document.getElementById('filter-student-name');
    const statusSelect = document.getElementById('filter-status');
    const startDateInput = document.getElementById('filter-start-date');
    const endDateInput = document.getElementById('filter-end-date');

    // Restore filter values from state
    studentNameInput.value = state.dataScreenFilters.studentName;
    statusSelect.value = state.dataScreenFilters.status;
    startDateInput.value = state.dataScreenFilters.startDate;
    endDateInput.value = state.dataScreenFilters.endDate;

    const fetchDataAndRender = async () => {
        container.innerHTML = `<p class="text-center text-slate-500">Memuat riwayat data...</p>`;
        
        const schoolId = state.userProfile.primaryRole === 'SUPER_ADMIN' ? state.adminActingAsSchool?.id : state.userProfile.school_id;
        
        try {
            const { allLogs } = await apiService.getHistoryData({
                schoolId,
                isClassSpecific: !!state.historyClassFilter,
                classFilter: state.historyClassFilter,
                isGlobalView: state.adminAllLogsView,
            });

            await setState({ allHistoryLogs: allLogs });
            filterAndRenderHistory(container); // Initial render with fetched data
            
        } catch (error) {
            container.innerHTML = `<p class="text-center text-red-500">Gagal memuat data: ${error.message}</p>`;
        }
    };

    const applyFilters = async () => {
        await setState({ 
            dataScreenFilters: { 
                studentName: studentNameInput.value.trim(), 
                status: statusSelect.value, 
                startDate: startDateInput.value, 
                endDate: endDateInput.value 
            } 
        });
        filterAndRenderHistory(container); // Re-render with new filters on existing data
    };
    
    let debounceTimer;
    const debouncedApplyFilters = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyFilters, 300);
    };

    studentNameInput.addEventListener('input', debouncedApplyFilters);
    [statusSelect, startDateInput, endDateInput].forEach(el => el.addEventListener('change', applyFilters));
    document.getElementById('clear-filters-btn').addEventListener('click', async () => { 
        await setState({ dataScreenFilters: { studentName: '', status: 'all', startDate: '', endDate: '' } }); 
        renderScreen('data'); 
    });
    document.getElementById('data-back-to-start-btn').addEventListener('click', () => navigateTo(state.historyClassFilter ? 'setup' : 'multiRoleHome'));
    
    titleEl.textContent = state.adminAllLogsView ? `Semua Riwayat Absensi` : state.historyClassFilter ? `Riwayat Absensi Kelas ${encodeHTML(state.historyClassFilter)}` : `Semua Riwayat Absensi Sekolah`;
    
    fetchDataAndRender();
}


async function renderRecapScreen() {
    appContainer.innerHTML = templates.recap();
    const container = document.getElementById('recap-container');
    container.innerHTML = `<p class="text-center text-slate-500">Memuat rekapitulasi...</p>`;

    try {
        const schoolId = state.userProfile.primaryRole === 'SUPER_ADMIN' ? state.adminActingAsSchool?.id : state.userProfile.school_id;
        const isAdmin = ['SUPER_ADMIN', 'ADMIN_SEKOLAH'].includes(state.userProfile.primaryRole);
        const classFilter = (state.userProfile.primaryRole === 'GURU' || isAdmin) ? state.selectedClass : null;
        
        const { recapArray } = await apiService.getRecapData({ schoolId, classFilter });

        if (!recapArray || recapArray.length === 0) {
            container.innerHTML = `<p class="text-center text-slate-500">Belum ada data untuk direkap.</p>`;
            return;
        }

        recapArray.sort((a, b) => {
            if (state.recapSortOrder === 'total') return b.total - a.total || a.name.localeCompare(b.name);
            return a.class.localeCompare(b.class) || a.originalIndex - b.originalIndex;
        });

        container.innerHTML = `<table class="w-full text-left">
            <thead><tr class="border-b bg-slate-50"><th class="p-3 text-sm font-semibold text-slate-600">No.</th><th class="p-3 text-sm font-semibold text-slate-600">Nama Siswa</th><th class="p-3 text-sm font-semibold text-slate-600">Kelas</th><th class="p-3 text-sm font-semibold text-slate-600 text-center">Sakit</th><th class="p-3 text-sm font-semibold text-slate-600 text-center">Izin</th><th class="p-3 text-sm font-semibold text-slate-600 text-center">Alfa</th><th class="p-3 text-sm font-semibold text-slate-600 text-center">Total</th></tr></thead>
            <tbody>${recapArray.map((item, index) => `<tr class="border-b hover:bg-slate-50">
                <td class="p-3 text-sm text-slate-500">${index + 1}</td><td class="p-3 font-medium text-slate-800">${encodeHTML(item.name)}</td><td class="p-3 text-sm text-slate-500">${encodeHTML(item.class)}</td><td class="p-3 text-sm text-center">${item.S}</td><td class="p-3 text-sm text-center">${item.I}</td><td class="p-3 text-sm text-center">${item.A}</td><td class="p-3 text-sm font-bold text-center">${item.total}</td>
            </tr>`).join('')}</tbody></table>`;

    } catch (error) {
        container.innerHTML = `<p class="text-center text-red-500">Gagal memuat rekap: ${error.message}</p>`;
    } finally {
        document.getElementById('recap-back-to-start-btn').addEventListener('click', () => navigateTo('setup'));
        document.getElementById('sort-by-total-btn').addEventListener('click', () => { setState({ recapSortOrder: 'total' }); renderRecapScreen(); });
        document.getElementById('sort-by-absen-btn').addEventListener('click', () => { setState({ recapSortOrder: 'absen' }); renderRecapScreen(); });
    }
}

async function renderJurisdictionPanelScreen() {
    appContainer.innerHTML = templates.jurisdictionPanel();
    document.getElementById('jurisdiction-panel-back-btn').addEventListener('click', () => navigateTo('multiRoleHome'));
    
    const treeContainer = document.getElementById('jurisdiction-tree-container');
    const detailsContainer = document.getElementById('jurisdiction-details-container');
    let jurisdictions = []; // Will store the full tree for modals

    const fetchAndRenderTree = async () => {
        try {
            const { tree } = await apiService.getJurisdictionTree();
            jurisdictions = tree; // Save for later use in modals

            const renderTree = (nodes, level = 0) => {
                if (nodes.length === 0 && level === 0) {
                    return `<p class="text-sm text-slate-500">Belum ada yurisdiksi. Klik 'Tambah' untuk memulai.</p>`;
                }
                return `<ul class="${level > 0 ? 'pl-4' : ''}">${nodes.map(node => `
                    <li class="my-1">
                        <div class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-200 cursor-pointer jur-node" data-id="${node.id}" data-node='${JSON.stringify(node)}'>
                            <span class="font-semibold text-slate-700">${encodeHTML(node.name)} <span class="text-xs text-slate-400 font-normal">(${encodeHTML(node.type)})</span></span>
                            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </div>
                        ${node.children.length > 0 ? renderTree(node.children, level + 1) : ''}
                    </li>`).join('')}</ul>`;
            };

            treeContainer.innerHTML = renderTree(tree);
        } catch (error) {
            treeContainer.innerHTML = `<p class="text-center text-red-500">Gagal memuat data: ${error.message}</p>`;
        }
    };
    
    const showManageJurisdictionModal = (jurisdiction = null) => {
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = templates.manageJurisdictionModal(jurisdiction, jurisdictions);
        document.body.appendChild(modalContainer);

        const closeModal = () => modalContainer.remove();
        document.getElementById('jur-modal-cancel-btn').onclick = closeModal;
        document.getElementById('jur-modal-save-btn').onclick = async () => {
            const name = document.getElementById('jur-name').value;
            const type = document.getElementById('jur-type').value;
            const parentId = document.getElementById('jur-parent').value || null;
            
            if (!name.trim() || !type) {
                showNotification('Nama dan Tingkat Yurisdiksi harus diisi.', 'error');
                return;
            }

            showLoader('Menyimpan...');
            try {
                if (jurisdiction) { // Editing
                    await apiService.updateJurisdiction(jurisdiction.id, name, type, parentId);
                } else { // Creating
                    await apiService.createJurisdiction(name, type, parentId);
                }
                showNotification('Yurisdiksi berhasil disimpan.');
                closeModal();
                fetchAndRenderTree();
                detailsContainer.innerHTML = `<div class="h-full flex items-center justify-center text-center p-4 border-2 border-dashed rounded-lg"><p class="text-slate-500">Pilih yurisdiksi dari daftar.</p></div>`;
            } catch (error) {
                showNotification(error.message, 'error');
            } finally {
                hideLoader();
            }
        };
    };
    
    document.getElementById('add-jurisdiction-btn').addEventListener('click', () => showManageJurisdictionModal());

    treeContainer.addEventListener('click', async (e) => {
        const nodeEl = e.target.closest('.jur-node');
        if (!nodeEl) return;

        treeContainer.querySelectorAll('.jur-node').forEach(el => el.classList.remove('bg-blue-100'));
        nodeEl.classList.add('bg-blue-100');

        const jurId = nodeEl.dataset.id;
        const jur = JSON.parse(nodeEl.dataset.node);
        detailsContainer.innerHTML = `<p class="text-center text-slate-500 py-8">Memuat detail untuk yurisdiksi...</p>`;
        
        try {
            const { assignedSchools, unassignedSchools } = await apiService.getSchoolsForJurisdiction(jurId);
            
            detailsContainer.innerHTML = `
                <div class="p-4 border rounded-lg h-full">
                     <div class="flex justify-between items-center mb-4">
                        <h2 class="text-lg font-bold text-slate-800">${encodeHTML(jur.name)}</h2>
                        <div>
                            <button id="edit-jur-btn" class="text-sm bg-yellow-100 text-yellow-800 hover:bg-yellow-200 font-semibold py-1 px-3 rounded-lg transition">Ubah</button>
                            <button id="delete-jur-btn" class="text-sm bg-red-100 text-red-800 hover:bg-red-200 font-semibold py-1 px-3 rounded-lg transition">Hapus</button>
                        </div>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <h3 class="font-semibold text-slate-600 mb-2">Sekolah Ditugaskan (${assignedSchools.length})</h3>
                            <div class="border rounded-lg p-2 min-h-[100px] bg-slate-50">${assignedSchools.map(s => `<p class="p-1">${encodeHTML(s.name)}</p>`).join('') || '<p class="text-sm text-slate-400 p-1">Tidak ada</p>'}</div>
                        </div>
                    </div>
                    <button id="manage-schools-btn" class="mt-4 w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg transition">Kelola Penugasan Sekolah</button>
                </div>
            `;

            document.getElementById('edit-jur-btn').onclick = () => showManageJurisdictionModal(jur);
            document.getElementById('delete-jur-btn').onclick = async () => {
                const confirmed = await showConfirmation(`Anda yakin ingin menghapus ${encodeHTML(jur.name)}? Tindakan ini tidak dapat diurungkan.`);
                if (confirmed) {
                    showLoader('Menghapus...');
                    try {
                        await apiService.deleteJurisdiction(jur.id);
                        showNotification('Yurisdiksi berhasil dihapus.');
                        detailsContainer.innerHTML = `<div class="h-full flex items-center justify-center text-center p-4 border-2 border-dashed rounded-lg"><p class="text-slate-500">Pilih yurisdiksi dari daftar.</p></div>`;
                        fetchAndRenderTree();
                    } catch (error) {
                        showNotification(error.message, 'error');
                    } finally {
                        hideLoader();
                    }
                }
            };
            
            document.getElementById('manage-schools-btn').onclick = () => {
                 const modalContainer = document.createElement('div');
                 modalContainer.innerHTML = templates.assignSchoolsModal(jur.name, assignedSchools, unassignedSchools);
                 document.body.appendChild(modalContainer);

                 const handleAssignment = async (e, assign) => {
                     const schoolId = e.target.dataset.schoolId;
                     const targetJurId = assign ? jur.id : null;
                     showLoader('Memperbarui...');
                     try {
                        await apiService.assignSchoolToJurisdiction(schoolId, targetJurId);
                        modalContainer.remove();
                        nodeEl.click(); // Re-click to refresh details
                     } catch(err) {
                        showNotification(err.message, 'error');
                     } finally {
                        hideLoader();
                     }
                 };

                 modalContainer.querySelectorAll('.assign-school-btn').forEach(btn => btn.onclick = (e) => handleAssignment(e, true));
                 modalContainer.querySelectorAll('.unassign-school-btn').forEach(btn => btn.onclick = (e) => handleAssignment(e, false));
                 document.getElementById('assign-schools-close-btn').onclick = () => modalContainer.remove();
            };

        } catch (error) {
            detailsContainer.innerHTML = `<p class="text-center text-red-500 py-8">Gagal memuat detail: ${error.message}</p>`;
        }
    });

    fetchAndRenderTree();
}

async function renderParentDashboardScreen() {
    appContainer.innerHTML = templates.parentDashboard(); // Renders loading state initially
    
    const { isLoading } = state.parentDashboard;

    if (isLoading) {
        try {
            const { parentData } = await apiService.getParentData();
            await setState({ parentDashboard: { isLoading: false, data: parentData } });
            renderScreen('parentDashboard'); // Re-render with the fetched data
        } catch (error) {
            console.error("Failed to load parent data:", error);
            showNotification(error.message, 'error');
            await setState({ parentDashboard: { isLoading: false, data: [] } }); // Set to empty array on error
            renderScreen('parentDashboard');
        }
    } else {
        // Data is loaded, just attach event listeners
        document.getElementById('parent-dashboard-back-btn')?.addEventListener('click', () => navigateTo('multiRoleHome'));
    }
}

function renderMigrationToolScreen() {
    appContainer.innerHTML = templates.migrationTool();
    document.getElementById('migration-back-btn').addEventListener('click', () => navigateTo('multiRoleHome'));
    document.getElementById('migrate-data-btn').addEventListener('click', handleMigrateLegacyData);
}


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
        'success': () => {
             appContainer.innerHTML = templates.success();
             document.getElementById('success-back-to-start-btn').addEventListener('click', () => {
                 setState({ lastSaveContext: null }); // Clear context before navigating
                 navigateTo('setup');
             });
             document.getElementById('success-view-data-btn').addEventListener('click', () => {
                 setState({ lastSaveContext: null }); // Clear context before navigating
                 handleViewHistory(false);
             });
        },
        'data': renderDataScreen,
        'recap': renderRecapScreen,
    };

    (screenRenderers[screen] || renderLandingPageScreen)();
    hideLoader();
}

// --- NEW: Centralized polling control functions ---

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
    if (!state.userProfile) return; // Don't poll if not logged in

    console.log(`Page is visible again. Resuming polling for screen: ${state.currentScreen}`);
    
    switch (state.currentScreen) {
        case 'dashboard':
            // Reset interval to the fastest and start the poller immediately
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
            // No polling on other screens
            break;
    }
}
