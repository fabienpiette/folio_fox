package auth

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewPasswordHasher(t *testing.T) {
	hasher := NewPasswordHasher()

	assert.NotNil(t, hasher)
	assert.Equal(t, uint32(64*1024), hasher.memory)
	assert.Equal(t, uint32(3), hasher.iterations)
	assert.Equal(t, uint8(2), hasher.parallelism)
	assert.Equal(t, uint32(16), hasher.saltLength)
	assert.Equal(t, uint32(32), hasher.keyLength)
}

func TestPasswordHasher_HashPassword(t *testing.T) {
	hasher := NewPasswordHasher()
	password := "TestPassword123!"

	hash, err := hasher.HashPassword(password)

	require.NoError(t, err)
	assert.NotEmpty(t, hash)

	// Verify hash format
	parts := strings.Split(hash, "$")
	assert.Len(t, parts, 6)
	assert.Equal(t, "", parts[0])        // Empty part before first $
	assert.Equal(t, "argon2id", parts[1]) // Algorithm
	assert.Contains(t, parts[2], "v=")    // Version
	assert.Contains(t, parts[3], "m=")    // Memory parameter
	assert.Contains(t, parts[3], "t=")    // Iterations parameter
	assert.Contains(t, parts[3], "p=")    // Parallelism parameter
	assert.NotEmpty(t, parts[4])          // Salt
	assert.NotEmpty(t, parts[5])          // Hash
}

func TestPasswordHasher_HashPassword_DifferentPasswords(t *testing.T) {
	hasher := NewPasswordHasher()

	passwords := []string{
		"Password123!",
		"DifferentPassword456@",
		"AnotherOne789#",
		"VeryLongPasswordWithManyCharacters1234567890!@#$%^&*()",
		"Short1!",
		"简单密码123!", // Unicode password
	}

	hashes := make([]string, len(passwords))

	for i, password := range passwords {
		hash, err := hasher.HashPassword(password)
		require.NoError(t, err, "Failed to hash password: %s", password)
		hashes[i] = hash
	}

	// Verify all hashes are different
	for i := 0; i < len(hashes); i++ {
		for j := i + 1; j < len(hashes); j++ {
			assert.NotEqual(t, hashes[i], hashes[j], "Hashes should be different for different passwords")
		}
	}
}

func TestPasswordHasher_HashPassword_SamePasswordDifferentHashes(t *testing.T) {
	hasher := NewPasswordHasher()
	password := "SamePassword123!"

	hash1, err := hasher.HashPassword(password)
	require.NoError(t, err)

	hash2, err := hasher.HashPassword(password)
	require.NoError(t, err)

	// Same password should produce different hashes due to random salt
	assert.NotEqual(t, hash1, hash2)

	// But both should verify successfully
	valid1, err := hasher.VerifyPassword(password, hash1)
	require.NoError(t, err)
	assert.True(t, valid1)

	valid2, err := hasher.VerifyPassword(password, hash2)
	require.NoError(t, err)
	assert.True(t, valid2)
}

func TestPasswordHasher_VerifyPassword_ValidPassword(t *testing.T) {
	hasher := NewPasswordHasher()
	password := "CorrectPassword123!"

	hash, err := hasher.HashPassword(password)
	require.NoError(t, err)

	valid, err := hasher.VerifyPassword(password, hash)

	require.NoError(t, err)
	assert.True(t, valid)
}

func TestPasswordHasher_VerifyPassword_InvalidPassword(t *testing.T) {
	hasher := NewPasswordHasher()
	correctPassword := "CorrectPassword123!"
	wrongPassword := "WrongPassword456@"

	hash, err := hasher.HashPassword(correctPassword)
	require.NoError(t, err)

	valid, err := hasher.VerifyPassword(wrongPassword, hash)

	require.NoError(t, err)
	assert.False(t, valid)
}

