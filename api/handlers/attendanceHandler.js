
// Simple sanitizer to prevent basic XSS by removing HTML tags.
function sanitize(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '').trim();
}

async function getSubJurisdictionIds(jurisdictionId, sql) {
    if (!jurisdictionId) return [];
    const { rows } = await sql`
        WITH RECURSIVE sub_jurisdictions AS (
            SELECT id FROM jurisdictions WHERE id = ${jurisdictionId}
            UNION
            SELECT j.id FROM jurisdictions j
            INNER JOIN sub_jurisdictions s ON s.id = j.parent_id
        )
        SELECT id FROM sub_jurisdictions;
    `;
    return rows.map(r => r.id);
}

export async function handleSaveData({ payload, user, sql, response, redis }) {
    const allowedWriteRoles = ['GURU', 'ADMIN_SEKOLAH', 'SUPER_ADMIN'];
    if (!allowedWriteRoles.includes(user.role)) {
        return response.status(403).json({ error: 'Anda tidak memiliki izin untuk menyimpan data absensi.' });
    }
    const { type, payload: originalEventPayload, actingAsSchoolId } = payload;
    let eventPayload = { ...originalEventPayload }; // Create a mutable copy

    // --- NEW: Input Sanitization Logic ---
    if (type === 'STUDENT_LIST_UPDATED' && eventPayload.students && Array.isArray(eventPayload.students)) {
        const sanitizedStudents = eventPayload.students.map(student => ({
            name: sanitize(student.name),
            parentEmail: sanitize(student.parentEmail)
        })).filter(student => student.name); // Ensure students with only whitespace names are removed

        eventPayload.students = sanitizedStudents;
    }
    // No sanitization needed for ATTENDANCE_UPDATED as student names are keys
    // derived from a previously sanitized list.
    // --- END: Input Sanitization Logic ---
    
    const actorEmail = user.email;
    const actorName = user.name;
    
    let finalSchoolId;
    if (user.role === 'SUPER_ADMIN') {
        finalSchoolId = actingAsSchoolId;
    } else {
        finalSchoolId = user.school_id;
    }

    if (!finalSchoolId) {
        return response.status(400).json({ error: 'Tidak dapat menentukan sekolah untuk menyimpan data. Pastikan akun Anda atau konteks admin Anda tertaut ke sekolah.' });
    }
    
    const { rows } = await sql`
        INSERT INTO change_log (school_id, user_email, event_type, payload)
        VALUES (${finalSchoolId}, ${actorEmail}, ${type}, ${JSON.stringify(eventPayload)})
        RETURNING id;
    `;
    const newVersion = rows[0].id;
    
    if (redis) {
        try {
            const key = `school_version:${finalSchoolId}`;
            // Set with expiration (e.g., 25 hours) to handle potential stale signals
            await redis.set(key, newVersion, { ex: 90000 }); // ex: 90000 detik = 25 jam
            console.log(`Update signal (v${newVersion}) sent to Redis for school ${finalSchoolId}`);
        } catch (e) {
             console.error("Failed to update Redis signal:", e);
             // Do not fail the request, just log the error.
        }
    }
    
    return response.status(200).json({ success: true, savedBy: actorName, newVersion });
}

export async function handleGetChangesSince({ payload, user, sql, response }) {
    const { schoolId, lastVersion } = payload;
    const effectiveSchoolId = schoolId || user.school_id;
    if (!effectiveSchoolId) {
        return response.status(400).json({ error: 'School ID is required' });
    }
    
    const { rows: changes } = await sql`
        SELECT id, event_type, payload
        FROM change_log
        WHERE school_id = ${effectiveSchoolId} AND id > ${lastVersion}
        ORDER BY id ASC;
    `;
    
    return response.status(200).json({ changes });
}

