import { GoogleGenAI } from "@google/genai";

export default async function handleAiRecommendation({ payload, user, sql, response }) {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'KEPALA_SEKOLAH' && user.role !== 'ADMIN_SEKOLAH') {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    try {
        if (!process.env.API_KEY) {
            console.error('SERVER_CONFIGURATION_ERROR: API_KEY is not set in environment variables.');
            return response.status(500).json({ error: 'Gagal menghasilkan rekomendasi: Konfigurasi server tidak lengkap.', details: 'Kunci API untuk layanan AI tidak ditemukan di lingkungan server.' });
        }
        
        const { aiRange } = payload;
        const schoolId = user.school_id;

        if (!schoolId) {
            return response.status(400).json({ error: 'User is not assigned to a school.' });
        }

        // --- START: Server-side data processing with dynamic date ranges ---
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
        startDate.setHours(0, 0, 0, 0);

        const { rows } = await sql`
            SELECT saved_logs FROM absensi_data WHERE school_id = ${schoolId};
        `;
        
        const allLogs = rows.flatMap(row => row.saved_logs || []);

        const studentSummary = {};

        allLogs.forEach(log => {
            const logDate = new Date(log.date + 'T00:00:00');
            if (logDate >= startDate) {
                Object.entries(log.attendance).forEach(([studentName, status]) => {
                    if (status !== 'H') {
                        if (!studentSummary[studentName]) {
                            studentSummary[studentName] = { name: studentName, class: log.class, S: 0, I: 0, A: 0, total: 0, absences: [] };
                        }
                        if (studentSummary[studentName][status] !== undefined) {
                            studentSummary[studentName][status]++;
                            studentSummary[studentName].total++;
                            studentSummary[studentName].absences.push({ date: log.date, status: status });
                        }
                    }
                });
            }
        });
        
        const topStudentsData = Object.values(studentSummary)
            .sort((a, b) => b.total - a.total)
            .slice(0, 25) // Increased limit for better analysis
            .map(({ name, class: className, S, I, A, total, absences }) => ({ name, class: className, S, I, A, total, absences }));

        if (topStudentsData.length === 0) {
            return response.status(200).json({ success: true, recommendation: `Tidak ada data absensi (sakit, izin, alpa) dalam periode **${dateRangeContext}** untuk dianalisis.` });
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

        const recommendation = geminiResponse.text;
        return response.status(200).json({ success: true, recommendation });

    } catch (error) {
        console.error('AI Recommendation processing failed:', error);
        return response.status(500).json({ error: 'Gagal menghasilkan rekomendasi AI.', details: error.message });
    }
}
