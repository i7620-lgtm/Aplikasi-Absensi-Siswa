import { promises as fs } from 'fs';
import path from 'path';

export default async function handler(request, response) {
    // Fungsi ini menangani permintaan GET dan POST ke root path (/).
    // Tujuannya adalah untuk selalu menyajikan file index.html utama.
    // Saat Google melakukan redirect kembali dengan POST, menyajikan index.html
    // memungkinkan skrip GSI di sisi klien untuk dimuat dan memproses kredensial login.

    // Hanya izinkan metode GET dan POST.
    if (request.method !== 'GET' && request.method !== 'POST') {
        response.setHeader('Allow', ['GET', 'POST']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    try {
        // Tentukan path ke file index.html di direktori root proyek.
        // Di lingkungan Vercel, direktori kerja saat ini adalah root proyek.
        const indexPath = path.join(process.cwd(), 'index.html');
        
        // Baca konten file index.html.
        const htmlContent = await fs.readFile(indexPath, 'utf-8');

        // Sajikan konten dengan header Content-Type yang benar.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.status(200).send(htmlContent);
    } catch (error) {
        console.error('Gagal menyajikan index.html:', error);
        response.status(500).send('<h1>500 - Internal Server Error</h1><p>Tidak dapat memuat shell aplikasi.</p>');
    }
}
