package testutil

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-redis/redis/v8"
	_ "github.com/mattn/go-sqlite3"
	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/fabienpiette/folio_fox/internal/config"
	"github.com/fabienpiette/folio_fox/internal/database"
)

// TestConfig provides test configuration settings
type TestConfig struct {
	*config.Config
	TestDir    string
	DBPath     string
	RedisAddr  string
	RedisPort  int
}

// SetupTestDB creates an in-memory SQLite database for testing
func SetupTestDB(t *testing.T) *database.DB {
	t.Helper()

	// Create a temporary directory for test database
	testDir := t.TempDir()
	dbPath := filepath.Join(testDir, "test.db")

	db, err := database.Initialize(dbPath)
	require.NoError(t, err)

	// Run test-specific setup if needed
	t.Cleanup(func() {
		db.Close()
	})

	return db
}

// SetupInMemoryDB creates a pure in-memory SQLite database
func SetupInMemoryDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	require.NoError(t, err)

	// Verify connection
	err = db.Ping()
	require.NoError(t, err)

	t.Cleanup(func() {
		db.Close()
	})

	return db
}

// SetupTestRedis starts a Redis container for testing
func SetupTestRedis(t *testing.T) (*redis.Client, func()) {
	t.Helper()

	ctx := context.Background()

	// Start Redis container
	req := testcontainers.ContainerRequest{
		Image:        "redis:7-alpine",
		ExposedPorts: []string{"6379/tcp"},
		WaitingFor:   wait.ForLog("Ready to accept connections"),
	}

	redisContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	require.NoError(t, err)

	// Get the mapped port
	mappedPort, err := redisContainer.MappedPort(ctx, "6379")
	require.NoError(t, err)

	host, err := redisContainer.Host(ctx)
	require.NoError(t, err)

	// Create Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", host, mappedPort.Port()),
		Password: "",
		DB:       0,
	})

	// Test connection
	err = redisClient.Ping(ctx).Err()
	require.NoError(t, err)

	cleanup := func() {
		redisClient.Close()
		if err := redisContainer.Terminate(ctx); err != nil {
			// Log but don't fail cleanup
			fmt.Printf("Warning: failed to terminate redis container: %v\n", err)
		}
	}

	return redisClient, cleanup
}

// GetTestConfig returns a configuration for testing
func GetTestConfig(t *testing.T) *TestConfig {
	t.Helper()

	testDir := t.TempDir()
	dbPath := filepath.Join(testDir, "test.db")

	cfg := &config.Config{
		Environment: "test",
		Server: config.ServerConfig{
			Port:                8080,
			Host:                "localhost",
			ReadTimeoutSeconds:  30,
			WriteTimeoutSeconds: 30,
			IdleTimeoutSeconds:  120,
		},
		Database: config.DatabaseConfig{
			Path: dbPath,
		},
		Redis: config.RedisConfig{
			Host:     "localhost",
			Port:     6379,
			Password: "",
			DB:       1, // Use DB 1 for tests
		},
		Log: config.LogConfig{
			Level: "debug",
		},
		Auth: config.AuthConfig{
			JWTSecret:     "test-secret-key-for-testing-only",
			TokenDuration: 24,
		},
		Downloads: config.DownloadConfig{
			MaxConcurrent: 2,
			Timeout:       30,
			RetryCount:    2,
			UserAgent:     "FolioFox-Test/1.0",
			DownloadPath:  filepath.Join(testDir, "downloads"),
		},
		Search: config.SearchConfig{
			CacheTTL:       5, // 5 minutes for tests
			MaxResults:     50,
			TimeoutSeconds: 15,
			MaxConcurrent:  3,
		},
		Prowlarr: config.ProwlarrConfig{
			Enabled:           false, // Disabled by default in tests
			BaseURL:           "http://localhost:9696",
			APIKey:            "test-prowlarr-key",
			TimeoutSeconds:    15,
			RateLimitRequests: 30,
			RateLimitWindow:   60,
		},
		Jackett: config.JackettConfig{
			Enabled:           false, // Disabled by default in tests
			BaseURL:           "http://localhost:9117",
			APIKey:            "test-jackett-key",
			TimeoutSeconds:    15,
			RateLimitRequests: 30,
			RateLimitWindow:   60,
		},
	}

	return &TestConfig{
		Config:    cfg,
		TestDir:   testDir,
		DBPath:    dbPath,
		RedisAddr: "localhost",
		RedisPort: 6379,
	}
}

