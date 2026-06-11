# Software Design Document: ScaleWash SaaS B2B2C

## 1. Purpose

ScaleWash is designed as a national laundry aggregator platform. Customers can place laundry orders, laundry owners can subscribe as outlet admins, and the platform can monetize admin access through a monthly SaaS subscription.

The system combines:

- Supabase Postgres for persistent data.
- Supabase Realtime for live order status, chat, and admin dashboard events.
- Midtrans for customer transactions and admin subscriptions.
- POS thermal printing for automatic order receipts.

## 2. Roles

| Role | Description | Key permissions |
| --- | --- | --- |
| `USER` | Laundry customer | Create orders, pay invoices, chat with assigned outlet, track progress |
| `ADMIN` | Laundry outlet owner/operator | Receive orders, print receipts, input weight/final price, update status |
| `SUPERADMIN` | ScaleWash platform operator | Manage outlets, view operational metrics, support payment/subscription issues |

Admin access is subscription-gated. When an admin subscription is active, the user role is `ADMIN` and `status_langganan` is `ACTIVE`. When the subscription expires, is canceled, or fails renewal, the backend downgrades the account to `USER`.

## 3. System Context

```text
Customer Web/App
  -> Supabase Auth
  -> Supabase Postgres
  -> Midtrans Snap/Core checkout

Admin Dashboard
  -> Supabase Realtime order listener
  -> Thermal printer flow
  -> Supabase status updates

BFF Service
  -> Midtrans webhook verification
  -> Supabase privileged subscription/payment updates
```

## 4. Core Order Workflow

1. Customer fills the laundry order form with estimated item count, address, selected package, pickup notes, and preferred outlet when available.
2. Frontend inserts a row into `tabel_order` with `status_order = 'PENDING_CONFIRMATION'` and `status_pembayaran = 'UNPAID'`.
3. Active admin dashboard listens to Supabase Realtime `INSERT` events on `tabel_order`.
4. When an order arrives, the dashboard generates a receipt and triggers the thermal printer.
5. Admin reviews the order, confirms it by changing status from `PENDING_CONFIRMATION` to at least `DITERIMA`, and finalizes `berat_kg` / `total_harga`.
6. Customer can only start laundry payment after the order is confirmed by admin and `total_harga >= 1000`.
7. Customer sees status changes in real time: `PENDING_CONFIRMATION -> DITERIMA -> DICUCI -> DISETRIKA -> SELESAI`.
8. Chat messages between customer and admin use Supabase Realtime Broadcast or database-backed realtime messages.

## 5. Payment Workflow

### Customer Laundry Payment

1. Customer starts checkout through Midtrans Snap or Core API after admin confirmation.
2. Midtrans processes QRIS, GoPay, ShopeePay, bank transfer, or supported channels.
3. Midtrans sends HTTP notification to the BFF webhook.
4. BFF verifies `signature_key`.
5. On settlement/capture, BFF updates the related order to `status_pembayaran = 'PAID'`.

### Admin SaaS Subscription

1. User chooses admin subscription package at IDR 500,000/month.
2. Backend creates a Midtrans subscription/recurring payment or initializes a Snap/Core subscription flow.
3. Midtrans sends payment notification to the BFF.
4. BFF verifies the notification.
5. On successful payment, BFF updates:

```text
tabel_user.role = 'ADMIN'
tabel_user.status_langganan = 'ACTIVE'
tabel_user.tgl_kadaluwarsa_langganan = now + 30 days
```

6. On cancel, expire, deny, or failed renewal, BFF updates:

```text
tabel_user.role = 'USER'
tabel_user.status_langganan = 'INACTIVE'
```

## 6. Data Model

### `tabel_user`

Stores application users and subscription-derived role state.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `auth_user_id` | UUID | Optional link to Supabase Auth user |
| `nama` | VARCHAR(100) | Display name |
| `email` | VARCHAR(100) | Unique email |
| `role` | VARCHAR(20) | `USER`, `ADMIN`, or `SUPERADMIN` |
| `status_langganan` | VARCHAR(20) | `ACTIVE` or `INACTIVE` |
| `tgl_kadaluwarsa_langganan` | TIMESTAMPTZ | Subscription expiry |

### `tabel_order`

