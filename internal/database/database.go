package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "github.com/mattn/go-sqlite3"
	"github.com/sirupsen/logrus"
)

// DB wraps the sql.DB connection with additional functionality
type DB struct {
	*sql.DB
}

// Initialize creates and configures the database connection
func Initialize(dbPath string) (*DB, error) {
	// Ensure the directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	// Open database connection
	sqlDB, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test the connection
	if err := sqlDB.Ping(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Configure connection pool
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)

	db := &DB{DB: sqlDB}

	// Run migrations
	if err := db.runMigrations(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	logrus.Info("Database initialized successfully")
	return db, nil
}

// runMigrations applies database migrations
func (db *DB) runMigrations() error {
	// Create migrations directory if it doesn't exist
	migrationsDir := "./database/migrations"
	if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
		logrus.Warn("Migrations directory not found, skipping migrations")
		return nil
	}

	driver, err := sqlite3.WithInstance(db.DB, &sqlite3.Config{})
	if err != nil {
		return fmt.Errorf("failed to create migration driver: %w", err)
	}

	m, err := migrate.NewWithDatabaseInstance(
		"file://"+migrationsDir,
		"sqlite3",
		driver,
	)
	if err != nil {
		return fmt.Errorf("failed to create migration instance: %w", err)
	}

	version, dirty, err := m.Version()
	if err != nil && err != migrate.ErrNilVersion {
		return fmt.Errorf("failed to get migration version: %w", err)
	}

	logrus.Infof("Current database version: %d, dirty: %v", version, dirty)

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("failed to apply migrations: %w", err)
	}

	newVersion, _, _ := m.Version()
	logrus.Infof("Migrations completed, database version: %d", newVersion)

	return nil
}

// Close closes the database connection
func (db *DB) Close() error {
	return db.DB.Close()
}

// Health checks the database connection health
func (db *DB) Health() error {
	return db.Ping()
}