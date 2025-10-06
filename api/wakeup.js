
import { sql } from '@vercel/postgres';

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Query yang sangat ringan ini cukup untuk memaksa koneksi ke database,
        // yang akan membangunkannya dari mode tidur (cold start).
        await sql`SELECT 1;`;
        console.log("Database wakeup signal received and processed successfully.");
        return response.status(200).json({ status: 'wakeup signal sent' });
    } catch (error) {
        console.error('API Wakeup Error:', error);
        // Bahkan jika ini gagal, kita tidak ingin menghentikan alur login.
        // Kirim status 500 tetapi klien akan melanjutkan.
        return response.status(500).json({ error: 'An internal server error occurred during wakeup', details: error.message });
    }
}
      
