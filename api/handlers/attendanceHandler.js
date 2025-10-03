export async function handleSaveData({ payload, user, sql, response }) {
    if (user.role === 'KEPALA_SEKOLAH') {
         return response.status(403).json({ error: 'Akun Kepala Sekolah bersifat hanya-baca.' });
    }
    const { studentsByClass, savedLogs, actingAsSchoolId } = payload;
    const studentsByClassJson = JSON.stringify(studentsByClass);
    const savedLogsJson = JSON.stringify(savedLogs);
    
    let targetEmail = user.email;
    let finalSchoolId = user.school_id;

    // Super Admin dan Admin Sekolah bertindak atas nama guru.
    if ((user.role === 'SUPER_ADMIN' && actingAsSchoolId) || user.role === 'ADMIN_SEKOLAH') {
        // Tentukan ID sekolah yang menjadi konteks
        if (user.role === 'ADMIN_SEKOLAH') {
            if (!user.school_id) {
                return response.status(403).json({ error: 'Admin Sekolah tidak ditugaskan ke sekolah manapun dan tidak dapat menyimpan data.' });
            }
            finalSchoolId = user.school_id;
        } else { // SUPER_ADMIN
            finalSchoolId = actingAsSchoolId;
        }
        
        // Temukan guru yang memiliki data kelas ini dalam konteks sekolah tersebut.
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
            return response.status(404).json({ error: `Tidak ditemukan guru yang ditugaskan untuk kelas ${className} di sekolah ini.` });
        }
        if (teacherRows.length > 1) {
            return response.status(409).json({ error: `Konflik: Lebih dari satu guru ditugaskan untuk kelas ${className}. Harap perbaiki di panel admin.` });
        }
        
        targetEmail = teacherRows[0].email;
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

export async function handleGetGlobalData({ payload, user, sql, response }) {
     if (user.role !== 'SUPER_ADMIN' && user.role !== 'KEPALA_SEKOLAH') {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    
    const { schoolId } = payload;

    let query;
    if (user.role === 'KEPALA_SEKOLAH') {
        if (!user.school_id) {
             return response.status(200).json({ allData: [] });
        }
        query = sql`
            SELECT ad.saved_logs, ad.students_by_class, u.name as user_name 
            FROM absensi_data ad 
            JOIN users u ON ad.user_email = u.email
            WHERE ad.school_id = ${user.school_id}
        `;
    } else { // SUPER_ADMIN
        if (schoolId) {
            query = sql`
                SELECT ad.saved_logs, ad.students_by_class, u.name as user_name 
                FROM absensi_data ad 
                JOIN users u ON ad.user_email = u.email
                WHERE ad.school_id = ${schoolId}
            `;
        } else {
            query = sql`
                SELECT ad.saved_logs, ad.students_by_class, u.name as user_name 
                FROM absensi_data ad 
                JOIN users u ON ad.user_email = u.email
            `;
        }
    }
    
    const { rows: allData } = await query;
    return response.status(200).json({ allData });
}
