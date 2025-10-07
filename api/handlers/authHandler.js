import { setupDatabase } from '../setup.js';

/**
 * Core logic to find or create a user in the database.
 * This function assumes the database tables already exist.
 */
async function loginOrRegisterUser(profile, sql, SUPER_ADMIN_EMAILS) {
    const { email, name, picture } = profile;
    
    // 1. Check for an existing user
    const { rows: userRows } = await sql`
        SELECT u.email, u.name, u.picture, u.role, u.school_id, u.jurisdiction_id, u.assigned_classes, j.name as jurisdiction_name 
        FROM users u
        LEFT JOIN jurisdictions j ON u.jurisdiction_id = j.id
        WHERE u.email = ${email}`;
    let primaryUser = userRows[0];
    let primaryRole = primaryUser ? primaryUser.role : null;

    if (primaryUser) {
        // Update profile info for existing user
        await sql`UPDATE users SET last_login = NOW(), name = ${name}, picture = ${picture} WHERE email = ${email}`;
    } else if (SUPER_ADMIN_EMAILS.includes(email)) {
        // Assign Super Admin role if email matches
        primaryRole = 'SUPER_ADMIN';
    }

    // 2. Independently check if the user is a parent
    const { rows: parentCheck } = await sql`
        SELECT 1 FROM change_log
        WHERE event_type = 'STUDENT_LIST_UPDATED'
        AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(payload->'students') as s
            WHERE s->>'parentEmail' = ${email}
        ) LIMIT 1;
    `;
    const isParent = parentCheck.length > 0;

    // 3. Consolidate profile and create new user if necessary
    let finalUser;
    if (primaryUser) {
        finalUser = { ...primaryUser, primaryRole: primaryUser.role, isParent };
    } else {
        // Determine the final primary role for new users
        if (!primaryRole) {
            primaryRole = isParent ? 'ORANG_TUA' : 'GURU'; // Default is GURU unless they are already a parent
        }
        
        // Create user in `users` table unless they are a parent-only login
        if (primaryRole !== 'ORANG_TUA') {
             const { rows: newRows } = await sql`
                INSERT INTO users (email, name, picture, role, last_login, assigned_classes)
                VALUES (${email}, ${name}, ${picture}, ${primaryRole}, NOW(), '{}')
                RETURNING email, name, picture, role, school_id, jurisdiction_id, assigned_classes;
            `;
            finalUser = { ...newRows[0], primaryRole: newRows[0].role, isParent, jurisdiction_name: null };
        } else {
            // For parent-only logins, create a temporary user object for the session
            finalUser = { email, name, picture, primaryRole: 'ORANG_TUA', isParent: true, school_id: null, jurisdiction_id: null, jurisdiction_name: null, assigned_classes: [] };
        }
    }
    
    // Ensure assigned_classes is always an array
    finalUser.assigned_classes = finalUser.assigned_classes || [];
    return { user: finalUser };
}

/**
 * Main handler for the login/registration action. Acts as a gatekeeper.
 */
export default async function handleLoginOrRegister({ payload, sql, response, SUPER_ADMIN_EMAILS }) {
    if (!payload || !payload.profile) {
        return response.status(400).json({ error: 'Profile payload is required' });
    }
    
    try {
        // This now ONLY handles user creation/verification.
        const { user } = await loginOrRegisterUser(payload.profile, sql, SUPER_ADMIN_EMAILS);
        
        // It returns just the user profile. The heavy data lifting is done in a separate call.
        return response.status(200).json({ user });

    } catch (error) {
        // This is the critical gatekeeper logic. It catches the raw DB error for an undefined table.
        if (error.code === '42P01') { 
            // Instead of fixing the problem, it signals to the frontend that a setup is needed.
            console.error("DB tables not found. Signaling client to initialize.");
            const initError = new Error("Database not initialized, caught undefined table error.");
            initError.code = 'DATABASE_NOT_INITIALIZED'; // Attach custom code for the main API handler
            throw initError;
        }
        // Re-throw any other errors to be handled as a generic 500 error.
        console.error("Error during login/register:", error);
        throw error;
    }
}

/**
 * A separate, dedicated handler for initializing the database.
 * This is called by the frontend only when it receives the DATABASE_NOT_INITIALIZED signal.
 */
export async function handleInitializeDatabase({ response }) {
    try {
        console.log("Dedicated endpoint called to initialize database.");
        await setupDatabase();
        return response.status(200).json({ success: true, message: "Database setup complete." });
    } catch (error) {
        console.error("Manual database setup via dedicated endpoint failed:", error);
        return response.status(500).json({ error: "Failed to initialize database.", details: error.message });
    }
}
