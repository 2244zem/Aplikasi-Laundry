# ScaleWash Finance Service

Spring Boot aggregation service for outlet finance summaries.

## Responsibilities

- Reads paid order totals from `tabel_order`.
- Reads operational expenses from `tabel_pengeluaran`.
- Upserts monthly balance summaries into `tabel_neraca_bulanan`.
- Runs automatically every day at 23:00 in the configured timezone.
- Provides a manual aggregation endpoint for testing or backfill.

## Environment

```env
SERVER_PORT="8090"
SPRING_DATASOURCE_URL="jdbc:postgresql://db.nlowbwnnzyywftsseamc.supabase.co:5432/postgres"
SPRING_DATASOURCE_USERNAME="postgres"
SPRING_DATASOURCE_PASSWORD="[YOUR-PASSWORD]"
SCALEWASH_FINANCE_ZONE="Asia/Jakarta"
```

Use a private server/runtime for this service. It connects directly to Postgres and should never run in a browser.

## Run

```bash
mvn spring-boot:run
```

Manual aggregation:

```bash
curl -X POST "http://localhost:8090/api/v1/finance/aggregate?period=2026-06"
```
