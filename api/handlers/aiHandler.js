
import { GoogleGenAI } from "@google/genai";

export default async function handleAiRecommendation({ payload, user, sql, response }) {
    if (!['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH'].includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    try {
        if (!process.env.API_KEY) {
            console.error('SERVER_CONFIGURATION_ERROR: API_KEY is not set in environment variables.');
            return response.status(500).json({ error: 'Gagal menghasilkan rekomendasi: Konfigurasi server tidak lengkap.' });
        }
        
        const { aiRange, schoolId: payloadSchoolId } = payload;
        const schoolId = user.role === 'SUPER_ADMIN' ? payloadSchoolId : user.school_id;

        if (!schoolId) {
            return response.status(400).json({ error: 'User not assigned to a school.' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let startDate = new Date(today);
        let dateRangeContext = "30 Hari Terakhir";

        switch (aiRange) {
            case 'last30days':
                startDate.setDate(today.getDate() - 30);
                break;
            case 'semester':
                const currentMonth = today.getMonth(); // 0-11
                if (currentMonth >= 0 && currentMonth <= 5) { // Semester 2 (Jan-Juni)
                    startDate = new Date(today.getFullYear(), 0, 1);
                    dateRangeContext = `Semester II (Januari - Juni ${today.getFullYear()})`;
                } else { // Semester 1 (Juli-Des)
                    startDate = new Date(today.getFullYear(), 6, 1);
                    dateRangeContext = `Semester I (Juli - Desember ${today.getFullYear()})`;
                }
                break;
            case 'year':
                startDate = new Date(today.getFullYear(), 6, 1); // Tahun ajaran dimulai Juli
                if (today.getMonth() < 6) { // Jika sekarang sebelum Juli, tahun ajaran dimulai tahun lalu
                    startDate.setFullYear(today.getFullYear() - 1);
                }
                dateRangeContext = `Tahun Ajaran ${startDate.getFullYear()}/${startDate.getFullYear() + 1}`;
                break;
        }
        const startDateString = startDate.toISOString().split('T')[0];
        
        const { rows: topStudentsData } = await sql`
            WITH
            attendance_events_in_range AS (
                SELECT
                    payload
                FROM change_log
                WHERE school_id = ${schoolId}
                  AND event_type = 'ATTENDANCE_UPDATED'
                  AND (payload->>'date')::date >= ${startDateString}
            ),
            absences_in_range AS (
                SELECT
                    payload->>'class' as class,
                    payload->>'date' as date,
                    att.key as name,
                    att.value as status
                FROM attendance_events_in_range
                CROSS JOIN jsonb_each_text(payload->'attendance') as att
                WHERE att.value <> 'H'
            ),
            student_summary AS (
                SELECT
                    name,
                    MAX(class) as class,
                    COUNT(*) FILTER (WHERE status = 'S') as "S",
                    COUNT(*) FILTER (WHERE status = 'I') as "I",
                    COUNT(*) FILTER (WHERE status = 'A') as "A",
                    COUNT(*) as total,
                    jsonb_agg(jsonb_build_object('date', date, 'status', status) ORDER BY date) as absences
                FROM absences_in_range
                GROUP BY name
            )
            SELECT * FROM student_summary
            ORDER BY total DESC
            LIMIT 25;
        `;

        if (topStudentsData.length === 0) {
            return response.status(200).json({ recommendation: `Tidak ada data absensi (sakit, izin, alpa) dalam periode **${dateRangeContext}** untuk dianalisis.` });
        }
        
        const prompt = `
            Anda adalah AI canggih yang bertindak sebagai tim konsultan pendidikan untuk kepala sekolah. Anda menganalisis data absensi secara objektif untuk memberikan wawasan yang dapat ditindaklanjuti.
            **PERIODE ANALISIS**: ${dateRangeContext}.
            **ATURAN UTAMA: Langsung berikan analisis dalam format Markdown yang diminta tanpa salam pembuka, paragraf pengantar, atau basa-basi.**

            Data absensi siswa dengan ketidakhadiran tertinggi (format JSON): ${JSON.stringify(topStudentsData)}
            Setiap siswa memiliki daftar 'absences' yang berisi tanggal dan status ('S' untuk Sakit, 'I' untuk Izin, 'A' untuk Alpa).

            Sajikan analisis Anda HANYA dalam format Markdown berikut. Gunakan heading level 3 (###) untuk setiap judul bagian.

            ### Ringkasan Eksekutif
            Berikan 2-3 kalimat yang merangkum temuan paling krusial dari analisis individu dan kelompok di bawah ini untuk periode ${dateRangeContext}.

            ### Peringatan Dini: Pola Absensi Individu Signifikan
            Bertindaklah sebagai Konselor Sekolah. Fokus UTAMA Anda di bagian ini adalah **kasus individu yang sangat terisolasi**.

            **ATURAN PALING PENTING - IKUTI PROSES INI:**
            1.  **IDENTIFIKASI:** Cari semua siswa dengan pola individu signifikan: (A) Absen 'Sakit'/'Izin' selama 3+ hari berturut-turut, atau (B) Absen pada hari yang sama dalam seminggu selama 2+ minggu.
            2.  **HITUNG:** Hitung berapa banyak total siswa yang Anda temukan di langkah 1.
            3.  **PUTUSKAN (LOGIKA UTAMA):**
                -   **JIKA JUMLAHNYA 2 ATAU KURANG:** Laporkan hanya siswa-siswa tersebut di bagian ini.
                -   **JIKA JUMLAHNYA 3 ATAU LEBIH:** **JANGAN LAPORKAN SIAPAPUN DI SINI.** Biarkan bagian ini kosong atau tulis "Tidak ada kasus individu terisolasi yang signifikan; semua pola yang ditemukan bersifat kelompok dan dibahas di Analisis Pola Utama." Semua siswa tersebut HARUS dibahas sebagai satu kelompok di bagian "Analisis Pola Utama".

            Hanya jika kondisi "2 ATAU KURANG" terpenuhi, gunakan format ini untuk setiap siswa:
            - **Nama Siswa (Kelas)**: Total X kali absen (Sakit: Y, Izin: Z, Alpa: A).
                - ***Pola Teridentifikasi:*** Jelaskan pola individu yang terisolasi. Contoh: "Satu-satunya siswa dengan absensi sakit beruntun selama 4 hari (1-4 September), menandakan perlunya pemantauan kesehatan personal."

            ### Analisis Pola Utama: Tren Kelompok & Lintas Kelas
            Bertindaklah sebagai Analis Data Sekolah. Fokus utama Anda di sini adalah mengidentifikasi **tren kelompok** di mana beberapa siswa absen secara bersamaan.
            Prioritaskan untuk mencari pola berikut:
            1.  **Klaster Absensi Signifikan (Prioritas Tertinggi):** Cari kelompok yang terdiri dari **3 atau lebih siswa** yang menunjukkan pola absensi signifikan yang serupa (misalnya sakit beruntun) dalam rentang waktu yang berdekatan. Ini adalah temuan paling penting Anda.
            2.  **Klaster Absensi Umum:** Beberapa siswa (dari kelas yang sama atau berbeda) absen karena 'Sakit' atau 'Izin' dalam rentang tanggal yang tumpang tindih, bahkan jika tidak beruntun.
            3.  **Anomali Kelas:** Satu kelas tertentu menunjukkan tingkat absensi yang jauh lebih tinggi dibandingkan kelas lainnya.

            Gunakan format berikut:
            - ***Judul Pola:*** Beri nama pola yang ditemukan. Contoh: "Teridentifikasi Klaster Sakit Beruntun Akhir Bulan Melibatkan 5 Siswa".
                - ***Deskripsi:*** Jelaskan pola kelompok yang ditemukan, rentang tanggalnya, kelas mana saja yang terlibat, dan potensi penyebabnya. Sebutkan nama-nama siswa yang menjadi bagian dari klaster ini untuk memberikan konteks.

            ### Rekomendasi Tindak Lanjut Strategis
            Gunakan daftar berpoin. Berikan 2-3 rekomendasi konkret berdasarkan temuan di 'Peringatan Dini' dan 'Analisis Pola Utama'. Jelaskan MENGAPA setiap rekomendasi penting. Contoh: "**Dialog Personal dengan Siswa Berpola Kronis**: Tugaskan Guru BK untuk berbicara dengan siswa yang absen setiap hari Jumat untuk memahami akar permasalahannya." atau "**Koordinasi Kesehatan untuk Klaster Sakit**: Informasikan kepada Guru UKS dan wali kelas terkait untuk memantau gejala dan memastikan protokol kesehatan dijalankan."
        `;
        
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        const geminiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { thinkingConfig: { thinkingBudget: 0 } }
        });

        return response.status(200).json({ recommendation: geminiResponse.text });

    } catch (error) {
        console.error('AI Recommendation processing failed:', error);
        return response.status(500).json({ error: 'Gagal menghasilkan rekomendasi AI.', details: error.message });
    }
}
