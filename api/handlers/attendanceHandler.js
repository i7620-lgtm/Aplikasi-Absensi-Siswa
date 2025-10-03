export async function handleSaveData({ payload, user, sql, response }) {
    if (user.role === 'KEPALA_SEKOLAH') {
         return response.status(403).json({ error: 'Akun Kepala Sekolah bersifat hanya-baca.' });
    }
    const { studentsByClass, savedLogs, actingAsSchoolId } = payload;
    const studentsByClassJson = JSON.stringify(studentsByClass);
    const savedLogsJson = JSON.stringify(savedLogs);
    
    let targetEmail = user.email;
    let finalSchoolId = user.school_id;

    if ((user.role === 'SUPER_ADMIN' && actingAsSchoolId) || user.role === 'ADMIN_SEKOLAH') {
        if (user.role === 'ADMIN_SEKOLAH') {
            if (!user.school_id) {
                return response.status(403).json({ error: 'Admin Sekolah tidak ditugaskan ke sekolah manapun dan tidak dapat menyimpan data.' });
            }
            finalSchoolId = user.school_id;
        } else {
            finalSchoolId = actingAsSchoolId;
        }
        
        const classNames = Object.keys(studentsByClass);
        if (classNames.length === 0) {
            return response.status(400).json({ error: 'Tidak ada data kelas yang dikirim untuk disimpan.' });
        }
        const className = classNames[0];

        const { rows: teacherRows } = await sql`
            SELECT email FROM users 
            WHERE school_id = ${finalSchoolId} AND ${className} = ANY(assigned_classes);
        `;

        if (teacherRows.length === 0) {
            // Jika tidak ada guru yang ditugaskan, simpan data di bawah akun admin itu sendiri.
            // Ini memungkinkan admin untuk mengelola kelas 'yatim'.
            console.log(`No teacher found for class ${className}. Saving data under admin ${user.email}`);
            targetEmail = user.email;
        } else if (teacherRows.length > 1) {
            return response.status(409).json({ error: `Konflik: Lebih dari satu guru ditugaskan untuk kelas ${className}. Harap perbaiki di panel admin.` });
        } else {
             targetEmail = teacherRows[0].email;
        }
    }

    await sql`
        INSERT INTO absensi_data (user_email, school_id, students_by_class, saved_logs, last_updated)
        VALUES (${targetEmail}, ${finalSchoolId}, ${studentsByClassJson}, ${savedLogsJson}, NOW())
        ON CONFLICT (user_email)
        DO UPDATE SET
          school_id = EXCLUDED.school_id,
          students_by_class = EXCLUDED.students_by_class,
          saved_logs = EXCLUDED.saved_logs,
          last_updated = NOW();
    `;
    return response.status(200).json({ success: true });
}

export async function handleGetHistoryData({ payload, user, sql, response }) {
    if (!['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'GURU'].includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { schoolId, filters, isClassSpecific, classFilter, isGlobalView } = payload;
    let effectiveSchoolId = schoolId;
    if (user.role === 'KEPALA_SEKOLAH' || user.role === 'ADMIN_SEKOLAH') {
        effectiveSchoolId = user.school_id;
    }

    let query;
    if (isGlobalView && user.role === 'SUPER_ADMIN') {
        // Super Admin Global View: Fetch from all schools
        query = sql`SELECT ad.saved_logs, u.name as user_name FROM absensi_data ad JOIN users u ON ad.user_email = u.email`;
    } else if (effectiveSchoolId) {
        // School-specific view for Admins/KS
        query = sql`SELECT ad.saved_logs, u.name as user_name FROM absensi_data ad JOIN users u ON ad.user_email = u.email WHERE ad.school_id = ${effectiveSchoolId}`;
    } else if (user.role === 'GURU' || (isClassSpecific && !effectiveSchoolId)) {
        // Teacher's own data
        query = sql`SELECT saved_logs FROM absensi_data WHERE user_email = ${user.email}`;
    } else {
        return response.status(200).json({ filteredLogs: [] });
    }

    const { rows } = await query;

    let allLogs = rows.flatMap(row => (row.saved_logs || []).map(log => ({
        ...log,
        teacherName: row.user_name || user.name
    })));

    // Apply filters on the server-side JS
    const { studentName, status, startDate, endDate } = filters || {};

    if (classFilter) {
        allLogs = allLogs.filter(log => log.class === classFilter);
    }
    if (startDate) {
        allLogs = allLogs.filter(log => log.date >= startDate);
    }
    if (endDate) {
        allLogs = allLogs.filter(log => log.date <= endDate);
    }

    const processedLogs = allLogs.map(log => {
        let absentStudents = Object.entries(log.attendance).filter(([_, s]) => s !== 'H');
        if (studentName) {
            absentStudents = absentStudents.filter(([name, _]) => name.toLowerCase().includes(studentName.toLowerCase()));
        }
        if (status && status !== 'all') {
            absentStudents = absentStudents.filter(([_, s]) => s === status);
        }
        return absentStudents.length > 0 ? { ...log, filteredAbsences: absentStudents } : null;
    }).filter(Boolean);

    return response.status(200).json({ filteredLogs: processedLogs });
}

export async function handleGetSchoolStudentData({ payload, user, sql, response }) {
    if (!['SUPER_ADMIN', 'ADMIN_SEKOLAH'].includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    let { schoolId } = payload;
    if (user.role === 'ADMIN_SEKOLAH') {
        schoolId = user.school_id;
    }

    if (!schoolId) {
        return response.status(400).json({ error: 'School ID is required' });
    }

    const { rows } = await sql`
        SELECT students_by_class FROM absensi_data WHERE school_id = ${schoolId};
    `;

    const aggregatedStudentsByClass = {};
    rows.forEach(row => {
        if (row.students_by_class) {
            Object.assign(aggregatedStudentsByClass, row.students_by_class);
        }
    });

    return response.status(200).json({ aggregatedStudentsByClass });
}
