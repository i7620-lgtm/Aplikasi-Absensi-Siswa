export default async function handleRunBackgroundMigrations({ user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden: Only Super Admins can run migrations.' });
    }

    const MIGRATION_NAME = 'migrate_v1_absensi_data_to_changelog';

    try {
        const { rows: ranMigrations } = await sql`SELECT name FROM migrations WHERE name = ${MIGRATION_NAME}`;
        if (ranMigrations.length > 0) {
            return response.status(200).json({ 
                message: `Migrasi '${MIGRATION_NAME}' sudah pernah dijalankan.`,
                details: "Tidak ada tindakan yang diambil."
            });
        }

        // Begin migration
        const client = await sql.connect();
        try {
            await client.query('BEGIN');
            
            // Mengelompokkan data absensi lama dan memasukkannya ke dalam change_log
            const { rows: migratedRows } = await client.query(`
                WITH grouped_absensi AS (
                    SELECT
                        school_id,
                        class_name,
                        date,
                        jsonb_object_agg(student_name, status) as attendance,
                        (array_agg(teacher_email))[1] as user_email
                    FROM absensi_data
                    GROUP BY school_id, class_name, date
                )
                INSERT INTO change_log (school_id, user_email, event_type, payload)
                SELECT
                    school_id,
                    COALESCE(user_email, 'migration@system.local'),
                    'ATTENDANCE_UPDATED',
                    jsonb_build_object(
                        'date', date::text,
                        'class', class_name,
                        'attendance', attendance
                    )
                FROM grouped_absensi
                RETURNING id;
            `);

            // Menandai migrasi sebagai selesai
            await client.query(`INSERT INTO migrations (name) VALUES ($1)`, [MIGRATION_NAME]);

            await client.query('COMMIT');
            
            const message = `Migrasi '${MIGRATION_NAME}' berhasil diselesaikan.`;
            const details = `${migratedRows.length} rekaman absensi (dikelompokkan per kelas/hari) berhasil dimigrasi ke format baru.`;
            
            return response.status(200).json({ message, details });

        } catch(error) {
            await client.query('ROLLBACK');
            console.error(`Migration ${MIGRATION_NAME} failed:`, error);
            return response.status(500).json({ error: `Proses migrasi gagal: ${error.message}` });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Gagal memeriksa status migrasi:", error);
        return response.status(500).json({ error: `Gagal memeriksa status migrasi: ${error.message}` });
    }
}
