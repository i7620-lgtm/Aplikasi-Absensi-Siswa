export default async function handleMigrateLegacyData({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden: Only Super Admins can migrate data.' });
    }

    const { schoolId, userEmail, legacyData } = payload;

    if (!schoolId || !userEmail || !legacyData) {
        return response.status(400).json({ error: 'schoolId, userEmail, and legacyData are required.' });
    }

    const eventsToInsert = [];

    // 1. Process student lists
    if (legacyData.students_by_class) {
        for (const className in legacyData.students_by_class) {
            const classData = legacyData.students_by_class[className];
            if (classData.students && Array.isArray(classData.students)) {
                
                const newStudentFormat = classData.students.map(studentName => ({
                    name: studentName,
                    parentEmail: "" 
                }));

                eventsToInsert.push({
                    type: 'STUDENT_LIST_UPDATED',
                    createdAt: classData.lastModified,
                    payload: {
                        class: className,
                        students: newStudentFormat
                    }
                });
            }
        }
    }

    // 2. Process attendance logs
    if (legacyData.saved_logs && Array.isArray(legacyData.saved_logs)) {
        legacyData.saved_logs.forEach(log => {
            const { lastModified, ...attendancePayload } = log;
            eventsToInsert.push({
                type: 'ATTENDANCE_UPDATED',
                createdAt: lastModified,
                payload: attendancePayload
            });
        });
    }

    if (eventsToInsert.length === 0) {
        return response.status(200).json({ success: true, message: "No data to migrate." });
    }

    const client = await sql.connect();
    try {
        await client.query('BEGIN');

        for (const event of eventsToInsert) {
            await client.query(
                `INSERT INTO change_log (school_id, user_email, event_type, payload, created_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [schoolId, userEmail, event.type, JSON.stringify(event.payload), event.createdAt]
            );
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration transaction failed:', error);
        return response.status(500).json({ error: 'Database transaction failed during migration.', details: error.message });
    } finally {
        client.release();
    }
    
    return response.status(200).json({ 
        success: true, 
        message: `Successfully migrated ${eventsToInsert.length} records.`
    });
}
