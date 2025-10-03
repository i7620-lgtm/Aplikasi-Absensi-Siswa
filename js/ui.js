import { state, setState, navigateTo, handleStartAttendance, handleManageStudents, handleViewHistory, handleDownloadData, handleSaveNewStudents, handleExcelImport, handleDownloadTemplate, handleSaveAttendance, handleGenerateAiRecommendation, handleCreateSchool, CLASSES, handleViewRecap } from './main.js';
import { templates } from './templates.js';
import { handleSignIn, handleSignOut } from './auth.js';
import { apiService } from './api.js';

const appContainer = document.getElementById('app-container');
const loaderWrapper = document.getElementById('loader-wrapper');
const notificationEl = document.getElementById('notification');
const offlineIndicator = document.getElementById('offline-indicator');

// --- POLLING & PAGINATION CONFIGURATION ---
const INITIAL_POLLING_INTERVAL = 10000; // 10 seconds
const MAX_POLLING_INTERVAL = 300000; // 5 minutes (300 seconds)
const USERS_PER_PAGE = 10;

function getNextInterval(currentInterval) {
    const next = currentInterval * 2;
    return Math.min(next, MAX_POLLING_INTERVAL);
}


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

export function showNotification(message, type = 'success', options = {}) {
    const { isPermanent = false, onRetry = null } = options;

    let content = `<span>${message}</span>`;
    if (onRetry) {
        content += `<button id="notification-retry-btn" class="notification-retry-btn">Coba Lagi</button>`;
    }

    notificationEl.innerHTML = content;
    notificationEl.className = ''; // Clear previous classes
    notificationEl.classList.add(type);
    notificationEl.classList.add('show');

    if (onRetry) {
        const retryBtn = document.getElementById('notification-retry-btn');
        if (retryBtn) {
            retryBtn.onclick = () => {
                showLoader('Mencoba lagi...');
                // Hide the notification before retrying
                notificationEl.classList.remove('show');
                // Use a timeout to allow the loader to appear before the heavy work
                setTimeout(() => {
                    onRetry();
                }, 200);
            };
        }
    }

    if (!isPermanent) {
        setTimeout(() => {
            notificationEl.classList.remove('show');
        }, 5000);
    }
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

function showRoleSelectorModal() {
    return new Promise((resolve) => {
        const currentUserRole = state.userProfile.role;
        const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';

        const availableRoles = [
            { value: 'GURU', text: 'Guru' },
            { value: 'KEPALA_SEKOLAH', text: 'Kepala Sekolah' },
        ];
        if (isSuperAdmin) {
            availableRoles.push({ value: 'ADMIN_SEKOLAH', text: 'Admin Sekolah' });
            // Cannot bulk-assign SUPER_ADMIN
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
    errorContainer.classList.remove('hidden');
    let details = error ? (error.message || (typeof error === 'string' ? error : JSON.stringify(error))) : '';
    details = details.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    errorContainer.innerHTML = `<div class="bg-red-50 p-3 rounded-lg border border-red-200"><p class="text-red-700 font-semibold">${message}</p><p class="text-slate-500 text-xs mt-2">${details}</p></div>`;
}

// --- SCREEN SPECIFIC RENDER LOGIC ---

function renderSetupScreen() {
    appContainer.innerHTML = templates.setup();
    const isAdmin = state.userProfile?.role === 'SUPER_ADMIN' || state.userProfile?.role === 'ADMIN_SEKOLAH';
    const isTeacher = state.userProfile?.role === 'GURU';
    const needsAssignment = isTeacher && (!state.userProfile.assigned_classes || state.userProfile.assigned_classes.length === 0);

    if (state.userProfile) {
        document.getElementById('logoutBtn').addEventListener('click', handleSignOut);
        if (isAdmin) {
            document.getElementById('back-to-admin-home-btn').addEventListener('click', () => navigateTo('adminHome'));
        }

        // Handle notification permission banner
        const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
        if (enableNotificationsBtn) {
            enableNotificationsBtn.addEventListener('click', () => {
                Notification.requestPermission().then(permission => {
                    const banner = document.getElementById('notification-permission-banner');
                    if (banner) {
                        banner.style.opacity = '0';
                        setTimeout(() => banner.remove(), 300);
                    }
                    if (permission === 'granted') {
                        showNotification('Notifikasi diaktifkan!', 'success');
                    } else {
                        localStorage.setItem('notificationBannerDismissed', 'true'); 
                        showNotification('Izin notifikasi tidak diberikan. Anda bisa mengubahnya di pengaturan browser.', 'info');
                    }
                });
            });
        }

        const dismissBannerBtn = document.getElementById('dismiss-notification-banner-btn');
        if (dismissBannerBtn) {
            dismissBannerBtn.addEventListener('click', () => {
                localStorage.setItem('notificationBannerDismissed', 'true');
                const banner = document.getElementById('notification-permission-banner');
                if (banner) {
                    banner.style.opacity = '0';
                    setTimeout(() => banner.remove(), 300);
                }
            });
        }

    } else {
        document.getElementById('loginBtn').addEventListener('click', handleSignIn);
    }
    
    if (!needsAssignment && state.userProfile) {
        document.getElementById('startBtn').addEventListener('click', handleStartAttendance);
        document.getElementById('historyBtn').addEventListener('click', () => handleViewHistory(true));
        document.getElementById('recapBtn').addEventListener('click', handleViewRecap);
        document.getElementById('manageStudentsBtn').addEventListener('click', handleManageStudents);
        document.getElementById('downloadDataBtn').addEventListener('click', handleDownloadData);

        const availableClasses = isAdmin ? CLASSES : (state.userProfile?.assigned_classes || []);
        document.getElementById('class-select').value = state.selectedClass || availableClasses[0] || '';
    }
    
    // --- START: Real-time update logic ---
    if (isTeacher) {
        const teacherProfilePoller = async () => {
            console.log(`Teacher profile polling (interval: ${state.setup.polling.interval / 1000}s)...`);
            if (state.setup.polling.timeoutId) {
                clearTimeout(state.setup.polling.timeoutId);
            }
            try {
                const { userProfile: latestProfile } = await apiService.getUserProfile();
                let nextInterval;

                if (JSON.stringify(latestProfile.assigned_classes) !== JSON.stringify(state.userProfile.assigned_classes)) {
                    console.log("Teacher profile changed. Re-rendering and resetting interval.");
                    await setState({ userProfile: latestProfile, setup: { ...state.setup, polling: { timeoutId: null, interval: INITIAL_POLLING_INTERVAL } }});
                    showNotification('Hak akses kelas Anda telah diperbarui oleh admin.', 'info');
                    renderScreen('setup'); // This re-runs this whole function, starting a new poller.
                    return; // Stop current poller execution.
                } else {
                    nextInterval = getNextInterval(state.setup.polling.interval);
                }

                const newTimeoutId = setTimeout(teacherProfilePoller, nextInterval);
                await setState({ setup: { ...state.setup, polling: { timeoutId: newTimeoutId, interval: nextInterval } } });

            } catch (error) {
                console.error("Failed to fetch teacher profile update:", error);
                const newTimeoutId = setTimeout(teacherProfilePoller, state.setup.polling.interval);
                await setState({ setup: { ...state.setup, polling: { ...state.setup.polling, timeoutId: newTimeoutId } } });
            }
        };
        teacherProfilePoller();
    } else if (isAdmin) {
        const adminClassDataPoller = async () => {
            const selectElement = document.getElementById('class-select');
            if (!selectElement || !selectElement.value) return;
            
            const selectedClass = selectElement.value;
            console.log(`Admin setup polling for class ${selectedClass} (interval: ${state.setup.polling.interval / 1000}s)...`);
            
            if (state.setup.polling.timeoutId) {
                clearTimeout(state.setup.polling.timeoutId);
            }

            try {
                const schoolId = state.userProfile.role === 'SUPER_ADMIN' ? state.adminActingAsSchool?.id : state.userProfile.school_id;
                if (!schoolId) return;

                const { allData } = await apiService.getGlobalData(schoolId);
                let latestStudents = null;

                for (const teacherData of allData) {
                    if (teacherData.students_by_class && teacherData.students_by_class[selectedClass]) {
                        latestStudents = teacherData.students_by_class[selectedClass].students;
                        break;
                    }
                }

                const currentStudents = state.studentsByClass[selectedClass]?.students || [];
                let nextInterval;
                
                if (latestStudents && JSON.stringify(latestStudents) !== JSON.stringify(currentStudents)) {
                    console.log(`Data for class ${selectedClass} changed. Updating state & resetting interval.`);
                    const updatedStudentsByClass = { ...state.studentsByClass, [selectedClass]: { ...(state.studentsByClass[selectedClass] || {}), students: latestStudents } };
                    await setState({ studentsByClass: updatedStudentsByClass });
                    showNotification(`Data untuk kelas ${selectedClass} telah diperbarui secara otomatis.`, 'info');
                    nextInterval = INITIAL_POLLING_INTERVAL;
                } else {
                    nextInterval = getNextInterval(state.setup.polling.interval);
                }
                
                const newTimeoutId = setTimeout(adminClassDataPoller, nextInterval);
                await setState({ setup: { ...state.setup, polling: { timeoutId: newTimeoutId, interval: nextInterval } } });

            } catch (error) {
                console.error(`Failed to fetch class data update for admin:`, error);
                const newTimeoutId = setTimeout(adminClassDataPoller, state.setup.polling.interval);
                await setState({ setup: { ...state.setup, polling: { timeoutId: newTimeoutId, interval: nextInterval } } });
            }
        };
        
        adminClassDataPoller();
        
        document.getElementById('class-select').addEventListener('change', async () => {
            console.log("Class selection changed, restarting admin setup poller.");
            await setState({ setup: { ...state.setup, polling: { ...state.setup.polling, interval: INITIAL_POLLING_INTERVAL } } });
            adminClassDataPoller();
        });
    }
}


function renderMaintenanceToggle(container, isMaintenance) {
    const statusText = isMaintenance ? 'Aktif' : 'Tidak Aktif';
    const statusColor = isMaintenance ? 'text-red-600' : 'text-green-600';
    const buttonText = isMaintenance ? 'Nonaktifkan' : 'Aktifkan';
    const buttonColor = isMaintenance ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-500';

    container.innerHTML = `
        <div class="flex items-center justify-between w-full">
            <p class="text-sm text-slate-700">Status: <span class="font-bold ${statusColor}">${statusText}</span></p>
            <button id="maintenance-action-btn" class="${buttonColor} text-white font-bold py-2 px-4 rounded-lg text-sm transition">
                ${buttonText}
            </button>
        </div>
    `;

    document.getElementById('maintenance-action-btn').addEventListener('click', async () => {
        const enable = !isMaintenance;
        const actionVerb = enable ? "mengaktifkan" : "menonaktifkan";
        const confirmed = await showConfirmation(`Anda yakin ingin ${actionVerb} mode perbaikan? Pengguna lain tidak akan bisa mengakses aplikasi.`);

        if (confirmed) {
            showLoader('Mengubah status...');
            try {
                const { newState } = await apiService.setMaintenanceStatus(enable);
                showNotification(`Mode perbaikan berhasil di${actionVerb}.`);
                renderMaintenanceToggle(container, newState);
            } catch (error) {
                showNotification(error.message, 'error');
            } finally {
                hideLoader();
            }
        }
    });
}


async function renderAdminHomeScreen() {
    appContainer.innerHTML = templates.adminHome();
    document.getElementById('logoutBtn').addEventListener('click', handleSignOut);
    document.getElementById('view-admin-panel-btn').addEventListener('click', () => navigateTo('adminPanel'));

    const isSuperAdmin = state.userProfile.role === 'SUPER_ADMIN';

    document.getElementById('go-to-attendance-btn').addEventListener('click', async () => {
        if (isSuperAdmin) {
            const selectedSchool = await showSchoolSelectorModal('Pilih Sekolah untuk Absensi');
            if (selectedSchool) {
                await setState({ adminActingAsSchool: selectedSchool });
                navigateTo('setup');
            }
        } else {
            navigateTo('setup');
        }
    });

    document.getElementById('view-dashboard-btn').addEventListener('click', async () => {
        if (isSuperAdmin) {
            const selectedSchool = await showSchoolSelectorModal('Pilih Sekolah untuk Dasbor');
            if (selectedSchool) {
                const oldSchoolId = state.adminActingAsSchool?.id;
                // If school context changes, reset the dashboard data to force a reload
                if (String(selectedSchool.id) !== String(oldSchoolId)) {
                    await setState({
                        adminActingAsSchool: selectedSchool,
                        dashboard: {
                            ...state.dashboard,
                            allTeacherData: [],
                            isDataLoaded: false,
                        }
                    });
                }
                navigateTo('dashboard');
            }
        } else {
            navigateTo('dashboard');
        }
    });

    if (isSuperAdmin) {
        const maintenanceContainer = document.getElementById('maintenance-toggle-container');
        
        const fetchAndRenderMaintenanceStatus = async () => {
             maintenanceContainer.innerHTML = `<p class="text-sm text-slate-500">Memuat status...</p>`;
             try {
                const { isMaintenance } = await apiService.getMaintenanceStatus();
                await setState({ maintenanceMode: { ...state.maintenanceMode, isActive: isMaintenance, statusChecked: true } });
                renderMaintenanceToggle(maintenanceContainer, isMaintenance);
            } catch (e) {
                maintenanceContainer.innerHTML = `<div class="text-center">
                    <p class="text-sm text-red-500 font-semibold">Gagal memuat status.</p>
                    <button id="retry-maintenance-status" class="text-xs text-blue-600 hover:underline font-semibold mt-2">Coba Lagi</button>
                </div>`;
                document.getElementById('retry-maintenance-status').addEventListener('click', fetchAndRenderMaintenanceStatus);
            }
        };

        fetchAndRenderMaintenanceStatus();
    }
}

function renderStructuredAiResponse(markdownText) {
    const icons = {
        'Ringkasan': `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
        'Peringatan Dini': `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`,
        'Pola Utama': `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`,
        'Rekomendasi Tindak Lanjut': `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>`
    };
    
    // Regex to split the text by headings (with or without markdown ###), looking for a newline before the heading.
    const splitRegex = new RegExp(`(?<=\\n)(?=(?:###\\s*)?(?:Ringkasan|Peringatan Dini|Analisis Pola Utama|Rekomendasi Tindak Lanjut))`, 'g');
    const parts = markdownText.split(splitRegex).filter(p => p.trim());
    
    // Fallback if splitting doesn't work well (e.g., less than 2 sections found)
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
                    <span>${section.title}</span>
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
                    dayButton.disabled = false; // Reset state

                    // Disable future dates first
                    if (currentDate > today) {
                        dayClasses.push('disabled-future');
                        dayButton.disabled = true;
                    }
                    
                    // Only apply other styles if the date is not disabled
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
                        if (dayButton.disabled) return; // Prevent action on disabled dates
                        const newDateStr = currentDate.toISOString().split('T')[0];
                        popup.classList.add('hidden');
                        await setState({ dashboard: { ...state.dashboard, selectedDate: newDateStr } });
                        renderScreen('dashboard');
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

        header.querySelector('.prev-month').onclick = () => {
            viewDate.setMonth(viewDate.getMonth() - 1);
            renderCalendar();
        };
        header.querySelector('.next-month').onclick = () => {
            viewDate.setMonth(viewDate.getMonth() + 1);
            renderCalendar();
        };
    }

    displayInput.onclick = (e) => {
        e.stopPropagation();
        popup.classList.toggle('hidden');
        if (!popup.classList.contains('hidden')) {
            renderCalendar();
        }
    };
    
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            popup.classList.add('hidden');
        }
    });
}


async function renderDashboardScreen() {
    appContainer.innerHTML = templates.dashboard();

    const renderDashboardPanels = () => {
        const { isDataLoaded, allTeacherData, selectedDate, activeView, aiRecommendation } = state.dashboard;
        
        const reportContent = document.getElementById('dashboard-content-report');
        const percentageContent = document.getElementById('dashboard-content-percentage');
        const aiContent = document.getElementById('dashboard-content-ai');

        if (!reportContent || !percentageContent || !aiContent) return;

        if (!isDataLoaded) {
            const loaderHtml = `<p class="text-center text-slate-500 py-8">Memuat data sekolah...</p>`;
            reportContent.innerHTML = loaderHtml;
            percentageContent.innerHTML = loaderHtml;
            aiContent.innerHTML = loaderHtml;
            return;
        }

        const logsForDate = [];
        allTeacherData.forEach(teacherData => {
            (teacherData.saved_logs || []).forEach(log => {
                if (log.date === selectedDate) {
                    logsForDate.push({ ...log, teacherName: teacherData.user_name });
                }
            });
        });

        if (activeView === 'report') {
            // --- NEW LOGIC: Summary Stats Calculation ---
            const allStudentsByClass = {};
            allTeacherData.forEach(teacher => {
                if (teacher.students_by_class) {
                    Object.assign(allStudentsByClass, teacher.students_by_class);
                }
            });
        
            const totalStudents = Object.values(allStudentsByClass).reduce((sum, classData) => {
                return sum + (classData?.students?.length || 0);
            }, 0);
        
            const absenceCounts = { S: 0, I: 0, A: 0 };
            logsForDate.forEach(log => {
                Object.values(log.attendance).forEach(status => {
                    if (absenceCounts[status] !== undefined) {
                        absenceCounts[status]++;
                    }
                });
            });
        
            const totalAbsent = absenceCounts.S + absenceCounts.I + absenceCounts.A;
            // Ensure 'present' is not negative if student list is out of sync with logs
            const totalPresent = Math.max(0, totalStudents - totalAbsent); 
        
            const summaryStatsHtml = `
            <div id="dashboard-summary-stats" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                <div class="bg-slate-100 p-4 rounded-xl text-center">
                    <p class="text-sm font-semibold text-slate-600">Total Siswa</p>
                    <p class="text-3xl font-bold text-slate-800">${totalStudents}</p>
                </div>
                <div class="bg-green-100 p-4 rounded-xl text-center">
                    <p class="text-sm font-semibold text-green-700">Hadir</p>
                    <p class="text-3xl font-bold text-green-800">${totalPresent}</p>
                </div>
                <div class="bg-yellow-100 p-4 rounded-xl text-center">
                    <p class="text-sm font-semibold text-yellow-700">Sakit</p>
                    <p class="text-3xl font-bold text-yellow-800">${absenceCounts.S}</p>
                </div>
                <div class="bg-blue-100 p-4 rounded-xl text-center">
                    <p class="text-sm font-semibold text-blue-700">Izin</p>
                    <p class="text-3xl font-bold text-blue-800">${absenceCounts.I}</p>
                </div>
                <div class="bg-red-100 p-4 rounded-xl text-center">
                    <p class="text-sm font-semibold text-red-700">Alpa</p>
                    <p class="text-3xl font-bold text-red-800">${absenceCounts.A}</p>
                </div>
            </div>
            `;
        
            // --- EXISTING LOGIC for detailed absent list ---
            const absentStudentsByClass = {};
            logsForDate.forEach(log => {
                if (!absentStudentsByClass[log.class]) {
                    absentStudentsByClass[log.class] = { students: [], teacherName: log.teacherName };
                }
                Object.entries(log.attendance).forEach(([studentName, status]) => {
                    if (status !== 'H') {
                        absentStudentsByClass[log.class].students.push({ name: studentName, status: status });
                    }
                });
            });
            const classNames = Object.keys(absentStudentsByClass).sort();
            
            let detailedReportHtml = '';
            if (classNames.length === 0 || classNames.every(c => absentStudentsByClass[c].students.length === 0)) {
                detailedReportHtml = `<div class="p-4 bg-slate-50 rounded-lg"><p class="text-center text-slate-500 py-4">Tidak ada siswa yang tercatat absen pada tanggal yang dipilih.</p></div>`;
            } else {
                const reportList = classNames.map(className => {
                    const classData = absentStudentsByClass[className];
                    if (classData.students.length === 0) return '';
                    classData.students.sort((a, b) => a.name.localeCompare(b.name));
                    return `<div class="bg-slate-50 p-4 rounded-lg">
                        <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-blue-600">Kelas ${className}</h3><p class="text-xs text-slate-400 font-medium">Oleh: ${classData.teacherName}</p></div>
                        <div class="overflow-x-auto"><table class="w-full text-sm">
                            <thead><tr class="text-left text-slate-500"><th class="py-1 pr-4 font-medium">Nama Siswa</th><th class="py-1 px-2 font-medium">Status</th></tr></thead>
                            <tbody>${classData.students.map(s => `<tr class="border-t border-slate-200"><td class="py-2 pr-4 text-slate-700">${s.name}</td><td class="py-2 px-2"><span class="px-2 py-1 rounded-full text-xs font-semibold ${s.status === 'S' ? 'bg-yellow-100 text-yellow-800' : s.status === 'I' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}">${s.status}</span></td></tr>`).join('')}</tbody>
                        </table></div></div>`;
                }).join('');
                detailedReportHtml = `<h2 class="text-lg font-bold text-slate-700 mb-4">Detail Siswa Tidak Hadir</h2>` + reportList;
            }
            
            reportContent.innerHTML = summaryStatsHtml + detailedReportHtml;

        } else if (activeView === 'percentage') {
            const allClasses = [...new Set(allTeacherData.flatMap(teacher => 
                teacher.students_by_class ? Object.keys(teacher.students_by_class) : []
            ))].sort();

            const timeFilters = [
                { id: 'daily', text: 'Harian' }, { id: 'weekly', text: 'Mingguan' },
                { id: 'monthly', text: 'Bulanan' }, { id: 'semester1', text: 'Semester I' },
                { id: 'semester2', text: 'Semester II' }, { id: 'yearly', text: 'Tahunan' },
            ];

            percentageContent.innerHTML = `
                <div class="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-slate-100 rounded-lg border border-slate-200">
                    <div class="flex-1">
                        <label class="block text-sm font-medium text-slate-700 mb-2">Periode Waktu</label>
                        <div id="chart-time-filter" class="flex flex-wrap gap-2">
                            ${timeFilters.map(f => `
                                <button data-mode="${f.id}" class="chart-time-btn flex-grow sm:flex-grow-0 text-sm font-semibold py-2 px-4 rounded-lg transition ${state.dashboard.chartViewMode === f.id ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'}">
                                    ${f.text}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    <div class="flex-1 md:max-w-xs">
                        <label for="chart-class-filter" class="block text-sm font-medium text-slate-700 mb-2">Lingkup Kelas</label>
                        <select id="chart-class-filter" class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="all">Seluruh Sekolah</option>
                            ${allClasses.map(c => `<option value="${c}" ${state.dashboard.chartClassFilter === c ? 'selected' : ''}>Kelas ${c}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="flex flex-col md:flex-row items-center justify-center gap-8 p-4">
                    <div id="chart-container" class="relative w-full md:w-1/2" style="max-width: 400px; max-height: 400px;">
                        <canvas id="dashboard-pie-chart"></canvas>
                        <div id="chart-no-data" class="hidden absolute inset-0 flex items-center justify-center">
                            <p class="text-slate-500 bg-white p-4 rounded-lg">Tidak ada data absensi untuk filter yang dipilih.</p>
                        </div>
                    </div>
                    <div id="custom-legend-container" class="w-full md:w-1/2 max-w-xs"></div>
                </div>
                `;

            document.querySelectorAll('.chart-time-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    await setState({ dashboard: { ...state.dashboard, chartViewMode: e.currentTarget.dataset.mode }});
                    renderScreen('dashboard');
                };
            });
            document.getElementById('chart-class-filter').onchange = async (e) => {
                await setState({ dashboard: { ...state.dashboard, chartClassFilter: e.target.value }});
                renderDashboardPanels();
            };

            // --- START: NEW, CORRECTED ATTENDANCE PERCENTAGE CALCULATION ---
            
            // 1. Aggregate all student data from all teachers
            const allStudentsByClass = {};
            allTeacherData.forEach(teacher => {
                if (teacher.students_by_class) {
                    Object.assign(allStudentsByClass, teacher.students_by_class);
                }
            });

            // 2. Determine the total number of students within the current filter scope
            const classFilter = state.dashboard.chartClassFilter;
            let totalStudentsInScope = 0;
            if (classFilter === 'all') {
                totalStudentsInScope = Object.values(allStudentsByClass).reduce((sum, classData) => {
                    return sum + (classData?.students?.length || 0);
                }, 0);
            } else {
                totalStudentsInScope = allStudentsByClass[classFilter]?.students?.length || 0;
            }

            // 3. Filter all logs based on the selected time period
            const today = new Date(state.dashboard.selectedDate + 'T00:00:00');
            today.setHours(0, 0, 0, 0);

            const startOfWeek = new Date(today);
            const dayOfWeek = today.getDay();
            const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday as start of week
            startOfWeek.setDate(diff);
            startOfWeek.setHours(0, 0, 0, 0);

            const allLogsInPeriod = allTeacherData
                .flatMap(teacher => teacher.saved_logs || [])
                .filter(log => {
                    const logDate = new Date(log.date + 'T00:00:00');
                    switch (state.dashboard.chartViewMode) {
                        case 'daily': return logDate.getTime() === today.getTime();
                        case 'weekly': return logDate >= startOfWeek && logDate < new Date(startOfWeek).setDate(startOfWeek.getDate() + 7) ;
                        case 'monthly': return logDate.getFullYear() === today.getFullYear() && logDate.getMonth() === today.getMonth();
                        case 'semester1': // Juli - Desember
                            return logDate.getFullYear() === today.getFullYear() && logDate.getMonth() >= 6 && logDate.getMonth() <= 11;
                        case 'semester2': // Januari - Juni
                            return logDate.getFullYear() === today.getFullYear() && logDate.getMonth() >= 0 && logDate.getMonth() <= 5;
                        case 'yearly': return logDate.getFullYear() === today.getFullYear();
                        default: return true;
                    }
                });

            // 4. Determine the number of school days based on unique log dates
            const uniqueDates = new Set(allLogsInPeriod.map(log => log.date));
            const numSchoolDays = state.dashboard.chartViewMode === 'daily' ? 1 : (uniqueDates.size || 1);
            
            // 5. Calculate total potential attendance records (student-days)
            const totalAttendanceOpportunities = totalStudentsInScope * numSchoolDays;

            // 6. Filter the period logs by the class filter and calculate total absences
            const filteredLogsByClass = allLogsInPeriod.filter(log => classFilter === 'all' || log.class === classFilter);

            const absenceCounts = { S: 0, I: 0, A: 0 };
            filteredLogsByClass.forEach(log => {
                Object.values(log.attendance).forEach(status => {
                    if (absenceCounts[status] !== undefined) {
                        absenceCounts[status]++;
                    }
                });
            });

            // 7. Calculate final counts based on the formula: Hadir = Total - (S + I + A)
            const totalAbsent = absenceCounts.S + absenceCounts.I + absenceCounts.A;
            const totalPresent = Math.max(0, totalAttendanceOpportunities - totalAbsent);

            const finalCounts = {
                H: totalPresent,
                S: absenceCounts.S,
                I: absenceCounts.I,
                A: absenceCounts.A,
            };
            
            const totalRecords = totalAttendanceOpportunities;
            // --- END: NEW, CORRECTED ATTENDANCE PERCENTAGE CALCULATION ---

            const chartCanvas = document.getElementById('dashboard-pie-chart');
            const noDataEl = document.getElementById('chart-no-data');
            const legendContainer = document.getElementById('custom-legend-container');
            
            const chartData = [
                { label: 'Hadir', value: finalCounts.H, color: '#22c55e' },
                { label: 'Sakit', value: finalCounts.S, color: '#fbbf24' },
                { label: 'Izin', value: finalCounts.I, color: '#3b82f6' },
                { label: 'Alpa', value: finalCounts.A, color: '#ef4444' }
            ];

            if (window.dashboardPieChart instanceof Chart) {
                window.dashboardPieChart.destroy();
            }

            if (totalRecords > 0 && chartCanvas && noDataEl && legendContainer) {
                chartCanvas.style.display = 'block';
                noDataEl.classList.add('hidden');
                
                legendContainer.innerHTML = chartData.map((item, index) => {
                    const percentage = totalRecords > 0 ? ((item.value / totalRecords) * 100).toFixed(1) : 0;
                    return `
                    <div class="legend-item flex items-center justify-between p-3 rounded-lg transition duration-200 cursor-pointer" data-index="${index}">
                        <div class="flex items-center gap-3">
                            <span class="w-4 h-4 rounded-full" style="background-color: ${item.color};"></span>
                            <span class="font-semibold text-slate-700">${item.label}</span>
                        </div>
                        <div class="text-right">
                            <span class="font-bold text-slate-800">${item.value}</span>
                            <span class="text-sm text-slate-500 ml-2">(${percentage}%)</span>
                        </div>
                    </div>`;
                }).join('');

                const ctx = chartCanvas.getContext('2d');
                window.dashboardPieChart = new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels: chartData.map(d => d.label),
                        datasets: [{
                            data: chartData.map(d => d.value),
                            backgroundColor: chartData.map(d => d.color),
                            borderColor: '#ffffff',
                            borderWidth: 3,
                            hoverOffset: 12,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: { enabled: true }
                        }
                    }
                });

                const legendItems = legendContainer.querySelectorAll('.legend-item');
                const setActive = (index) => {
                     window.dashboardPieChart.setActiveElements([{ datasetIndex: 0, index: index }]);
                     window.dashboardPieChart.update();
                     legendItems.forEach((item, i) => item.classList.toggle('bg-slate-100', i === index));
                };
                const clearActive = () => {
                     window.dashboardPieChart.setActiveElements([]);
                     window.dashboardPieChart.update();
                     legendItems.forEach(item => item.classList.remove('bg-slate-100'));
                };

                chartCanvas.onpointermove = (e) => {
                    const activeElements = window.dashboardPieChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
                    if (activeElements.length > 0) setActive(activeElements[0].index); else clearActive();
                };
                chartCanvas.onpointerleave = clearActive;
                legendItems.forEach(item => {
                    item.addEventListener('mouseenter', () => setActive(parseInt(item.dataset.index)));
                    item.addEventListener('mouseleave', clearActive);
                });
            } else if (chartCanvas && noDataEl && legendContainer) {
                chartCanvas.style.display = 'none';
                noDataEl.classList.remove('hidden');
                legendContainer.innerHTML = `<p class="text-center text-slate-500 py-8">Tidak ada data untuk ditampilkan di legenda.</p>`;
            }
        } else if (activeView === 'ai') {
            const { isLoading, result, error, selectedRange } = aiRecommendation;

            const aiRanges = [
                { id: 'last30days', text: '30 Hari Terakhir' },
                { id: 'semester', text: 'Semester Ini' },
                { id: 'year', text: 'Tahun Ajaran Ini' },
            ];

            const getAiButtonClass = (rangeId) => {
                return selectedRange === rangeId
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-300';
            };

            let contentHtml = `
                <div class="mb-6 p-4 bg-slate-100 rounded-lg border border-slate-200">
                    <label class="block text-sm font-medium text-slate-700 mb-2">Pilih Periode Analisis</label>
                    <div id="ai-range-filter" class="flex flex-wrap gap-2">
                        ${aiRanges.map(r => `
                            <button data-range="${r.id}" class="ai-range-btn flex-grow sm:flex-grow-0 text-sm font-semibold py-2 px-4 rounded-lg transition ${getAiButtonClass(r.id)}">
                                ${r.text}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;

            if (isLoading) {
                contentHtml += `<div class="text-center py-8"><div class="loader mx-auto"></div><p class="loader-text">Menganalisis data absensi...</p></div></div>`;
            } else if (error) {
                contentHtml += `<div class="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200"><p class="font-bold">Terjadi Kesalahan</p><p>${error}</p><button id="retry-ai-btn" class="mt-4 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg">Coba Lagi</button></div>`;
            } else if (result) {
                contentHtml += renderStructuredAiResponse(result);
            } else {
                contentHtml += `<div class="text-center p-8 bg-slate-50 rounded-lg">
                    <h3 class="text-lg font-bold text-slate-800">Dapatkan Wawasan dengan AI</h3>
                    <p class="text-slate-500 my-4">Pilih periode di atas, lalu klik tombol di bawah untuk meminta Gemini menganalisis data absensi. AI akan menemukan pola, mengidentifikasi siswa yang perlu perhatian, dan memberikan rekomendasi yang dapat ditindaklanjuti.</p>
                    <button id="generate-ai-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg transition">Buat Rekomendasi Sekarang</button>
                </div>`;
            }

            aiContent.innerHTML = contentHtml;

            document.querySelectorAll('.ai-range-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const newRange = e.currentTarget.dataset.range;
                    // Reset result when range changes to force re-generation
                    await setState({ dashboard: { ...state.dashboard, aiRecommendation: { ...state.dashboard.aiRecommendation, selectedRange: newRange, result: null, error: null } } });
                    renderDashboardPanels();
                });
            });

            const generateBtn = document.getElementById('generate-ai-btn');
            if (generateBtn) generateBtn.addEventListener('click', handleGenerateAiRecommendation);
            
            const retryBtn = document.getElementById('retry-ai-btn');
            if (retryBtn) retryBtn.addEventListener('click', handleGenerateAiRecommendation);
        }
    };

    const dashboardPoller = async () => {
        console.log(`Dashboard polling (interval: ${state.dashboard.polling.interval / 1000}s)...`);
        if (state.dashboard.polling.timeoutId) clearTimeout(state.dashboard.polling.timeoutId);

        try {
            const schoolId = state.userProfile.role === 'SUPER_ADMIN' ? state.adminActingAsSchool?.id : state.userProfile.school_id;
            if (!schoolId) {
                if (state.currentScreen === 'dashboard') {
                    const message = state.userProfile.role === 'SUPER_ADMIN' ? 'Konteks sekolah belum dipilih.' : 'Anda belum ditugaskan ke sekolah manapun.';
                    const rc = document.getElementById('dashboard-content-report');
                    const pc = document.getElementById('dashboard-content-percentage');
                    if (rc) rc.innerHTML = `<p class="text-center text-slate-500 py-8">${message}</p>`;
                    if (pc) pc.innerHTML = `<p class="text-center text-slate-500 py-8">${message}</p>`;
                }
                return;
            }

            const { allData } = await apiService.getGlobalData(schoolId);
            let nextInterval;

            if (state.currentScreen !== 'dashboard') {
                console.log("Dashboard poller cycle skipped: User is on a different screen.");
                return;
            }

            if (JSON.stringify(allData) !== JSON.stringify(state.dashboard.allTeacherData)) {
                console.log('Dashboard data changed. Updating view & resetting interval.');
                await setState({ dashboard: { ...state.dashboard, allTeacherData: allData, isDataLoaded: true } });
                renderDashboardPanels();
                nextInterval = INITIAL_POLLING_INTERVAL;
            } else {
                console.log('Dashboard data unchanged. Increasing interval.');
                nextInterval = getNextInterval(state.dashboard.polling.interval);
                if (!state.dashboard.isDataLoaded) {
                     await setState({ dashboard: { ...state.dashboard, allTeacherData: allData, isDataLoaded: true } });
                     renderDashboardPanels();
                }
            }
            
            const newTimeoutId = setTimeout(dashboardPoller, nextInterval);
            await setState({ dashboard: { ...state.dashboard, polling: { timeoutId: newTimeoutId, interval: nextInterval } } });
        } catch (error) {
            console.error("Dashboard poll failed:", error);
            if (!state.dashboard.isDataLoaded && state.currentScreen === 'dashboard') {
                const currentContent = document.querySelector(`#dashboard-content-${state.dashboard.activeView}`);
                if (currentContent) {
                    currentContent.innerHTML = `<p class="text-center text-red-500 py-8">Gagal memuat data: ${error.message}</p>`;
                }
            }
            const newTimeoutId = setTimeout(dashboardPoller, state.dashboard.polling.interval);
            await setState({ dashboard: { ...state.dashboard, polling: { ...state.dashboard.polling, timeoutId: newTimeoutId } } });
        }
    };

    document.getElementById('logoutBtn-ks').addEventListener('click', handleSignOut);
    const backBtn = document.getElementById('dashboard-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => navigateTo(backBtn.dataset.target));
    
    ['report', 'percentage', 'ai'].forEach(view => {
        document.getElementById(`db-view-${view}`).addEventListener('click', async () => {
            await setState({ dashboard: { ...state.dashboard, activeView: view } });
            renderScreen('dashboard'); 
        });
    });

    const datePickerWrapper = document.getElementById('ks-datepicker-wrapper');
    if (datePickerWrapper) {
        let mode = 'daily';
        if (state.dashboard.activeView === 'percentage') {
            if (state.dashboard.chartViewMode === 'weekly') {
                mode = 'weekly';
            } else if (state.dashboard.chartViewMode === 'monthly') {
                mode = 'monthly';
            }
        }
        createCustomDatePicker(
            datePickerWrapper,
            state.dashboard.selectedDate,
            mode
        );
    }

    renderDashboardPanels();
    dashboardPoller();
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
                    await apiService.updateUsersBulkConfiguration({
                        targetEmails: state.adminPanel.selectedUsers,
                        newSchoolId: selectedSchool.id
                    });
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
                    await apiService.updateUsersBulkConfiguration({
                        targetEmails: state.adminPanel.selectedUsers,
                        newRole: newRole
                    });
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

    if (groupBySchool && state.userProfile.role === 'SUPER_ADMIN') {
        usersToRender.sort((a, b) => {
            const schoolA = a.school_name || 'zzz_Unassigned';
            const schoolB = b.school_name || 'zzz_Unassigned';
            if (schoolA < schoolB) return -1;
            if (schoolA > schoolB) return 1;
            return a.name.localeCompare(b.name);
        });
    } else {
        usersToRender.sort((a, b) => a.name.localeCompare(b.name));
    }

    const totalPages = Math.ceil(usersToRender.length / USERS_PER_PAGE);
    const validCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1));
    const startIndex = (validCurrentPage - 1) * USERS_PER_PAGE;
    const endIndex = startIndex + USERS_PER_PAGE;
    const paginatedUsers = usersToRender.slice(startIndex, endIndex);

    const paginatedUserEmails = new Set(paginatedUsers.map(u => u.email));
    const allVisibleSelected = paginatedUsers.length > 0 && [...paginatedUserEmails].every(email => selectedUsers.includes(email));

    let tableHtml = `
        <table class="w-full text-left">
            <thead>
                <tr class="border-b bg-slate-50">
                    <th class="p-3 w-12 text-center">
                        <input type="checkbox" id="select-all-users-checkbox" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" ${allVisibleSelected ? 'checked' : ''} />
                    </th>
                    <th class="p-3 text-sm font-semibold text-slate-600">Pengguna</th>
                    <th class="p-3 text-sm font-semibold text-slate-600">Peran</th>
                    <th class="p-3 text-sm font-semibold text-slate-600">Sekolah</th>
                    <th class="p-3 text-sm font-semibold text-slate-600 text-center">Tindakan</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    if (paginatedUsers.length === 0) {
        tableHtml += `<tr><td colspan="5" class="text-center text-slate-500 py-8">Tidak ada pengguna yang cocok.</td></tr>`;
    } else {
        let currentSchoolName = null;
        paginatedUsers.forEach(user => {
            if (groupBySchool && state.userProfile.role === 'SUPER_ADMIN' && user.school_name !== currentSchoolName) {
                currentSchoolName = user.school_name;
                const schoolName = currentSchoolName || 'Belum Ditugaskan';
                tableHtml += `
                    <tr class="bg-slate-100 sticky top-0">
                        <td colspan="5" class="p-2 font-bold text-slate-600">${schoolName}</td>
                    </tr>
                `;
            }
            
            const isNew = user.is_unmanaged;
            const newBadge = isNew ? `<span class="ml-2 px-2 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">BARU</span>` : '';

            tableHtml += `
                <tr class="border-b hover:bg-slate-50 transition">
                     <td class="p-3 text-center">
                        <input type="checkbox" class="user-select-checkbox h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" value="${user.email}" ${selectedUsers.includes(user.email) ? 'checked' : ''} />
                    </td>
                    <td class="p-3">
                        <div class="flex items-center gap-3">
                            <img src="${user.picture}" alt="${user.name}" class="w-10 h-10 rounded-full"/>
                            <div>
                                <p class="font-medium text-slate-800">${user.name}${newBadge}</p>
                                <p class="text-xs text-slate-500">${user.email}</p>
                            </div>
                        </div>
                    </td>
                    <td class="p-3 text-sm text-slate-600">${user.role}</td>
                    <td class="p-3 text-sm text-slate-600">${user.school_name || '<span class="italic text-slate-400">Belum Ditugaskan</span>'}</td>
                    <td class="p-3 text-center">
                        <button class="manage-user-btn bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold py-2 px-3 rounded-lg text-sm transition" 
                                data-user='${JSON.stringify(user)}'>
                            Kelola
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;

    const paginationContainer = document.getElementById('admin-pagination-container');
    if (paginationContainer) {
        if (totalPages > 1) {
            paginationContainer.innerHTML = `
                <button id="prev-page-btn" class="font-semibold py-1 px-3 rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed bg-white hover:bg-slate-50 text-slate-700 border border-slate-300" ${validCurrentPage === 1 ? 'disabled' : ''}>
                    Sebelumnya
                </button>
                <span>Halaman ${validCurrentPage} dari ${totalPages}</span>
                <button id="next-page-btn" class="font-semibold py-1 px-3 rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed bg-white hover:bg-slate-50 text-slate-700 border border-slate-300" ${validCurrentPage === totalPages ? 'disabled' : ''}>
                    Berikutnya
                </button>
            `;
            
            const prevBtn = document.getElementById('prev-page-btn');
            if (prevBtn) {
                prevBtn.addEventListener('click', async () => {
                    await setState({ adminPanel: { ...state.adminPanel, currentPage: state.adminPanel.currentPage - 1 }});
                    renderAdminPanelTable(container, allUsers, allSchools);
                });
            }

            const nextBtn = document.getElementById('next-page-btn');
            if (nextBtn) {
                nextBtn.addEventListener('click', async () => {
                    await setState({ adminPanel: { ...state.adminPanel, currentPage: state.adminPanel.currentPage + 1 }});
                    renderAdminPanelTable(container, allUsers, allSchools);
                });
            }

        } else {
            paginationContainer.innerHTML = '';
        }
    }
}