Stores customer laundry transactions.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `user_id` | UUID | Customer |
| `admin_outlet_id` | UUID | Assigned outlet admin |
| `format_detail` | JSONB | Estimated items, address, package, notes |
| `berat_kg` | DECIMAL(5,2) | Final weight entered by admin |
| `total_harga` | DECIMAL(12,2) | Final price entered by admin |
| `status_order` | VARCHAR(30) | Workflow status |
| `status_pembayaran` | VARCHAR(20) | Payment status |
| `midtrans_order_id` | VARCHAR(100) | Payment/order correlation ID |

### Supporting Tables

| Table | Purpose |
| --- | --- |
| `tabel_subscription` | Tracks Midtrans subscription IDs, amount, and billing period |
| `tabel_payment_event` | Stores verified Midtrans notifications for audit/debugging |
| `tabel_chat_message` | Stores user-admin messages when database-backed chat is preferred |
| `tabel_pengeluaran` | Stores outlet operational expenses entered by admins |
| `tabel_neraca_bulanan` | Stores monthly financial summaries generated by the Java finance service |

## 7. Realtime Design

Realtime subscriptions:

| Channel | Event | Consumer | Action |
| --- | --- | --- | --- |
| `scale-wash:orders` | `INSERT` on `tabel_order` | Admin dashboard | Print receipt and show new order |
| `scale-wash:orders` | `UPDATE` on `tabel_order` | Customer app | Refresh status/progress UI |
| `scale-wash:chat` | `INSERT` on `tabel_chat_message` or broadcast | Customer/admin | Append chat message |

Operational considerations:

- Supabase Realtime database changes must be enabled for tables used by dashboards.
- RLS policies should be strict because browser clients use the anon key.
- Backend webhook updates should use the service-role key, never a browser key.

## 8. Live Chat Attachments

Order participants can exchange text messages and laundry proof images. Images are uploaded to the public Supabase Storage bucket `bukti-cucian`, while the chat row stores the public URL and storage path in `tabel_chat_message`.

Storage paths are scoped by order:

```text
{order_id}/{sender_id}-{random_uuid}.{extension}
```

The bucket is public so images render in the browser, but RLS storage policies restrict upload, update, and delete operations to the customer, assigned outlet admin, or superadmin for that order.

## 9. Thermal Printing Design

The admin dashboard contains a realtime order listener. On a new order:

1. Build a receipt payload with order ID, customer ID, package, pickup notes, and initial status.
2. Render a `58mm` or `80mm` HTML receipt.
3. Trigger print through browser print, WebUSB/WebSerial, Bluetooth bridge, or local POS bridge.
4. Record printer failures in dashboard UI so admins can reprint manually.

Production recommendation:

- Browser print is enough for MVP demos.
- A local POS bridge is recommended for unattended production printing because browser security policies can block fully automatic device access.

## 10. Finance Aggregation

The Java Spring Boot finance service acts as a scheduled aggregation engine. It reads:

- `tabel_order.total_harga` where `status_pembayaran = 'PAID'`
- `tabel_pengeluaran.nominal`

It writes one row per outlet admin and month into `tabel_neraca_bulanan`:

```text
total_pendapatan_kotor - total_pengeluaran = pendapatan_bersih
```

The scheduled job runs daily at 23:00 `Asia/Jakarta`. A manual API endpoint can recalculate a specific month for testing or backfill.

## 11. Security Requirements

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in the frontend.
- Never expose `MIDTRANS_SERVER_KEY` in the frontend.
- Verify Midtrans `signature_key` before updating payment or subscription state.
- Store all raw payment notifications in `tabel_payment_event` after verification.
- Use Row Level Security for all Supabase tables exposed to browser clients.
- Admin subscription state must be updated by backend webhook or trusted superadmin workflows only.
- Keep direct JDBC credentials for the finance service on a private backend host only.

## 12. Deployment Notes

| Component | Deployment target |
| --- | --- |
| Next.js web | Vercel, Netlify, or containerized Node runtime |
| BFF service | Render, Railway, Fly.io, VPS, or container platform |
| Finance service | JVM-capable backend host, container platform, VPS, or scheduled backend worker |
| Supabase | Hosted Supabase project `nlowbwnnzyywftsseamc` |
| Thermal printer | Admin outlet machine/browser or local POS bridge |

## 13. External Documentation

- Midtrans HTTP notifications: https://docs.midtrans.com/docs/https-notification-webhooks
- Midtrans Snap/Core/Subscription overview: https://docs.midtrans.com/
- Supabase Realtime Postgres changes: https://supabase.com/docs/guides/realtime/postgres-changes