func TestPasswordHasher_VerifyPassword_InvalidHashFormat(t *testing.T) {
	hasher := NewPasswordHasher()

	invalidHashes := []string{
		"invalid-hash",
		"$argon2id$invalid",
		"$argon2id$v=19$m=65536",                     // Too few parts
		"$invalid$v=19$m=65536,t=3,p=2$salt$hash",   // Wrong algorithm
		"$argon2id$v=18$m=65536,t=3,p=2$salt$hash",  // Wrong version
		"$argon2id$v=19$invalid$salt$hash",          // Invalid parameters
		"$argon2id$v=19$m=65536,t=3,p=2$inv@lid$hash", // Invalid salt encoding
		"$argon2id$v=19$m=65536,t=3,p=2$c2FsdA$inv@lid", // Invalid hash encoding
	}

	for _, invalidHash := range invalidHashes {
		t.Run("invalid_hash_"+invalidHash[:min(len(invalidHash), 20)], func(t *testing.T) {
			valid, err := hasher.VerifyPassword("password", invalidHash)

			assert.Error(t, err)
			assert.False(t, valid)
		})
	}
}

func TestPasswordHasher_VerifyPassword_EmptyPassword(t *testing.T) {
	hasher := NewPasswordHasher()
	password := ""

	hash, err := hasher.HashPassword(password)
	require.NoError(t, err)

	valid, err := hasher.VerifyPassword(password, hash)
	require.NoError(t, err)
	assert.True(t, valid)

	// Wrong password should fail
	valid, err = hasher.VerifyPassword("not-empty", hash)
	require.NoError(t, err)
	assert.False(t, valid)
}

func TestValidatePasswordStrength_ValidPasswords(t *testing.T) {
	validPasswords := []string{
		"Password123!",
		"MyStr0ng@Pass",
		"C0mplex#P@ssw0rd",
		"TestUser123$",
		"Secure1@Password",
		"Valid8&Strong",
		"G00d!P@ssw0rd",
		"R3ally$3cur3P@ss",
	}

	for _, password := range validPasswords {
		t.Run("valid_"+password, func(t *testing.T) {
			err := ValidatePasswordStrength(password)
			assert.NoError(t, err, "Password should be valid: %s", password)
		})
	}
}

func TestValidatePasswordStrength_InvalidPasswords(t *testing.T) {
	tests := []struct {
		password    string
		expectedErr string
	}{
		{
			password:    "short",
			expectedErr: "password must be at least 8 characters long",
		},
		{
			password:    "",
			expectedErr: "password must be at least 8 characters long",
		},
		{
			password:    strings.Repeat("a", 129),
			expectedErr: "password must be no more than 128 characters long",
		},
		{
			password:    "nouppercase123!",
			expectedErr: "password must contain at least one: uppercase letter",
		},
		{
			password:    "NOLOWERCASE123!",
			expectedErr: "password must contain at least one: lowercase letter",
		},
		{
			password:    "NoNumbers!@#",
			expectedErr: "password must contain at least one: number",
		},
		{
			password:    "NoSpecialChars123",
			expectedErr: "password must contain at least one: special character",
		},
		{
			password:    "onlylowercase",
			expectedErr: "password must contain at least one: uppercase letter, number, special character",
		},
		{
			password:    "ONLYUPPERCASE",
			expectedErr: "password must contain at least one: lowercase letter, number, special character",
		},
		{
			password:    "OnlyLetters",
			expectedErr: "password must contain at least one: number, special character",
		},
		{
			password:    "Letters123",
			expectedErr: "password must contain at least one: special character",
		},
	}

	for _, tt := range tests {
		t.Run("invalid_"+tt.password[:min(len(tt.password), 20)], func(t *testing.T) {
			err := ValidatePasswordStrength(tt.password)
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.expectedErr)
		})
	}
}

func TestValidatePasswordStrength_SpecialCharacters(t *testing.T) {
	specialChars := []string{
		"!", "@", "#", "$", "%", "^", "&", "*",
		"(", ")", "-", "_", "=", "+", "[", "]",
		"{", "}", "|", "\\", ":", ";", "\"", "'",
		"<", ">", ",", ".", "?", "/", "~", "`",
	}

	for _, char := range specialChars {
		password := "Password123" + char
		t.Run("special_char_"+char, func(t *testing.T) {
			err := ValidatePasswordStrength(password)
			assert.NoError(t, err, "Password with special character %s should be valid", char)
		})
	}
}

