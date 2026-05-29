
import { SUPER_ADMIN_EMAILS } from '../data.js';

async function getSubJurisdictionIds(jurisdictionId, sql) {
    if (!jurisdictionId) return [];
    const rows = await sql`
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
 */
async function reconstructStateFromLogs(schoolId, sql) {
    if (!schoolId) {
        return { initialStudents: {}, initialLogs: [], latestVersion: 0 };
    }

    const changes = await sql`
        SELECT id, event_type, payload
        FROM change_log
        WHERE school_id = ${schoolId}
        ORDER BY id ASC;
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
    let schoolData = { initialStudents: {}, initialLogs: [], latestVersion: 0 };
    let schoolSettings = { workDays: [1, 2, 3, 4, 5, 6] };
    let holidays = [];

    let applicableRegionalIds = [];
    
    if (user && user.school_id) {
        schoolData = await reconstructStateFromLogs(user.school_id, sql);
        
        const sRows = await sql`SELECT * FROM schools WHERE id = ${user.school_id}`;
        
        if (sRows.length > 0) {
            if (sRows[0].settings) {
                schoolSettings = { ...schoolSettings, ...sRows[0].settings };
            }
            
            if (sRows[0].jurisdiction_id) {
                const jurIds = await sql`
                    WITH RECURSIVE parents AS (
                        SELECT id, parent_id FROM jurisdictions WHERE id = ${sRows[0].jurisdiction_id}
                        UNION ALL
                        SELECT j.id, j.parent_id FROM jurisdictions j JOIN parents p ON j.id = p.parent_id
                    )
                    SELECT id FROM parents
                `;
                applicableRegionalIds = jurIds.map(j => j.id);
            }
        }
    }

    const allHolidays = await sql`SELECT id, TO_CHAR(date, 'YYYY-MM-DD') as date, description, scope, reference_id, created_by_email FROM holidays ORDER BY date DESC`; 
    
    holidays = allHolidays.filter(h => 
        h.scope === 'NATIONAL' ||
        (user.school_id && h.scope === 'SCHOOL' && h.reference_id === user.school_id) ||
        (h.scope === 'REGIONAL' && applicableRegionalIds.includes(h.reference_id))
    );
    
    return response.status(200).json({ ...schoolData, schoolSettings, holidays });
}


