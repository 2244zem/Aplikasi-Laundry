package archive

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}

	return &PostgresStore{pool: pool}, nil
}

func (store *PostgresStore) Close() {
	if store != nil && store.pool != nil {
		store.pool.Close()
	}
}

func (store *PostgresStore) Ping(ctx context.Context) error {
	if store == nil || store.pool == nil {
		return pgx.ErrNoRows
	}
	return store.pool.Ping(ctx)
}

func (store *PostgresStore) FetchOrderEvents(ctx context.Context, offset Offset, limit int) ([]OrderEvent, error) {
	rows, err := store.pool.Query(ctx, `
		select
			id::text,
			order_id::text,
			coalesce(actor_user_id::text, ''),
			event_type,
			coalesce(metadata::text, '{}'),
			created_at
		from public.tabel_order_event
		where (created_at, id) > ($1::timestamptz, $2::uuid)
		order by created_at asc, id asc
		limit $3
	`, offset.LastSeenAt, offset.LastSeenID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := make([]OrderEvent, 0)
	for rows.Next() {
		var event OrderEvent
		if err := rows.Scan(
			&event.ID,
			&event.OrderID,
			&event.ActorUserID,
			&event.EventType,
			&event.Metadata,
			&event.CreatedAt,
		); err != nil {
			return nil, err
		}
		events = append(events, event)
	}

	return events, rows.Err()
}

func (store *PostgresStore) FetchChatMessages(ctx context.Context, offset Offset, limit int) ([]ChatMessage, error) {
	rows, err := store.pool.Query(ctx, `
		select
			id::text,
			order_id::text,
			sender_user_id::text,
			coalesce(receiver_user_id::text, ''),
			coalesce(message, ''),
			coalesce(attachment_url, ''),
			coalesce(attachment_path, ''),
			coalesce(attachment_mime_type, ''),
			created_at
		from public.tabel_chat_message
		where (created_at, id) > ($1::timestamptz, $2::uuid)
		order by created_at asc, id asc
		limit $3
	`, offset.LastSeenAt, offset.LastSeenID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]ChatMessage, 0)
	for rows.Next() {
		var message ChatMessage
		if err := rows.Scan(
			&message.ID,
			&message.OrderID,
			&message.SenderUserID,
			&message.ReceiverUserID,
			&message.Message,
			&message.AttachmentURL,
			&message.AttachmentPath,
			&message.AttachmentMimeType,
			&message.CreatedAt,
		); err != nil {
			return nil, err
		}
		messages = append(messages, message)
	}

	return messages, rows.Err()
}

func (store *PostgresStore) FetchPaymentEvents(ctx context.Context, offset Offset, limit int) ([]PaymentEvent, error) {
	rows, err := store.pool.Query(ctx, `
		select
			id::text,
			coalesce(user_id::text, ''),
			order_id::text,
			coalesce(midtrans_order_id, ''),
			coalesce(midtrans_transaction_id, ''),
			coalesce(transaction_status, ''),
			coalesce(payment_type, ''),
			coalesce(gross_amount::text, ''),
			coalesce(payload::text, '{}'),
			verified_at
		from public.tabel_payment_event
		where order_id is not null
		  and (verified_at, id) > ($1::timestamptz, $2::uuid)
		order by verified_at asc, id asc
		limit $3
	`, offset.LastSeenAt, offset.LastSeenID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := make([]PaymentEvent, 0)
	for rows.Next() {
		var event PaymentEvent
		if err := rows.Scan(
			&event.ID,
			&event.UserID,
			&event.OrderID,
			&event.MidtransOrderID,
			&event.MidtransTransactionID,
			&event.TransactionStatus,
			&event.PaymentType,
			&event.GrossAmountText,
			&event.Payload,
			&event.VerifiedAt,
		); err != nil {
			return nil, err
		}
		events = append(events, event)
	}

	return events, rows.Err()
}
