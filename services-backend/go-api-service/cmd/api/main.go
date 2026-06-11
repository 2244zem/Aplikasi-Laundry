package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/2244zem/aplikasi-laundry/services-backend/go-api-service/internal/archive"
	"github.com/2244zem/aplikasi-laundry/services-backend/go-api-service/internal/config"
	"github.com/2244zem/aplikasi-laundry/services-backend/go-api-service/internal/httpapi"
)

func main() {
	config.LoadDotEnv(".env")
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var postgresStore *archive.PostgresStore
	if cfg.DatabaseURL != "" {
		store, err := archive.NewPostgresStore(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Printf("postgres init failed: %v", err)
		} else {
			postgresStore = store
			defer postgresStore.Close()
		}
	} else {
		log.Print("DATABASE_URL is empty; postgres health will report missing")
	}

	var cassandraStore *archive.CassandraStore
	if cfg.CassandraEnabled {
		store, err := archive.NewCassandraStore(cfg.CassandraHosts, cfg.CassandraKeyspace)
		if err != nil {
			log.Printf("cassandra init failed: %v", err)
		} else {
			cassandraStore = store
			defer cassandraStore.Close()
		}
	}

	archiveWorker := archive.NewWorker(
		postgresStore,
		cassandraStore,
		cfg.ArchivePollInterval,
		cfg.ArchiveBatchSize,
		cfg.ArchiveWorkerEnabled && cfg.CassandraEnabled,
	)
	archiveWorker.Start(ctx)

	api := httpapi.NewServer(cfg, postgresStore, cassandraStore, archiveWorker)
	server := &http.Server{
		Addr:              cfg.Address(),
		Handler:           api.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("ungu laundry go api listening on %s", cfg.Address())
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server failed: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("http shutdown failed: %v", err)
	}
}