async function renderAdminPanelScreen() {
    appContainer.innerHTML = templates.adminPanel();
    document.getElementById('admin-panel-back-btn').addEventListener('click', () => navigateTo('adminHome'));
    if (document.getElementById('add-school-btn')) {
        document.getElementById('add-school-btn').addEventListener('click', handleCreateSchool);
    }
    const groupBySchoolToggle = document.getElementById('group-by-school-toggle');
    if (groupBySchoolToggle) {
        groupBySchoolToggle.checked = state.adminPanel.groupBySchool;
        groupBySchoolToggle.addEventListener('change', async (e) => {
            await setState({ 
                adminPanel: { 
                    ...state.adminPanel, 
                    groupBySchool: e.target.checked,
                    currentPage: 1 
                } 
            });
            renderAdminPanelTable(
                document.getElementById('admin-panel-container'), 
                state.adminPanel.users, 
                state.adminPanel.schools
            );
        });
    }
    const container = document.getElementById('admin-panel-container');

    container.addEventListener('click', async (e) => {
        const target = e.target;
        
        if (target.classList.contains('user-select-checkbox')) {
            const email = target.value;
            const currentSelected = [...state.adminPanel.selectedUsers];
            if (target.checked) {
                if (!currentSelected.includes(email)) currentSelected.push(email);
            } else {
                const index = currentSelected.indexOf(email);
                if (index > -1) currentSelected.splice(index, 1);
            }
            await setState({ adminPanel: { ...state.adminPanel, selectedUsers: currentSelected } });
            renderAdminPanelTable(container, state.adminPanel.users, state.adminPanel.schools);
            renderBulkActionsBar();
        }

        if (target.id === 'select-all-users-checkbox') {
            const { currentPage, users, selectedUsers: currentSelected } = state.adminPanel;
            const startIndex = (currentPage - 1) * USERS_PER_PAGE;
            const endIndex = startIndex + USERS_PER_PAGE;
            const paginatedEmails = users.slice(startIndex, endIndex).map(u => u.email);
            let newSelected = [...currentSelected];

            if (target.checked) {
                paginatedEmails.forEach(email => {
                    if (!newSelected.includes(email)) newSelected.push(email);
                });
            } else {
                newSelected = newSelected.filter(email => !paginatedEmails.includes(email));
            }
            await setState({ adminPanel: { ...state.adminPanel, selectedUsers: newSelected } });
            renderAdminPanelTable(container, state.adminPanel.users, state.adminPanel.schools);
            renderBulkActionsBar();
        }
        
        if (target.classList.contains('manage-user-btn')) {
            const user = JSON.parse(target.dataset.user);
            showManageUserModal(user, state.adminPanel.schools);
        }
    });

    await setState({ adminPanel: { ...state.adminPanel, isLoading: true } });
    container.innerHTML = `<p class="text-center text-slate-500 py-8">Memuat daftar pengguna...</p>`;

    const adminPanelPoller = async () => {
        console.log(`Admin panel polling (interval: ${state.adminPanel.polling.interval / 1000}s)...`);

        if (state.adminPanel.polling.timeoutId) {
            clearTimeout(state.adminPanel.polling.timeoutId);
        }

        try {
            const isSuperAdmin = state.userProfile.role === 'SUPER_ADMIN';
            
            const usersPromise = apiService.getAllUsers();
            const schoolsPromise = isSuperAdmin ? apiService.getAllSchools() : Promise.resolve({ allSchools: state.adminPanel.schools });

            const [{ allUsers }, { allSchools }] = await Promise.all([usersPromise, schoolsPromise]);

            const oldData = { users: state.adminPanel.users, schools: state.adminPanel.schools };
            const newData = { users: allUsers, schools: allSchools };
            let nextInterval;

            if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
                console.log("Admin panel data changed. Updating view & resetting interval.");
                if (oldData.users.length > 0 && oldData.users.length < newData.users.length) {
                    const oldUserEmails = new Set(oldData.users.map(u => u.email));
                    newData.users.forEach(newUser => {
                        if (!oldUserEmails.has(newUser.email)) {
                            showNotification(`${newUser.name} baru saja mendaftar.`, 'info');
                        }
                    });
                }
                
                const totalPages = Math.ceil(allUsers.length / USERS_PER_PAGE);
                const newCurrentPage = Math.min(state.adminPanel.currentPage, totalPages) || 1;

                await setState({ adminPanel: { ...state.adminPanel, ...newData, isLoading: false, currentPage: newCurrentPage } });
                renderAdminPanelTable(container, allUsers, allSchools);
                renderBulkActionsBar();
                nextInterval = INITIAL_POLLING_INTERVAL;
            } else {
                console.log("Admin panel data unchanged. Increasing interval.");
                nextInterval = getNextInterval(state.adminPanel.polling.interval);
                if (state.adminPanel.isLoading) {
                    await setState({ adminPanel: { ...state.adminPanel, ...newData, isLoading: false } });
                    renderAdminPanelTable(container, allUsers, allSchools);
                    renderBulkActionsBar();
                }
            }

            const newTimeoutId = setTimeout(adminPanelPoller, nextInterval);
            await setState({ adminPanel: { ...state.adminPanel, polling: { timeoutId: newTimeoutId, interval: nextInterval } } });
        } catch(error) {
            console.error("Admin Panel poll failed:", error);
            if (state.adminPanel.isLoading) {
                if (container && state.currentScreen === 'adminPanel') {
                    container.innerHTML = `<p class="text-center text-red-500 py-8">Gagal memuat data: ${error.message}</p>`;
                }
            }
            
            const newTimeoutId = setTimeout(adminPanelPoller, state.adminPanel.polling.interval);
            await setState({ adminPanel: { ...state.adminPanel, polling: { ...state.adminPanel.polling, timeoutId: newTimeoutId } } });
        }
    };

    adminPanelPoller();
}

