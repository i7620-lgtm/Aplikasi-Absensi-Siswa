import { state, setState, navigateTo, handleStartAttendance, handleManageStudents, handleViewHistory, handleDownloadData, handleSaveNewStudents, handleExcelImport, handleDownloadTemplate, handleSaveAttendance } from './main.js';
import { templates } from './templates.js';
import { handleSignIn, handleSignOut } from './auth.js';
import { apiService } from './api.js';

const appContainer = document.getElementById('app-container');
const loaderWrapper = document.getElementById('loader-wrapper');
const notificationEl = document.getElementById('notification');
const offlineIndicator = document.getElementById('offline-indicator');


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
                        // If denied, don't ask again. Treat as dismissed.
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

        const availableClasses = isAdmin ? state.CLASSES : (state.userProfile?.assigned_classes || []);
        document.getElementById('class-select').value = state.selectedClass || availableClasses[0] || '';
    }
    
    // --- START: Real-time update for Teacher's profile ---
    if (isTeacher) {
        const updateTeacherProfile = async () => {
            console.log("Checking for teacher profile updates...");
            try {
                const { userProfile: latestProfile } = await apiService.getUserProfile();
                const hasChanged = JSON.stringify(latestProfile.assigned_classes) !== JSON.stringify(state.userProfile.assigned_classes);
                
                if (hasChanged) {
                    console.log("Teacher profile has changed, re-rendering.");
                    // Stop the current interval before re-rendering
                    if (state.setup.pollingIntervalId) {
                        clearInterval(state.setup.pollingIntervalId);
                    }
                    await setState({ 
                        userProfile: latestProfile,
                        setup: { ...state.setup, pollingIntervalId: null }
                    });
                    showNotification('Hak akses kelas Anda telah diperbarui oleh admin.', 'info');
                    renderScreen('setup'); // Re-render the screen which will start a new poll
                }
            } catch (error) {
                console.error("Failed to fetch teacher profile update:", error);
                // Don't show error to user to avoid disruption
            }
        };

        if (state.setup.pollingIntervalId) {
            clearInterval(state.setup.pollingIntervalId);
        }
        const newIntervalId = setInterval(updateTeacherProfile, 10000); // Check every 10 seconds
        setState({ setup: { ...state.setup, pollingIntervalId: newIntervalId } });
        console.log(`Setup (Teacher) polling started with ID: ${newIntervalId}.`);
    }
    // --- END: Real-time update for Teacher's profile ---
}

function renderMaintenanceToggle(container, isMaintenance) {
    const statusText = isMaintenance ? 'Aktif' : 'Tidak Aktif';
    const statusColor = isMaintenance ? 'text-red-600' : 'text-green-600';
    const buttonText = isMaintenance ? 'Nonaktifkan' : 'Aktifkan';
    const buttonColor = isMaintenance ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600';

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
                renderMaintenanceToggle(container, newState); // Re-render toggle with new state
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
    document.getElementById('go-to-attendance-btn').addEventListener('click', () => navigateTo('setup'));
    document.getElementById('view-dashboard-btn').addEventListener('click', () => navigateTo('dashboard'));
    document.getElementById('view-admin-panel-btn').addEventListener('click', () => navigateTo('adminPanel'));

    // Render dan kelola tombol mode perbaikan
    const maintenanceContainer = document.getElementById('maintenance-toggle-container');
    try {
        const { isMaintenance } = await apiService.getMaintenanceStatus();
        renderMaintenanceToggle(maintenanceContainer, isMaintenance);
    } catch (e) {
        maintenanceContainer.innerHTML = `<p class="text-sm text-red-500">Gagal memuat status mode perbaikan.</p>`;
    }
}


