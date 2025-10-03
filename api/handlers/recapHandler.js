export default async function handleGetRecapData({ payload, user, sql, response }) {
    if (!['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'GURU'].includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { schoolId, classFilter } = payload;
    let effectiveSchoolId = schoolId;
    if (user.role !== 'SUPER_ADMIN') {
        effectiveSchoolId = user.school_id;
    }

    let studentsByClassToUse = {};
    let logsToUse = [];

    if (user.role === 'GURU') {
        const { rows } = await sql`SELECT students_by_class, saved_logs FROM absensi_data WHERE user_email = ${user.email}`;
        studentsByClassToUse = rows[0]?.students_by_class || {};
        logsToUse = rows[0]?.saved_logs || [];
    } else if (effectiveSchoolId) {
        const { rows } = await sql`SELECT students_by_class, saved_logs FROM absensi_data WHERE school_id = ${effectiveSchoolId}`;
        rows.forEach(row => {
            if (row.students_by_class) Object.assign(studentsByClassToUse, row.students_by_class);
            if (row.saved_logs) logsToUse.push(...row.saved_logs);
        });
    }

    if (classFilter) {
        studentsByClassToUse = { [classFilter]: studentsByClassToUse[classFilter] };
        logsToUse = logsToUse.filter(log => log.class === classFilter);
    }
    
    if (Object.keys(studentsByClassToUse).length === 0) {
        return response.status(200).json({ recapArray: [] });
    }

    const recapData = {};
    const studentToClassMap = {};
    const studentOriginalIndex = {};

    for (const className in studentsByClassToUse) {
        if (studentsByClassToUse[className]?.students) {
            studentsByClassToUse[className].students.forEach((studentName, index) => {
                recapData[studentName] = { S: 0, I: 0, A: 0 };
                studentToClassMap[studentName] = className;
                studentOriginalIndex[studentName] = index;
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
        return {
            name,
            class: studentToClassMap[name] || 'N/A',
            ...data,
            total: data.S + data.I + data.A,
            originalIndex: studentOriginalIndex[name] || 0
        };
    });

    return response.status(200).json({ recapArray });
}