// SetupTestLogger creates a logger for testing with appropriate level
func SetupTestLogger(t *testing.T) *logrus.Logger {
	t.Helper()

	logger := logrus.New()
	logger.SetLevel(logrus.DebugLevel)

	// Use text formatter for better test output readability
	logger.SetFormatter(&logrus.TextFormatter{
		DisableColors:   true,
		TimestampFormat: time.RFC3339,
	})

	// Optionally redirect to test output
	if testing.Verbose() {
		logger.SetOutput(os.Stdout)
	} else {
		logger.SetOutput(os.Stderr)
	}

	return logger
}

// WaitForCondition waits for a condition to be true with timeout
func WaitForCondition(t *testing.T, condition func() bool, timeout time.Duration, message string) {
	t.Helper()

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	timeoutCh := time.After(timeout)

	for {
		select {
		case <-ticker.C:
			if condition() {
				return
			}
		case <-timeoutCh:
			t.Fatalf("Timeout waiting for condition: %s", message)
		}
	}
}

// CreateTestDirectories creates necessary test directories
func CreateTestDirectories(t *testing.T, testDir string) {
	t.Helper()

	dirs := []string{
		"downloads",
		"uploads", 
		"cache",
		"logs",
	}

	for _, dir := range dirs {
		err := os.MkdirAll(filepath.Join(testDir, dir), 0755)
		require.NoError(t, err)
	}
}

// SeedTestData provides common test data seeding utilities
type TestDataSeeder struct {
	DB     *sql.DB
	Logger *logrus.Logger
}

// NewTestDataSeeder creates a new test data seeder
func NewTestDataSeeder(db *sql.DB, logger *logrus.Logger) *TestDataSeeder {
	return &TestDataSeeder{
		DB:     db,
		Logger: logger,
	}
}

// SeedBasicData seeds basic reference data for tests
func (s *TestDataSeeder) SeedBasicData(t *testing.T) {
	t.Helper()

	// This would seed basic data like languages, formats, etc.
	// For now, it's a placeholder that can be extended based on the actual schema

	queries := []string{
		// Example: Insert test languages
		`INSERT OR IGNORE INTO languages (id, code, name, native_name) VALUES 
		 (1, 'en', 'English', 'English'),
		 (2, 'fr', 'French', 'Français'),
		 (3, 'es', 'Spanish', 'Español')`,

		// Example: Insert test formats
		`INSERT OR IGNORE INTO book_formats (id, name, description, mime_type, is_supported) VALUES
		 (1, 'EPUB', 'Electronic Publication', 'application/epub+zip', 1),
		 (2, 'PDF', 'Portable Document Format', 'application/pdf', 1),
		 (3, 'MOBI', 'Mobipocket', 'application/x-mobipocket-ebook', 1)`,
	}

	for _, query := range queries {
		_, err := s.DB.Exec(query)
		if err != nil {
			s.Logger.Debugf("Seeding query failed (may be expected): %v", err)
			// Don't fail the test for seeding issues - the schema might not exist yet
		}
	}
}

// CleanupTestData cleans up test data after tests
func (s *TestDataSeeder) CleanupTestData(t *testing.T) {
	t.Helper()

	// Clean up test data in reverse dependency order
	tables := []string{
		"search_history",
		"download_queue",
		"book_files", 
		"book_authors",
		"book_genres",
		"books",
		"authors",
		"publishers",
		"series",
		"genres",
		"users",
	}

	for _, table := range tables {
		_, err := s.DB.Exec(fmt.Sprintf("DELETE FROM %s", table))
		if err != nil {
			s.Logger.Debugf("Failed to clean table %s: %v", table, err)
			// Don't fail - table might not exist
		}
	}
}