function showManageUserModal(user, schools) {
    const existingModal = document.getElementById('manage-user-modal');
    if (existingModal) existingModal.parentElement.remove();
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = templates.manageUserModal(user, schools);
    document.body.appendChild(modalContainer);

    const closeModal = () => {
        if (document.body.contains(modalContainer)) {
            document.body.removeChild(modalContainer);
        }
    };

    const roleSelect = document.getElementById('role-select-modal');
    const classesContainer = document.getElementById('manage-classes-container');
    const schoolSelect = document.getElementById('school-select-modal');

    roleSelect.addEventListener('change', () => {
        classesContainer.classList.toggle('hidden', roleSelect.value !== 'GURU');
        if (schoolSelect) {
            const isTargetSuperAdmin = roleSelect.value === 'SUPER_ADMIN';
            schoolSelect.disabled = isTargetSuperAdmin;
            schoolSelect.classList.toggle('bg-slate-100', isTargetSuperAdmin);
            schoolSelect.classList.toggle('cursor-not-allowed', isTargetSuperAdmin);
             if (isTargetSuperAdmin) {
                schoolSelect.value = ""; // Auto-set to unassigned
            }
        }
    });

    document.getElementById('manage-user-cancel-btn').onclick = closeModal;
    document.getElementById('manage-user-save-btn').onclick = async () => {
        const newRole = document.getElementById('role-select-modal').value;
        const newSchoolId = schoolSelect ? schoolSelect.value : state.userProfile.school_id.toString();
        const newClasses = Array.from(document.querySelectorAll('.class-checkbox:checked')).map(cb => cb.value);

        showLoader('Menyimpan perubahan...');
        try {
            await apiService.updateUserConfiguration(user.email, newRole, newSchoolId, newClasses);
            showNotification('Konfigurasi pengguna berhasil diperbarui.');
            closeModal();
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
    
    // --- Setup DOM Elements and Event Listeners ---
    const backButton = document.getElementById('data-back-to-start-btn');
    const container = document.getElementById('data-container');
    const titleEl = document.getElementById('data-title');
    const studentNameInput = document.getElementById('filter-student-name');
    const statusSelect = document.getElementById('filter-status');
    const startDateInput = document.getElementById('filter-start-date');
    const endDateInput = document.getElementById('filter-end-date');
    const clearButton = document.getElementById('clear-filters-btn');

    backButton.addEventListener('click', () => {
        const isAdmin = state.userProfile?.role === 'SUPER_ADMIN' || state.userProfile?.role === 'ADMIN_SEKOLAH';
        const targetScreen = isAdmin ? 'adminHome' : 'setup';
        navigateTo(targetScreen);
    });

    // --- State & Filter Handling ---
    const { studentName, status, startDate, endDate } = state.dataScreenFilters;
    studentNameInput.value = studentName;
    statusSelect.value = status;
    startDateInput.value = startDate;
    endDateInput.value = endDate;

    const applyFilters = () => {
        if (applyFilters.timeout) clearTimeout(applyFilters.timeout);
        applyFilters.timeout = setTimeout(async () => {
            await setState({
                dataScreenFilters: {
                    studentName: studentNameInput.value.trim(),
                    status: statusSelect.value,
                    startDate: startDateInput.value,
                    endDate: endDateInput.value
                }
            });
            renderDataScreen(); // Re-render the screen with new state
        }, studentNameInput === document.activeElement ? 300 : 0); // Debounce for text input
    };
    
    studentNameInput.addEventListener('input', applyFilters);
    statusSelect.addEventListener('change', applyFilters);
    startDateInput.addEventListener('change', applyFilters);
    endDateInput.addEventListener('change', applyFilters);

    clearButton.addEventListener('click', async () => {
        if (applyFilters.timeout) clearTimeout(applyFilters.timeout);
        await setState({
            dataScreenFilters: { studentName: '', status: 'all', startDate: '', endDate: '' }
        });
        renderDataScreen();
    });

    // --- Data Retrieval and Context Setting ---
    const isAdmin = state.userProfile.role === 'SUPER_ADMIN' || state.userProfile.role === 'ADMIN_SEKOLAH';
    const isAdminGlobalView = state.userProfile.role === 'SUPER_ADMIN' && state.adminAllLogsView;

    let logsToShow;
    if (isAdminGlobalView) {
        logsToShow = state.adminAllLogsView;
        titleEl.textContent = `Semua Riwayat Absensi (Tampilan Super Admin)`;
    } else if (isAdmin && state.schoolDataContext) {
        logsToShow = state.schoolDataContext.savedLogs;
        if (state.historyClassFilter) {
            logsToShow = logsToShow.filter(log => log.class === state.historyClassFilter);
            titleEl.textContent = `Riwayat Absensi Kelas ${state.historyClassFilter}`;
        } else {
            titleEl.textContent = `Semua Riwayat Absensi Sekolah`;
        }
    } else {
        logsToShow = state.historyClassFilter 
            ? state.savedLogs.filter(log => log.class === state.historyClassFilter)
            : state.savedLogs;
        titleEl.textContent = state.historyClassFilter 
            ? `Riwayat Absensi Kelas ${state.historyClassFilter}` 
            : `Semua Riwayat Absensi Saya`;
    }
        
    const hasActiveFilters = studentName || startDate || endDate || status !== 'all';
    if (logsToShow.length === 0 && !hasActiveFilters) {
        container.innerHTML = `<p class="text-center text-slate-500">Belum ada riwayat absensi yang tersimpan untuk tampilan ini.</p>`;
        return;
    }

    // --- Applying Filters ---
    let filteredLogs = [...logsToShow];
    if (startDate) filteredLogs = filteredLogs.filter(log => log.date >= startDate);
    if (endDate) filteredLogs = filteredLogs.filter(log => log.date <= endDate);

    const processedLogs = filteredLogs.map(log => {
        let absentStudents = Object.entries(log.attendance).filter(([_, s]) => s !== 'H');
        if (studentName) absentStudents = absentStudents.filter(([name, _]) => name.toLowerCase().includes(studentName.toLowerCase()));
        if (status !== 'all') absentStudents = absentStudents.filter(([_, s]) => s === status);
        
        return absentStudents.length > 0 ? { ...log, filteredAbsences: absentStudents } : null;
    }).filter(Boolean);

    // --- Rendering Results ---
    if (processedLogs.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500">Tidak ada riwayat absensi yang cocok dengan filter yang diterapkan.</p>`;
        return;
    }

    const groupedByDate = processedLogs.reduce((acc, log) => {
        if (!acc[log.date]) acc[log.date] = [];
        acc[log.date].push(log);
        return acc;
    }, {});

    container.innerHTML = Object.entries(groupedByDate)
        .sort((a, b) => new Date(b[0]) - new Date(a[0]))
        .map(([date, logs]) => {
            const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const logsHtml = logs.map(log => {
                const contentHtml = `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-slate-500"><th class="py-1 pr-4 font-medium">Nama Siswa</th><th class="py-1 px-2 font-medium">Status</th></tr></thead><tbody>${log.filteredAbsences.map(([name, status]) => `<tr class="border-t border-slate-200"><td class="py-2 pr-4 text-slate-700">${name}</td><td class="py-2 px-2"><span class="px-2 py-1 rounded-full text-xs font-semibold ${status === 'S' ? 'bg-yellow-100 text-yellow-800' : status === 'I' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}">${status}</span></td></tr>`).join('')}</tbody></table></div>`;
                const teacherInfo = log.teacherName ? `<p class="text-xs text-slate-400 font-medium">Oleh: ${log.teacherName}</p>` : '';

                return `<div class="bg-slate-50 p-4 rounded-lg">
                            <div class="flex justify-between items-center mb-2">
                                <h3 class="font-bold text-blue-600">Kelas ${log.class}</h3>
                                ${teacherInfo}
                            </div>
                            ${contentHtml}
                        </div>`;
            }).join('');

            return `<div><h2 class="text-lg font-semibold text-slate-700 mb-3">${displayDate}</h2><div class="space-y-4">${logsHtml}</div></div>`;
        }).join('');
}


function renderRecapScreen() {
    appContainer.innerHTML = templates.recap();
    const isAdmin = state.userProfile?.role === 'SUPER_ADMIN' || state.userProfile?.role === 'ADMIN_SEKOLAH';
    document.getElementById('recap-back-to-start-btn').addEventListener('click', () => {
        const targetScreen = isAdmin ? 'adminHome' : 'setup';
        navigateTo(targetScreen);
    });
    document.getElementById('sort-by-total-btn').addEventListener('click', () => { setState({ recapSortOrder: 'total' }); renderRecapScreen(); });
    document.getElementById('sort-by-absen-btn').addEventListener('click', () => { setState({ recapSortOrder: 'absen' }); renderRecapScreen(); });

    const container = document.getElementById('recap-container');
    
    // Determine which data to use: school-wide context for admins, or personal data for others.
    const dataContext = (isAdmin && state.schoolDataContext) 
        ? state.schoolDataContext 
        : { studentsByClass: state.studentsByClass, savedLogs: state.savedLogs };

    const { studentsByClass: studentsByClassToUse, savedLogs: logsToUse } = dataContext;

    if (!studentsByClassToUse || Object.keys(studentsByClassToUse).length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500">Belum ada data siswa untuk ditampilkan.</p>`;
        return;
    }

    const recapData = {};
    const studentToClassMap = {};

    for (const className in studentsByClassToUse) {
        if (studentsByClassToUse[className] && studentsByClassToUse[className].students) {
            studentsByClassToUse[className].students.forEach(studentName => {
                recapData[studentName] = { S: 0, I: 0, A: 0 };
                studentToClassMap[studentName] = className;
            });
        }
    }

    logsToUse.forEach(log => {
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
            const classStudents = studentsByClassToUse[a.class]?.students;
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
    appContainer.innerHTML = '';
    
    switch(screen) {
        case 'setup':
            renderSetupScreen();
            break;
        case 'adminHome':
            renderAdminHomeScreen();
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
                const isAdmin = state.userProfile?.role === 'SUPER_ADMIN' || state.userProfile?.role === 'ADMIN_SEKOLAH';
                const targetScreen = isAdmin ? 'adminHome' : 'setup';
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
        case 'maintenance':
            appContainer.innerHTML = templates.maintenance();
            break;
        default:
            renderSetupScreen();
    }

    hideLoader();
}
