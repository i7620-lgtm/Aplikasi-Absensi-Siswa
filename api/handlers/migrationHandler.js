export async function handleCheckAndStartClientMigration({ user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden' });
    }

    const MIGRATION_NAME = 'client_side_migration_v1';

    try {
        const { rows: ranMigrations } = await sql`SELECT name FROM migrations WHERE name = ${MIGRATION_NAME}`;
        if (ranMigrations.length > 0) {
            return response.status(200).json({ status: 'complete' });
        }

        // Ambil SEMUA data mentah dari tabel lama. `SELECT *` adalah cara paling aman
        // untuk menghindari masalah nama kolom yang tidak konsisten (`class` vs `class_name`).
        const { rows: rawData } = await sql`SELECT * FROM absensi_data`;
        
        // Tambahan: Ambil ID sekolah default (sekolah pertama yang dibuat) untuk data lama yang mungkin tidak memiliki school_id.
        const { rows: schools } = await sql`SELECT id FROM schools ORDER BY id ASC LIMIT 1`;
        const defaultSchoolId = schools.length > 0 ? schools[0].id : null;

        return response.status(200).json({ status: 'pending', data: rawData, defaultSchoolId });

    } catch (error) {
        // Jika tabel 'absensi_data' tidak ada, itu bukan error, berarti tidak ada yang perlu dimigrasi.
        if (error.message.includes('relation "absensi_data" does not exist')) {
            console.log("Tabel 'absensi_data' tidak ditemukan, migrasi dilewati.");
            return response.status(200).json({ status: 'no_data_table' });
        }
        console.error("Gagal memeriksa status migrasi:", error);
        return response.status(500).json({ error: `Gagal memeriksa status migrasi: ${error.message}` });
    }
}

export async function handleUploadMigratedData({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden' });
    }

    const { migratedData } = payload;
    if (!migratedData || !Array.isArray(migratedData) || migratedData.length === 0) {
        return response.status(400).json({ error: 'Tidak ada data migrasi yang diberikan.' });
    }
    
    const MIGRATION_NAME = 'client_side_migration_v1';
    const client = await sql.connect();

    try {
        await client.query('BEGIN');

        // Menggunakan unnest untuk bulk insert yang efisien
        const values = migratedData.map(item => [
            item.school_id,
            item.user_email,
            item.event_type,
            JSON.stringify(item.payload)
        ]);

        const text = 'INSERT INTO change_log (school_id, user_email, event_type, payload) SELECT * FROM unnest($1::int[], $2::varchar[], $3::varchar[], $4::jsonb[])';
        const params = [
            values.map(v => v[0]),
            values.map(v => v[1]),
            values.map(v => v[2]),
            values.map(v => v[3])
        ];
        
        const { rowCount } = await client.query(text, params);
        
        // Menandai migrasi sebagai selesai
        await client.query(`INSERT INTO migrations (name) VALUES ($1)`, [MIGRATION_NAME]);

        await client.query('COMMIT');
        
        return response.status(200).json({ status: 'success', count: rowCount });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Gagal mengunggah data migrasi:', error);
        return response.status(500).json({ error: `Gagal menyimpan data migrasi: ${error.message}` });
    } finally {
        client.release();
    }
}
