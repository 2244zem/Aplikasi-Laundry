package archive

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Worker struct {
	archive  *CassandraStore
	batchSize int
	enabled  bool
	interval time.Duration
	postgres *PostgresStore
	stats    WorkerStats
	statsMu  sync.RWMutex
}

func NewWorker(postgres *PostgresStore, archive *CassandraStore, interval time.Duration, batchSize int, enabled bool) *Worker {
	return &Worker{
		archive:   archive,
		batchSize: batchSize,
		enabled:   enabled && postgres != nil && archive != nil,
		interval:  interval,
		postgres:  postgres,
		stats: WorkerStats{
			Enabled:     enabled && postgres != nil && archive != nil,
			LastResults: map[string]int{},
		},
	}
}

func (worker *Worker) Start(ctx context.Context) {
	if worker == nil || !worker.enabled {
		return
	}

	worker.setRunning(true)
	go func() {
		defer worker.setRunning(false)

		worker.runAndRecord(ctx)

		ticker := time.NewTicker(worker.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				worker.runAndRecord(ctx)
			}
		}
	}()
}

func (worker *Worker) Stats() WorkerStats {
	if worker == nil {
		return WorkerStats{Enabled: false, LastResults: map[string]int{}}
	}

	worker.statsMu.RLock()
	defer worker.statsMu.RUnlock()

	results := make(map[string]int, len(worker.stats.LastResults))
	for key, value := range worker.stats.LastResults {
		results[key] = value
	}

	return WorkerStats{
		Enabled:     worker.stats.Enabled,
		LastError:   worker.stats.LastError,
		LastResults: results,
		LastRunAt:   worker.stats.LastRunAt,
		Running:     worker.stats.Running,
	}
}

func (worker *Worker) Replay(ctx context.Context, reset bool) ([]RunResult, error) {
	if worker == nil || worker.postgres == nil || worker.archive == nil {
		return nil, fmt.Errorf("archive worker is not ready")
	}

	allResults := make([]RunResult, 0)
	for _, source := range []string{SourceOrderEvents, SourceChatMessages, SourcePaymentEvents} {
		offset := DefaultOffset(source)
		if !reset {
			currentOffset, err := worker.archive.GetOffset(ctx, source)
			if err != nil {
				return allResults, err
			}
			offset = currentOffset
		}

		for {
			result, nextOffset, err := worker.archiveSource(ctx, source, offset)
			if err != nil {
				return allResults, err
			}

			allResults = append(allResults, result)
			if result.Archived < worker.batchSize {
				break
			}
			offset = nextOffset
		}
	}

	worker.recordResults(allResults, nil)
	return allResults, nil
}

func (worker *Worker) runAndRecord(ctx context.Context) {
	results, err := worker.RunOnce(ctx)
	worker.recordResults(results, err)
}

func (worker *Worker) RunOnce(ctx context.Context) ([]RunResult, error) {
	if worker == nil || worker.postgres == nil || worker.archive == nil {
		return nil, fmt.Errorf("archive worker is not ready")
	}

	results := make([]RunResult, 0, 3)
	for _, source := range []string{SourceOrderEvents, SourceChatMessages, SourcePaymentEvents} {
		offset, err := worker.archive.GetOffset(ctx, source)
		if err != nil {
			return results, err
		}

		result, _, err := worker.archiveSource(ctx, source, offset)
		if err != nil {
			return results, err
		}
		results = append(results, result)
	}

	return results, nil
}

func (worker *Worker) archiveSource(ctx context.Context, source string, offset Offset) (RunResult, Offset, error) {
	result := RunResult{Source: source}
	nextOffset := offset

	switch source {
	case SourceOrderEvents:
		events, err := worker.postgres.FetchOrderEvents(ctx, offset, worker.batchSize)
		if err != nil {
			return result, nextOffset, err
		}
		if err := worker.archive.WriteOrderEvents(ctx, events); err != nil {
			return result, nextOffset, err
		}
		if len(events) > 0 {
			last := events[len(events)-1]
			nextOffset = Offset{Source: source, LastSeenAt: last.CreatedAt, LastSeenID: last.ID}
		}
		result.Archived = len(events)

	case SourceChatMessages:
		messages, err := worker.postgres.FetchChatMessages(ctx, offset, worker.batchSize)
		if err != nil {
			return result, nextOffset, err
		}
		if err := worker.archive.WriteChatMessages(ctx, messages); err != nil {
			return result, nextOffset, err
		}
		if len(messages) > 0 {
			last := messages[len(messages)-1]
			nextOffset = Offset{Source: source, LastSeenAt: last.CreatedAt, LastSeenID: last.ID}
		}
		result.Archived = len(messages)

	case SourcePaymentEvents:
		events, err := worker.postgres.FetchPaymentEvents(ctx, offset, worker.batchSize)
		if err != nil {
			return result, nextOffset, err
		}
		if err := worker.archive.WritePaymentEvents(ctx, events); err != nil {
			return result, nextOffset, err
		}
		if len(events) > 0 {
			last := events[len(events)-1]
			nextOffset = Offset{Source: source, LastSeenAt: last.VerifiedAt, LastSeenID: last.ID}
		}
		result.Archived = len(events)

	default:
		return result, nextOffset, fmt.Errorf("unknown archive source %q", source)
	}

	if result.Archived > 0 {
		if err := worker.archive.SetOffset(ctx, nextOffset); err != nil {
			return result, nextOffset, err
		}
		result.LastAt = nextOffset.LastSeenAt
		result.LastID = nextOffset.LastSeenID
	}

	return result, nextOffset, nil
}

func (worker *Worker) setRunning(running bool) {
	worker.statsMu.Lock()
	defer worker.statsMu.Unlock()
	worker.stats.Running = running
	worker.stats.Enabled = worker.enabled
}

func (worker *Worker) recordResults(results []RunResult, runErr error) {
	worker.statsMu.Lock()
	defer worker.statsMu.Unlock()

	worker.stats.LastRunAt = time.Now().UTC()
	worker.stats.Enabled = worker.enabled
	worker.stats.LastResults = map[string]int{}
	for _, result := range results {
		worker.stats.LastResults[result.Source] += result.Archived
	}

	if runErr != nil {
		worker.stats.LastError = runErr.Error()
		return
	}
	worker.stats.LastError = ""
}