async function renderDashboardScreen() {
    appContainer.innerHTML = templates.dashboard();
    document.getElementById('logoutBtn-ks').addEventListener('click', handleSignOut);
    
    const backBtn = document.getElementById('dashboard-back-btn');
    if(backBtn) {
        const target = backBtn.dataset.target;
        backBtn.addEventListener('click', () => navigateTo(target));
    }
    
    document.getElementById('ks-date-picker').addEventListener('change', async (e) => {
        // Stop the poll, update date, then re-render to start new poll.
        navigateTo('dashboard'); 
        await setState({ 
            dashboard: { 
                ...state.dashboard, 
                selectedDate: e.target.value,
                pollingIntervalId: null 
            } 
        });
        renderScreen('dashboard');
    });

    const dashboardContent = document.getElementById('dashboard-content');

    const updateDashboardContent = async () => {
        console.log('Dashboard is refreshing...');
        try {
            const { allData } = await apiService.getGlobalData();
            const selectedDate = state.dashboard.selectedDate;
            
            const absentStudentsByClass = {};

            allData.forEach(teacherData => {
                let logs = teacherData.saved_logs;

                if (logs && typeof logs === 'string') {
                    try {
                        logs = JSON.parse(logs);
                    } catch (e) {
                        console.error("Could not parse saved_logs for teacher:", teacherData.user_name, logs);
                        logs = [];
                    }
                }

                if (Array.isArray(logs)) {
                    logs.forEach(log => {
                        if (log.date === selectedDate) {
                            if (!absentStudentsByClass[log.class]) {
                                absentStudentsByClass[log.class] = {
                                    students: [],
                                    teacherName: teacherData.user_name
                                };
                            }
                            
                            Object.entries(log.attendance).forEach(([studentName, status]) => {
                                if (status !== 'H') {
                                    const existingStudent = absentStudentsByClass[log.class].students.find(s => s.name === studentName);
                                    if (!existingStudent) {
                                        absentStudentsByClass[log.class].students.push({ name: studentName, status: status });
                                    }
                                }
                            });
                        }
                    });
                }
            });

            const classNames = Object.keys(absentStudentsByClass).sort();
            const hasAbsentees = Object.values(absentStudentsByClass).some(classData => classData.students.length > 0);

            if (!hasAbsentees) {
                dashboardContent.innerHTML = `<p class="text-center text-slate-500 py-8">Tidak ada siswa yang absen pada tanggal yang dipilih.</p>`;
                return;
            }

            dashboardContent.innerHTML = classNames.map(className => {
                const classData = absentStudentsByClass[className];
                if (classData.students.length === 0) return '';
                
                classData.students.sort((a, b) => a.name.localeCompare(b.name));

                const studentRows = classData.students.map(student => `
                    <tr class="border-t border-slate-200">
                        <td class="py-2 pr-4 text-slate-700">${student.name}</td>
                        <td class="py-2 px-2">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${
                                student.status === 'S' ? 'bg-yellow-100 text-yellow-800' : 
                                student.status === 'I' ? 'bg-blue-100 text-blue-800' : 
                                'bg-red-100 text-red-800'
                            }">${student.status}</span>
                        </td>
                    </tr>
                `).join('');

                return `
                    <div class="bg-slate-50 p-4 rounded-lg">
                        <div class="flex justify-between items-center mb-2">
                            <h3 class="font-bold text-blue-600">Kelas ${className}</h3>
                            <p class="text-xs text-slate-400 font-medium">Oleh: ${classData.teacherName}</p>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="text-left text-slate-500">
                                        <th class="py-1 pr-4 font-medium">Nama Siswa</th>
                                        <th class="py-1 px-2 font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${studentRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error("Failed to refresh dashboard data:", error);
            if (!dashboardContent.innerHTML.includes('bg-slate-50')) {
                 dashboardContent.innerHTML = `<p class="text-center text-red-500 py-8">Gagal memuat data: ${error.message}</p>`;
            }
        }
    };

    updateDashboardContent();

    if (state.dashboard.pollingIntervalId) {
        clearInterval(state.dashboard.pollingIntervalId);
    }

    const newIntervalId = setInterval(updateDashboardContent, 5000);
    setState({ dashboard: { ...state.dashboard, pollingIntervalId: newIntervalId } });
    console.log(`Dashboard polling started with ID: ${newIntervalId}.`);
}


async function renderAdminPanelScreen() {
    appContainer.innerHTML = templates.adminPanel();
    document.getElementById('admin-panel-back-btn').addEventListener('click', () => navigateTo('adminHome'));
    const container = document.getElementById('admin-panel-container');

    const updateAdminPanelContent = async () => {
        console.log("Admin panel is refreshing...");
        try {
            const { allUsers } = await apiService.getAllUsers();
            
            // Only re-render if data has actually changed to prevent losing focus on dropdowns
            const hasChanged = JSON.stringify(allUsers) !== JSON.stringify(state.adminPanel.users);
            if (!hasChanged && !state.adminPanel.isLoading) {
                console.log("Admin panel data unchanged.");
                return;
            }

            setState({ adminPanel: { ...state.adminPanel, users: allUsers, isLoading: false }});
            
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
                            // Manually trigger an update instead of full navigation to avoid flicker
                            await updateAdminPanelContent();
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
    };

    updateAdminPanelContent();

    if (state.adminPanel.pollingIntervalId) {
        clearInterval(state.adminPanel.pollingIntervalId);
    }
    const newIntervalId = setInterval(updateAdminPanelContent, 10000); // Check every 10 seconds
    setState({ adminPanel: { ...state.adminPanel, pollingIntervalId: newIntervalId } });
    console.log(`Admin Panel polling started with ID: ${newIntervalId}.`);
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
    // Clear previous content
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
