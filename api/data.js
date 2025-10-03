import { sql } from '@vercel/postgres';
import { GoogleGenAI } from "@google/genai";

// --- KONFIGURASI ---
const SUPER_ADMIN_EMAILS = ['i7620@guru.sd.belajar.id', 'admin@sekolah.com'];

// --- SETUP DATABASE YANG EFISIEN ---
let dbSetupPromise = null;
async function setupTables() {
    if (dbSetupPromise) {
        return dbSetupPromise;
    }
    dbSetupPromise = (async () => {
        try {
            console.log("Menjalankan setup skema database untuk instans ini...");
            await sql`CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());`;
            await sql`CREATE TABLE IF NOT EXISTS users (email VARCHAR(255) PRIMARY KEY, name VARCHAR(255), picture TEXT, role VARCHAR(50) DEFAULT 'GURU', school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL, assigned_classes TEXT[] DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), last_login TIMESTAMPTZ);`;
            try { await sql`ALTER TABLE users ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL;`; } catch (e) { if (e.code !== '42701') throw e; }
            try { await sql`ALTER TABLE users ADD COLUMN assigned_classes TEXT[] DEFAULT '{}'`; } catch (e) { if (e.code !== '42701') throw e; }
            await sql`UPDATE users SET assigned_classes = '{}' WHERE assigned_classes IS NULL`;
            await sql`CREATE TABLE IF NOT EXISTS absensi_data (user_email VARCHAR(255) PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE, school_id INTEGER, students_by_class JSONB, saved_logs JSONB, last_updated TIMESTAMPTZ DEFAULT NOW());`;
            try { await sql`ALTER TABLE absensi_data ADD COLUMN school_id INTEGER;`; } catch (e) { if (e.code !== '42701') throw e; }
            await sql`CREATE TABLE IF NOT EXISTS app_config (key VARCHAR(50) PRIMARY KEY, value TEXT);`;
            await sql`INSERT INTO app_config (key, value) VALUES ('maintenance_mode', 'false') ON CONFLICT (key) DO NOTHING;`;
            console.log("Setup skema database berhasil untuk instans ini.");
        } catch (error) {
            console.error("Gagal melakukan setup tabel:", error);
            dbSetupPromise = null; // Izinkan percobaan ulang pada permintaan berikutnya di instans ini
            throw error;
        }
    })();
    return dbSetupPromise;
}

