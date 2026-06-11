# Payment Manual Checklist

Checklist ini dipakai sebelum QRIS real dinyalakan. Fokusnya memastikan order flow, Midtrans sandbox, webhook, dan dashboard admin berjalan konsisten.

## Production Readiness

- `MIDTRANS_IS_PRODUCTION=false` untuk sandbox, `true` untuk production.
- Ambil key dari dashboard Midtrans sesuai toggle environment:
  - Sandbox: `dashboard.sandbox.midtrans.com` atau toggle `Sandbox`.
  - Production: `dashboard.midtrans.com` atau toggle `Production`.
- Beberapa dashboard sandbox tetap menampilkan key berawalan `Mid-server-...`. Jangan tebak environment hanya dari prefix.
- Isi `MIDTRANS_KEY_ENV=sandbox` atau `MIDTRANS_KEY_ENV=production` supaya BFF bisa memverifikasi key secara tegas.
- `BFF_PUBLIC_BASE_URL` atau `MIDTRANS_WEBHOOK_URL` harus memakai HTTPS sebelum production.
- Webhook production diarahkan ke:
  - `https://domain-kamu/api/v1/payment/midtrans-webhook`
- Cek endpoint BFF:
  - `http://127.0.0.1:8080/health`
- Pastikan response `midtrans.key_matches_environment=true`.
- Pastikan response `midtrans.key_environment_verified=true`.
- Pastikan response `midtrans.webhook_https_ready=true` sebelum production.

Contoh sandbox lokal:

```env
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_KEY_ENV=sandbox
MIDTRANS_SERVER_KEY=<server-key-dari-dashboard-sandbox>
```

Contoh production:

```env
MIDTRANS_IS_PRODUCTION=true
MIDTRANS_KEY_ENV=production
MIDTRANS_SERVER_KEY=<server-key-dari-dashboard-production>
MIDTRANS_WEBHOOK_URL=https://domain-kamu/api/v1/payment/midtrans-webhook
```

## Sandbox QRIS Test

QRIS sandbox tidak bisa discan memakai GoPay, OVO, DANA, atau mobile banking asli.

1. Login sebagai user.
2. Buat order.
3. Buka halaman `Bayar` sebagai user dan pastikan order tampil sebagai `Menunggu konfirmasi admin`; tombol bayar belum aktif.
4. Login sebagai admin outlet yang dipilih.
5. Isi `Berat kg` dan `Total harga` minimal Rp 1.000.
6. Ubah status order dari `PENDING` ke `DITERIMA`, lalu simpan.
7. Kembali sebagai user, buka `Bayar`.
8. Pastikan order berubah realtime menjadi siap dibayar.
9. Klik `Bayar Sekarang`.
10. Di halaman Snap Midtrans, pilih QRIS.
11. Salin URL gambar QR dari halaman Snap.
12. Buka `https://simulator.sandbox.midtrans.com/qris/index`.
13. Paste URL gambar QR.
14. Klik scan/pay di simulator.
15. Tunggu webhook mengubah status menjadi `PAID`.
16. Buka `Riwayat`, `Dashboard Admin`, dan `Finance` untuk memastikan status/pendapatan realtime berubah.

## Common Sandbox Failure

- `QR not valid` di GoPay asli: normal, karena transaksi masih sandbox.
- `Unsuccessful` di simulator: biasanya URL QR yang ditempel bukan URL gambar QR, order sudah expired, atau amount tidak valid.
- Status tidak berubah realtime: webhook localhost tidak bisa dijangkau Midtrans. Pakai HTTPS tunnel seperti ngrok/cloudflared, lalu isi `MIDTRANS_WEBHOOK_URL`.
- Tombol bayar tidak aktif: admin belum mengisi `total_harga` final minimal Rp 1.000.
- Tombol bayar tetap tidak aktif walau ada estimasi harga: normal jika order masih `PENDING_CONFIRMATION`; admin harus mengubah status minimal ke `DITERIMA`.
- `INVALID_SESSION`: login ulang, karena token Supabase lokal sudah expired/rusak.

## End-to-End Checklist

- User login.
- User buat order dan memilih outlet.
- User melihat order baru sebagai `Menunggu konfirmasi admin`.
- Admin outlet yang benar menerima order.
- Admin isi harga final dan mengubah status minimal ke `DITERIMA`.
- User melihat tombol bayar aktif tanpa refresh.
- User bayar memakai Midtrans sandbox simulator.
- Webhook mengubah pembayaran ke `PAID`, atau `FAILED` jika transaksi gagal.
- User melihat result page setelah kembali dari Midtrans.
- User melihat status realtime di Riwayat.
- Admin melihat badge `UNPAID`, `PENDING`, `PAID`, atau `FAILED`.
- Admin filter `Menunggu konfirmasi`, `UNPAID`, `PENDING`, `PAID`, atau `FAILED`.
- Admin filter `Belum lunas`.
- Admin finance hanya menampilkan pendapatan dari order `PAID`.
