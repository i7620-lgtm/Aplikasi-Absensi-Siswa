import { GoogleGenAI } from "@google/genai";

async function getSubJurisdictionIds(jurisdictionId, sql) {
    if (!jurisdictionId) return [];
    const { rows } = await sql`
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

export default async function handleAiRecommendation({ payload, user, sql, response }) {
    const authorizedRoles = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'];
    if (!authorizedRoles.includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    try {
        if (!process.env.API_KEY) {
            console.error('SERVER_CONFIGURATION_ERROR: API_KEY is not set in environment variables.');
            return response.status(500).json({ error: 'Gagal menghasilkan rekomendasi: Konfigurasi server tidak lengkap.' });
        }
        
        const { aiRange, schoolId: payloadSchoolId, jurisdictionId: payloadJurisdictionId, selectedDate } = payload;
        
        // Use the selected date from the dashboard as the reference point, defaulting to today's date
        const referenceDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
        referenceDate.setHours(0, 0, 0, 0);
        const endDateString = referenceDate.toISOString().split('T')[0];

        let startDate = new Date(referenceDate);
        let dateRangeContext = "30 Hari Terakhir";

        switch (aiRange) {
            case 'last30days':
                startDate.setDate(referenceDate.getDate() - 30);
                break;
            case 'semester':
                const currentMonth = referenceDate.getMonth(); // 0-11
                if (currentMonth >= 0 && currentMonth <= 5) { // Semester 2 (Jan-Juni)
                    startDate = new Date(referenceDate.getFullYear(), 0, 1);
                    dateRangeContext = `Semester II (Januari - Juni ${referenceDate.getFullYear()})`;
                } else { // Semester 1 (Juli-Des)
                    startDate = new Date(referenceDate.getFullYear(), 6, 1);
                    dateRangeContext = `Semester I (Juli - Desember ${referenceDate.getFullYear()})`;
                }
                break;
            case 'year':
                startDate = new Date(referenceDate.getFullYear(), 6, 1); // Tahun ajaran dimulai Juli
                if (referenceDate.getMonth() < 6) { // Jika sekarang sebelum Juli, tahun ajaran dimulai tahun lalu
                    startDate.setFullYear(referenceDate.getFullYear() - 1);
                }
                dateRangeContext = `Tahun Ajaran ${startDate.getFullYear()}/${startDate.getFullYear() + 1}`;
                break;
        }
        const startDateString = startDate.toISOString().split('T')[0];
        
        // --- NEW: Logic Branch for Regional vs. School AI ---
        if (payloadJurisdictionId) {
            // --- REGIONAL AI ANALYSIS ---
            const schoolIdsInScope = await getSubJurisdictionIds(payloadJurisdictionId, sql);
            if (schoolIdsInScope.length === 0) {
                 return response.status(200).json({ recommendation: `Tidak ada sekolah yang ditemukan di yurisdiksi ini untuk dianalisis.` });
            }

            const { rows: schoolStats } = await sql`
                WITH SchoolStudentCounts AS (
                    SELECT
                        school_id,
                        SUM(student_count)::int as total_students
                    FROM (
                        SELECT DISTINCT ON (school_id, payload->>'class')
                            school_id,
                            jsonb_array_length(payload->'students') as student_count
                        FROM change_log
                        WHERE school_id = ANY(${schoolIdsInScope}) AND event_type = 'STUDENT_LIST_UPDATED'
                        ORDER BY school_id, payload->>'class', id DESC
                    ) as latest_lists
                    GROUP BY school_id
                ),
                latest_attendance_in_range AS (
                    SELECT DISTINCT ON (cl.school_id, cl.payload->>'class', cl.payload->>'date')
                        cl.school_id,
                        cl.payload->'attendance' as attendance
                    FROM change_log cl
                    WHERE cl.school_id = ANY(${schoolIdsInScope})
                      AND cl.event_type = 'ATTENDANCE_UPDATED'
                      AND (cl.payload->>'date')::date BETWEEN ${startDateString} AND ${endDateString}
                    ORDER BY cl.school_id, cl.payload->>'class', cl.payload->>'date', cl.id DESC
                ),
                SchoolAbsences AS (
                    SELECT
                        lai.school_id,
                        att.value as status
                    FROM latest_attendance_in_range lai, jsonb_each_text(lai.attendance) as att
                    WHERE att.value <> 'H'
                )
                SELECT 
                    s.id as "schoolId",
                    s.name as "schoolName",
                    COALESCE(ssc.total_students, 0)::int as "totalStudents",
                    COALESCE(COUNT(sa.status), 0)::int as "totalAbsences",
                    COALESCE(COUNT(sa.status) FILTER (WHERE sa.status = 'S'), 0)::int as "S",
                    COALESCE(COUNT(sa.status) FILTER (WHERE sa.status = 'I'), 0)::int as "I",
                    COALESCE(COUNT(sa.status) FILTER (WHERE sa.status = 'A'), 0)::int as "A"
                FROM schools s
                LEFT JOIN SchoolStudentCounts ssc ON s.id = ssc.school_id
                LEFT JOIN SchoolAbsences sa ON s.id = sa.school_id
                WHERE s.id = ANY(${schoolIdsInScope})
                GROUP BY s.id, s.name, ssc.total_students
                ORDER BY "totalAbsences" DESC;
            `;

            if (schoolStats.length === 0 || schoolStats.every(s => s.totalAbsences === 0)) {
                return response.status(200).json({ recommendation: `Tidak ada data ketidakhadiran yang tercatat di seluruh wilayah yurisdiksi ini untuk periode **${dateRangeContext}**.` });
            }

            const prompt = `
                Anda adalah AI canggih yang bertindak sebagai analis data untuk kantor dinas pendidikan. Tugas Anda adalah menganalisis data absensi agregat dari beberapa sekolah untuk memberikan wawasan strategis tingkat regional.
                **PERIODE ANALISIS**: ${dateRangeContext}.
                **ATURAN UTAMA: Langsung berikan analisis dalam format Markdown tanpa salam pembuka atau basa-basi.**

                Berikut adalah data absensi agregat per sekolah dalam format JSON: ${JSON.stringify(schoolStats)}
                Setiap sekolah memiliki total siswa, total absensi, dan rinciannya (Sakit, Izin, Alpa).

                Sajikan analisis Anda HANYA dalam format Markdown berikut. Gunakan heading level 3 (###) untuk setiap judul.

                ### Ringkasan Eksekutif Regional
                Berikan 2-3 kalimat yang merangkum kondisi kehadiran secara umum di seluruh yurisdiksi. Sebutkan tingkat absensi rata-rata (jika bisa dihitung) dan soroti temuan paling penting dari analisis di bawah ini.

                ### Sekolah dengan Perhatian Khusus
                Identifikasi 2-3 sekolah yang paling menonjol dari data. Prioritaskan sekolah dengan **tingkat absensi per siswa yang tinggi** (totalAbsences / totalStudents), atau sekolah dengan jumlah absensi 'Alpa' (A) yang sangat tinggi dibandingkan sekolah lain. Ini adalah temuan paling krusial Anda.
                
                Untuk setiap sekolah yang diidentifikasi, gunakan format ini:
                - **Nama Sekolah**: Total Absensi: X (S: Y, I: Z, A: A).
                    - ***Justifikasi:*** Jelaskan secara singkat MENGAPA sekolah ini memerlukan perhatian khusus. Contoh: "Menunjukkan tingkat absensi Alpa tertinggi di wilayah ini, menandakan potensi masalah kedisiplinan atau kesejahteraan siswa yang perlu diselidiki lebih lanjut oleh pengawas sekolah." atau "Memiliki rasio absensi per siswa tertinggi, meskipun bukan sekolah terbesar."

                ### Analisis Pola Lintas Sekolah
                Cari tren atau pola umum yang mungkin terlihat di beberapa sekolah, meskipun tidak seekstrim sekolah yang disorot di atas. Contoh: "Beberapa sekolah menunjukkan peningkatan absensi 'Sakit' yang mungkin menandakan penyebaran penyakit musiman," atau "Secara umum, absensi 'Izin' lebih tinggi daripada 'Sakit' di seluruh wilayah." Jika tidak ada pola yang jelas, sebutkan bahwa data absensi tersebar secara merata.

                ### Rekomendasi Strategis untuk Dinas Pendidikan
                Gunakan daftar berpoin. Berikan 2-3 rekomendasi konkret dan dapat ditindaklanjuti untuk dinas pendidikan atau pengawas sekolah berdasarkan temuan di atas. Fokus pada intervensi tingkat sekolah atau regional.
                Contoh:
                - "**Prioritaskan Kunjungan Pengawas**: Jadwalkan kunjungan ke sekolah-sekolah yang diidentifikasi di 'Perhatian Khusus' untuk berdiskusi dengan kepala sekolah mengenai strategi peningkatan kehadiran."
                - "**Program Kesehatan Regional**: Jika absensi 'Sakit' tinggi di banyak sekolah, pertimbangkan untuk mengeluarkan edaran tentang praktik kesehatan atau mengoordinasikan program penyuluhan kesehatan."
            `;

            const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
            const geminiResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { thinkingConfig: { thinkingBudget: 0 } }
            });

            return response.status(200).json({ recommendation: geminiResponse.text });

        } else {
            // --- SCHOOL-LEVEL AI ANALYSIS (Existing Logic) ---
            const schoolId = user.role === 'SUPER_ADMIN' ? payloadSchoolId : user.school_id;
            if (!schoolId) {
                return response.status(400).json({ error: 'User not assigned to a school.' });
            }
            
            const { rows: topStudentsData } = await sql`
                WITH
                attendance_events_in_range AS (
                    SELECT DISTINCT ON (payload->>'class', payload->>'date')
                        payload
                    FROM change_log
                    WHERE school_id = ${schoolId}
                      AND event_type = 'ATTENDANCE_UPDATED'
                      AND (payload->>'date')::date BETWEEN ${startDateString} AND ${endDateString}
                    ORDER BY payload->>'class', payload->>'date', id DESC
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

                Sajikan analisis Anda HANYA dalam format Markdown berikut. Gunakan heading level 3 (###) untuk setiap judul.

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
        }
        
    } catch (error) {
        console.error('AI Recommendation processing failed:', error);
        return response.status(500).json({ error: 'Gagal menghasilkan rekomendasi AI.', details: error.message });
    }
}
