package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/2244zem/aplikasi-laundry/services-backend/go-api-service/internal/archive"
	"github.com/2244zem/aplikasi-laundry/services-backend/go-api-service/internal/config"
)

type Server struct {
	archiveStore *archive.CassandraStore
	config       config.Config
	postgres     *archive.PostgresStore
	startedAt    time.Time
	worker       *archive.Worker
}

func NewServer(cfg config.Config, postgres *archive.PostgresStore, archiveStore *archive.CassandraStore, worker *archive.Worker) *Server {
	return &Server{
		archiveStore: archiveStore,
		config:       cfg,
		postgres:     postgres,
		startedAt:    time.Now().UTC(),
		worker:       worker,
	}
}

func (server *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", server.handleHealth)
	mux.HandleFunc("POST /api/v1/archive/replay", server.handleReplay)
	return withJSONHeaders(mux)
}

func (server *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	postgresStatus := "missing"
	if server.postgres != nil {
		postgresStatus = "ready"
		if err := server.postgres.Ping(ctx); err != nil {
			postgresStatus = "offline"
		}
	}

	cassandraStatus := "disabled"
	if server.config.CassandraEnabled {
		cassandraStatus = "offline"
		if server.archiveStore != nil {
			cassandraStatus = "ready"
			if err := server.archiveStore.Ping(ctx); err != nil {
				cassandraStatus = "offline"
			}
		}
	}

	ok := postgresStatus == "ready" && (cassandraStatus == "disabled" || cassandraStatus == "ready")
	writeJSON(w, http.StatusOK, map[string]any{
		"archive": server.worker.Stats(),
		"cassandra": map[string]any{
			"enabled":  server.config.CassandraEnabled,
			"hosts":    server.config.CassandraHosts,
			"keyspace": server.config.CassandraKeyspace,
			"status":   cassandraStatus,
		},
		"ok": ok,
		"postgres": map[string]any{
			"configured": server.config.DatabaseURL != "",
			"status":     postgresStatus,
		},
		"service":    "ungu-laundry-go-api-service",
		"started_at": server.startedAt,
		"uptime_sec": int(time.Since(server.startedAt).Seconds()),
	})
}

func (server *Server) handleReplay(w http.ResponseWriter, r *http.Request) {
	if server.config.InternalAPIToken == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error": "INTERNAL_API_TOKEN belum dikonfigurasi.",
			"ok":    false,
		})
		return
	}

	if r.Header.Get("X-Internal-Token") != server.config.InternalAPIToken {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"error": "Invalid X-Internal-Token.",
			"ok":    false,
		})
		return
	}

	reset, _ := strconv.ParseBool(r.URL.Query().Get("reset"))
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	results, err := server.worker.Replay(ctx, reset)
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": err.Error(),
			"ok":    false,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"reset":   reset,
		"results": results,
	})
}

func withJSONHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
