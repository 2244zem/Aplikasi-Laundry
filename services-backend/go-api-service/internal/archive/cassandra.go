package archive

import (
	"context"
	"fmt"
	"regexp"
	"time"

	"github.com/gocql/gocql"
)

var keyspacePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*$`)

type CassandraStore struct {
	keyspace string
	session  *gocql.Session
}

func NewCassandraStore(hosts []string, keyspace string) (*CassandraStore, error) {
	if !keyspacePattern.MatchString(keyspace) {
		return nil, fmt.Errorf("invalid cassandra keyspace %q", keyspace)
	}

	baseCluster := gocql.NewCluster(hosts...)
	baseCluster.Timeout = 10 * time.Second
	baseCluster.Consistency = gocql.One

	baseSession, err := baseCluster.CreateSession()
	if err != nil {
		return nil, err
	}

	if err := baseSession.Query(fmt.Sprintf(`
		create keyspace if not exists %s
		with replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
	`, keyspace)).Exec(); err != nil {
		baseSession.Close()
		return nil, err
	}
	baseSession.Close()

	cluster := gocql.NewCluster(hosts...)
	cluster.Keyspace = keyspace
	cluster.Timeout = 10 * time.Second
	cluster.Consistency = gocql.One

	session, err := cluster.CreateSession()
	if err != nil {
		return nil, err
	}

	store := &CassandraStore{keyspace: keyspace, session: session}
	if err := store.EnsureSchema(); err != nil {
		session.Close()
		return nil, err
	}

	return store, nil
}

func (store *CassandraStore) Close() {
	if store != nil && store.session != nil {
		store.session.Close()
	}
}

func (store *CassandraStore) Ping(ctx context.Context) error {
	if store == nil || store.session == nil {
		return fmt.Errorf("cassandra is not configured")
	}

	return store.session.Query("select release_version from system.local").WithContext(ctx).Exec()
}

func (store *CassandraStore) EnsureSchema() error {
	statements := []string{
		`create table if not exists order_events_by_order (
			order_id uuid,
			created_at timestamp,
			event_id uuid,
			actor_user_id uuid,
			event_type text,
			metadata text,
			archived_at timestamp,
			primary key ((order_id), created_at, event_id)
		) with clustering order by (created_at desc, event_id asc)`,
		`create table if not exists chat_messages_by_order_archive (
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
		) with clustering order by (created_at desc, message_id asc)`,
		`create table if not exists payment_events_by_order (
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
		) with clustering order by (verified_at desc, event_id asc)`,
		`create table if not exists archive_offsets (
			source text primary key,
			last_seen_at timestamp,
			last_seen_id uuid,
			updated_at timestamp
		)`,
	}

	for _, statement := range statements {
		if err := store.session.Query(statement).Exec(); err != nil {
			return err
		}
	}

	return nil
}

func (store *CassandraStore) GetOffset(ctx context.Context, source string) (Offset, error) {
	offset := DefaultOffset(source)
	var lastSeenID gocql.UUID

	err := store.session.Query(`
		select last_seen_at, last_seen_id
		from archive_offsets
		where source = ?
	`, source).WithContext(ctx).Scan(&offset.LastSeenAt, &lastSeenID)
	if err == gocql.ErrNotFound {
		return offset, nil
	}
	if err != nil {
		return offset, err
	}

	offset.LastSeenID = lastSeenID.String()
	return offset, nil
}

func (store *CassandraStore) SetOffset(ctx context.Context, offset Offset) error {
	lastSeenID, err := gocql.ParseUUID(offset.LastSeenID)
	if err != nil {
		return err
	}

	return store.session.Query(`
		insert into archive_offsets (source, last_seen_at, last_seen_id, updated_at)
		values (?, ?, ?, ?)
	`, offset.Source, offset.LastSeenAt, lastSeenID, time.Now().UTC()).WithContext(ctx).Exec()
}

func (store *CassandraStore) WriteOrderEvents(ctx context.Context, events []OrderEvent) error {
	for _, event := range events {
		eventID, err := requiredUUID(event.ID)
		if err != nil {
			return err
		}
		orderID, err := requiredUUID(event.OrderID)
		if err != nil {
			return err
		}

		if err := store.session.Query(`
			insert into order_events_by_order (
				order_id, created_at, event_id, actor_user_id, event_type, metadata, archived_at
			) values (?, ?, ?, ?, ?, ?, ?)
		`, orderID, event.CreatedAt, eventID, optionalUUID(event.ActorUserID), event.EventType, event.Metadata, time.Now().UTC()).
			WithContext(ctx).Exec(); err != nil {
			return err
		}
	}
	return nil
}

func (store *CassandraStore) WriteChatMessages(ctx context.Context, messages []ChatMessage) error {
	for _, message := range messages {
		messageID, err := requiredUUID(message.ID)
		if err != nil {
			return err
		}
		orderID, err := requiredUUID(message.OrderID)
		if err != nil {
			return err
		}

		if err := store.session.Query(`
			insert into chat_messages_by_order_archive (
				order_id, created_at, message_id, sender_user_id, receiver_user_id, message,
				attachment_url, attachment_path, attachment_mime_type, archived_at
			) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, orderID, message.CreatedAt, messageID, optionalUUID(message.SenderUserID), optionalUUID(message.ReceiverUserID), message.Message,
			message.AttachmentURL, message.AttachmentPath, message.AttachmentMimeType, time.Now().UTC()).
			WithContext(ctx).Exec(); err != nil {
			return err
		}
	}
	return nil
}

func (store *CassandraStore) WritePaymentEvents(ctx context.Context, events []PaymentEvent) error {
	for _, event := range events {
		eventID, err := requiredUUID(event.ID)
		if err != nil {
			return err
		}
		orderID, err := requiredUUID(event.OrderID)
		if err != nil {
			return err
		}

		if err := store.session.Query(`
			insert into payment_events_by_order (
				order_id, verified_at, event_id, user_id, midtrans_order_id, midtrans_transaction_id,
				transaction_status, payment_type, gross_amount_text, payload, archived_at
			) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, orderID, event.VerifiedAt, eventID, optionalUUID(event.UserID), event.MidtransOrderID, event.MidtransTransactionID,
			event.TransactionStatus, event.PaymentType, event.GrossAmountText, event.Payload, time.Now().UTC()).
			WithContext(ctx).Exec(); err != nil {
			return err
		}
	}
	return nil
}

func requiredUUID(value string) (gocql.UUID, error) {
	return gocql.ParseUUID(value)
}

func optionalUUID(value string) interface{} {
	if value == "" {
		return nil
	}

	parsed, err := gocql.ParseUUID(value)
	if err != nil {
		return nil
	}
	return parsed
}
