

export async function handleSaveData({ payload, user, sql, response }) {
    if (['KEPALA_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(user.role)) {
         return response.status(403).json({ error: 'Akun ini bersifat hanya-baca untuk data absensi.' });
    }
    const { studentsByClass, savedLogs, actingAsSchoolId } = payload;
    const studentsByClassJson = JSON.stringify(studentsByClass);
    const savedLogsJson = JSON.stringify(savedLogs);
    
    let targetEmail = user.email;
    let finalSchoolId = user.school_id;
    let savedAsTeacherName = null;

    if ((user.role === 'SUPER_ADMIN' && actingAsSchoolId) || user.role === 'ADMIN_SEKOLAH') {
        finalSchoolId = (user.role === 'ADMIN_SEKOLAH') ? user.school_id : actingAsSchoolId;
        if (!finalSchoolId) {
            return response.status(400).json({ error: 'Konteks sekolah diperlukan untuk admin.' });
        }
        
        const className = Object.keys(studentsByClass)[0];
        if (className) {
            const { rows: teacherRows } = await sql`
                SELECT email, name FROM users 
                WHERE school_id = ${finalSchoolId} AND ${className} = ANY(assigned_classes);
            `;
            if (teacherRows.length > 1) {
                return response.status(409).json({ error: `Konflik: Lebih dari satu guru ditugaskan untuk kelas ${className}.` });
            } else if (teacherRows.length === 1) {
                targetEmail = teacherRows[0].email;
                savedAsTeacherName = teacherRows[0].name;
            }
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
    return response.status(200).json({ success: true, savedAsTeacherName });
}

export async function handleGetHistoryData({ payload, user, sql, response }) {
    const { schoolId, jurisdictionId, isClassSpecific, classFilter, isGlobalView } = payload;

    let query;
    let params = [];
    let whereClauses = [];

    // --- Determine Data Scope ---
    if (user.role === 'GURU') {
        whereClauses.push(`ad.user_email = $${params.push(user.email)}`);
    } else if (isGlobalView && user.role === 'SUPER_ADMIN') {
        // No extra school filter for global view
    } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(user.role) || (user.role === 'SUPER_ADMIN' && jurisdictionId)) {
        const effectiveJurisdictionId = jurisdictionId || user.jurisdiction_id;
        if (!effectiveJurisdictionId) return response.status(200).json({ allLogs: [] });
        
        const { rows: schoolIdRows } = await sql`
            WITH RECURSIVE jurisdiction_tree AS (
                SELECT id FROM jurisdictions WHERE id = ${effectiveJurisdictionId}
                UNION ALL
                SELECT j.id FROM jurisdictions j
                INNER JOIN jurisdiction_tree jt ON j.parent_id = jt.id
            )
            SELECT s.id FROM schools s WHERE s.jurisdiction_id IN (SELECT id FROM jurisdiction_tree);
        `;
        const schoolIds = schoolIdRows.map(r => r.id);
        if (schoolIds.length === 0) return response.status(200).json({ allLogs: [] });

        whereClauses.push(`ad.school_id = ANY($${params.push(schoolIds)})`);

    } else { // KEPALA_SEKOLAH, ADMIN_SEKOLAH, or SUPER_ADMIN acting on a school
        const effectiveSchoolId = (['KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(user.role)) ? user.school_id : schoolId;
        if (!effectiveSchoolId) return response.status(200).json({ allLogs: [] });
        whereClauses.push(`ad.school_id = $${params.push(effectiveSchoolId)}`);
    }

    query = `
        SELECT
            log_obj as log,
            u.name as "teacherName"
        FROM absensi_data ad
        JOIN users u ON ad.user_email = u.email
        CROSS JOIN jsonb_array_elements(ad.saved_logs) as log_obj
        ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
    `;
    
    const { rows } = await sql.query(query, params);

    // Initial server-side class filter if specified
    const allLogs = rows.map(row => ({ ...row.log, teacherName: row.teacherName }));
    const filteredLogs = isClassSpecific && classFilter
        ? allLogs.filter(log => log.class === classFilter)
        : allLogs;

    return response.status(200).json({ allLogs: filteredLogs });
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
            for (const className in row.students_by_class) {
                if (!aggregatedStudentsByClass[className]) {
                    aggregatedStudentsByClass[className] = row.students_by_class[className];
                }
            }
        }
    });

    return response.status(200).json({ aggregatedStudentsByClass });
}