// --- LOGIKA UTAMA HANDLER ---
export default async function handler(request, response) {
    try {
        await setupTables();

        if (request.method !== 'POST') {
            return response.status(405).json({ error: 'Method Not Allowed' });
        }

        const { action, payload, userEmail } = request.body;
        if (!action) {
            return response.status(400).json({ error: 'Action is required' });
        }

        // Tindakan publik
        if (action === 'getMaintenanceStatus') {
            const { rows } = await sql`SELECT value FROM app_config WHERE key = 'maintenance_mode'`;
            return response.status(200).json({ isMaintenance: rows[0]?.value === 'true' });
        }
        if (action === 'loginOrRegister') {
            if (!payload || !payload.profile) return response.status(400).json({ error: 'Profile payload is required' });
            
            const { email, name, picture } = payload.profile;
            let { rows: userRows } = await sql`SELECT email, name, picture, role, school_id, assigned_classes FROM users WHERE email = ${email}`;
            let user = userRows[0];

            if (user) {
                await sql`UPDATE users SET last_login = NOW(), name = ${name}, picture = ${picture} WHERE email = ${email}`;
            } else {
                const role = SUPER_ADMIN_EMAILS.includes(email) ? 'SUPER_ADMIN' : 'GURU';
                ({ rows: userRows } = await sql`INSERT INTO users (email, name, picture, role, last_login) VALUES (${email}, ${name}, ${picture}, ${role}, NOW()) RETURNING *;`);
                user = userRows[0];
            }
            user.assigned_classes = user.assigned_classes || [];

            const { rows: configRows } = await sql`SELECT value FROM app_config WHERE key = 'maintenance_mode'`;
            if (configRows[0]?.value === 'true' && user.role !== 'SUPER_ADMIN') {
                return response.status(200).json({ maintenance: true });
            }

            const { rows: dataRows } = await sql`SELECT students_by_class, saved_logs FROM absensi_data WHERE user_email = ${email}`;
            const userData = dataRows[0] || { students_by_class: {}, saved_logs: [] };
            return response.status(200).json({ user, userData });
        }

        // --- DARI SINI, SEMUA TINDAKAN MEMERLUKAN AUTENTIKASI ---
        if (!userEmail) {
            return response.status(400).json({ error: 'userEmail is required' });
        }
        const { rows: userRows } = await sql`SELECT email, role, school_id, assigned_classes FROM users WHERE email = ${userEmail}`;
        if (userRows.length === 0) {
            return response.status(403).json({ error: 'Forbidden: User not found' });
        }
        const user = userRows[0];

        // --- SWITCH UNTUK SEMUA TINDAKAN ---
        switch (action) {
            case 'getUserProfile':
                user.assigned_classes = user.assigned_classes || [];
                return response.status(200).json({ userProfile: user });

            case 'setMaintenanceStatus': {
                if (user.role !== 'SUPER_ADMIN') return response.status(403).json({ error: 'Forbidden' });
                const { enabled } = payload;
                await sql`INSERT INTO app_config (key, value) VALUES ('maintenance_mode', ${String(enabled)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`;
                return response.status(200).json({ success: true, newState: enabled });
            }

            case 'getAllUsers': {
                 if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') return response.status(403).json({ error: 'Forbidden' });
                let query;
                if (user.role === 'SUPER_ADMIN') {
                    query = sql`SELECT u.email, u.name, u.picture, u.role, u.school_id, u.assigned_classes, s.name as school_name, (u.role = 'GURU' AND u.school_id IS NULL) AS is_unmanaged FROM users u LEFT JOIN schools s ON u.school_id = s.id ORDER BY u.name;`;
                } else {
                    if (!user.school_id) return response.status(200).json({ allUsers: [] });
                    query = sql`SELECT u.email, u.name, u.picture, u.role, u.school_id, u.assigned_classes, s.name as school_name FROM users u LEFT JOIN schools s ON u.school_id = s.id WHERE u.school_id = ${user.school_id} AND u.role IN ('GURU', 'KEPALA_SEKOLAH') ORDER BY u.name;`;
                }
                const { rows: allUsers } = await query;
                return response.status(200).json({ allUsers });
            }
            
            case 'updateUserConfiguration': {
                if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') return response.status(403).json({ error: 'Forbidden' });
                const { targetEmail, newRole, newSchoolId, newClasses } = payload;
                if (user.role === 'ADMIN_SEKOLAH') {
                    if (!user.school_id) return response.status(403).json({ error: 'Admin Sekolah tidak ditugaskan ke sekolah manapun.' });
                    const { rows: targetUserRows } = await sql`SELECT school_id FROM users WHERE email = ${targetEmail}`;
                    if (targetUserRows.length === 0 || targetUserRows[0].school_id !== user.school_id) { return response.status(403).json({ error: 'Anda hanya dapat mengelola pengguna di sekolah Anda sendiri.' }); }
                    if (newRole === 'SUPER_ADMIN' || newRole === 'ADMIN_SEKOLAH') { return response.status(403).json({ error: 'Anda tidak memiliki izin untuk menetapkan peran admin.' });}
                    if (newSchoolId && newSchoolId !== user.school_id.toString()) { return response.status(403).json({ error: 'Anda tidak dapat memindahkan pengguna ke sekolah lain.' }); }
                } else { 
                    if (SUPER_ADMIN_EMAILS.includes(targetEmail) && newRole !== 'SUPER_ADMIN') { return response.status(400).json({ error: 'Cannot demote a bootstrapped Super Admin.' }); }
                }
                
                let finalSchoolId = newSchoolId === "" ? null : newSchoolId;
                if (newRole === 'SUPER_ADMIN') finalSchoolId = null;
                const assignedClasses = newRole === 'GURU' ? newClasses : '{}';
                await sql`UPDATE users SET role = ${newRole}, school_id = ${finalSchoolId}, assigned_classes = ${assignedClasses} WHERE email = ${targetEmail}`;
                return response.status(200).json({ success: true });
            }
            
            case 'updateUsersBulk': {
                 if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') return response.status(403).json({ error: 'Forbidden' });
                const { targetEmails, newRole, newSchoolId } = payload;
                const client = await sql.connect();
                try {
                    await client.query('BEGIN');
                    if (newSchoolId !== undefined) {
                        const finalSchoolId = newSchoolId === "" || newSchoolId === null ? null : newSchoolId;
                        await client.query(`UPDATE users SET school_id = $1 WHERE email = ANY($2::text[])`, [finalSchoolId, targetEmails]);
                    } else if (newRole) {
                        const query = newRole === 'GURU' ? `UPDATE users SET role = $2 WHERE email = ANY($1::text[])` : newRole === 'SUPER_ADMIN' ? `UPDATE users SET role = $2, school_id = NULL, assigned_classes = '{}' WHERE email = ANY($1::text[])` : `UPDATE users SET role = $2, assigned_classes = '{}' WHERE email = ANY($1::text[])`;
                        await client.query(query, [targetEmails, newRole]);
                    }
                    await client.query('COMMIT');
                } catch (e) {
                    await client.query('ROLLBACK');
                    throw e;
                } finally {
                    client.release();
                }
                return response.status(200).json({ success: true });
            }

            case 'getAllSchools': {
                if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') return response.status(403).json({ error: 'Forbidden' });
                const { rows: allSchools } = await sql`SELECT id, name FROM schools ORDER BY name;`;
                return response.status(200).json({ allSchools });
            }

            case 'createSchool': {
                if (user.role !== 'SUPER_ADMIN') return response.status(403).json({ error: 'Forbidden' });
                const { schoolName } = payload;
                const { rows: newSchool } = await sql`INSERT INTO schools (name) VALUES (${schoolName}) RETURNING id, name;`;
                return response.status(201).json({ success: true, school: newSchool[0] });
            }

            case 'saveData': {
                if (user.role === 'KEPALA_SEKOLAH') return response.status(403).json({ error: 'Kepala Sekolah hanya bisa membaca data.' });
                
                const { studentsByClass, savedLogs, actingAsSchoolId } = payload;
                let targetEmail = user.email;
                let finalSchoolId = user.school_id;

                if ((user.role === 'SUPER_ADMIN' && actingAsSchoolId) || user.role === 'ADMIN_SEKOLAH') {
                    finalSchoolId = user.role === 'ADMIN_SEKOLAH' ? user.school_id : actingAsSchoolId;
                    const className = Object.keys(studentsByClass)[0];
                    if (className) {
                        const { rows: teacherRows } = await sql`SELECT email FROM users WHERE school_id = ${finalSchoolId} AND ${className} = ANY(assigned_classes);`;
                        if (teacherRows.length === 1) targetEmail = teacherRows[0].email;
                    }
                }
                
                await sql`
                    INSERT INTO absensi_data (user_email, school_id, students_by_class, saved_logs, last_updated)
                    VALUES (${targetEmail}, ${finalSchoolId}, ${JSON.stringify(studentsByClass)}, ${JSON.stringify(savedLogs)}, NOW())
                    ON CONFLICT (user_email) DO UPDATE SET
                      school_id = EXCLUDED.school_id,
                      students_by_class = EXCLUDED.students_by_class,
                      saved_logs = EXCLUDED.saved_logs,
                      last_updated = NOW();
                `;
                return response.status(200).json({ success: true });
            }
            
            case 'getHistoryData': {
                const { schoolId, filters, isClassSpecific, classFilter, isGlobalView } = payload;
                let effectiveSchoolId = (user.role === 'KEPALA_SEKOLAH' || user.role === 'ADMIN_SEKOLAH') ? user.school_id : schoolId;
                let query;
                if (isGlobalView && user.role === 'SUPER_ADMIN') {
                    query = sql`SELECT ad.saved_logs, u.name as user_name FROM absensi_data ad JOIN users u ON ad.user_email = u.email`;
                } else if (effectiveSchoolId) {
                    query = sql`SELECT ad.saved_logs, u.name as user_name FROM absensi_data ad JOIN users u ON ad.user_email = u.email WHERE ad.school_id = ${effectiveSchoolId}`;
                } else if (user.role === 'GURU') {
                    query = sql`SELECT saved_logs FROM absensi_data WHERE user_email = ${user.email}`;
                } else {
                    return response.status(200).json({ filteredLogs: [] });
                }
                const { rows } = await query;
                let allLogs = rows.flatMap(row => (row.saved_logs || []).map(log => ({...log, teacherName: row.user_name || user.name })));
                
                const { studentName, status, startDate, endDate } = filters || {};
                if (classFilter) allLogs = allLogs.filter(log => log.class === classFilter);
                if (startDate) allLogs = allLogs.filter(log => log.date >= startDate);
                if (endDate) allLogs = allLogs.filter(log => log.date <= endDate);
                const processedLogs = allLogs.map(log => {
                    let absentStudents = Object.entries(log.attendance).filter(([, s]) => s !== 'H');
                    if (studentName) absentStudents = absentStudents.filter(([name]) => name.toLowerCase().includes(studentName.toLowerCase()));
                    if (status && status !== 'all') absentStudents = absentStudents.filter(([, s]) => s === status);
                    return absentStudents.length > 0 ? { ...log, filteredAbsences: absentStudents } : null;
                }).filter(Boolean);

                return response.status(200).json({ filteredLogs: processedLogs });
            }

            case 'getDashboardData': {
                if (!['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(user.role)) {
                    return response.status(403).json({ error: 'Forbidden' });
                }

                const { schoolId, selectedDate, chartViewMode, chartClassFilter } = payload;
                if (!schoolId) {
                    return response.status(400).json({ error: 'School ID required' });
                }
                
                const { rows: schoolInfoRows } = await sql`
                    WITH merged_students AS (
                        SELECT jsonb_object_agg(key, value) as all_classes
                        FROM (
                            SELECT key, value FROM absensi_data, jsonb_each(students_by_class)
                            WHERE school_id = ${schoolId}
                        ) as t
                    )
                    SELECT 
                        (SELECT COALESCE(SUM(jsonb_array_length(class_data -> 'students')), 0)
                         FROM merged_students, jsonb_each(all_classes) as class_each(class_name, class_data)) as "totalStudents",
                        (SELECT COALESCE(jsonb_agg(class_name ORDER BY class_name), '[]'::jsonb) 
                         FROM (SELECT DISTINCT jsonb_object_keys(all_classes) as class_name FROM merged_students) as c) as "allClasses";
                `;
                const totalStudents = schoolInfoRows[0]?.totalStudents || 0;
                const allClasses = schoolInfoRows[0]?.allClasses || [];

                const { rows: dailyAbsentRows } = await sql`
                    WITH unnested_logs AS (
                      SELECT 
                        log_obj,
                        u.name as user_name
                      FROM absensi_data ad
                      CROSS JOIN jsonb_array_elements(ad.saved_logs) as log_obj
                      JOIN users u on u.email = ad.user_email
                      WHERE ad.school_id = ${schoolId}
                    ),
                    logs_for_date AS (
                      SELECT 
                        log_obj ->> 'class' as class,
                        log_obj -> 'attendance' as attendance,
                        user_name
                      FROM unnested_logs
                      WHERE log_obj ->> 'date' = ${selectedDate}
                    ),
                    absent_students AS (
                      SELECT
                        lfd.class,
                        lfd.user_name,
                        att.key as student_name,
                        att.value as status
                      FROM logs_for_date lfd
                      CROSS JOIN jsonb_each_text(lfd.attendance) as att
                      WHERE att.value <> 'H'
                    )
                    SELECT
                      class,
                      user_name as "teacherName",
                      jsonb_agg(jsonb_build_object('name', student_name, 'status', status) ORDER BY student_name) as students
                    FROM absent_students
                    GROUP BY class, user_name
                    ORDER BY class;
                `;

                const absenceCounts = { S: 0, I: 0, A: 0 };
                const absentStudentsByClass = {};
                dailyAbsentRows.forEach(row => {
                    absentStudentsByClass[row.class] = { students: row.students, teacherName: row.teacherName };
                    row.students.forEach(student => {
                        if (absenceCounts[student.status] !== undefined) {
                            absenceCounts[student.status]++;
                        }
                    });
                });
                const totalAbsent = absenceCounts.S + absenceCounts.I + absenceCounts.A;
                const totalPresent = Math.max(0, totalStudents - totalAbsent);

                const today = new Date(selectedDate + 'T00:00:00');
                let startDate, endDate;
                
                switch (chartViewMode) {
                    case 'daily': startDate = endDate = selectedDate; break;
                    case 'weekly': {
                        const d = new Date(today);
                        d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
                        startDate = d.toISOString().split('T')[0];
                        d.setDate(d.getDate() + 6);
                        endDate = d.toISOString().split('T')[0];
                        break;
                    }
                    case 'monthly': {
                        const d = new Date(today);
                        startDate = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
                        endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
                        break;
                    }
                    case 'semester1': startDate = new Date(today.getFullYear(), 6, 1).toISOString().split('T')[0]; endDate = new Date(today.getFullYear(), 11, 31).toISOString().split('T')[0]; break;
                    case 'semester2': startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]; endDate = new Date(today.getFullYear(), 5, 30).toISOString().split('T')[0]; break;
                    case 'yearly': startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]; endDate = new Date(today.getFullYear(), 11, 31).toISOString().split('T')[0]; break;
                }

                const { rows: periodAbsenceRows } = await sql`
                    WITH RelevantLogs AS (
                        SELECT log_obj FROM absensi_data, jsonb_array_elements(saved_logs) as log_obj
                        WHERE school_id = ${schoolId} AND (log_obj->>'date')::date BETWEEN ${startDate} AND ${endDate} AND (${chartClassFilter} = 'all' OR log_obj->>'class' = ${chartClassFilter})
                    ), Absences AS (
                        SELECT (jsonb_each_text(log_obj->'attendance')).value as status FROM RelevantLogs
                    )
                    SELECT status, COUNT(*) as count FROM Absences WHERE status <> 'H' GROUP BY status;
                `;

                const { rows: periodDaysAndStudents } = await sql`
                     WITH RelevantLogs AS (
                        SELECT DISTINCT log_obj->>'date' as date FROM absensi_data, jsonb_array_elements(saved_logs) as log_obj
                        WHERE school_id = ${schoolId} AND (log_obj->>'date')::date BETWEEN ${startDate} AND ${endDate} AND (${chartClassFilter} = 'all' OR log_obj->>'class' = ${chartClassFilter})
                    ), StudentsInScope AS (
                         SELECT COALESCE(SUM(jsonb_array_length(class_data -> 'students')), 0) as count
                         FROM (SELECT jsonb_object_agg(key, value) as all_classes FROM (
                            SELECT key, value FROM absensi_data, jsonb_each(students_by_class)
                            WHERE school_id = ${schoolId}
                         ) as t) as merged_students,
                         jsonb_each(all_classes) as class_each(class_name, class_data)
                         WHERE ${chartClassFilter} = 'all' OR class_name = ${chartClassFilter}
                    )
                    SELECT (SELECT COUNT(*) FROM RelevantLogs) as "numSchoolDays", (SELECT count FROM StudentsInScope) as "numStudents";
                `;

                const periodAbsenceCounts = { S: 0, I: 0, A: 0 };
                periodAbsenceRows.forEach(row => { if (periodAbsenceCounts[row.status] !== undefined) { periodAbsenceCounts[row.status] = parseInt(row.count, 10); } });
                
                const numSchoolDays = parseInt(periodDaysAndStudents[0]?.numSchoolDays || 0, 10);
                const numStudentsInScope = parseInt(periodDaysAndStudents[0]?.numStudents || 0, 10);
                const totalAttendanceOpportunities = numSchoolDays * numStudentsInScope;
                const periodTotalAbsent = periodAbsenceCounts.S + periodAbsenceCounts.I + periodAbsenceCounts.A;
                const periodTotalPresent = Math.max(0, totalAttendanceOpportunities - periodTotalAbsent);

                return response.status(200).json({
                    reportData: { summaryStats: { totalStudents, totalPresent, ...absenceCounts }, absentStudentsByClass },
                    percentageData: { finalCounts: { H: periodTotalPresent, ...periodAbsenceCounts }, totalAttendanceOpportunities, allClasses }
                });
            }

            case 'getRecapData': {
                if (!['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'GURU'].includes(user.role)) {
                    return response.status(403).json({ error: 'Forbidden' });
                }

                const { schoolId, classFilter } = payload;
                let effectiveSchoolId = (user.role !== 'SUPER_ADMIN') ? user.school_id : schoolId;
                
                if (user.role === 'GURU') {
                    const { rows } = await sql`SELECT students_by_class, saved_logs FROM absensi_data WHERE user_email = ${user.email}`;
                    const studentsByClassToUse = rows[0]?.students_by_class || {};
                    const logsToUse = rows[0]?.saved_logs || [];
                    const recapData = {};
                    const studentToClassMap = {};
                    const studentOriginalIndex = {};
                    for (const className in studentsByClassToUse) {
                        if (classFilter && className !== classFilter) continue;
                        if (studentsByClassToUse[className]?.students) {
                            studentsByClassToUse[className].students.forEach((studentName, index) => {
                                recapData[studentName] = { S: 0, I: 0, A: 0 };
                                studentToClassMap[studentName] = className;
                                studentOriginalIndex[studentName] = index;
                            });
                        }
                    }
                    logsToUse.forEach(log => {
                        if (classFilter && log.class !== classFilter) return;
                        Object.entries(log.attendance).forEach(([studentName, status]) => {
                            if (recapData[studentName] && status !== 'H') {
                                if (recapData[studentName][status] !== undefined) { recapData[studentName][status]++; }
                            }
                        });
                    });
                    const recapArray = Object.keys(recapData).map(name => {
                        const data = recapData[name];
                        return { name, class: studentToClassMap[name] || 'N/A', ...data, total: data.S + data.I + data.A, originalIndex: studentOriginalIndex[name] || 0 };
                    });
                    return response.status(200).json({ recapArray });
                } else if (effectiveSchoolId) {
                    const { rows: recapArray } = await sql`
                        WITH all_students_by_class AS (
                            SELECT jsonb_object_agg(key, value) as data FROM (
                                SELECT key, value FROM absensi_data, jsonb_each(students_by_class) WHERE school_id = ${effectiveSchoolId}
                            ) as t
                        ), students_flat AS (
                            SELECT class_info.key as class, student_name.value as name, row_number() over (partition by class_info.key order by student_name.value) as "originalIndex"
                            FROM all_students_by_class, jsonb_each(data) as class_info, jsonb_array_elements_text(class_info.value -> 'students') as student_name
                            WHERE ${classFilter} IS NULL OR class_info.key = ${classFilter}
                        ), unnested_logs AS (
                          SELECT log_obj -> 'attendance' as attendance FROM absensi_data ad
                          CROSS JOIN jsonb_array_elements(ad.saved_logs) as log_obj
                          WHERE ad.school_id = ${effectiveSchoolId} AND (${classFilter} IS NULL OR log_obj ->> 'class' = ${classFilter})
                        ), absences AS (
                          SELECT att.key as name, att.value as status FROM unnested_logs
                          CROSS JOIN jsonb_each_text(attendance) as att WHERE att.value <> 'H'
                        ), absence_counts AS (
                            SELECT name, COUNT(*) FILTER (WHERE status = 'S') as "S", COUNT(*) FILTER (WHERE status = 'I') as "I", COUNT(*) FILTER (WHERE status = 'A') as "A"
                            FROM absences GROUP BY name
                        )
                        SELECT s.name, s.class, s."originalIndex", COALESCE(ac."S", 0)::int as "S", COALESCE(ac."I", 0)::int as "I", COALESCE(ac."A", 0)::int as "A",
                            (COALESCE(ac."S", 0) + COALESCE(ac."I", 0) + COALESCE(ac."A", 0))::int as total
                        FROM students_flat s LEFT JOIN absence_counts ac ON s.name = ac.name;
                    `;
                    return response.status(200).json({ recapArray });
                }
                return response.status(200).json({ recapArray: [] });
            }

            case 'generateAiRecommendation': {
                if (!['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(user.role)) {
                    return response.status(403).json({ error: 'Forbidden' });
                }
                if (!process.env.API_KEY) return response.status(500).json({ error: 'Konfigurasi server tidak lengkap' });
                
                const { aiRange } = payload;
                const schoolId = user.school_id;
                if (!schoolId) return response.status(400).json({ error: 'User not assigned to a school.' });

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                let startDate = new Date(today);
                let dateRangeContext = "30 Hari Terakhir";

                switch (aiRange) {
                    case 'last30days': startDate.setDate(today.getDate() - 30); break;
                    case 'semester':
                        const currentMonth = today.getMonth();
                        if (currentMonth >= 0 && currentMonth <= 5) {
                            startDate = new Date(today.getFullYear(), 0, 1);
                            dateRangeContext = `Semester II (Januari - Juni ${today.getFullYear()})`;
                        } else {
                            startDate = new Date(today.getFullYear(), 6, 1);
                            dateRangeContext = `Semester I (Juli - Desember ${today.getFullYear()})`;
                        }
                        break;
                    case 'year':
                        startDate = new Date(today.getFullYear(), 6, 1);
                        if (today.getMonth() < 6) { startDate.setFullYear(today.getFullYear() - 1); }
                        dateRangeContext = `Tahun Ajaran ${startDate.getFullYear()}/${startDate.getFullYear() + 1}`;
                        break;
                }
                const startDateString = startDate.toISOString().split('T')[0];
                
                const { rows: topStudentsData } = await sql`
                    WITH unnested_logs AS (
                      SELECT log_obj ->> 'class' as class, log_obj ->> 'date' as date, log_obj -> 'attendance' as attendance
                      FROM absensi_data ad CROSS JOIN jsonb_array_elements(ad.saved_logs) as log_obj
                      WHERE ad.school_id = ${schoolId}
                    ), absences_in_range AS (
                      SELECT class, date, att.key as name, att.value as status
                      FROM unnested_logs CROSS JOIN jsonb_each_text(attendance) as att
                      WHERE att.value <> 'H' AND date >= ${startDateString}
                    ), student_summary AS (
                        SELECT name, MAX(class) as class, COUNT(*) FILTER (WHERE status = 'S') as "S", COUNT(*) FILTER (WHERE status = 'I') as "I",
                            COUNT(*) FILTER (WHERE status = 'A') as "A", COUNT(*) as total,
                            jsonb_agg(jsonb_build_object('date', date, 'status', status) ORDER BY date) as absences
                        FROM absences_in_range GROUP BY name
                    )
                    SELECT * FROM student_summary ORDER BY total DESC LIMIT 25;
                `;

                if (topStudentsData.length === 0) {
                    return response.status(200).json({ recommendation: `Tidak ada data absensi (sakit, izin, alpa) dalam periode **${dateRangeContext}** untuk dianalisis.` });
                }
                
                const prompt = `
                    Anda adalah AI canggih yang bertindak sebagai tim konsultan pendidikan untuk kepala sekolah. Anda menganalisis data absensi secara objektif untuk memberikan wawasan yang dapat ditindaklanjuti.
                    **PERIODE ANALISIS**: ${dateRangeContext}.
                    **ATURAN UTAMA: Langsung berikan analisis dalam format Markdown yang diminta tanpa salam pembuka, paragraf pengantar, atau basa-basi.**

                    Data absensi siswa dengan ketidakhadiran tertinggi (format JSON): ${JSON.stringify(topStudentsData)}
                    Setiap siswa memiliki daftar 'absences' yang berisi tanggal dan status ('S' untuk Sakit, 'I' untuk Izin, 'A' untuk Alpa).

                    Sajikan analisis Anda HANYA dalam format Markdown berikut. Gunakan heading level 3 (###) untuk setiap judul bagian.

                    ### Ringkasan Eksekutif
                    Berikan 2-3 kalimat yang merangkum temuan paling krusial dari analisis individu dan kelompok di bawah ini untuk periode ${dateRangeContext}.

                    ### Peringatan Dini: Pola Absensi Individu Signifikan
                    Bertindaklah sebagai Konselor Sekolah. Fokus UTAMA Anda di bagian ini adalah **kasus individu yang sangat terisolasi**.

                    **ATURAN PALING PENTING - IKUTI PROSES INI:**
                    1.  **IDENTIFIKASI:** Cari semua siswa dengan pola individu signifikan: (A) Absen 'Sakit'/'Izin' selama 3+ hari berturut-turut, atau (B) Absen pada hari yang sama dalam seminggu selama 2+ minggu.
                    2.  **HITUNG:** Hitung berapa banyak total siswa yang Anda temukan di langkah 1.
                    3.  **PUTUSKAN (LOGIKA UTAMA):**
                        -   **JIKA JUMLAHNYA 2 ATAU KURANG:** Laporkan hanya siswa-siswa tersebut di bagian ini.
                        -   **JIKA JUMLAHNYA 3 ATAU LEBIH:** **JANGAN LAPORKAN SIAPAPUN DI SINI.** Biarkan bagian ini kosong atau tulis "Tidak ada kasus individu terisolasi yang signifikan; semua pola yang ditemukan bersifat kelompok dan dibahas di Analisis Pola Utama." Semua siswa tersebut HARUS dibahas sebagai satu kelompok di bagian "Analisis Pola Utama".

                    Hanya jika kondisi "2 ATAU KURANG" terpenuhi, gunakan format ini untuk setiap siswa:
                    - **Nama Siswa (Kelas)**: Total X kali absen (Sakit: Y, Izin: Z, Alpa: A).
                        - ***Pola Teridentifikasi:*** Jelaskan pola individu yang terisolasi. Contoh: "Satu-satunya siswa dengan absensi sakit beruntun selama 4 hari (1-4 September), menandakan perlunya pemantauan kesehatan personal."

                    ### Analisis Pola Utama: Tren Kelompok & Lintas Kelas
                    Bertindaklah sebagai Analis Data Sekolah. Fokus utama Anda di sini adalah mengidentifikasi **tren kelompok** di mana beberapa siswa absen secara bersamaan.
                    Prioritaskan untuk mencari pola berikut:
                    1.  **Klaster Absensi Signifikan (Prioritas Tertinggi):** Cari kelompok yang terdiri dari **3 atau lebih siswa** yang menunjukkan pola absensi signifikan yang serupa (misalnya sakit beruntun) dalam rentang waktu yang berdekatan. Ini adalah temuan paling penting Anda.
                    2.  **Klaster Absensi Umum:** Beberapa siswa (dari kelas yang sama atau berbeda) absen karena 'Sakit' atau 'Izin' dalam rentang tanggal yang tumpang tindih, bahkan jika tidak beruntun.
                    3.  **Anomali Kelas:** Satu kelas tertentu menunjukkan tingkat absensi yang jauh lebih tinggi dibandingkan kelas lainnya.

                    Gunakan format berikut:
                    - ***Judul Pola:*** Beri nama pola yang ditemukan. Contoh: "Teridentifikasi Klaster Sakit Beruntun Akhir Bulan Melibatkan 5 Siswa".
                        - ***Deskripsi:*** Jelaskan pola kelompok yang ditemukan, rentang tanggalnya, kelas mana saja yang terlibat, dan potensi penyebabnya. Sebutkan nama-nama siswa yang menjadi bagian dari klaster ini untuk memberikan konteks.

                    ### Rekomendasi Tindak Lanjut Strategis
                    Gunakan daftar berpoin. Berikan 2-3 rekomendasi konkret berdasarkan temuan di 'Peringatan Dini' dan 'Analisis Pola Utama'. Jelaskan MENGAPA setiap rekomendasi penting. Contoh: "**Dialog Personal dengan Siswa Berpola Kronis**: Tugaskan Guru BK untuk berbicara dengan siswa yang absen setiap hari Jumat untuk memahami akar permasalahannya." atau "**Koordinasi Kesehatan untuk Klaster Sakit**: Informasikan kepada Guru UKS dan wali kelas terkait untuk memantau gejala dan memastikan protokol kesehatan dijalankan."
                `;
                
                const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
                const geminiResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: { thinkingConfig: { thinkingBudget: 0 } }
                });
            
                return response.status(200).json({ recommendation: geminiResponse.text });
            }
            
            default:
                return response.status(400).json({ error: 'Invalid action' });
        }

    } catch (error) {
        console.error('API Error:', error);
        return response.status(500).json({ error: 'An internal server error occurred', details: error.message });
    }
}
