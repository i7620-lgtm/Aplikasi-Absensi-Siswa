
export default async function handleGetParentData({ user, sql, response }) {
    // Check if the user has been identified as a parent, regardless of their primary role.
    if (!user.isParent) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const parentEmail = user.email;

    try {
        const { rows: parentData } = await sql`
            WITH
            latest_student_lists AS (
                -- Find the most recent student list for each class in each school (snapshot)
                SELECT DISTINCT ON (school_id, payload->>'class')
                    id,
                    school_id,
                    payload->>'class' as class_name,
                    payload->'students' as students
                FROM change_log
                WHERE event_type = 'STUDENT_LIST_UPDATED'
                ORDER BY school_id, payload->>'class', id DESC
            ),
            parent_children AS (
                -- Find the children of the logged-in parent from these LATEST lists only
                SELECT
                    l.school_id,
                    s.name as school_name,
                    l.class_name,
                    (student_obj->>'name') as student_name
                FROM latest_student_lists l
                JOIN schools s ON l.school_id = s.id
                CROSS JOIN jsonb_array_elements(l.students) as student_obj
                WHERE student_obj->>'parentEmail' = ${parentEmail}
            ),
            child_attendance AS (
                -- Get LATEST attendance logs for the schools where the children are enrolled
                -- Fix: Use DISTINCT ON to ensure only the latest update per date is used
                SELECT DISTINCT ON (school_id, payload->>'class', payload->>'date')
                    school_id,
                    payload->>'class' as class_name,
                    payload->>'date' as attendance_date,
                    payload->'attendance' as attendance_data
                FROM change_log
                WHERE event_type = 'ATTENDANCE_UPDATED'
                  AND school_id IN (SELECT school_id FROM parent_children)
                ORDER BY school_id, payload->>'class', payload->>'date', id DESC
            )
            -- Join the children with their attendance data
            SELECT
                pc.school_name,
                pc.class_name,
                pc.student_name,
                COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'date', ca.attendance_date,
                        'status', ca.attendance_data->>pc.student_name
                    ) ORDER BY ca.attendance_date DESC
                ) FILTER (WHERE ca.attendance_data->>pc.student_name IS NOT NULL AND ca.attendance_data->>pc.student_name <> 'H'), '[]'::jsonb) as attendance_history
            FROM parent_children pc
            LEFT JOIN child_attendance ca
                ON pc.school_id = ca.school_id
                AND pc.class_name = ca.class_name
            GROUP BY pc.school_name, pc.class_name, pc.student_name
            ORDER BY pc.school_name, pc.student_name;
        `;

        return response.status(200).json({ parentData });
    } catch (error) {
        console.error("Failed to get parent data:", error);
        return response.status(500).json({ error: "Failed to retrieve child's attendance data." });
    }
}
