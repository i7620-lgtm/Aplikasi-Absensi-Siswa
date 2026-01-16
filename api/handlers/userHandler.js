
// HAPUS IMPORT INI UNTUK MENCEGAH CIRCULAR DEPENDENCY
// import { SUPER_ADMIN_EMAILS } from '../data.js';

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

/**
 * Reconstructs a school's current state from its entire change log.
 * This is the heavy data-lifting operation, now separated from login.
 */
async function reconstructStateFromLogs(schoolId, sql) {
    if (!schoolId) {
        return { initialStudents: {}, initialLogs: [], latestVersion: 0 };
    }

    const { rows: changes } = await sql`
        SELECT id, event_type, payload
        FROM change_log
        WHERE school_id = ${schoolId}
        ORDER BY id ASC;
    `;

    const studentsByClass = {};
    const attendanceLogs = {}; // Use a map for efficient updates by key

    changes.forEach(change => {
        if (change.event_type === 'ATTENDANCE_UPDATED') {
            const logKey = `${change.payload.class}-${change.payload.date}`;
            attendanceLogs[logKey] = change.payload;
        } else if (change.event_type === 'STUDENT_LIST_UPDATED') {
            studentsByClass[change.payload.class] = { students: change.payload.students };
        }
    });

    const latestVersion = changes.length > 0 ? changes[changes.length - 1].id : 0;
    
    return {
        initialStudents: studentsByClass,
        initialLogs: Object.values(attendanceLogs),
        latestVersion
    };
}


/**
 * New handler for fetching the main school data after a successful login.
 */
export async function handleGetInitialData({ user, sql, response }) {
    // The user object is already available in the context from api/data.js
    if (!user || !user.school_id) {
        // This case covers new users, admins without context, parents etc.
        // It's not an error, just means there's no school data to fetch.
        return response.status(200).json({ initialStudents: {}, initialLogs: [], latestVersion: 0 });
    }
    
    const { initialStudents, initialLogs, latestVersion } = await reconstructStateFromLogs(user.school_id, sql);
    
    return response.status(200).json({ initialStudents, initialLogs, latestVersion });
}


