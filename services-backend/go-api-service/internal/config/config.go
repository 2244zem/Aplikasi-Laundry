package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ArchiveBatchSize        int
	ArchivePollInterval     time.Duration
	ArchiveWorkerEnabled    bool
	CassandraEnabled        bool
	CassandraHosts          []string
	CassandraKeyspace       string
	DatabaseURL             string
	InternalAPIToken        string
	Port                    string
}

func LoadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key != "" {
			_ = os.Setenv(key, value)
		}
	}
}

func Load() Config {
	return Config{
		ArchiveBatchSize:     envInt("ARCHIVE_BATCH_SIZE", 100),
		ArchivePollInterval:  time.Duration(envInt("ARCHIVE_POLL_INTERVAL_SECONDS", 15)) * time.Second,
		ArchiveWorkerEnabled: envBool("ARCHIVE_WORKER_ENABLED", true),
		CassandraEnabled:     envBool("CASSANDRA_ENABLED", false),
		CassandraHosts:       envCSV("CASSANDRA_HOSTS", "127.0.0.1:9042"),
		CassandraKeyspace:    env("CASSANDRA_KEYSPACE", "ungu_laundry_archive"),
		DatabaseURL:          env("DATABASE_URL", ""),
		InternalAPIToken:     env("INTERNAL_API_TOKEN", ""),
		Port:                 env("PORT", "8082"),
	}
}

func (cfg Config) Address() string {
	return ":" + cfg.Port
}

func env(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	return value == "true" || value == "1" || value == "yes"
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func envCSV(key string, fallback string) []string {
	raw := env(key, fallback)
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))

	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value != "" {
			values = append(values, value)
		}
	}

	if len(values) == 0 {
		return []string{fallback}
	}
	return values
}
