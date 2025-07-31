package main

import (
	"fmt"
	"log"
	"os"

	"github.com/fabienpiette/folio_fox/internal/auth"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run hash_password.go <password>")
		os.Exit(1)
	}

	password := os.Args[1]

	// Create password hasher
	hasher := auth.NewPasswordHasher()

	// Hash the password
	passwordHash, err := hasher.HashPassword(password)
	if err != nil {
		log.Fatalf("Failed to hash password: %v", err)
	}

	fmt.Printf("Password hash for '%s':\n%s\n", password, passwordHash)
}