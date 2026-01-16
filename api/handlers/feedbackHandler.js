
// Simple sanitizer
function sanitize(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '').trim();
}

export async function handleSubmitFeedback({ payload, sql, response }) {
    const { name, email, type, message } = payload;
    
    const sanitizedName = sanitize(name);
    const sanitizedEmail = sanitize(email);
    const sanitizedMessage = sanitize(message);
    const sanitizedType = sanitize(type);

    if (!sanitizedName || !sanitizedEmail || !sanitizedMessage || !sanitizedType) {
        return response.status(400).json({ error: 'Semua kolom wajib diisi.' });
    }

    try {
        await sql`
            INSERT INTO feedback (name, email, type, message)
            VALUES (${sanitizedName}, ${sanitizedEmail}, ${sanitizedType}, ${sanitizedMessage})
        `;
        return response.status(200).json({ success: true, message: 'Pesan Anda berhasil dikirim.' });
    } catch (error) {
        console.error("Failed to submit feedback:", error);
        return response.status(500).json({ error: 'Gagal mengirim pesan. Silakan coba lagi.' });
    }
}

export async function handleGetFeedback({ user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN') {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    try {
        const { rows: feedbackList } = await sql`
            SELECT id, name, email, type, message, created_at
            FROM feedback
            ORDER BY created_at DESC
            LIMIT 100;
        `;
        return response.status(200).json({ feedbackList });
    } catch (error) {
        console.error("Failed to fetch feedback:", error);
        return response.status(500).json({ error: 'Gagal mengambil data pengaduan.' });
    }
}
