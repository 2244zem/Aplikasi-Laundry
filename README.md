# ScaleWash

ScaleWash is a B2B2C laundry SaaS concept: one platform for customers, laundry outlet admins, and a platform superadmin. The current scaffold documents the target architecture and includes starter integration points for Supabase Realtime, Midtrans payments, and POS thermal printing.

## Repository Map

```text
docs/
  design.md
  infrastructure.md
  sdd.md
apps-frontend/
  web-nextjs/
    app/admin/dashboard/page.tsx
    components/AdminOrderRealtimePrint.tsx
    lib/supabaseClient.ts
services-backend/
  bff-service/
    src/server.js
  finance-service/
    src/main/java/com/scalewash/finance
supabase/
  migrations/20260608000000_init_schema.sql
  migrations/20260608020000_finance_and_chat_attachments.sql
```

## Quick Start Notes

1. Configure Supabase using [docs/infrastructure.md](docs/infrastructure.md).
2. Apply the database schema in [supabase/migrations/20260608000000_init_schema.sql](supabase/migrations/20260608000000_init_schema.sql).
3. Use the Next.js sample in `apps-frontend/web-nextjs` as the admin dashboard auto-print entry point.
4. Run the BFF webhook in `services-backend/bff-service` after setting Midtrans and Supabase server-side environment variables.

## Run The Web App

```bash
cd apps-frontend/web-nextjs
npm.cmd install
npm.cmd run dev
```

Open:

- Customer order: http://127.0.0.1:3000/orders/new
- Admin dashboard: http://127.0.0.1:3000/admin/dashboard
- Admin finance: http://127.0.0.1:3000/admin/finance
- Order chat: http://127.0.0.1:3000/orders/[orderId]/chat

New users start as `USER`. To test admin dashboard before Midtrans subscription is connected, update the test user in Supabase Table Editor:

```text
role = ADMIN
status_langganan = ACTIVE
tgl_kadaluwarsa_langganan = a future timestamp
```

After the extra admin intake policy migration is added, push pending migrations with:

```bash
npx.cmd supabase db push --yes
```

## Finance Aggregation

The Spring Boot finance service lives in `services-backend/finance-service`. It reads paid outlet orders and outlet expenses, then writes monthly summaries to `tabel_neraca_bulanan`.

```bash
cd services-backend/finance-service
mvn spring-boot:run
```

Manual aggregation:

```bash
curl -X POST "http://localhost:8090/api/v1/finance/aggregate?period=2026-06"
```

## Chat Attachments

Laundry proof images are stored in the public Supabase Storage bucket `bukti-cucian`. The migration creates storage policies so only order participants can upload/update/delete files inside an order folder.

## Integration References

- Supabase Realtime Postgres changes: https://supabase.com/docs/guides/realtime/postgres-changes
- Midtrans HTTP notifications and signature verification: https://docs.midtrans.com/docs/https-notification-webhooks
- Midtrans Snap/Core/Subscription overview: https://docs.midtrans.com/
