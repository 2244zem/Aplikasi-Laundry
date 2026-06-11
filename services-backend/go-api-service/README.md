# Ungu Laundry Go API Service

Backend operasional tambahan untuk health check dan Cassandra archive worker.

## Responsibilities

- Menyediakan `GET /health` untuk status Postgres, Cassandra, dan archive worker.
- Mengarsipkan data append-only dari Supabase Postgres ke Cassandra:
  - `tabel_order_event`
  - `tabel_chat_message`
  - `tabel_payment_event` yang punya `order_id`
- Menyediakan `POST /api/v1/archive/replay` untuk replay/backfill manual.

Node BFF tetap menangani Midtrans payment sampai service Go punya parity penuh.

## Run

Install Go 1.22+ terlebih dahulu, lalu:

```bash
cp .env.example .env
go mod tidy
go run ./cmd/api
```

Health:

```bash
curl http://127.0.0.1:8082/health
```

Replay archive:

```bash
curl -X POST "http://127.0.0.1:8082/api/v1/archive/replay?reset=false" \
  -H "X-Internal-Token: [CHANGE-ME]"
```

Gunakan `reset=true` hanya untuk backfill dari awal. Cassandra table memakai primary key idempotent, jadi replay ulang aman.
