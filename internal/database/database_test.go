package database

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInitialize_Success(t *testing.T) {
	// Create a temporary directory for test database
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")

	db, err := Initialize(dbPath)

	require.NoError(t, err)
	assert.NotNil(t, db)
	assert.NotNil(t, db.DB)

	// Test that the database file was created
	_, err = os.Stat(dbPath)
	assert.NoError(t, err)

	// Test that we can ping the database
	err = db.Ping()
	assert.NoError(t, err)

	// Cleanup
	err = db.Close()
	assert.NoError(t, err)
}

func TestInitialize_CreatesDirectory(t *testing.T) {
	// Create a temporary directory
	tempDir := t.TempDir()
	subDir := filepath.Join(tempDir, "subdir", "nested")
	dbPath := filepath.Join(subDir, "test.db")

	// The subdirectory doesn't exist yet
	_, err := os.Stat(subDir)
	assert.True(t, os.IsNotExist(err))

	db, err := Initialize(dbPath)

	require.NoError(t, err)
	assert.NotNil(t, db)

	// Test that the directory was created
	_, err = os.Stat(subDir)
	assert.NoError(t, err)

	// Test that the database file was created
	_, err = os.Stat(dbPath)
	assert.NoError(t, err)

	// Cleanup
	err = db.Close()
	assert.NoError(t, err)
}

func TestInitialize_InvalidPath(t *testing.T) {
	// Try to create database in a path that can't be created (e.g., in root if not admin)
	invalidPath := "/root/invalid/path/test.db"

	db, err := Initialize(invalidPath)

	// Should fail to create directory
	assert.Error(t, err)
	assert.Nil(t, db)
	assert.Contains(t, err.Error(), "failed to create database directory")
}

func TestInitialize_ExistingDatabase(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "existing.db")

	// Create first database
	db1, err := Initialize(dbPath)
	require.NoError(t, err)
	require.NotNil(t, db1)

	// Close first database
	err = db1.Close()
	require.NoError(t, err)

	// Initialize again with same path
	db2, err := Initialize(dbPath)
	require.NoError(t, err)
	assert.NotNil(t, db2)

	// Should be able to ping
	err = db2.Ping()
	assert.NoError(t, err)

	// Cleanup
	err = db2.Close()
	assert.NoError(t, err)
}

func TestDB_Health(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "health_test.db")

	db, err := Initialize(dbPath)
	require.NoError(t, err)
	require.NotNil(t, db)

	// Test health check on open database
	err = db.Health()
	assert.NoError(t, err)

	// Close database
	err = db.Close()
	require.NoError(t, err)

	// Test health check on closed database
	err = db.Health()
	assert.Error(t, err)
}

func TestDB_Close(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "close_test.db")

	db, err := Initialize(dbPath)
	require.NoError(t, err)
	require.NotNil(t, db)

	// Should be able to ping before closing
	err = db.Ping()
	assert.NoError(t, err)

	// Close database
	err = db.Close()
	assert.NoError(t, err)

	// Should not be able to ping after closing
	err = db.Ping()
	assert.Error(t, err)
}

func TestDB_ConnectionPool(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "pool_test.db")

	db, err := Initialize(dbPath)
	require.NoError(t, err)
	require.NotNil(t, db)
	defer db.Close()

	// Test that connection pool settings are applied
	stats := db.Stats()
	assert.Equal(t, 25, stats.MaxOpenConnections)
	
	// Note: MaxIdleConns is not directly accessible in stats,
	// but we can verify the database works with concurrent access
	done := make(chan bool, 10)

	// Create multiple concurrent connections
	for i := 0; i < 10; i++ {
		go func() {
			defer func() { done <- true }()
			err := db.Ping()
			assert.NoError(t, err)
		}()
	}

	// Wait for all goroutines to complete
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestDB_SQLiteFeatures(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "features_test.db")

	db, err := Initialize(dbPath)
	require.NoError(t, err)
	require.NotNil(t, db)
	defer db.Close()

	// Test foreign keys are enabled
	var foreignKeysEnabled int
	err = db.QueryRow("PRAGMA foreign_keys").Scan(&foreignKeysEnabled)
	require.NoError(t, err)
	assert.Equal(t, 1, foreignKeysEnabled, "Foreign keys should be enabled")

	// Test WAL mode is enabled
	var journalMode string
	err = db.QueryRow("PRAGMA journal_mode").Scan(&journalMode)
	require.NoError(t, err)
	assert.Equal(t, "wal", journalMode, "Journal mode should be WAL")
}

