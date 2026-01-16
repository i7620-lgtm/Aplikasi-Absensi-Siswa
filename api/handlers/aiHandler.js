
async function getSubJurisdictionIds(jurisdictionId, sql) {
    if (!jurisdictionId) return [];
    const { rows } = await sql`
        WITH RECURSIVE sub_jurisdictions AS (
            SELECT id FROM jurisdictions WHERE id = ${jurisdictionId}
            UNION ALL
            SELECT j.id FROM jurisdictions j JOIN sub_jurisdictions s ON j.parent_id = s.id
        )
        SELECT id FROM sub_jurisdictions;
    `;
    return rows.map(r => r.id);
}

// --- HELPER FUNCTIONS FOR RULES ---

function calculateDateRange(rangeType, selectedDateStr) {
    const referenceDate = selectedDateStr ? new Date(selectedDateStr + 'T00:00:00') : new Date();
    referenceDate.setHours(0, 0, 0, 0);
    
    let startDate = new Date(referenceDate);
    let endDate = new Date(referenceDate); // Default to today/reference
    let label = "";

    const currentYear = referenceDate.getFullYear();
    const currentMonth = referenceDate.getMonth(); // 0-11

    switch (rangeType) {
        case 'last30days':
            startDate.setDate(referenceDate.getDate() - 30);
            label = "30 Hari Terakhir";
            break;
        case 'semester':
            if (currentMonth >= 0 && currentMonth <= 5) { // Semester 2 (Jan-Jun)
                startDate = new Date(currentYear, 0, 1);
                endDate = new Date(currentYear, 5, 30);
                label = `Semester II (${currentYear})`;
            } else { // Semester 1 (Jul-Dec)
                startDate = new Date(currentYear, 6, 1);
                endDate = new Date(currentYear, 11, 31);
                label = `Semester I (${currentYear})`;
            }
            break;
        case 'year':
            if (currentMonth < 6) { // Before July, year starts prev year
                startDate = new Date(currentYear - 1, 6, 1);
                endDate = new Date(currentYear, 5, 30);
                label = `Tahun Pelajaran ${currentYear - 1}/${currentYear}`;
            } else {
                startDate = new Date(currentYear, 6, 1);
                endDate = new Date(currentYear + 1, 5, 30);
                label = `Tahun Pelajaran ${currentYear}/${currentYear + 1}`;
            }
            break;
        default:
            startDate.setDate(referenceDate.getDate() - 30);
            label = "30 Hari Terakhir";
    }

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        rangeLabel: label
    };
}

function getDayDiff(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
}

function getDayOfWeek(dateStr) {
    // 0 = Sunday, 1 = Monday, ... 6 = Saturday
    return new Date(dateStr).getDay();
}

// --- CORE ANALYTICS ENGINE ---

