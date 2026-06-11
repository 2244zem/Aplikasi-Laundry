# Production Readiness Checklist

Checklist ini dipakai sebelum aplikasi dipakai customer real. Fokusnya security, session, realtime, dan payment gate.

## 1. RLS Data Access

Expected result utama:

- USER hanya bisa membaca `tabel_order` miliknya sendiri.
- USER hanya bisa insert order dengan `user_id` miliknya sendiri.
- USER hanya bisa baca/kirim chat untuk order miliknya.
- ADMIN hanya bisa baca/update order dengan `admin_outlet_id` outletnya.
- Staff `OWNER`, `KASIR`, dan `TUKANG_CUCI` hanya bisa akses order/chat outlet induknya.
- Staff outlet tidak aktif tidak boleh melihat order/chat outlet.
- `tabel_payment_event` tetap backend-only. Client tidak perlu policy select/insert karena webhook BFF memakai service role.
- `SUPABASE_SERVICE_ROLE_KEY` hanya ada di backend, tidak pernah di `NEXT_PUBLIC_*`.

Manual test:

1. Login sebagai USER A, buat order ke Outlet A.
2. Login sebagai USER B, buka riwayat. Order USER A tidak boleh muncul.
3. Login sebagai ADMIN Outlet A, order USER A muncul.
4. Login sebagai ADMIN Outlet B, order USER A tidak boleh muncul.
5. Login sebagai staff Outlet A, chat order Outlet A bisa dibaca dan unread bisa berubah terbaca.
6. Login sebagai staff Outlet B, chat/order Outlet A tidak boleh muncul.

## 2. Auth And Session

Expected result:

- Saat session valid, user/admin langsung melihat menu sesuai role.
- ADMIN yang login dari halaman customer diarahkan ke `/admin/dashboard`.
- USER tidak melihat menu admin.
- Logout membersihkan profile/menu lama dan kembali ke beranda.
- Jika session expired, pesan error meminta login ulang, bukan error JWT/database mentah.

Manual test:

1. Login USER, refresh halaman `Riwayat`, `Chat`, dan `Bayar`.
2. Logout, pastikan nav kembali ke customer default.
3. Login ADMIN dari `/orders/payment`, pastikan diarahkan ke dasbor admin.
4. Hapus session browser lalu klik bayar/chat, pastikan muncul pesan login ulang.

## 3. BFF Health And Payment Gate

Endpoint:

```text
GET http://127.0.0.1:8080/health
```

Expected fields:

- `ok=true`
- `midtrans.environment=sandbox|production`
- `midtrans.key_matches_environment=true`
- `redis.status=disabled|ready|offline|connecting`
- `auth.payment_session_required=true`
- `payment_ready=true` untuk mode yang siap dipakai
- `payment_gate.min_amount_idr=1000`
- `payment_gate.blocked_order_statuses` berisi `PENDING_CONFIRMATION` dan `DIBATALKAN`

Manual test:

1. Jalankan BFF.
2. Buka `/health`.
3. Pastikan sandbox memakai `MIDTRANS_IS_PRODUCTION=false` dan `MIDTRANS_KEY_ENV=sandbox`.
4. Matikan Redis jika aktif. BFF harus tetap berjalan dan payment tetap fallback.
5. Ubah key/mode secara sengaja di local env, restart BFF, pastikan warning key mismatch muncul.

## 4. Payment Sandbox End-To-End

Expected result:

- Order `PENDING_CONFIRMATION` ditolak BFF.
- Order `DITERIMA` dengan `total_harga >= 1000` bisa membuat transaksi.
- Payment page hanya mengaktifkan tombol bayar untuk order final.
- Webhook atau sync mengubah status ke `PENDING`, `PAID`, atau `FAILED`.
- Finance hanya menghitung order `PAID`.

Manual test:

1. USER buat order.
2. Halaman Bayar menampilkan `Menunggu konfirmasi admin`.
3. ADMIN isi harga final minimal Rp 1.000 dan ubah status ke `DITERIMA`.
4. USER melihat tombol `Bayar Sekarang` aktif tanpa refresh.
5. USER bayar di Midtrans sandbox.
6. QRIS sandbox dites lewat Midtrans simulator, bukan GoPay asli.
7. Result page menampilkan status terbaru.
8. ADMIN buka Finance, pendapatan berubah hanya setelah `PAID`.

## 5. Realtime Smoke

Expected result:

- Order baru muncul di dashboard admin outlet yang dipilih user.
- Update harga/status admin muncul di dashboard user, riwayat, chat, dan payment tanpa refresh.
- Chat user/admin masuk realtime dan unread badge berkurang setelah dibuka.
- Payment `PENDING/PAID/FAILED` terlihat realtime di user dan admin.

Manual test:

1. Buka USER di browser pertama dan ADMIN di browser kedua.
2. USER buat order ke Outlet A.
3. ADMIN Outlet A finalkan harga dan status.
4. USER tetap di halaman `Bayar` atau `Riwayat`; perubahan harus masuk sendiri.
5. USER kirim chat dan foto kecil.
6. ADMIN buka inbox/chat; pesan dan attachment muncul.
7. ADMIN balas; USER melihat balasan tanpa refresh.

## 6. UI State Check

Expected result:

- Android tidak overlap di `Beranda`, `Order`, `Riwayat`, `Bayar`, `Chat`.
- Loading memakai skeleton atau empty state yang jelas.
- Disabled button menjelaskan penyebabnya: session, BFF, harga belum final, atau admin belum konfirmasi.
- Error RLS/session tampil dalam bahasa operasional.

Manual test:

1. Buka `?isandroid`.
2. Test semua halaman customer.
3. Buka admin dashboard dan chat.
4. Cek tombol disabled, alert warning, dan empty state.
