export default async function handleMigrateLegacyData({ payload, user, sql, response, redis }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden: Only Super Admins can migrate data.' });
    }

    const { schoolId, userEmail, legacyData } = payload;

    if (!schoolId || !userEmail || !legacyData) {
        return response.status(400).json({ error: 'schoolId, userEmail, and legacyData are required.' });
    }

    const eventsToInsert = [];

    // --- NEW: Robust data detection logic ---
    // It first looks for the specific key. If not found, it checks if the provided data
    // itself is an object that looks like a class list (i.e., not an array and not containing saved_logs).
    const studentData = legacyData.students_by_class || (typeof legacyData === 'object' && !Array.isArray(legacyData) && !legacyData.saved_logs ? legacyData : null);
    const logData = legacyData.saved_logs || (Array.isArray(legacyData) ? legacyData : null);
    // --- END: Robust data detection logic ---

    // 1. Process student lists
    if (studentData) {
        for (const className in studentData) {
            const classData = studentData[className];
            if (classData && classData.students && Array.isArray(classData.students)) {
                
                const newStudentFormat = classData.students.map(studentName => ({
                    name: String(studentName).trim(), // Ensure it's a string
                    parentEmail: "" 
                })).filter(s => s.name);

                eventsToInsert.push({
                    type: 'STUDENT_LIST_UPDATED',
                    createdAt: classData.lastModified || new Date().toISOString(),
                    payload: {
                        class: className,
                        students: newStudentFormat
                    }
                });
            }
        }
    }

    // 2. Process attendance logs
    if (logData && Array.isArray(logData)) {
        logData.forEach(log => {
            // Basic validation to ensure it looks like a log entry
            if (log && log.date && log.class && log.attendance) {
                const { lastModified, ...attendancePayload } = log;
                eventsToInsert.push({
                    type: 'ATTENDANCE_UPDATED',
                    createdAt: lastModified || new Date(log.date).toISOString(),
                    payload: attendancePayload
                });
            }
        });
    }

    if (eventsToInsert.length === 0) {
        return response.status(200).json({ 
            success: false, 
            message: "No data to migrate. Format JSON tidak dikenali atau tidak ada data yang valid untuk dimigrasikan. Pastikan data mengandung 'students_by_class' atau 'saved_logs', atau merupakan objek daftar kelas." 
        });
    }


    const client = await sql.connect();
    let latestId = 0;
    try {
        await client.query('BEGIN');

        for (const event of eventsToInsert) {
            const res = await client.query(
                `INSERT INTO change_log (school_id, user_email, event_type, payload, created_at)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [schoolId, userEmail, event.type, JSON.stringify(event.payload), event.createdAt]
            );
            if (res.rows[0].id > latestId) {
                latestId = res.rows[0].id;
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration transaction failed:', error);
        return response.status(500).json({ error: 'Database transaction failed during migration.', details: error.message });
    } finally {
        client.release();
    }
    
    // After successful migration, update the Redis signal
    if (redis && latestId > 0) {
        try {
            const key = `school_version:${schoolId}`;
            await redis.set(key, latestId, { ex: 90000 });
            console.log(`Update signal (v${latestId}) sent to Redis after migration for school ${schoolId}`);
        } catch(e) {
            console.error("Failed to update Redis signal after migration:", e);
        }
    }
    
    return response.status(200).json({ 
        success: true, 
        message: `Successfully migrated ${eventsToInsert.length} records.`
    });
}
