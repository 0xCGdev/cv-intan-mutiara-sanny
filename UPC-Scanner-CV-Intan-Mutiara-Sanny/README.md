# UPC Scanner — CV Intan Mutiara Sanny

Web scanner UPC dengan:
- Scanner Bluetooth/USB HID keyboard
- Kamera HP untuk barcode 1D (UPC/EAN) memakai Quagga2
- Login ADMIN/PETUGAS
- Google Apps Script + Google Sheets sebagai backend
- Rekap harian otomatis
- Log scan
- Master Data
- Manajemen petugas

## Struktur

- `index.html` — halaman utama
- `css/style.css` — seluruh tampilan
- `js/` — modul frontend
- `api/api.php` — proxy PHP ke Google Apps Script
- `backend/Code.gs` — source backend Google Apps Script

## Backend

Setelah mengganti `backend/Code.gs` di project Apps Script:
1. Deploy sebagai Web App.
2. Execute as: Me.
3. Access: Anyone.
4. Jalankan `setup()` sekali dari editor Apps Script.
5. Pastikan sheet `USERS`, `MASTER_DATA`, dan `LOG_SCAN` tersedia.

Login awal dibuat oleh `setup()`:
- Username: `admin`
- Password: `admin123`

Segera ubah password setelah login.