func TestRunMigrations_NoMigrationsDir(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "no_migrations.db")

	// Change to temporary directory where migrations don't exist
	originalDir, err := os.Getwd()
	require.NoError(t, err)
	defer func() {
		if err := os.Chdir(originalDir); err != nil {
			t.Logf("Failed to restore directory: %v", err)
		}
	}()

	err = os.Chdir(tempDir)
	require.NoError(t, err)

	db, err := Initialize(dbPath)

	// Should succeed even without migrations directory
	require.NoError(t, err)
	assert.NotNil(t, db)

	err = db.Close()
	assert.NoError(t, err)
}

func TestRunMigrations_WithMigrationsDir(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "with_migrations.db")

	// Create migrations directory
	migrationsDir := filepath.Join(tempDir, "database", "migrations")
	err := os.MkdirAll(migrationsDir, 0755)
	require.NoError(t, err)

	// Create a simple migration file
	migrationContent := `CREATE TABLE test_table (
		id INTEGER PRIMARY KEY,
		name TEXT NOT NULL
	);`
	
	migrationFile := filepath.Join(migrationsDir, "001_test_migration.up.sql")
	err = os.WriteFile(migrationFile, []byte(migrationContent), 0644)
	require.NoError(t, err)

	// Change to temp directory so migrations can be found
	originalDir, err := os.Getwd()
	require.NoError(t, err)
	defer func() {
		if err := os.Chdir(originalDir); err != nil {
			t.Logf("Failed to restore directory: %v", err)
		}
	}()

	err = os.Chdir(tempDir)
	require.NoError(t, err)

	db, err := Initialize(dbPath)
	require.NoError(t, err)
	assert.NotNil(t, db)
	defer db.Close()

	// Test that the migration was applied by checking if table exists
	var tableName string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'").Scan(&tableName)
	require.NoError(t, err)
	assert.Equal(t, "test_table", tableName)
}

func TestDB_MultipleConnections(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "multi_conn_test.db")

	db, err := Initialize(dbPath)
	require.NoError(t, err)
	require.NotNil(t, db)
	defer db.Close()

	// Create a simple table
	_, err = db.Exec("CREATE TABLE IF NOT EXISTS test_multi (id INTEGER PRIMARY KEY, value TEXT)")
	require.NoError(t, err)

	// Test concurrent writes and reads
	numGoroutines := 10
	numOperations := 10
	done := make(chan error, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func(id int) {
			var lastErr error
			for j := 0; j < numOperations; j++ {
				// Insert
				_, err := db.Exec("INSERT INTO test_multi (value) VALUES (?)", 
					fmt.Sprintf("value_%d_%d", id, j))
				if err != nil {
					lastErr = err
					break
				}

				// Read
				var count int
				err = db.QueryRow("SELECT COUNT(*) FROM test_multi").Scan(&count)
				if err != nil {
					lastErr = err
					break
				}
			}
			done <- lastErr
		}(i)
	}

	// Wait for all goroutines and check for errors
	for i := 0; i < numGoroutines; i++ {
		err := <-done
		assert.NoError(t, err, "Concurrent operation failed")
	}

	// Verify total count
	var totalCount int
	err = db.QueryRow("SELECT COUNT(*) FROM test_multi").Scan(&totalCount)
	require.NoError(t, err)
	assert.Equal(t, numGoroutines*numOperations, totalCount)
}

// Benchmark tests
func BenchmarkInitialize(b *testing.B) {
	tempDir := b.TempDir()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		dbPath := filepath.Join(tempDir, fmt.Sprintf("bench_%d.db", i))
		db, err := Initialize(dbPath)
		if err != nil {
			b.Fatal(err)
		}
		db.Close()
	}
}

