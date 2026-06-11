package archive

import "time"

const (
	SourceOrderEvents  = "order_events"
	SourceChatMessages = "chat_messages"
	SourcePaymentEvents = "payment_events"
	ZeroUUID           = "00000000-0000-0000-0000-000000000000"
)

type Offset struct {
	LastSeenAt time.Time `json:"last_seen_at"`
	LastSeenID string    `json:"last_seen_id"`
	Source     string    `json:"source"`
}

type OrderEvent struct {
	ActorUserID string
	CreatedAt   time.Time
	EventType   string
	ID          string
	Metadata    string
	OrderID     string
}

type ChatMessage struct {
	AttachmentMimeType string
	AttachmentPath     string
	AttachmentURL      string
	CreatedAt          time.Time
	ID                 string
	Message            string
	OrderID            string
	ReceiverUserID     string
	SenderUserID       string
}

type PaymentEvent struct {
	GrossAmountText       string
	ID                    string
	MidtransOrderID       string
	MidtransTransactionID string
	OrderID               string
	Payload               string
	PaymentType           string
	TransactionStatus     string
	UserID                string
	VerifiedAt            time.Time
}

type RunResult struct {
	Archived int       `json:"archived"`
	LastAt   time.Time `json:"last_at,omitempty"`
	LastID   string    `json:"last_id,omitempty"`
	Source   string    `json:"source"`
}

type WorkerStats struct {
	Enabled     bool              `json:"enabled"`
	LastError   string            `json:"last_error,omitempty"`
	LastResults map[string]int    `json:"last_results"`
	LastRunAt   time.Time         `json:"last_run_at,omitempty"`
	Running     bool              `json:"running"`
}

func DefaultOffset(source string) Offset {
	return Offset{
		LastSeenAt: time.Unix(0, 0).UTC(),
		LastSeenID: ZeroUUID,
		Source:     source,
	}
}
