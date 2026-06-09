# Payment Manual Checklist

Checklist ini dipakai sebelum QRIS real dinyalakan. Fokusnya memastikan order flow, Midtrans sandbox, webhook, dan dashboard admin berjalan konsisten.

## Production Readiness

- `MIDTRANS_IS_PRODUCTION=false` untuk sandbox, `true` untuk production.
- Prefix `MIDTRANS_SERVER_KEY` harus cocok:
  - Sandbox: `SB-Mid-server-...`
  - Production: `Mid-server-...`
- `BFF_PUBLIC_BASE_URL` atau `MIDTRANS_WEBHOOK_URL` harus memakai HTTPS sebelum production.
- Webhook production diarahkan ke:
  - `https://domain-kamu/api/v1/payment/midtrans-webhook`
- Cek endpoint BFF:
  - `http://127.0.0.1:8080/health`
- Pastikan response `midtrans.key_matches_environment=true`.
- Pastikan response `midtrans.webhook_https_ready=true` sebelum production.

## Sandbox QRIS Test

QRIS sandbox tidak bisa discan memakai GoPay, OVO, DANA, atau mobile banking asli.

1. Login sebagai user.
2. Buat order.
3. Login sebagai admin outlet yang dipilih.
4. Isi `Berat kg` dan `Total harga` minimal Rp 1.000.
5. Simpan order.
6. Kembali sebagai user, buka `Bayar`.
7. Klik `Bayar Sekarang`.
8. Di halaman Snap Midtrans, pilih QRIS.
9. Salin URL gambar QR dari halaman Snap.
10. Buka `https://simulator.sandbox.midtrans.com/qris/index`.
11. Paste URL gambar QR.
12. Klik scan/pay di simulator.
13. Tunggu webhook mengubah status menjadi `PAID`.
14. Buka `Riwayat` dan `Dashboard Admin` untuk memastikan status realtime berubah.

## Common Sandbox Failure

- `QR not valid` di GoPay asli: normal, karena transaksi masih sandbox.
- `Unsuccessful` di simulator: biasanya URL QR yang ditempel bukan URL gambar QR, order sudah expired, atau amount tidak valid.
- Status tidak berubah realtime: webhook localhost tidak bisa dijangkau Midtrans. Pakai HTTPS tunnel seperti ngrok/cloudflared, lalu isi `MIDTRANS_WEBHOOK_URL`.
- Tombol bayar tidak aktif: admin belum mengisi `total_harga` final minimal Rp 1.000.
- `INVALID_SESSION`: login ulang, karena token Supabase lokal sudah expired/rusak.

## End-to-End Checklist

- User login.
- User buat order dan memilih outlet.
- Admin outlet yang benar menerima order.
- Admin isi harga final.
- User bayar memakai Midtrans sandbox simulator.
- Webhook mengubah pembayaran ke `PAID`, atau `FAILED` jika transaksi gagal.
- User melihat result page setelah kembali dari Midtrans.
- User melihat status realtime di Riwayat.
- Admin melihat badge `UNPAID`, `PENDING`, `PAID`, atau `FAILED`.
- Admin filter `Belum lunas`.
- Admin finance ikut menampilkan pendapatan setelah order paid/selesai sesuai aturan finance yang dipakai.
