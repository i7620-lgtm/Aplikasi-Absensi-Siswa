
// Simple sanitizer to prevent basic XSS by removing HTML tags.
function sanitize(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '').trim();
}

export async function handleGetAllSchools({ user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') {
         return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    const { rows: allSchools } = await sql`SELECT id, name FROM schools ORDER BY name;`;
    return response.status(200).json({ allSchools });
}

export async function handleSearchSchools({ payload, user, sql, response }) {
    // Open to all authenticated users (GURU, etc) to facilitate onboarding
    const { query } = payload;
    const sanitizedQuery = sanitize(query);

    if (!sanitizedQuery || sanitizedQuery.length < 3) {
        return response.status(200).json({ results: [] });
    }

    // Find schools matching the name AND find the associated Admin/Principal name & email
    // Using LEFT JOIN LATERAL to efficiently fetch the top-ranking admin for each school found
    const { rows: results } = await sql`
        SELECT 
            s.id, 
            s.name, 
            u.name as admin_name,
            u.email as admin_email
        FROM schools s
        LEFT JOIN LATERAL (
            SELECT name, email
            FROM users
            WHERE school_id = s.id
            AND role IN ('ADMIN_SEKOLAH', 'KEPALA_SEKOLAH', 'SUPER_ADMIN')
            ORDER BY CASE WHEN role = 'ADMIN_SEKOLAH' THEN 1 ELSE 2 END
            LIMIT 1
        ) u ON true
        WHERE s.name ILIKE ${'%' + sanitizedQuery + '%'} 
        LIMIT 10;
    `;

    return response.status(200).json({ results });
}

export async function handleCreateSchool({ payload, user, sql, response }) {
    // Modified: If user has NO school_id, allow them to create one (Onboarding flow)
    // Otherwise, restrict to SUPER_ADMIN.
    
    if (user.role !== 'SUPER_ADMIN' && user.school_id) {
         return response.status(403).json({ error: 'Forbidden: Anda sudah terdaftar di sebuah sekolah.' });
    }
    
    const { schoolName } = payload;
    const sanitizedName = sanitize(schoolName);
    
    if (!sanitizedName) {
        return response.status(400).json({ error: 'Nama sekolah wajib diisi.' });
    }

    const client = await sql.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Create School
        const { rows: newSchool } = await client.query(`INSERT INTO schools (name) VALUES ($1) RETURNING id, name`, [sanitizedName]);
        const schoolId = newSchool[0].id;

        // 2. If this is a self-service creation (user has no role/school yet), promote them
        if (user.role !== 'SUPER_ADMIN') {
            await client.query(
                `UPDATE users SET school_id = $1, role = 'ADMIN_SEKOLAH' WHERE email = $2`,
                [schoolId, user.email]
            );
        }

        await client.query('COMMIT');
        return response.status(201).json({ success: true, school: newSchool[0] });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Failed to create school:", error);
        return response.status(500).json({ error: 'Gagal membuat sekolah.' });
    } finally {
        client.release();
    }
}