async function reconstructAttendanceState(schoolId, sql) {
    if (!schoolId) return { logs: [], students: {} };
    
    const { rows: changes } = await sql`
        SELECT event_type, payload FROM change_log WHERE school_id = ${schoolId} ORDER BY id ASC
    `;

    const studentsByClass = {};
    const attendanceLogs = {};

    changes.forEach(change => {
        if (change.event_type === 'ATTENDANCE_UPDATED') {
            const logKey = `${change.payload.class}-${change.payload.date}`;
            attendanceLogs[logKey] = change.payload;
        } else if (change.event_type === 'STUDENT_LIST_UPDATED') {
            studentsByClass[change.payload.class] = { students: change.payload.students };
        }
    });

    return { logs: Object.values(attendanceLogs), students: studentsByClass };
}

export async function handleGetHistoryData({ payload, user, sql, response }) {
    let schoolIds = [];
    const { isClassSpecific, classFilter, isGlobalView } = payload;

    if (user.role === 'GURU') {
        if (user.school_id) schoolIds.push(user.school_id);
    } else if (isGlobalView && user.role === 'SUPER_ADMIN') {
        const { rows } = await sql`SELECT id FROM schools`;
        schoolIds = rows.map(r => r.id);
    } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(user.role)) {
        if (user.jurisdiction_id) {
            const accessibleJurisdictionIds = await getSubJurisdictionIds(user.jurisdiction_id, sql);
            if (accessibleJurisdictionIds.length > 0) {
                const { rows } = await sql`SELECT id FROM schools WHERE jurisdiction_id = ANY(${accessibleJurisdictionIds})`;
                schoolIds = rows.map(r => r.id);
            }
        }
    } else { // KEPALA_SEKOLAH, ADMIN_SEKOLAH, or SUPER_ADMIN in school context
        const effectiveSchoolId = payload.schoolId || user.school_id;
        if (effectiveSchoolId) schoolIds.push(effectiveSchoolId);
    }

    if (schoolIds.length === 0) {
        return response.status(200).json({ allLogs: [] });
    }

    // --- IMPROVED LOGIC: Filter by class in SQL if requested, and always get DISTINCT per day/class ---
    const { rows } = await sql`
        SELECT DISTINCT ON (cl.school_id, TRIM(cl.payload->>'class'), cl.payload->>'date')
            cl.payload, u.name as "teacherName"
        FROM change_log cl
        JOIN users u ON cl.user_email = u.email
        WHERE cl.school_id = ANY(${schoolIds}) 
          AND cl.event_type = 'ATTENDANCE_UPDATED'
          AND (${!isClassSpecific} OR TRIM(cl.payload->>'class') = TRIM(${classFilter}::text))
        ORDER BY cl.school_id, TRIM(cl.payload->>'class'), cl.payload->>'date', cl.id DESC
    `;
    
    const allLogs = rows.map(row => ({ ...row.payload, teacherName: row.teacherName }));

    return response.status(200).json({ allLogs });
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

    // Fetch Student Lists
    const { rows } = await sql`
        SELECT DISTINCT ON (payload->>'class') payload
        FROM change_log
        WHERE school_id = ${schoolId} AND event_type = 'STUDENT_LIST_UPDATED'
        ORDER BY payload->>'class', id DESC;
    `;
    
    const aggregatedStudentsByClass = {};
    rows.forEach(row => {
        aggregatedStudentsByClass[row.payload.class] = row.payload.students;
    });

    // --- NEW: Fetch School Settings with Robust Default Fallback ---
    // Menggunakan SELECT * untuk menghindari error 'column does not exist' jika skema DB belum update.
    const { rows: settingsRows } = await sql`
        SELECT * FROM schools WHERE id = ${schoolId}
    `;
    
    // Default: Senin (1) s.d Sabtu (6). Jika data DB null atau kosong, gunakan default ini.
    let settings = settingsRows[0]?.settings;
    if (!settings || typeof settings !== 'object' || !Array.isArray(settings.workDays)) {
        settings = { workDays: [1, 2, 3, 4, 5, 6] };
    }

    return response.status(200).json({ aggregatedStudentsByClass, settings });
}
