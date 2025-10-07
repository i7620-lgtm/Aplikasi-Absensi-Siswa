import { setupDatabase } from '../setup.js';

// --- NEW: Idempotent setup check ---
// This flag prevents re-checking the database on every subsequent API call
// within the same serverless function instance (warm start).
let isDbInitialized = false;

async function ensureDatabaseIsReady(sql) {
    if (isDbInitialized) return;

    // Proactively check if the 'users' table exists. This is a reliable
    // indicator of whether the initial schema setup has run.
    const { rows } = await sql`SELECT to_regclass('public.users');`;
    const tableExists = rows[0].to_regclass;

    if (!tableExists) {
        console.warn("Tabel 'users' tidak ditemukan. Menjalankan inisialisasi database (pertama kali)...");
        await setupDatabase();
        console.log("Inisialisasi database berhasil.");
    }
    isDbInitialized = true;
}


async function loginOrRegisterUser(profile, sql, SUPER_ADMIN_EMAILS) {
    const { email, name, picture } = profile;
    
    // 1. Check for a primary role in the main users table
    const { rows: userRows } = await sql`
        SELECT u.email, u.name, u.picture, u.role, u.school_id, u.jurisdiction_id, u.assigned_classes, j.name as jurisdiction_name 
        FROM users u
        LEFT JOIN jurisdictions j ON u.jurisdiction_id = j.id
        WHERE u.email = ${email}`;
    let primaryUser = userRows[0];
    let primaryRole = null;

    if (primaryUser) {
        // Existing user: update login time and profile info
        await sql`UPDATE users SET last_login = NOW(), name = ${name}, picture = ${picture} WHERE email = ${email}`;
        primaryRole = primaryUser.role;
    } else {
        // If not an existing user in the main table, they might be a new user or a parent-only user.
        // For new users, determine if they should be Super Admin.
        if (SUPER_ADMIN_EMAILS.includes(email)) {
            primaryRole = 'SUPER_ADMIN';
        }
        // Note: Default 'GURU' role is now handled below after the parent check.
    }

    // 2. Independently, check if the email is registered as a parent
    const { rows: parentCheck } = await sql`
        SELECT 1 FROM change_log
        WHERE event_type = 'STUDENT_LIST_UPDATED'
        AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(payload->'students') as s
            WHERE s->>'parentEmail' = ${email}
        )
        LIMIT 1;
    `;
    const isParent = parentCheck.length > 0;

    // 3. Consolidate user profile and handle new user registration if needed
    let finalUser;
    if (primaryUser) {
        finalUser = { ...primaryUser, primaryRole: primaryUser.role, isParent };
    } else {
        // Determine the final primary role for new or parent-only users
        if (!primaryRole) {
            if (isParent) {
                primaryRole = 'ORANG_TUA';
            } else {
                primaryRole = 'GURU'; // Default role for brand new users
            }
        }
        
        // If the user needs to be created in the `users` table (i.e., not a parent-only login)
        if (primaryRole !== 'ORANG_TUA') {
             const { rows: newRows } = await sql`
                INSERT INTO users (email, name, picture, role, last_login, assigned_classes)
                VALUES (${email}, ${name}, ${picture}, ${primaryRole}, NOW(), '{}')
                RETURNING email, name, picture, role as "primaryRole", school_id, jurisdiction_id, assigned_classes;
            `;
            finalUser = { ...newRows[0], isParent, jurisdiction_name: null };
        } else {
            // This is a parent-only login, create a temporary user object for this session.
            finalUser = {
                email,
                name,
                picture,
                primaryRole: 'ORANG_TUA',
                isParent: true,
                school_id: null,
                jurisdiction_id: null,
                jurisdiction_name: null,
                assigned_classes: [],
            };
        }
    }
    
    // Ensure assigned_classes is an array
    if (finalUser.assigned_classes === null || finalUser.assigned_classes === undefined) {
        finalUser.assigned_classes = [];
    }
    
    return { user: finalUser };
}


// Function to reconstruct current state from change_log
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
    const attendanceLogs = {}; // Use map for efficient updates: key=`${class}-${date}`

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


export default async function handleLoginOrRegister({ payload, sql, response, SUPER_ADMIN_EMAILS }) {
    if (!payload || !payload.profile) return response.status(400).json({ error: 'Profile payload is required' });
    
    // --- NEW: Proactive DB setup check ---
    // This stable approach ensures the database schema exists before any login logic runs.
    await ensureDatabaseIsReady(sql);
    
    const loginResult = await loginOrRegisterUser(payload.profile, sql, SUPER_ADMIN_EMAILS);
    const { user } = loginResult;

    // For roles that require initial school data, bootstrap it.
    if (user.primaryRole !== 'ORANG_TUA' && user.school_id) {
        const { initialStudents, initialLogs, latestVersion } = await reconstructStateFromLogs(user.school_id, sql);
        return response.status(200).json({ user, initialStudents, initialLogs, latestVersion });
    }
    
    // For other roles (Super Admin without school, Parent, Dinas), just return the user profile. 
    // Data will be fetched based on context later.
    return response.status(200).json({ user });
}
