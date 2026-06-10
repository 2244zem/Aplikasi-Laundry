# Infrastructure

## Target Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend web | Next.js | Customer app and admin dashboard |
| Realtime database | Supabase Postgres + Realtime | Orders, users, chat, live status updates |
| Operational cache | Redis / Upstash Redis | Payment locks, short-lived status cache, and read-pressure relief |
| Backend-for-Frontend | Node.js Express | Midtrans webhook, server-only updates, privileged writes |
| Finance service | Java Spring Boot | Scheduled monthly outlet finance aggregation |
| Payment gateway | Midtrans Snap/Core/Subscription | Laundry order payments and admin SaaS subscriptions |
| POS printing | Browser print, WebUSB/WebSerial, or Bluetooth bridge | Thermal receipt printing from active admin dashboard |
| Object storage | Supabase Storage | Proof images for laundry condition chat |

## Supabase Project

Project ref:

```text
nlowbwnnzyywftsseamc
```

Supabase URL:

```text
https://nlowbwnnzyywftsseamc.supabase.co
```

## Supabase CLI Initialization

Run these commands from the repository root after installing the Supabase CLI:

```bash
supabase login
supabase init
supabase link --project-ref nlowbwnnzyywftsseamc
```

Apply migrations with:

```bash
supabase db push
```

## Environment Variables

Frontend `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL="https://nlowbwnnzyywftsseamc.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_fLNn9cozUb_p0K9ND-KWyA_BPRucYtJ"
```

Backend `.env`:

```env
PORT="8080"
SUPABASE_URL="https://nlowbwnnzyywftsseamc.supabase.co"
SUPABASE_ANON_KEY="sb_publishable_fLNn9cozUb_p0K9ND-KWyA_BPRucYtJ"
SUPABASE_SERVICE_ROLE_KEY="[YOUR-SUPABASE-SERVICE-ROLE-KEY]"
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.nlowbwnnzyywftsseamc.supabase.co:5432/postgres"
MIDTRANS_SERVER_KEY="[YOUR-MIDTRANS-SERVER-KEY]"
MIDTRANS_KEY_ENV="sandbox"
MIDTRANS_IS_PRODUCTION="false"
REDIS_ENABLED="false"
REDIS_URL=""
CACHE_TTL_SECONDS="30"
```

Finance service `.env`:

```env
SERVER_PORT="8090"
SPRING_DATASOURCE_URL="jdbc:postgresql://db.nlowbwnnzyywftsseamc.supabase.co:5432/postgres"
SPRING_DATASOURCE_USERNAME="postgres"
SPRING_DATASOURCE_PASSWORD="[YOUR-PASSWORD]"
SCALEWASH_FINANCE_ZONE="Asia/Jakarta"
```

Redis production example:

```env
REDIS_ENABLED="true"
REDIS_URL="rediss://default:[UPSTASH-PASSWORD]@[UPSTASH-HOST]:6379"
CACHE_TTL_SECONDS="30"
```

Important security boundary:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` can be used in the browser with Row Level Security policies.
- `SUPABASE_SERVICE_ROLE_KEY` must only exist on the backend. It bypasses Row Level Security and is required for webhook-driven role/subscription changes.
- `MIDTRANS_SERVER_KEY` must only exist on the backend. It is used to verify Midtrans notification authenticity.
- `REDIS_URL` must only exist on backend services. The browser never connects directly to Redis.

## Redis Cache and Locking

Redis is optional in v1. Postgres/Supabase remains the source of truth for all transactional data.

The BFF uses Redis for:

- Short-lived `/health` payment readiness cache.
- Midtrans status cache per `midtrans_order_id`.
- `sync-payment:{orderId}` lock so repeated status checks do not hammer Midtrans.
- `create-payment:{orderId}` lock so double-clicks do not create parallel transactions.
- Cached Midtrans Snap redirect payload for a pending order when available.

Failure behavior:

- If `REDIS_ENABLED=false` or `REDIS_URL` is empty, Redis is reported as `disabled`.
- If Redis is down, BFF reports `redis.status=offline` in `/health`.
- Payment and sync endpoints continue using Supabase and Midtrans directly when Redis is unavailable.

Local Redis options:

```bash
docker run --name ungu-redis -p 6379:6379 redis:7-alpine
```

Then set:

```env
REDIS_ENABLED="true"
REDIS_URL="redis://127.0.0.1:6379"
```

## Cassandra Read Archive Direction

Cassandra is not used as a backup/failover database for Postgres in v1. The transactional tables need relational integrity, RLS, realtime publication, and payment consistency, so Supabase Postgres remains authoritative.

If event volume becomes large, Cassandra can be added later as append-only read storage for:

- `order_events_by_order`
- `chat_messages_by_order_archive`
- `courier_locations_by_order_day`
- `payment_events_by_order`

The future write model should keep Postgres first, then copy events asynchronously from the BFF or a worker into Cassandra. UI reads should stay on Supabase until a Cassandra read model is explicitly introduced.

## Realtime Setup

Supabase Realtime database changes need replication enabled for the relevant tables. The migration adds `tabel_order` and `tabel_chat_message` to the `supabase_realtime` publication when the publication exists.

Admin dashboard flow:

```text
Customer submits order
  -> Supabase inserts tabel_order
  -> Admin dashboard listens for INSERT
  -> Dashboard formats receipt
  -> Browser/POS bridge prints thermal receipt
  -> Admin weighs laundry and updates final price/status
  -> Customer sees live status update
```

## Payment Setup

Midtrans should be used for two payment paths:

| Payment path | Midtrans capability | ScaleWash action |
| --- | --- | --- |
| Customer laundry payment | Snap or Core API | Mark `tabel_order.status_pembayaran` as `PAID` after verified settlement |
| Admin SaaS subscription | Subscription/recurring payment | Upgrade `tabel_user.role` to `ADMIN`, set `status_langganan` to `ACTIVE`, and set subscription expiry |

Webhook URL:

```text
POST /api/v1/payment/midtrans-webhook
```

The backend must verify `signature_key` before trusting notification status. Midtrans documents the signature as a SHA-512 hash built from the transaction identifiers and the confidential server key.

## Thermal Printer Notes

Browser-based auto-printing depends on the admin dashboard being open and the printer already being trusted/configured by the operating system or browser. For production POS reliability, prefer one of these:

- Default OS thermal printer plus browser print window.
- WebUSB/WebSerial after device permission is granted.
- Local POS bridge app that accepts receipt payloads from the web dashboard and sends ESC/POS commands.

## Finance Aggregation Setup

The Spring Boot service in `services-backend/finance-service` connects directly to Supabase Postgres with a private JDBC connection. It should run on a backend host, not in the browser.

Scheduled aggregation runs every day at 23:00 `Asia/Jakarta` and updates `tabel_neraca_bulanan` for the current month. The manual endpoint can backfill a specific period:

```text
POST /api/v1/finance/aggregate?period=2026-06
```

## Storage Setup

The migration creates a public Supabase Storage bucket:

```text
bukti-cucian
```

Files are stored under an order-scoped path:

```text
{order_id}/{sender_id}-{random_uuid}.{extension}
```

The bucket is public for image rendering, while upload/update/delete policies are restricted to order participants.