async function handleSchoolAnalysis(schoolId, startDate, endDate, rangeLabel, sql, response) {
    if (!schoolId) {
        return response.status(400).json({ error: 'School ID required.' });
    }

    // 1. Fetch Raw Data
    const { rows: logs } = await sql`
        SELECT payload->>'date' as date, payload->>'class' as class_name, payload->'attendance' as attendance
        FROM change_log
        WHERE school_id = ${schoolId}
        AND event_type = 'ATTENDANCE_UPDATED'
        AND (payload->>'date')::date BETWEEN ${startDate} AND ${endDate}
        ORDER BY (payload->>'date')::date ASC
    `;

    if (logs.length === 0) {
        return response.status(200).json({ recommendation: `### Ringkasan\nTidak ada data absensi yang ditemukan untuk periode **${rangeLabel}**. Silakan lakukan pencatatan absensi terlebih dahulu.` });
    }

    // 2. Process Data Structure
    const students = {}; // { Name: { class, S:[], I:[], A:[], H:[], total:0 } }
    const classes = {}; // { ClassName: { totalStudents: 0, totalAtt: 0, S:0, I:0, A:0, dailySick: {date: count} } }

    logs.forEach(log => {
        const date = log.date;
        const className = log.class_name;
        const att = log.attendance || {};

        if (!classes[className]) {
            classes[className] = { 
                name: className, 
                totalStudents: 0, // Approximate from max attendance
                totalEntries: 0,
                S: 0, I: 0, A: 0, H: 0,
                dailySick: {} 
            };
        }

        let dailySickCount = 0;
        let dailyStudentCount = 0;

        Object.entries(att).forEach(([name, status]) => {
            dailyStudentCount++;
            
            // Student Level
            if (!students[name]) {
                students[name] = { name, class: className, S: [], I: [], A: [], H: 0, total: 0 };
            }
            students[name].total++;
            if (status === 'H') students[name].H++;
            else if (['S', 'I', 'A'].includes(status)) {
                students[name][status].push(date);
            }

            // Class Level
            if (status === 'S') {
                classes[className].S++;
                dailySickCount++;
            } else if (status === 'I') classes[className].I++;
            else if (status === 'A') classes[className].A++;
            else if (status === 'H') classes[className].H++;
            classes[className].totalEntries++;
        });

        // Track max students seen in a class to estimate class size
        if (dailyStudentCount > classes[className].totalStudents) {
            classes[className].totalStudents = dailyStudentCount;
        }

        // Track temporal sick data for outbreak detection
        classes[className].dailySick[date] = dailySickCount;
    });

    // 3. Apply Rules
    const warnings = []; // { type: 'STUDENT'|'CLASS', priority: 'HIGH'|'MED', msg: '' }
    
    // -- R2: Performance Indicator --
    const totalEntriesAll = Object.values(classes).reduce((sum, c) => sum + c.totalEntries, 0);
    const totalPresentAll = Object.values(classes).reduce((sum, c) => sum + c.H, 0);
    const presenceRate = totalEntriesAll > 0 ? (totalPresentAll / totalEntriesAll) * 100 : 0;
    
    let summaryStatus = "";
    if (presenceRate > 95) summaryStatus = "Sangat Baik (Hijau)";
    else if (presenceRate >= 85) summaryStatus = "Waspada (Kuning)";
    else summaryStatus = "Kritis (Merah)";

    // -- Student Rules --
    Object.values(students).forEach(s => {
        // A1: Alpa Berulang (>= 3 times)
        if (s.A.length >= 3) {
            warnings.push({
                type: 'STUDENT', priority: 'HIGH',
                text: `**${s.name} (${s.class})**: Status **Alpa Berulang** (${s.A.length} kali). Wali kelas disarankan menghubungi orang tua.`
            });
        }

        // A2: Pola Weekend (Mon/Fri Alpa >= 3)
        const weekendAlpas = s.A.filter(d => {
            const day = getDayOfWeek(d);
            return day === 1 || day === 5; // Mon or Fri
        });
        if (weekendAlpas.length >= 3) {
            warnings.push({
                type: 'STUDENT', priority: 'MED',
                text: `**${s.name} (${s.class})**: Status **Pola Weekend Panjang** (Alpa pada Senin/Jumat ${weekendAlpas.length} kali). Indikasi memperpanjang libur.`
            });
        }

        // A3: Alpa Hari Tertentu (3 consecutive specific days)
        if (s.A.length >= 3) {
            const daysMap = {};
            s.A.forEach(d => {
                const day = getDayOfWeek(d);
                if (!daysMap[day]) daysMap[day] = [];
                daysMap[day].push(d);
            });
            
            for (const [day, dates] of Object.entries(daysMap)) {
                if (dates.length >= 3) {
                    // Check consecutiveness (roughly 7 days gap)
                    dates.sort();
                    let consec = 1;
                    for (let i = 1; i < dates.length; i++) {
                        const diff = getDayDiff(dates[i-1], dates[i]);
                        if (diff >= 6 && diff <= 8) consec++; // Allow 1 day variance for shifting calendars
                        else consec = 1;
                        
                        if (consec >= 3) {
                            const dayName = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][day];
                            warnings.push({
                                type: 'STUDENT', priority: 'MED',
                                text: `**${s.name} (${s.class})**: Status **Alpa Hari Tertentu** (3x berturut-turut hari ${dayName}). Cek jadwal pelajaran hari tersebut.`
                            });
                            break;
                        }
                    }
                }
            }
        }

        // A4: Sakit Beruntun (>= 3 consecutive days)
        if (s.S.length >= 3) {
            s.S.sort();
            let consec = 1;
            for (let i = 1; i < s.S.length; i++) {
                const diff = getDayDiff(s.S[i-1], s.S[i]);
                if (diff <= 3) consec++; // Allow weekend gap (Fri->Mon is 3 days)
                else consec = 1;

                if (consec === 3) { // Trigger once per sequence
                    warnings.push({
                        type: 'STUDENT', priority: 'MED',
                        text: `**${s.name} (${s.class})**: Status **Pemulihan Medis** (Sakit ≥ 3 hari beruntun). Disarankan Home Visit/konfirmasi medis.`
                    });
                    break;
                }
            }
        }

        // A6: Izin Berlebihan (> 5 times)
        if (s.I.length > 5) {
            warnings.push({
                type: 'STUDENT', priority: 'LOW',
                text: `**${s.name} (${s.class})**: Status **Frekuensi Izin Tinggi** (${s.I.length} kali). Evaluasi alasan izin.`
            });
        }
    });

    // -- Class Rules --
    Object.values(classes).forEach(c => {
        // A5: Outbreak (Increase > 15% of total students in 3 days)
        const dates = Object.keys(c.dailySick).sort();
        if (dates.length >= 3) {
            const threshold = c.totalStudents * 0.15;
            for (let i = 0; i < dates.length - 2; i++) {
                // Simple trend: Check if day i+2 is significantly higher than day i
                // and exceeds threshold
                const sickStart = c.dailySick[dates[i]];
                const sickEnd = c.dailySick[dates[i+2]];
                if (sickEnd > sickStart && (sickEnd - sickStart) > threshold) {
                    warnings.push({
                        type: 'CLASS', priority: 'HIGH',
                        text: `**Kelas ${c.name}**: Status **Waspada Penularan**. Lonjakan siswa sakit >15% dalam 3 hari. Koordinasi dengan UKS.`
                    });
                    break; 
                }
            }
        }

        // A7: Anomali Izin Kelas (> 15% of total entries)
        if (c.totalEntries > 0) {
            const izinRate = c.I / c.totalEntries;
            if (izinRate > 0.15) {
                warnings.push({
                    type: 'CLASS', priority: 'MED',
                    text: `**Kelas ${c.name}**: Status **Anomali Izin Kelas** (Tingkat Izin ${(izinRate*100).toFixed(1)}%). Evaluasi administrasi izin.`
                });
            }
        }
    });

    // 4. Generate Markdown Response
    
    // Sort Top Absences (R3 Triase)
    const sortedByS = Object.values(students).sort((a,b) => b.S.length - a.S.length).slice(0,5).filter(s=>s.S.length>0).map(s=>`${s.name} (${s.S.length})`);
    const sortedByI = Object.values(students).sort((a,b) => b.I.length - a.I.length).slice(0,5).filter(s=>s.I.length>0).map(s=>`${s.name} (${s.I.length})`);
    const sortedByA = Object.values(students).sort((a,b) => b.A.length - a.A.length).slice(0,5).filter(s=>s.A.length>0).map(s=>`${s.name} (${s.A.length})`);

    const topListText = `
**Top Ketidakhadiran (S/I/A):**
*   **Sakit:** ${sortedByS.length ? sortedByS.join(', ') : '-'}
*   **Izin:** ${sortedByI.length ? sortedByI.join(', ') : '-'}
*   **Alpa:** ${sortedByA.length ? sortedByA.join(', ') : '-'}`;

    const warningText = warnings.length > 0 
        ? warnings.map(w => `- ${w.text}`).join('\n') 
        : "Tidak ditemukan pola risiko signifikan pada periode ini.";

    // Separate recommendations not really needed as they are embedded in warnings, 
    // but we can add general ones if warnings exist.
    let recommendationText = "- Lakukan pemantauan rutin pada siswa yang terdaftar di atas.";
    if (warnings.some(w => w.text.includes("Waspada Penularan"))) {
        recommendationText += "\n- **Prioritas:** Sterilisasi kelas yang terindikasi penularan.";
    }

    const markdown = `### Ringkasan
Tingkat kehadiran sekolah pada periode **${rangeLabel}** adalah **${presenceRate.toFixed(1)}%**. Status performa: **${summaryStatus}**.
${topListText}

### Peringatan Dini & Analisis Pola
Berikut adalah deteksi otomatis berdasarkan aturan perilaku siswa dan kelas:

${warningText}

### Rekomendasi Tindak Lanjut
${recommendationText}
    `;

    return response.status(200).json({ recommendation: markdown });
}

