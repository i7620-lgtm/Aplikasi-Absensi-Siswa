import { SUPER_ADMIN_EMAILS } from '../data.js';

export async function handleGetAllUsers({ user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') {
         return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    let usersQuery;
    if (user.role === 'SUPER_ADMIN') {
        usersQuery = sql`
            SELECT 
                u.email, u.name, u.picture, u.role, u.school_id, u.assigned_classes,
                s.name as school_name,
                (u.role = 'GURU' AND u.school_id IS NULL) AS is_unmanaged
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            ORDER BY u.name;
        `;
    } else { // ADMIN_SEKOLAH
        if (!user.school_id) return response.status(200).json({ allUsers: [] });
        usersQuery = sql`
            SELECT 
                u.email, u.name, u.picture, u.role, u.school_id, u.assigned_classes,
                s.name as school_name
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            WHERE u.school_id = ${user.school_id} AND u.role IN ('GURU', 'KEPALA_SEKOLAH')
            ORDER BY u.name;
        `;
    }
    const { rows: allUsers } = await usersQuery;
    return response.status(200).json({ allUsers });
}


export async function handleUpdateUserConfiguration({ payload, user, sql, response }) {
     if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') {
         return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    const { targetEmail, newRole, newSchoolId, newClasses } = payload;
    
    if (user.role === 'ADMIN_SEKOLAH') {
        if (!user.school_id) return response.status(403).json({ error: 'Admin Sekolah tidak ditugaskan ke sekolah manapun.' });

        const { rows: targetUserRows } = await sql`SELECT school_id FROM users WHERE email = ${targetEmail}`;
        if (targetUserRows.length === 0 || targetUserRows[0].school_id !== user.school_id) {
            return response.status(403).json({ error: 'Anda hanya dapat mengelola pengguna di sekolah Anda sendiri.' });
        }
        if (newRole === 'SUPER_ADMIN' || newRole === 'ADMIN_SEKOLAH') {
             return response.status(403).json({ error: 'Anda tidak memiliki izin untuk menetapkan peran admin.' });
        }
        if (newSchoolId && newSchoolId !== user.school_id.toString()) {
             return response.status(403).json({ error: 'Anda tidak dapat memindahkan pengguna ke sekolah lain.' });
        }
    } else { // SUPER_ADMIN checks
        if (SUPER_ADMIN_EMAILS.includes(targetEmail) && newRole !== 'SUPER_ADMIN') {
            return response.status(400).json({ error: 'Cannot demote a bootstrapped Super Admin.' });
        }
    }
    
    let finalSchoolId = newSchoolId === "" ? null : newSchoolId;

    if (newRole === 'SUPER_ADMIN') {
        finalSchoolId = null;
    }
    
    const assignedClasses = newRole === 'GURU' ? newClasses : '{}';
    
    await sql`
        UPDATE users 
        SET 
            role = ${newRole}, 
            school_id = ${finalSchoolId}, 
            assigned_classes = ${assignedClasses}
        WHERE email = ${targetEmail}`;
    
    return response.status(200).json({ success: true });
}


export async function handleUpdateUsersBulk({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN_SEKOLAH') {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    const { targetEmails, newRole, newSchoolId } = payload;

    if (!targetEmails || !Array.isArray(targetEmails) || targetEmails.length === 0) {
        return response.status(400).json({ error: 'Tidak ada pengguna target yang ditentukan.' });
    }

    if (user.role === 'ADMIN_SEKOLAH') {
        if (!user.school_id) return response.status(403).json({ error: 'Admin Sekolah tidak ditugaskan ke sekolah manapun.' });

        const { rows: targetUsers } = await sql`SELECT school_id FROM users WHERE email = ANY(${targetEmails}::text[])`;
        if (targetUsers.some(u => u.school_id !== user.school_id)) {
            return response.status(403).json({ error: 'Anda hanya dapat mengelola pengguna di sekolah Anda sendiri.' });
        }
        if (newRole && (newRole === 'SUPER_ADMIN' || newRole === 'ADMIN_SEKOLAH')) {
             return response.status(403).json({ error: 'Anda tidak memiliki izin untuk menetapkan peran admin.' });
        }
        if (newSchoolId !== undefined && newSchoolId.toString() !== user.school_id.toString()) {
             return response.status(403).json({ error: 'Anda tidak dapat memindahkan pengguna ke sekolah lain.' });
        }
    }

    if (user.role === 'SUPER_ADMIN' && newRole && newRole !== 'SUPER_ADMIN') {
        const demotingBootstrapped = targetEmails.some(email => SUPER_ADMIN_EMAILS.includes(email));
        if (demotingBootstrapped) {
            return response.status(400).json({ error: 'Tidak dapat menurunkan peran Super Admin bawaan.' });
        }
    }

    if (newSchoolId !== undefined) {
        const finalSchoolId = newSchoolId === "" || newSchoolId === null ? null : newSchoolId;
        await sql`
            UPDATE users SET school_id = ${finalSchoolId}
            WHERE email = ANY(${targetEmails}::text[]);
        `;
    } else if (newRole) {
         const client = await sql.connect();
         try {
            let setClauses = [`role = '${newRole}'`];
            if (newRole === 'SUPER_ADMIN') {
                setClauses.push(`school_id = NULL`);
            }
            if (newRole !== 'GURU') {
                setClauses.push(`assigned_classes = '{}'`);
            }
    
            const queryString = `
                UPDATE users SET ${setClauses.join(', ')}
                WHERE email = ANY($1::text[]);
            `;
            await client.query(queryString, [targetEmails]);
         } finally {
            client.release();
         }
    } else {
        return response.status(400).json({ error: 'Tidak ada tindakan massal yang valid (diperlukan newSchoolId atau newRole).' });
    }
    
    return response.status(200).json({ success: true });
}
