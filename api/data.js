import { sql } from '@vercel/postgres';

// --- KONFIGURASI ---
// Ganti dengan email akun yang akan dijadikan sebagai admin/kepala sekolah.
const KEPALA_SEKOLAH_EMAIL = 'mc4diaz@gmail.com'; 

export default async function handler(request, response) {
  try {
    // Create table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS absensi_data (
        user_email VARCHAR(255) PRIMARY KEY,
        students_by_class JSONB,
        saved_logs JSONB,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      );
    `;
  } catch (error) {
    return response.status(500).json({ error: 'Database setup failed', details: error.message });
  }

  // Handle GET request to fetch data
  if (request.method === 'GET') {
    try {
      const { email } = request.query;
      if (!email) {
        return response.status(400).json({ error: 'Email query parameter is required' });
      }

      // Jika email adalah email kepala sekolah, ambil semua data
      if (email === KEPALA_SEKOLAH_EMAIL) {
        const { rows } = await sql`SELECT user_email, students_by_class, saved_logs FROM absensi_data;`;
        return response.status(200).json({ isKepalaSekolah: true, allData: rows });
      }
      
      // Logika untuk pengguna biasa
      const { rows } = await sql`SELECT students_by_class, saved_logs FROM absensi_data WHERE user_email = ${email};`;
      
      if (rows.length > 0) {
        return response.status(200).json(rows[0]);
      } else {
        return response.status(200).json({ students_by_class: {}, saved_logs: [] });
      }
    } catch (error) {
      return response.status(500).json({ error: 'Failed to fetch data', details: error.message });
    }
  }

  // Handle POST request to save (upsert) data
  if (request.method === 'POST') {
    try {
      const { email, studentsByClass, savedLogs } = request.body;
      if (!email || studentsByClass === undefined || savedLogs === undefined) {
        return response.status(400).json({ error: 'Missing required fields: email, studentsByClass, savedLogs' });
      }
      
      // Kepala sekolah tidak boleh menyimpan data
      if (email === KEPALA_SEKOLAH_EMAIL) {
          return response.status(403).json({ error: 'Akun Kepala Sekolah bersifat hanya-baca.' });
      }

      const studentsByClassJson = JSON.stringify(studentsByClass);
      const savedLogsJson = JSON.stringify(savedLogs);
      
      await sql`
        INSERT INTO absensi_data (user_email, students_by_class, saved_logs, last_updated)
        VALUES (${email}, ${studentsByClassJson}, ${savedLogsJson}, NOW())
        ON CONFLICT (user_email)
        DO UPDATE SET
          students_by_class = EXCLUDED.students_by_class,
          saved_logs = EXCLUDED.saved_logs,
          last_updated = NOW();
      `;
      
      return response.status(200).json({ success: true, message: 'Data saved successfully' });
    } catch (error) {
      return response.status(500).json({ error: 'Failed to save data', details: error.message });
    }
  }

  // Handle other methods
  return response.status(405).json({ error: 'Method Not Allowed' });
}
