import { state, setState, navigateTo, handleStartAttendance, handleManageStudents, handleViewHistory, handleDownloadData, handleSaveNewStudents, handleExcelImport, handleDownloadTemplate, handleSaveAttendance, handleGenerateAiRecommendation, handleCreateSchool, CLASSES } from './main.js';
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

export function showNotification(message, type = 'success') {
    notificationEl.textContent = message;
    notificationEl.className = ''; // Clear previous classes
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
        document.getElementById('recapBtn').addEventListener('click', () => navigateTo('recap'));
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
                await setState({ setup: { ...state.setup, polling: { ...state.setup.polling, timeoutId: newTimeoutId } } });
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
        try {
            const { isMaintenance } = await apiService.getMaintenanceStatus();
            renderMaintenanceToggle(maintenanceContainer, isMaintenance);
        } catch (e) {
            maintenanceContainer.innerHTML = `<p class="text-sm text-red-500">Gagal memuat status mode perbaikan.</p>`;
        }
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
            if (classNames.length === 0 || classNames.every(c => absentStudentsByClass[c].students.length === 0)) {
                reportContent.innerHTML = `<p class="text-center text-slate-500 py-8">Tidak ada siswa yang absen pada tanggal yang dipilih.</p>`;
            } else {
                reportContent.innerHTML = classNames.map(className => {
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
            }
        } else if (activeView === 'percentage') {
            const allClasses = [...new Set(allTeacherData.flatMap(teacher => 
                teacher.students_by_class ? Object.keys(teacher.students_by_class) : []
            ))].sort();

            const timeFilters = [
                { id: 'daily', text: 'Harian' }, { id: 'weekly', text: 'Mingguan' },
                { id: 'monthly', text: 'Bulanan' }, { id: 'yearly', text: 'Tahunan' },
            ];

            percentageContent.innerHTML = `
                <div class="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-slate-100 rounded-lg border border-slate-200">
                    <div class="flex-1">
                        <label class="block text-sm font-medium text-slate-700 mb-2">Periode Waktu</label>
                        <div id="chart-time-filter" class="flex flex-wrap gap-2">
                            ${timeFilters.map(f => `
                                <button data-mode="${f.id}" class="chart-time-btn flex-1 sm:flex-initial text-sm font-semibold py-2 px-4 rounded-lg transition ${state.dashboard.chartViewMode === f.id ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'}">
                                    ${f.text}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    <div class="flex-1">
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
                    renderDashboardPanels();
                };
            });
            document.getElementById('chart-class-filter').onchange = async (e) => {
                await setState({ dashboard: { ...state.dashboard, chartClassFilter: e.target.value }});
                renderDashboardPanels();
            };

            const counts = { H: 0, S: 0, I: 0, A: 0 };
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const startOfWeek = new Date(today);
            const dayOfWeek = today.getDay();
            const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            startOfWeek.setDate(diff);
            startOfWeek.setHours(0, 0, 0, 0);

            const filteredLogs = allTeacherData
                .flatMap(teacher => teacher.saved_logs || [])
                .filter(log => {
                    const logDate = new Date(log.date + 'T00:00:00');
                    switch (state.dashboard.chartViewMode) {
                        case 'daily': return logDate.getTime() === new Date(state.dashboard.selectedDate + 'T00:00:00').getTime();
                        case 'weekly': return logDate >= startOfWeek;
                        case 'monthly': return logDate.getFullYear() === today.getFullYear() && logDate.getMonth() === today.getMonth();
                        case 'yearly': return logDate.getFullYear() === today.getFullYear();
                        default: return true;
                    }
                })
                .filter(log => state.dashboard.chartClassFilter === 'all' || log.class === state.dashboard.chartClassFilter);

            filteredLogs.forEach(log => {
                Object.values(log.attendance).forEach(status => {
                    if (counts[status] !== undefined) counts[status]++;
                });
            });

            const totalRecords = Object.values(counts).reduce((sum, val) => sum + val, 0);
            const chartCanvas = document.getElementById('dashboard-pie-chart');
            const noDataEl = document.getElementById('chart-no-data');
            const legendContainer = document.getElementById('custom-legend-container');
            
            const chartData = [
                { label: 'Hadir', value: counts.H, color: '#22c55e' },
                { label: 'Sakit', value: counts.S, color: '#fbbf24' },
                { label: 'Izin', value: counts.I, color: '#3b82f6' },
                { label: 'Alpa', value: counts.A, color: '#ef4444' }
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
            const { isLoading, result, error } = aiRecommendation;
            if (isLoading) {
                aiContent.innerHTML = `<div class="text-center py-8"><div class="loader mx-auto"></div><p class="loader-text">Menganalisis data absensi...</p></div>`;
            } else if (error) {
                aiContent.innerHTML = `<div class="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200"><p class="font-bold">Terjadi Kesalahan</p><p>${error}</p><button id="retry-ai-btn" class="mt-4 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg">Coba Lagi</button></div>`;
                document.getElementById('retry-ai-btn').addEventListener('click', handleGenerateAiRecommendation);
            } else if (result) {
                aiContent.innerHTML = renderStructuredAiResponse(result);
            } else {
                aiContent.innerHTML = `<div class="text-center p-8 bg-slate-50 rounded-lg">
                    <h3 class="text-lg font-bold text-slate-800">Dapatkan Wawasan dengan AI</h3>
                    <p class="text-slate-500 my-4">Klik tombol di bawah untuk meminta Gemini menganalisis data absensi 30 hari terakhir. AI akan menemukan pola, mengidentifikasi siswa yang perlu perhatian, dan memberikan rekomendasi yang dapat ditindaklanjuti.</p>
                    <button id="generate-ai-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg transition">Buat Rekomendasi Sekarang</button>
                </div>`;
                document.getElementById('generate-ai-btn').addEventListener('click', handleGenerateAiRecommendation);
            }
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
    document.getElementById('ks-date-picker').addEventListener('change', async (e) => {
        await setState({ dashboard: { ...state.dashboard, selectedDate: e.target.value, chartViewMode: 'daily' } });
        renderDashboardPanels();
    });

    renderDashboardPanels();
    dashboardPoller();
}