func BenchmarkDB_Ping(b *testing.B) {
	tempDir := b.TempDir()
	dbPath := filepath.Join(tempDir, "ping_bench.db")

	db, err := Initialize(dbPath)
	if err != nil {
		b.Fatal(err)
	}
	defer db.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		err := db.Ping()
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDB_Health(b *testing.B) {
	tempDir := b.TempDir()
	dbPath := filepath.Join(tempDir, "health_bench.db")

	db, err := Initialize(dbPath)
	if err != nil {
		b.Fatal(err)
	}
	defer db.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		err := db.Health()
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDB_ConcurrentAccess(b *testing.B) {
	tempDir := b.TempDir()
	dbPath := filepath.Join(tempDir, "concurrent_bench.db")

	db, err := Initialize(dbPath)
	if err != nil {
		b.Fatal(err)
	}
	defer db.Close()

	// Create test table
	_, err = db.Exec("CREATE TABLE IF NOT EXISTS bench_test (id INTEGER PRIMARY KEY, value INTEGER)")
	if err != nil {
		b.Fatal(err)
	}

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		i := 0
		for pb.Next() {
			// Alternate between read and write operations
			if i%2 == 0 {
				_, err := db.Exec("INSERT INTO bench_test (value) VALUES (?)", i)
				if err != nil {
					b.Fatal(err)
				}
			} else {
				var count int
				err := db.QueryRow("SELECT COUNT(*) FROM bench_test").Scan(&count)
				if err != nil {
					b.Fatal(err)
				}
			}
			i++
		}
	})
}

// Test edge cases and error conditions
func TestDB_EdgeCases(t *testing.T) {
	t.Run("empty path", func(t *testing.T) {
		db, err := Initialize("")
		// Should handle empty path gracefully
		if err == nil {
			db.Close()
		}
		// Either succeeds with current directory or fails gracefully
	})

	t.Run("relative path", func(t *testing.T) {
		tempDir := t.TempDir()
		originalDir, err := os.Getwd()
		require.NoError(t, err)
		defer func() {
		if err := os.Chdir(originalDir); err != nil {
			t.Logf("Failed to restore directory: %v", err)
		}
	}()

		err = os.Chdir(tempDir)
		require.NoError(t, err)

		db, err := Initialize("relative_test.db")
		require.NoError(t, err)
		assert.NotNil(t, db)

		err = db.Close()
		assert.NoError(t, err)

		// Verify file was created in current directory
		_, err = os.Stat("relative_test.db")
		assert.NoError(t, err)
	})

	t.Run("very long path", func(t *testing.T) {
		tempDir := t.TempDir()
		longPath := filepath.Join(tempDir, strings.Repeat("a", 100), "test.db")

		db, err := Initialize(longPath)
		require.NoError(t, err)
		assert.NotNil(t, db)

		err = db.Close()
		assert.NoError(t, err)
	})
}

func TestDB_TransactionSupport(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "transaction_test.db")

	db, err := Initialize(dbPath)
	require.NoError(t, err)
	require.NotNil(t, db)
	defer db.Close()

	// Create test table
	_, err = db.Exec("CREATE TABLE IF NOT EXISTS tx_test (id INTEGER PRIMARY KEY, value TEXT)")
	require.NoError(t, err)

	// Test successful transaction
	tx, err := db.Begin()
	require.NoError(t, err)

	_, err = tx.Exec("INSERT INTO tx_test (value) VALUES (?)", "test1")
	require.NoError(t, err)

	_, err = tx.Exec("INSERT INTO tx_test (value) VALUES (?)", "test2")
	require.NoError(t, err)

	err = tx.Commit()
	require.NoError(t, err)

	// Verify data was committed
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM tx_test").Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 2, count)

	// Test rolled back transaction
	tx, err = db.Begin()
	require.NoError(t, err)

	_, err = tx.Exec("INSERT INTO tx_test (value) VALUES (?)", "test3")
	require.NoError(t, err)

	err = tx.Rollback()
	require.NoError(t, err)

	// Verify data was not committed
	err = db.QueryRow("SELECT COUNT(*) FROM tx_test").Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 2, count) // Still 2, not 3
}