export async function handleGetAllUsers({ payload, user, sql, response }) {
    const authorizedRoles = ['SUPER_ADMIN', 'ADMIN_SEKOLAH', 'ADMIN_DINAS_PENDIDIKAN'];
    if (!authorizedRoles.includes(user.role)) {
         return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { page = 1, limit = 10, searchQuery = '', groupBySchool = false } = payload || {};
    const offset = (page - 1) * limit;
    const searchPattern = searchQuery ? `%${searchQuery}%` : null;
    const isSearching = !!searchQuery;

    let totalCount = 0;
    let allUsers = [];

    if (user.role === 'SUPER_ADMIN') {
        const countRes = await sql`
            SELECT COUNT(*) as total FROM users u
            WHERE (${searchPattern}::text IS NULL OR u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern})
        `;
        totalCount = parseInt(countRes[0].total, 10);

        const rows = await sql`
            SELECT 
                u.email, u.name, u.picture, u.role, u.school_id, u.jurisdiction_id, u.assigned_classes,
                s.name as school_name,
                j.name as jurisdiction_name,
                (u.role = 'GURU' AND u.school_id IS NULL AND u.jurisdiction_id IS NULL) AS is_unmanaged
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            LEFT JOIN jurisdictions j ON u.jurisdiction_id = j.id
            WHERE (${searchPattern}::text IS NULL OR u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern})
            ORDER BY 
                CASE WHEN ${groupBySchool}::boolean THEN s.name END ASC NULLS LAST,
                u.name ASC
            LIMIT ${isSearching ? null : limit} OFFSET ${isSearching ? 0 : offset};
        `;
        allUsers = rows;
    } else if (user.role === 'ADMIN_DINAS_PENDIDIKAN') {
        const accessibleJurisdictionIds = await getSubJurisdictionIds(user.jurisdiction_id, sql);
        if (accessibleJurisdictionIds.length === 0) return response.status(200).json({ allUsers: [], totalCount: 0 });
        
        const countRes = await sql`
            SELECT COUNT(*) as total FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            WHERE ((u.jurisdiction_id = ANY(${accessibleJurisdictionIds}) OR s.jurisdiction_id = ANY(${accessibleJurisdictionIds})) OR (u.school_id IS NULL AND u.jurisdiction_id IS NULL AND u.email = ${searchPattern}))
            AND (${searchPattern}::text IS NULL OR u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern})
        `;
        totalCount = parseInt(countRes[0].total, 10);

        const rows = await sql`
            SELECT 
                u.email, u.name, u.picture, u.role, u.school_id, u.jurisdiction_id, u.assigned_classes,
                s.name as school_name,
                j.name as jurisdiction_name
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            LEFT JOIN jurisdictions j ON u.jurisdiction_id = j.id
            WHERE ((u.jurisdiction_id = ANY(${accessibleJurisdictionIds}) OR s.jurisdiction_id = ANY(${accessibleJurisdictionIds})) OR (u.school_id IS NULL AND u.jurisdiction_id IS NULL AND u.email = ${searchPattern}))
            AND (${searchPattern}::text IS NULL OR u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern})
            ORDER BY 
                CASE WHEN ${groupBySchool}::boolean THEN s.name END ASC NULLS LAST,
                u.name ASC
            LIMIT ${isSearching ? null : limit} OFFSET ${isSearching ? 0 : offset};
        `;
        allUsers = rows;
    } else { // ADMIN_SEKOLAH
        if (!user.school_id) return response.status(200).json({ allUsers: [], totalCount: 0 });
        
        const countRes = await sql`
            SELECT COUNT(*) as total FROM users u
            WHERE (u.school_id = ${user.school_id} OR (u.school_id IS NULL AND u.email = ${searchPattern})) 
            AND u.role IN ('GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH')
            AND (${searchPattern}::text IS NULL OR u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern})
        `;
        totalCount = parseInt(countRes[0].total, 10);

        const rows = await sql`
            SELECT 
                u.email, u.name, u.picture, u.role, u.school_id, u.jurisdiction_id, u.assigned_classes,
                s.name as school_name,
                j.name as jurisdiction_name
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            LEFT JOIN jurisdictions j ON u.jurisdiction_id = j.id
            WHERE (u.school_id = ${user.school_id} OR (u.school_id IS NULL AND u.email = ${searchPattern})) 
            AND u.role IN ('GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH')
            AND (${searchPattern}::text IS NULL OR u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern})
            ORDER BY 
                CASE WHEN ${groupBySchool}::boolean THEN s.name END ASC NULLS LAST,
                u.name ASC
            LIMIT ${isSearching ? null : limit} OFFSET ${isSearching ? 0 : offset};
        `;
        allUsers = rows;
    }
    
    return response.status(200).json({ allUsers, totalCount });
}


export async function handleUpdateUserConfiguration({ payload, user, sql, response }) {
    const authorizedRoles = ['SUPER_ADMIN', 'ADMIN_SEKOLAH', 'ADMIN_DINAS_PENDIDIKAN'];
    if (!authorizedRoles.includes(user.role)) {
         return response.status(403).json({ error: 'Forbidden: Access denied' });
    }
    const { targetEmail, newRole, newSchoolId, newClasses, newJurisdictionId } = payload;
    
    // Admin Sekolah validation
    if (user.role === 'ADMIN_SEKOLAH') {
        if (!user.school_id) return response.status(403).json({ error: 'Admin Sekolah tidak ditugaskan ke sekolah manapun.' });
        
        // Ensure the target is actually in their school OR is unassigned
        const targetUserRows = await sql`SELECT school_id, role FROM users WHERE email = ${targetEmail}`;
        if (targetUserRows.length === 0 || (targetUserRows[0].school_id !== user.school_id && targetUserRows[0].school_id !== null)) {
            return response.status(403).json({ error: 'Anda hanya dapat mengelola pengguna di sekolah Anda sendiri atau pengguna yang belum mendapatkan sekolah.' });
        }
        
        // Prevent assigning high-level roles
        if (!['GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(newRole)) {
             return response.status(403).json({ error: 'Anda tidak memiliki izin untuk menetapkan peran administratif tingkat wilayah atau sistem.' });
        }
        
        // Prevent moving users to other schools (enforced server-side)
        if (newSchoolId && Number(newSchoolId) !== Number(user.school_id)) {
             return response.status(403).json({ error: 'Anda tidak dapat memindahkan pengguna ke sekolah lain.' });
        }
    }
    
    // Admin Dinas validation
    if (user.role === 'ADMIN_DINAS_PENDIDIKAN') {
         if (!user.jurisdiction_id) return response.status(403).json({ error: 'Admin Dinas tidak ditugaskan ke yurisdiksi manapun.' });
         const accessibleJurisdictionIds = await getSubJurisdictionIds(user.jurisdiction_id, sql);
         const targetUserRows = await sql`SELECT jurisdiction_id, school_id FROM users WHERE email = ${targetEmail}`;
         if (targetUserRows.length === 0) return response.status(404).json({ error: 'User not found' });
         const targetUser = targetUserRows[0];
         
         let isTargetInScope = false;
         if (!targetUser.jurisdiction_id && !targetUser.school_id) {
             isTargetInScope = true; // Unassigned user
         } else if (targetUser.jurisdiction_id && accessibleJurisdictionIds.includes(targetUser.jurisdiction_id)) {
            isTargetInScope = true;
         } else if (targetUser.school_id) {
            const schoolRows = await sql`SELECT jurisdiction_id FROM schools WHERE id = ${targetUser.school_id}`;
            if (schoolRows[0] && accessibleJurisdictionIds.includes(schoolRows[0].jurisdiction_id)) {
                isTargetInScope = true;
            }
         }
         
         if (!isTargetInScope) {
             return response.status(403).json({ error: 'Anda hanya dapat mengelola pengguna di dalam yurisdiksi Anda atau pengguna yang belum ditugaskan.' });
         }
         
         if (['SUPER_ADMIN', 'ADMIN_DINAS_PENDIDIKAN'].includes(newRole)) {
            return response.status(403).json({ error: 'Anda tidak dapat menetapkan peran admin tingkat tinggi.' });
         }

         if (newJurisdictionId && newJurisdictionId !== "" && !accessibleJurisdictionIds.includes(Number(newJurisdictionId))) {
             return response.status(403).json({ error: 'Anda tidak dapat menetapkan yurisdiksi di luar wilayah Anda.' });
         }

         if (newSchoolId && newSchoolId !== "") {
             const newSchoolRows = await sql`SELECT jurisdiction_id FROM schools WHERE id = ${newSchoolId}`;
             if (newSchoolRows.length === 0 || !accessibleJurisdictionIds.includes(newSchoolRows[0].jurisdiction_id)) {
                 return response.status(403).json({ error: 'Anda tidak dapat menetapkan sekolah di luar wilayah Anda.' });
             }
         }
    }
    
    // Super Admin checks
    if (user.role === 'SUPER_ADMIN' && SUPER_ADMIN_EMAILS.includes(targetEmail) && newRole !== 'SUPER_ADMIN') {
        return response.status(400).json({ error: 'Cannot demote a bootstrapped Super Admin.' });
    }
    
    // Fallback/Force school assignment for Admin Sekolah
    let finalSchoolId = (user.role === 'ADMIN_SEKOLAH') ? user.school_id : (newSchoolId === "" ? null : newSchoolId);
    let finalJurisdictionId = (user.role === 'ADMIN_SEKOLAH') ? null : (newJurisdictionId === "" ? null : newJurisdictionId);
    let assignedClasses = newRole === 'GURU' ? (newClasses || '{}') : '{}';

    // Role dependency rules
    if (newRole === 'SUPER_ADMIN') {
        finalSchoolId = null;
        finalJurisdictionId = null;
    } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(newRole)) {
        finalSchoolId = null;
    } else if (['GURU', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(newRole)) {
        finalJurisdictionId = (user.role === 'ADMIN_DINAS_PENDIDIKAN' || user.role === 'SUPER_ADMIN') ? finalJurisdictionId : null;
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

        const targetUsers = await sql`SELECT school_id FROM users WHERE email = ANY(${targetEmails}::text[])`;
        if (targetUsers.some(u => u.school_id !== user.school_id)) {
            return response.status(403).json({ error: 'Anda hanya dapat mengelola pengguna di sekolah Anda sendiri.' });
        }
        if (newRole && (newRole === 'SUPER_ADMIN' || ['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(newRole))) {
             return response.status(403).json({ error: 'Anda tidak memiliki izin untuk menetapkan peran admin sistem atau wilayah.' });
        }
        if (newSchoolId !== undefined && Number(newSchoolId) !== Number(user.school_id)) {
             return response.status(403).json({ error: 'Anda tidak dapat memindahkan pengguna ke sekolah lain.' });
        }
    }

    if (user.role === 'SUPER_ADMIN' && newRole && newRole !== 'SUPER_ADMIN') {
        const demotingBootstrapped = targetEmails.some(email => SUPER_ADMIN_EMAILS.includes(email));
        if (demotingBootstrapped) {
            return response.status(400).json({ error: 'Tidak dapat menurunkan peran Super Admin bawaan.' });
        }
    }

    // Fix: Using sql.begin for transactions in postgres.js
    try {
        await sql.begin(async (sql) => {
            if (newSchoolId !== undefined) {
                const finalSchoolId = newSchoolId === "" || newSchoolId === null ? null : newSchoolId;
                await sql`UPDATE users SET school_id = ${finalSchoolId}, jurisdiction_id = NULL WHERE email = ANY(${targetEmails}::text[])`;
            } else if (newRole) {
                if (newRole === 'GURU') {
                    await sql`UPDATE users SET role = ${newRole} WHERE email = ANY(${targetEmails}::text[])`;
                } else if (newRole === 'SUPER_ADMIN') {
                    await sql`UPDATE users SET role = ${newRole}, school_id = NULL, jurisdiction_id = NULL, assigned_classes = '{}' WHERE email = ANY(${targetEmails}::text[])`;
                } else if (['DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'].includes(newRole)) {
                    await sql`UPDATE users SET role = ${newRole}, school_id = NULL, assigned_classes = '{}' WHERE email = ANY(${targetEmails}::text[])`;
                } else { // KEPALA_SEKOLAH or ADMIN_SEKOLAH
                    await sql`UPDATE users SET role = ${newRole}, assigned_classes = '{}' WHERE email = ANY(${targetEmails}::text[])`;
                }
            } else {
                throw new Error('Tidak ada tindakan massal yang valid (diperlukan newSchoolId atau newRole).');
            }
        });
    } catch (error) {
        console.error("Bulk update transaction failed:", error);
        if (error.message.includes('Tidak ada tindakan massal')) {
            return response.status(400).json({ error: error.message });
        }
        throw error;
    }
    
    return response.status(200).json({ success: true });
}

export async function handleJoinSchool({ payload, user, sql, response }) {
    if (user.role !== 'GURU' || user.school_id) {
        return response.status(400).json({ error: 'You are already assigned to a school or have an incompatible role.' });
    }
    const { schoolId } = payload;
    if (!schoolId) {
        return response.status(400).json({ error: 'School ID required.' });
    }

    try {
        await sql`UPDATE users SET school_id = ${schoolId}, assigned_classes = '{}' WHERE email = ${user.email}`;
        
        // Log the change
        const logData = {
            timestamp: new Date().toISOString(),
            date: new Date().toISOString().split('T')[0],
            edited_by: user.email,
            changes: { type: 'join_school', details: 'User joined school as GURU' },
            client_id: user.email + '-' + Date.now()
        };
        await sql`INSERT INTO change_log (school_id, class_name, type, payload) VALUES (${schoolId}, 'SYSTEM', 'UPDATE_USER', ${sql.json(logData)})`;

        return response.status(200).json({ success: true, schoolId });
    } catch (e) {
        console.error("Error joining school", e);
        return response.status(500).json({ error: 'Internal Server Error' });
    }
}

export async function handleRegisterAsTeacher({ user, sql, response }) {
    if (!user.isParent || user.role !== 'ORANG_TUA') {
        return response.status(400).json({ error: 'Anda sudah login sebagai tenaga pendidik.' });
    }

    try {
        // Insert them into the users table as a 'GURU'
        await sql`
            INSERT INTO users (email, name, picture, role, last_login, assigned_classes)
            VALUES (${user.email}, ${user.name || 'User'}, ${user.picture || ''}, 'GURU', NOW(), '{}')
            ON CONFLICT (email) DO UPDATE SET role = 'GURU', last_login = NOW()
        `;
        return response.status(200).json({ success: true, message: 'Berhasil didaftarkan sebagai tenaga pendidik.' });
    } catch (error) {
        console.error("Error registering as teacher:", error);
        return response.status(500).json({ error: 'Gagal mendaftar sebagai tenaga pendidik.' });
    }
}
