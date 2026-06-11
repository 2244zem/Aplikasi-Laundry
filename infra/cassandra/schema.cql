create keyspace if not exists ungu_laundry_archive
with replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

use ungu_laundry_archive;

create table if not exists order_events_by_order (
  order_id uuid,
  created_at timestamp,
  event_id uuid,
  actor_user_id uuid,
  event_type text,
  metadata text,
  archived_at timestamp,
  primary key ((order_id), created_at, event_id)
) with clustering order by (created_at desc, event_id asc);

create table if not exists chat_messages_by_order_archive (
  order_id uuid,
  created_at timestamp,
  message_id uuid,
  sender_user_id uuid,
  receiver_user_id uuid,
  message text,
  attachment_url text,
  attachment_path text,
  attachment_mime_type text,
  archived_at timestamp,
  primary key ((order_id), created_at, message_id)
) with clustering order by (created_at desc, message_id asc);

create table if not exists payment_events_by_order (
  order_id uuid,
  verified_at timestamp,
  event_id uuid,
  user_id uuid,
  midtrans_order_id text,
  midtrans_transaction_id text,
  transaction_status text,
  payment_type text,
  gross_amount_text text,
  payload text,
  archived_at timestamp,
  primary key ((order_id), verified_at, event_id)
) with clustering order by (verified_at desc, event_id asc);

create table if not exists archive_offsets (
  source text primary key,
  last_seen_at timestamp,
  last_seen_id uuid,
  updated_at timestamp
);