export async function handleGetAllUsers({ user, sql, response }) {
    const authorizedRoles = ['SUPER_ADMIN', 'ADMIN_SEKOLAH', 'ADMIN_DINAS_PENDIDIKAN'];
    if (!authorizedRoles.includes(user.role)) {
         return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    let usersQuery;
    if (user.role === 'SUPER_ADMIN') {
        usersQuery = sql`
            SELECT 
                u.email, u.name, u.picture, u.role, u.school_id, u.jurisdiction_id, u.assigned_classes,
                s.name as school_name,
                j.name as jurisdiction_name,
                (u.role = 'GURU' AND u.school_id IS NULL AND u.jurisdiction_id IS NULL) AS is_unmanaged
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            LEFT JOIN jurisdictions j ON u.jurisdiction_id = j.id
            ORDER BY u.name;
        `;
    } else if (user.role === 'ADMIN_DINAS_PENDIDIKAN') {
        const accessibleJurisdictionIds = await getSubJurisdictionIds(user.jurisdiction_id, sql);
        if (accessibleJurisdictionIds.length === 0) return response.status(200).json({ allUsers: [] });
        
        usersQuery = sql`
            SELECT 
                u.email, u.name, u.picture, u.role, u.school_id, u.jurisdiction_id, u.assigned_classes,
                s.name as school_name,
                j.name as jurisdiction_name
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            LEFT JOIN jurisdictions j ON u.jurisdiction_id = j.id
            WHERE u.jurisdiction_id = ANY(${accessibleJurisdictionIds})
            OR s.jurisdiction_id = ANY(${accessibleJurisdictionIds})
            ORDER BY u.name;
        `;
    } else { // ADMIN_SEKOLAH
        if (!user.school_id) return response.status(200).json({ allUsers: [] });
        usersQuery = sql`
            SELECT 
                u.email, u.name, u.picture, u.role, u.school_id, u.jurisdiction_id, u.assigned_classes,
                s.name as school_name,
                j.name as jurisdiction_name
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            LEFT JOIN jurisdictions j ON u.jurisdiction_id = j.id
            WHERE u.school_id = ${user.school_id} AND u.role IN ('GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH')
            ORDER BY u.name;
        `;
    }
    const { rows: allUsers } = await usersQuery;
    return response.status(200).json({ allUsers });
}


export async function handleUpdateUserConfiguration({ payload, user, sql, response, SUPER_ADMIN_EMAILS }) {
    const authorizedRoles = ['SUPER_ADMIN', 'ADMIN_SEKOLAH', 'ADMIN_DINAS_PENDIDIKAN'];
    if (!authorizedRoles.includes(user.role)) {
         return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    const { targetEmail, newRole, newSchoolId, newClasses, newJurisdictionId } = payload;
    
    // Admin Sekolah validation
    if (user.role === 'ADMIN_SEKOLAH') {
        if (!user.school_id) return response.status(403).json({ error: 'Admin Sekolah tidak ditugaskan ke sekolah manapun.' });
        const { rows: targetUserRows } = await sql`SELECT school_id FROM users WHERE email = ${targetEmail}`;
        if (targetUserRows.length === 0 || targetUserRows[0].school_id !== user.school_id) {
            return response.status(403).json({ error: 'Anda hanya dapat mengelola pengguna di sekolah Anda sendiri.' });
        }
        if (!['GURU', 'KEPALA_SEKOLAH'].includes(newRole)) {
             return response.status(403).json({ error: 'Anda tidak memiliki izin untuk menetapkan peran ini.' });
        }
        if (newSchoolId && newSchoolId !== user.school_id.toString()) {
             return response.status(403).json({ error: 'Anda tidak dapat memindahkan pengguna ke sekolah lain.' });
        }
    }
    
    // Admin Dinas validation
    if (user.role === 'ADMIN_DINAS_PENDIDIKAN') {
         if (!user.jurisdiction_id) return response.status(403).json({ error: 'Admin Dinas tidak ditugaskan ke yurisdiksi manapun.' });
         const accessibleJurisdictionIds = await getSubJurisdictionIds(user.jurisdiction_id, sql);
         const { rows: targetUserRows } = await sql`SELECT jurisdiction_id, school_id FROM users WHERE email = ${targetEmail}`;
         const targetUser = targetUserRows[0];
         
         let isTargetInScope = false;
         if (targetUser.jurisdiction_id && accessibleJurisdictionIds.includes(targetUser.jurisdiction_id)) {
            isTargetInScope = true;
         } else if (targetUser.school_id) {
            const { rows: schoolRows } = await sql`SELECT jurisdiction_id FROM schools WHERE id = ${targetUser.school_id}`;
            if (schoolRows[0] && accessibleJurisdictionIds.includes(schoolRows[0].jurisdiction_id)) {
                isTargetInScope = true;
            }
         }
         
         if (!isTargetInScope) {
             return response.status(403).json({ error: 'Anda hanya dapat mengelola pengguna di dalam yurisdiksi Anda.' });
         }
         
         if (['SUPER_ADMIN', 'ADMIN_DINAS_PENDIDIKAN'].includes(newRole)) {
            return response.status(403).json({ error: 'Anda tidak dapat menetapkan peran admin tingkat tinggi.' });
         }
    }
    
    // Super Admin checks
    if (user.role === 'SUPER_ADMIN' && SUPER_ADMIN_EMAILS && SUPER_ADMIN_EMAILS.includes(targetEmail) && newRole !== 'SUPER_ADMIN') {
        return response.status(400).json({ error: 'Cannot demote a bootstrapped Super Admin.' });
    }
    
    let finalSchoolId = newSchoolId === "" ? null : newSchoolId;
    let finalJurisdictionId = newJurisdictionId === "" ? null : newJurisdictionId;
    let assignedClasses = newRole === 'GURU' ? (newClasses || '{}') : '{}';

    // Business logic for roles
    if (newRole === 'SUPER_ADMIN') {
        finalSchoolId = null;
        finalJurisdictionId = null;
    } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(newRole)) {
        finalSchoolId = null; // Dinas users are not tied to a single school
    } else if (['GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(newRole)) {
        finalJurisdictionId = null; // School users are not directly tied to a jurisdiction
    }
    
    await sql`
        UPDATE users 
        SET 
            role = ${newRole}, 
            school_id = ${finalSchoolId}, 
            jurisdiction_id = ${finalJurisdictionId},
            assigned_classes = ${assignedClasses}
        WHERE email = ${targetEmail}`;
    
    return response.status(200).json({ success: true });
}


export async function handleUpdateUsersBulk({ payload, user, sql, response, SUPER_ADMIN_EMAILS }) {
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

    if (user.role === 'SUPER_ADMIN' && newRole && newRole !== 'SUPER_ADMIN' && SUPER_ADMIN_EMAILS) {
        const demotingBootstrapped = targetEmails.some(email => SUPER_ADMIN_EMAILS.includes(email));
        if (demotingBootstrapped) {
            return response.status(400).json({ error: 'Tidak dapat menurunkan peran Super Admin bawaan.' });
        }
    }

    const client = await sql.connect();
    try {
        await client.query('BEGIN');

        if (newSchoolId !== undefined) {
            const finalSchoolId = newSchoolId === "" || newSchoolId === null ? null : newSchoolId;
            await client.query(
                `UPDATE users SET school_id = $1, jurisdiction_id = NULL WHERE email = ANY($2::text[])`,
                [finalSchoolId, targetEmails]
            );
        } else if (newRole) {
            let updateQuery;
            const queryParams = [targetEmails, newRole];

            if (newRole === 'GURU') {
                updateQuery = `UPDATE users SET role = $2 WHERE email = ANY($1::text[])`;
            } else if (newRole === 'SUPER_ADMIN') {
                updateQuery = `UPDATE users SET role = $2, school_id = NULL, jurisdiction_id = NULL, assigned_classes = '{}' WHERE email = ANY($1::text[])`;
            } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(newRole)) {
                updateQuery = `UPDATE users SET role = $2, school_id = NULL, assigned_classes = '{}' WHERE email = ANY($1::text[])`;
            } else { // KEPALA_SEKOLAH or ADMIN_SEKOLAH
                updateQuery = `UPDATE users SET role = $2, assigned_classes = '{}' WHERE email = ANY($1::text[])`;
            }
            await client.query(updateQuery, queryParams);
        } else {
             return response.status(400).json({ error: 'Tidak ada tindakan massal yang valid (diperlukan newSchoolId atau newRole).' });
        }
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error; // Rethrow the error to be caught by the main handler
    } finally {
        client.release();
    }
    
    return response.status(200).json({ success: true });
}
