package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/fabienpiette/folio_fox/internal/auth"
	_ "github.com/mattn/go-sqlite3"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run create_admin.go <database_path>")
		fmt.Println("This creates a default admin user with username 'admin' and password 'admin123'")
		os.Exit(1)
	}

	dbPath := os.Args[1]

	// Open database
	db, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// Create password hasher
	hasher := auth.NewPasswordHasher()

	// Hash the default password
	passwordHash, err := hasher.HashPassword("admin123")
	if err != nil {
		log.Fatalf("Failed to hash password: %v", err)
	}

	// Check if admin user already exists
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", "admin").Scan(&count)
	if err != nil {
		log.Fatalf("Failed to check existing users: %v", err)
	}

	if count > 0 {
		fmt.Println("Admin user already exists!")
		return
	}

	// Insert admin user
	_, err = db.Exec(`
		INSERT INTO users (username, email, password_hash, is_active, is_admin, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	`, "admin", "admin@foliofox.local", passwordHash, true, true)

	if err != nil {
		log.Fatalf("Failed to create admin user: %v", err)
	}

	fmt.Println("✅ Default admin user created successfully!")
	fmt.Println("   Username: admin")
	fmt.Println("   Password: admin123")
	fmt.Println("   Please change the password after first login!")
}