async function handleRegionalAnalysis(jurisdictionId, startDate, endDate, rangeLabel, sql, response) {
    const jurisdictionIdsInScope = await getSubJurisdictionIds(jurisdictionId, sql);
    
    // 1. Fetch Aggregated Data
    const { rows: stats } = await sql`
        SELECT 
            s.name as school_name,
            COUNT(cl.id) FILTER (WHERE cl.event_type = 'ATTENDANCE_UPDATED') as total_logs,
            SUM((value = 'S')::int) as count_s,
            SUM((value = 'I')::int) as count_i,
            SUM((value = 'A')::int) as count_a,
            SUM((value = 'H')::int) as count_h
        FROM schools s
        LEFT JOIN change_log cl ON s.id = cl.school_id
        LEFT JOIN jsonb_each_text(cl.payload->'attendance') ON true
        WHERE s.jurisdiction_id = ANY(${jurisdictionIdsInScope})
        AND (cl.payload->>'date')::date BETWEEN ${startDate} AND ${endDate}
        GROUP BY s.id, s.name
        HAVING COUNT(cl.id) > 0
    `;

    if (stats.length === 0) {
        return response.status(200).json({ recommendation: `### Ringkasan Regional\nTidak ada data absensi yang ditemukan di yurisdiksi ini untuk periode **${rangeLabel}**.` });
    }

    // 2. Analyze
    const schoolReports = [];
    let regionS = 0, regionI = 0, regionA = 0, regionH = 0;

    stats.forEach(sch => {
        const S = parseInt(sch.count_s);
        const I = parseInt(sch.count_i);
        const A = parseInt(sch.count_a);
        const H = parseInt(sch.count_h);
        const total = S + I + A + H;
        
        regionS += S; regionI += I; regionA += A; regionH += H;

        // A7 Equivalent: Anomali Izin Sekolah
        const izinRate = total > 0 ? (I / total) * 100 : 0;
        const alpaRate = total > 0 ? (A / total) * 100 : 0;

        if (izinRate > 15) {
            schoolReports.push(`- **${sch.school_name}**: Status **Tingkat Izin Tinggi** (${izinRate.toFixed(1)}%). Evaluasi manajemen izin.`);
        }
        if (alpaRate > 10) { // Arbitrary threshold for regional alert
             schoolReports.push(`- **${sch.school_name}**: Status **Tingkat Alpa Kritis** (${alpaRate.toFixed(1)}%). Perlu inspeksi kedisiplinan.`);
        }
    });

    const totalRegion = regionS + regionI + regionA + regionH;
    const regionRate = totalRegion > 0 ? (regionH / totalRegion) * 100 : 0;

    // A5 Equivalent (Simple): Top Sick Rate
    const topSickSchool = stats.sort((a,b) => (parseInt(b.count_s)/totalRegion) - (parseInt(a.count_s)/totalRegion))[0];
    if (topSickSchool && parseInt(topSickSchool.count_s) > 20) { // Only if significant
         schoolReports.push(`- **${topSickSchool.school_name}**: Tertinggi dalam absensi Sakit (${topSickSchool.count_s} kasus). Cek kondisi kesehatan lingkungan.`);
    }

    const markdown = `### Ringkasan Regional
Rata-rata kehadiran wilayah pada periode **${rangeLabel}** adalah **${regionRate.toFixed(1)}%**.
Total data yang dianalisis: **${stats.length} Sekolah**.

### Identifikasi Masalah & Manajemen (A5, A6, A7)
Daftar sekolah yang terdeteksi memiliki pola anomali berdasarkan aturan dinas:

${schoolReports.length > 0 ? schoolReports.join('\n') : "- Tidak ada anomali signifikan pada tingkat sekolah."}

### Rekomendasi
- Lakukan inspeksi pada sekolah dengan tingkat Alpa > 10%.
- Koordinasikan dengan sekolah yang memiliki tingkat Izin tinggi untuk standarisasi aturan.
    `;

    return response.status(200).json({ recommendation: markdown });
}

// --- MAIN HANDLER ---

export default async function handleAiRecommendation({ payload, user, sql, response }) {
    const authorizedRoles = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'ADMIN_SEKOLAH', 'DINAS_PENDIDIKAN', 'ADMIN_DINAS_PENDIDIKAN'];
    if (!authorizedRoles.includes(user.role)) {
        return response.status(403).json({ error: 'Forbidden: Access denied' });
    }

    try {
        const { aiRange, schoolId, jurisdictionId, selectedDate } = payload;
        
        // 1. Calculate Time Window (Rule R1)
        const { startDate, endDate, rangeLabel } = calculateDateRange(aiRange, selectedDate);

        // 2. Route Logic
        if (jurisdictionId) {
            return await handleRegionalAnalysis(jurisdictionId, startDate, endDate, rangeLabel, sql, response);
        } else {
            const targetSchoolId = user.role === 'SUPER_ADMIN' ? schoolId : user.school_id;
            return await handleSchoolAnalysis(targetSchoolId, startDate, endDate, rangeLabel, sql, response);
        }

    } catch (error) {
        console.error('Rule-Engine processing failed:', error);
        return response.status(500).json({ error: 'Gagal memproses analisis otomatis.', details: error.message });
    }
}