func TestValidatePasswordStrength_EdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		password string
		valid    bool
	}{
		{
			name:     "exactly 8 characters",
			password: "Pass123!",
			valid:    true,
		},
		{
			name:     "exactly 128 characters",
			password: "A1!" + strings.Repeat("a", 125),
			valid:    true,
		},
		{
			name:     "unicode characters",
			password: "Pāssw0rd!",
			valid:    true,
		},
		{
			name:     "mixed case with numbers and symbols",
			password: "MyV3ry$3cur3P@$$w0rd!",
			valid:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePasswordStrength(tt.password)
			if tt.valid {
				assert.NoError(t, err)
			} else {
				assert.Error(t, err)
			}
		})
	}
}

// Benchmark tests
func BenchmarkPasswordHasher_HashPassword(b *testing.B) {
	hasher := NewPasswordHasher()
	password := "BenchmarkPassword123!"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := hasher.HashPassword(password)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkPasswordHasher_VerifyPassword(b *testing.B) {
	hasher := NewPasswordHasher()
	password := "BenchmarkPassword123!"

	hash, err := hasher.HashPassword(password)
	if err != nil {
		b.Fatal(err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		valid, err := hasher.VerifyPassword(password, hash)
		if err != nil {
			b.Fatal(err)
		}
		if !valid {
			b.Fatal("Password verification failed")
		}
	}
}

func BenchmarkValidatePasswordStrength(b *testing.B) {
	passwords := []string{
		"Password123!",
		"MyStr0ng@Pass",
		"C0mplex#P@ssw0rd",
		"TestUser123$",
		"Secure1@Password",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		password := passwords[i%len(passwords)]
		err := ValidatePasswordStrength(password)
		if err != nil {
			b.Fatal(err)
		}
	}
}

// Parallel benchmarks
func BenchmarkPasswordHasher_HashPassword_Parallel(b *testing.B) {
	hasher := NewPasswordHasher()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_, err := hasher.HashPassword("ParallelBenchmarkPassword123!")
			if err != nil {
				b.Fatal(err)
			}
		}
	})
}

func BenchmarkPasswordHasher_VerifyPassword_Parallel(b *testing.B) {
	hasher := NewPasswordHasher()
	password := "ParallelBenchmarkPassword123!"

	hash, err := hasher.HashPassword(password)
	if err != nil {
		b.Fatal(err)
	}

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			valid, err := hasher.VerifyPassword(password, hash)
			if err != nil {
				b.Fatal(err)
			}
			if !valid {
				b.Fatal("Password verification failed")
			}
		}
	})
}

// Table-driven test for comprehensive password validation
func TestPasswordValidation_Comprehensive(t *testing.T) {
	tests := []struct {
		name        string
		password    string
		shouldHash  bool
		shouldVerify bool
		strengthErr string
	}{
		{
			name:         "perfect password",
			password:     "Perfect123!",
			shouldHash:   true,
			shouldVerify: true,
			strengthErr:  "",
		},
		{
			name:         "too short",
			password:     "Sh0rt!",
			shouldHash:   true, // Hashing should work regardless
			shouldVerify: true,
			strengthErr:  "password must be at least 8 characters long",
		},
		{
			name:         "no uppercase",
			password:     "nouppercase123!",
			shouldHash:   true,
			shouldVerify: true,
			strengthErr:  "uppercase letter",
		},
		{
			name:         "empty password",
			password:     "",
			shouldHash:   true,
			shouldVerify: true,
			strengthErr:  "password must be at least 8 characters long",
		},
		{
			name:         "very long password",
			password:     "ValidPassword123!" + strings.Repeat("x", 200),
			shouldHash:   true,
			shouldVerify: true,
			strengthErr:  "password must be no more than 128 characters long",
		},
	}

	hasher := NewPasswordHasher()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test strength validation
			err := ValidatePasswordStrength(tt.password)
			if tt.strengthErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.strengthErr)
			} else {
				assert.NoError(t, err)
			}

			// Test hashing
			if tt.shouldHash {
				hash, err := hasher.HashPassword(tt.password)
				if err != nil {
					t.Fatalf("Failed to hash password: %v", err)
				}

				// Test verification
				if tt.shouldVerify {
					valid, err := hasher.VerifyPassword(tt.password, hash)
					require.NoError(t, err)
					assert.True(t, valid)

					// Test with wrong password
					valid, err = hasher.VerifyPassword(tt.password+"wrong", hash)
					require.NoError(t, err)
					assert.False(t, valid)
				}
			}
		})
	}
}

// Helper function for min (not available in older Go versions)
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}