function renderAdminPanelTable(container, allUsers, allSchools) {
    const { currentPage, groupBySchool } = state.adminPanel;
    let usersToRender = [...allUsers];

    // 1. Logika Pengurutan & Pengelompokan
    if (groupBySchool && state.userProfile.role === 'SUPER_ADMIN') {
        usersToRender.sort((a, b) => {
            const schoolA = allSchools.find(s => s.id === a.school_id)?.name || 'zzz_Unassigned';
            const schoolB = allSchools.find(s => s.id === b.school_id)?.name || 'zzz_Unassigned';
            if (schoolA < schoolB) return -1;
            if (schoolA > schoolB) return 1;
            return a.name.localeCompare(b.name);
        });
    } else {
        usersToRender.sort((a, b) => a.name.localeCompare(b.name));
    }

    // 2. Logika Paginasi
    const totalPages = Math.ceil(usersToRender.length / USERS_PER_PAGE);
    const validCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1));
    const startIndex = (validCurrentPage - 1) * USERS_PER_PAGE;
    const endIndex = startIndex + USERS_PER_PAGE;
    const paginatedUsers = usersToRender.slice(startIndex, endIndex);

    // 3. Merender Tabel
    let tableHtml = `
        <table class="w-full text-left">
            <thead>
                <tr class="border-b bg-slate-50">
                    <th class="p-3 text-sm font-semibold text-slate-600">Pengguna</th>
                    <th class="p-3 text-sm font-semibold text-slate-600">Peran</th>
                    <th class="p-3 text-sm font-semibold text-slate-600">Sekolah</th>
                    <th class="p-3 text-sm font-semibold text-slate-600 text-center">Tindakan</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    if (paginatedUsers.length === 0) {
        tableHtml += `<tr><td colspan="4" class="text-center text-slate-500 py-8">Tidak ada pengguna yang cocok.</td></tr>`;
    } else {
        let currentSchoolId = -1; 
        paginatedUsers.forEach(user => {
            if (groupBySchool && state.userProfile.role === 'SUPER_ADMIN' && user.school_id !== currentSchoolId) {
                currentSchoolId = user.school_id;
                const school = allSchools.find(s => s.id === currentSchoolId);
                const schoolName = school ? school.name : 'Belum Ditugaskan';
                tableHtml += `
                    <tr class="bg-slate-100 sticky top-0">
                        <td colspan="4" class="p-2 font-bold text-slate-600">${schoolName}</td>
                    </tr>
                `;
            }
            
            const school = allSchools.find(s => s.id === user.school_id);
            const isNew = user.is_unmanaged;
            const newBadge = isNew ? `<span class="ml-2 px-2 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">BARU</span>` : '';

            tableHtml += `
                <tr class="border-b hover:bg-slate-50 transition">
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
                    <td class="p-3 text-sm text-slate-600">${school ? school.name : '<span class="italic text-slate-400">Belum Ditugaskan</span>'}</td>
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

    // 4. Merender Kontrol Paginasi
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
    
    // 5. Melampirkan kembali Event Listener untuk tombol kelola
    document.querySelectorAll('.manage-user-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const user = JSON.parse(e.currentTarget.dataset.user);
            showManageUserModal(user, allSchools);
        });
    });
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

    await setState({ adminPanel: { ...state.adminPanel, isLoading: true } });
    container.innerHTML = `<p class="text-center text-slate-500 py-8">Memuat daftar pengguna...</p>`;

    const adminPanelPoller = async () => {
        console.log(`Admin panel polling (interval: ${state.adminPanel.polling.interval / 1000}s)...`);

        if (state.adminPanel.polling.timeoutId) {
            clearTimeout(state.adminPanel.polling.timeoutId);
        }

        try {
            const [{ allUsers }, { allSchools }] = await Promise.all([
                apiService.getAllUsers(),
                state.userProfile.role === 'SUPER_ADMIN' ? apiService.getAllSchools() : Promise.resolve({ allSchools: [] })
            ]);

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

                renderAdminPanelTable(container, allUsers, allSchools);
                await setState({ adminPanel: { ...state.adminPanel, ...newData, isLoading: false, currentPage: newCurrentPage } });
                nextInterval = INITIAL_POLLING_INTERVAL;
            } else {
                console.log("Admin panel data unchanged. Increasing interval.");
                nextInterval = getNextInterval(state.adminPanel.polling.interval);
                if (state.adminPanel.isLoading) {
                    renderAdminPanelTable(container, allUsers, allSchools);
                    await setState({ adminPanel: { ...state.adminPanel, ...newData, isLoading: false } });
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
    document.getElementById('data-back-to-start-btn').addEventListener('click', () => {
        const targetScreen = state.userProfile.role === 'SUPER_ADMIN' ? 'adminHome' : 'setup';
        navigateTo(targetScreen);
    });
    const container = document.getElementById('data-container');
    const titleEl = document.getElementById('data-title');
    
    const isAdminGlobalView = state.userProfile.role === 'SUPER_ADMIN' && state.adminAllLogsView;

    const logsToShow = isAdminGlobalView 
        ? state.adminAllLogsView
        : (state.historyClassFilter 
            ? state.savedLogs.filter(log => log.class === state.historyClassFilter)
            : state.savedLogs);
        
    if (isAdminGlobalView) {
        titleEl.textContent = `Semua Riwayat Absensi (Tampilan Admin)`;
    } else if (state.historyClassFilter) {
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
        case 'maintenance':
            appContainer.innerHTML = templates.maintenance();
            break;
        default:
            renderSetupScreen();
    }

    hideLoader();
}
