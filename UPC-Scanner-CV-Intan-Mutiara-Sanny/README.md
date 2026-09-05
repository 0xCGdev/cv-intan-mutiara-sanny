# UPC Scanner — Mobile First v3

## Struktur
- `index.html` — HTML/tampilan
- `css/style.css` — CSS
- `js/state.js` — state & helper DOM
- `js/api.js` — komunikasi ke API proxy
- `js/auth.js` — login/logout/session
- `js/scanner.js` — scanner keyboard + kamera
- `js/dashboard.js` — ringkasan & daftar scan
- `js/master.js` — Master Data
- `js/users.js` — Petugas
- `js/logs.js` — Log Scan
- `api/api.php` — proxy hosting ke Apps Script
- `backend/Code.gs` — backend Google Apps Script

## Urutan pemasangan
1. Di Google Apps Script, buka project backend yang terhubung ke Google Sheet.
2. Hapus kode lama dan isi dengan `backend/Code.gs`.
3. Jalankan `setup()` satu kali dan izinkan akses.
4. Deploy > New deployment > Web app.
5. Execute as: Me.
6. Who has access: Anyone.
7. Salin URL `/exec` hasil deployment.
8. Buka `api/api.php` dan ganti `PASTE_APPS_SCRIPT_WEB_APP_URL_HERE` dengan URL tersebut.
9. Upload seluruh isi folder ini ke hosting dengan struktur folder tetap.
10. Pastikan hosting mendukung PHP + cURL.
11. Buka website. Login awal: `admin` / `admin123`.

## Penting
- Jangan membuka `index.html` langsung dari komputer dengan double-click. Upload ke hosting/HTTPS.
- Kamera membutuhkan HTTPS.
- Jika login gagal, buka browser DevTools > Network dan cek request `api/api.php`. Pesan error di halaman sekarang dibuat lebih spesifik.
- Jangan mengubah `PASSWORD_HASH` secara manual. Password dibuat oleh backend.


## Arsitektur koneksi terbaru
Frontend HTML/JS tetap di-host di hosting. Browser memanggil `api/api.php`, kemudian PHP meneruskan request ke Google Apps Script Web App untuk menghindari masalah CORS.

- `index.html`, `css/`, `js/` = frontend.
- `api/api.php` = proxy PHP ke Apps Script.
- `backend/Code.gs` = backend Apps Script + Google Sheets.
- Hosting PHP harus mendukung cURL.
