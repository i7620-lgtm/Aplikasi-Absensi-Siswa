
// /api/auth-config.js
export default function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            console.error("SERVER_CONFIGURATION_ERROR: GOOGLE_CLIENT_ID is not set in environment variables.");
            // Menggunakan status 503 (Service Unavailable) lebih tepat di sini
            return response.status(503).json({ error: 'Konfigurasi otentikasi server tidak lengkap.' });
        }
        return response.status(200).json({ clientId });
    } catch (error) {
        console.error('Auth Config API Error:', error);
        return response.status(500).json({ error: 'An internal server error occurred', details: error.message });
    }
}
