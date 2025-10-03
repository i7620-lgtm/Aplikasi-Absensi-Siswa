export default async function handleGetDashboardData({ payload, user, sql, response }) {
    if (!['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { schoolId, selectedDate, chartViewMode, chartClassFilter } = payload;
    if (!schoolId) {
        return response.status(400).json({ error: 'School ID is required' });
    }

    const { rows } = await sql`
        SELECT ad.saved_logs, ad.students_by_class, u.name as user_name 
        FROM absensi_data ad 
        JOIN users u ON ad.user_email = u.email
        WHERE ad.school_id = ${schoolId};
    `;

    const allTeacherData = rows;
    const allLogs = allTeacherData.flatMap(teacher => teacher.saved_logs || []);
    
    const allStudentsByClass = {};
    allTeacherData.forEach(teacher => {
        if (teacher.students_by_class) {
            Object.assign(allStudentsByClass, teacher.students_by_class);
        }
    });

    // 1. Calculate Report Data
    const logsForDate = [];
    allTeacherData.forEach(teacherData => {
        (teacherData.saved_logs || []).forEach(log => {
            if (log.date === selectedDate) {
                logsForDate.push({ ...log, teacherName: teacherData.user_name });
            }
        });
    });
    const totalStudents = Object.values(allStudentsByClass).reduce((sum, classData) => sum + (classData?.students?.length || 0), 0);
    const absenceCounts = { S: 0, I: 0, A: 0 };
    logsForDate.forEach(log => Object.values(log.attendance).forEach(status => {
        if (absenceCounts[status] !== undefined) absenceCounts[status]++;
    }));
    const totalAbsent = absenceCounts.S + absenceCounts.I + absenceCounts.A;
    const totalPresent = Math.max(0, totalStudents - totalAbsent);

    const absentStudentsByClass = {};
    logsForDate.forEach(log => {
        if (!absentStudentsByClass[log.class]) absentStudentsByClass[log.class] = { students: [], teacherName: log.teacherName };
        Object.entries(log.attendance).forEach(([studentName, status]) => {
            if (status !== 'H') absentStudentsByClass[log.class].students.push({ name: studentName, status });
        });
    });

    // 2. Calculate Percentage Data
    let totalStudentsInScope = chartClassFilter === 'all'
        ? totalStudents
        : allStudentsByClass[chartClassFilter]?.students?.length || 0;

    const today = new Date(selectedDate + 'T00:00:00');
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const allLogsInPeriod = allLogs.filter(log => {
        const logDate = new Date(log.date + 'T00:00:00');
        switch (chartViewMode) {
            case 'daily': return logDate.getTime() === today.getTime();
            case 'weekly': return logDate >= startOfWeek && logDate < new Date(new Date(startOfWeek).setDate(startOfWeek.getDate() + 7));
            case 'monthly': return logDate.getFullYear() === today.getFullYear() && logDate.getMonth() === today.getMonth();
            case 'semester1': return logDate.getFullYear() === today.getFullYear() && logDate.getMonth() >= 6 && logDate.getMonth() <= 11;
            case 'semester2': return logDate.getFullYear() === today.getFullYear() && logDate.getMonth() >= 0 && logDate.getMonth() <= 5;
            case 'yearly': return logDate.getFullYear() === today.getFullYear();
            default: return false;
        }
    });

    const numSchoolDays = chartViewMode === 'daily' ? 1 : (new Set(allLogsInPeriod.map(log => log.date))).size || 1;
    const totalAttendanceOpportunities = totalStudentsInScope * numSchoolDays;

    const filteredLogsByClass = allLogsInPeriod.filter(log => chartClassFilter === 'all' || log.class === chartClassFilter);
    const periodAbsenceCounts = { S: 0, I: 0, A: 0 };
    filteredLogsByClass.forEach(log => Object.values(log.attendance).forEach(status => {
        if (periodAbsenceCounts[status] !== undefined) periodAbsenceCounts[status]++;
    }));

    const periodTotalAbsent = periodAbsenceCounts.S + periodAbsenceCounts.I + periodAbsenceCounts.A;
    const periodTotalPresent = Math.max(0, totalAttendanceOpportunities - periodTotalAbsent);

    return response.status(200).json({
        reportData: {
            summaryStats: { totalStudents, totalPresent, ...absenceCounts },
            absentStudentsByClass
        },
        percentageData: {
            finalCounts: { H: periodTotalPresent, ...periodAbsenceCounts },
            totalAttendanceOpportunities,
            allClasses: Object.keys(allStudentsByClass).sort()
        }
    });
}
