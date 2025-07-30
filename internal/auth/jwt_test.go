package auth

import (
	"fmt"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fabienpiette/folio_fox/internal/models"
)

func TestNewJWTManager(t *testing.T) {
	secretKey := "test-secret-key"
	tokenDuration := 24

	manager := NewJWTManager(secretKey, tokenDuration)

	assert.NotNil(t, manager)
	assert.Equal(t, secretKey, manager.secretKey)
	assert.Equal(t, 24*time.Hour, manager.tokenDuration)
}

func TestJWTManager_GenerateToken(t *testing.T) {
	manager := NewJWTManager("test-secret", 1)

	user := &models.User{
		ID:       123,
		Username: "testuser",
		IsAdmin:  false,
	}

	tokenString, expiresAt, err := manager.GenerateToken(user)

	require.NoError(t, err)
	assert.NotEmpty(t, tokenString)
	assert.True(t, expiresAt.After(time.Now()))
	assert.True(t, expiresAt.Before(time.Now().Add(2*time.Hour)))

	// Verify the token can be parsed
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte("test-secret"), nil
	})

	require.NoError(t, err)
	require.True(t, token.Valid)

	claims, ok := token.Claims.(*JWTClaims)
	require.True(t, ok)

	assert.Equal(t, user.ID, claims.UserID)
	assert.Equal(t, user.Username, claims.Username)
	assert.Equal(t, user.IsAdmin, claims.IsAdmin)
	assert.Equal(t, "123", claims.Subject)
	assert.Equal(t, "foliofox", claims.Issuer)
	assert.NotNil(t, claims.IssuedAt)
	assert.NotNil(t, claims.ExpiresAt)
	assert.NotNil(t, claims.NotBefore)
}

func TestJWTManager_GenerateToken_AdminUser(t *testing.T) {
	manager := NewJWTManager("test-secret", 2)

	user := &models.User{
		ID:       456,
		Username: "adminuser",
		IsAdmin:  true,
	}

	tokenString, expiresAt, err := manager.GenerateToken(user)

	require.NoError(t, err)
	assert.NotEmpty(t, tokenString)

	// Verify admin flag is preserved
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte("test-secret"), nil
	})

	require.NoError(t, err)
	claims, ok := token.Claims.(*JWTClaims)
	require.True(t, ok)

	assert.Equal(t, user.ID, claims.UserID)
	assert.Equal(t, user.Username, claims.Username)
	assert.True(t, claims.IsAdmin)
	assert.True(t, expiresAt.After(time.Now().Add(time.Hour)))
}

func TestJWTManager_ValidateToken_ValidToken(t *testing.T) {
	manager := NewJWTManager("test-secret", 1)

	user := &models.User{
		ID:       789,
		Username: "validuser",
		IsAdmin:  false,
	}

	tokenString, _, err := manager.GenerateToken(user)
	require.NoError(t, err)

	claims, err := manager.ValidateToken(tokenString)

	require.NoError(t, err)
	assert.NotNil(t, claims)
	assert.Equal(t, user.ID, claims.UserID)
	assert.Equal(t, user.Username, claims.Username)
	assert.Equal(t, user.IsAdmin, claims.IsAdmin)
}

func TestJWTManager_ValidateToken_InvalidSignature(t *testing.T) {
	manager1 := NewJWTManager("secret1", 1)
	manager2 := NewJWTManager("secret2", 1)

	user := &models.User{
		ID:       123,
		Username: "testuser",
		IsAdmin:  false,
	}

	// Generate token with manager1
	tokenString, _, err := manager1.GenerateToken(user)
	require.NoError(t, err)

	// Try to validate with manager2 (different secret)
	claims, err := manager2.ValidateToken(tokenString)

	assert.Error(t, err)
	assert.Nil(t, claims)
	assert.Contains(t, err.Error(), "failed to parse token")
}

func TestJWTManager_ValidateToken_ExpiredToken(t *testing.T) {
	// Create manager with very short duration
	manager := NewJWTManager("test-secret", 0) // 0 hours = immediate expiration
	manager.tokenDuration = -time.Hour // Set to negative to make it immediately expired

	user := &models.User{
		ID:       123,
		Username: "testuser",
		IsAdmin:  false,
	}

	tokenString, _, err := manager.GenerateToken(user)
	require.NoError(t, err)

	// Wait a moment to ensure expiration
	time.Sleep(10 * time.Millisecond)

	claims, err := manager.ValidateToken(tokenString)

	assert.Error(t, err)
	assert.Nil(t, claims)
	assert.Contains(t, err.Error(), "token is expired")
}

func TestJWTManager_ValidateToken_MalformedToken(t *testing.T) {
	manager := NewJWTManager("test-secret", 1)

	malformedTokens := []string{
		"invalid-token",
		"header.payload", // Missing signature
		"",               // Empty token
		"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature", // Invalid payload
	}

	for _, tokenString := range malformedTokens {
		t.Run("malformed_"+tokenString, func(t *testing.T) {
			claims, err := manager.ValidateToken(tokenString)

			assert.Error(t, err)
			assert.Nil(t, claims)
		})
	}
}

func TestJWTManager_RefreshToken_ValidToken(t *testing.T) {
	manager := NewJWTManager("test-secret", 1)

	user := &models.User{
		ID:       123,
		Username: "testuser",
		IsAdmin:  true,
	}

	// Generate initial token
	originalToken, originalExpiry, err := manager.GenerateToken(user)
	require.NoError(t, err)

	// Wait a bit to ensure new token has different issued time
	time.Sleep(1 * time.Second)

	// Refresh the token
	newToken, newExpiry, err := manager.RefreshToken(originalToken)

	require.NoError(t, err)
	assert.NotEmpty(t, newToken)
	assert.NotEqual(t, originalToken, newToken)
	assert.True(t, newExpiry.After(originalExpiry))

	// Validate the new token
	claims, err := manager.ValidateToken(newToken)
	require.NoError(t, err)
	assert.Equal(t, user.ID, claims.UserID)
	assert.Equal(t, user.Username, claims.Username)
	assert.Equal(t, user.IsAdmin, claims.IsAdmin)
}

func TestJWTManager_RefreshToken_InvalidToken(t *testing.T) {
	manager := NewJWTManager("test-secret", 1)

	newToken, newExpiry, err := manager.RefreshToken("invalid-token")

	assert.Error(t, err)
	assert.Empty(t, newToken)
	assert.True(t, newExpiry.IsZero())
	assert.Contains(t, err.Error(), "invalid token for refresh")
}

func TestJWTManager_RefreshToken_TooOldToken(t *testing.T) {
	manager := NewJWTManager("test-secret", 1)

	// Create a token with very old issued time
	claims := &JWTClaims{
		UserID:   123,
		Username: "testuser",
		IsAdmin:  false,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "123",
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-8 * 24 * time.Hour)), // 8 days ago
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			NotBefore: jwt.NewNumericDate(time.Now().Add(-8 * 24 * time.Hour)),
			Issuer:    "foliofox",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	oldTokenString, err := token.SignedString([]byte("test-secret"))
	require.NoError(t, err)

	newToken, newExpiry, err := manager.RefreshToken(oldTokenString)

	assert.Error(t, err)
	assert.Empty(t, newToken)
	assert.True(t, newExpiry.IsZero())
	assert.Contains(t, err.Error(), "token too old for refresh")
}

func TestValidateJWT_ValidToken(t *testing.T) {
	// Create a token using the default secret key used in ValidateJWT
	secretKey := "your-super-secret-jwt-key-change-this"
	claims := &JWTClaims{
		UserID:   123,
		Username: "testuser",
		IsAdmin:  true,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "123",
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "foliofox",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secretKey))
	require.NoError(t, err)

	userID, username, isAdmin, err := ValidateJWT(tokenString)

	require.NoError(t, err)
	assert.Equal(t, int64(123), userID)
	assert.Equal(t, "testuser", username)
	assert.True(t, isAdmin)
}

func TestValidateJWT_InvalidToken(t *testing.T) {
	userID, username, isAdmin, err := ValidateJWT("invalid-token")

	assert.Error(t, err)
	assert.Equal(t, int64(0), userID)
	assert.Empty(t, username)
	assert.False(t, isAdmin)
}

func TestValidateJWT_WrongSigningMethod(t *testing.T) {
	// Create token with RS256 instead of HS256
	claims := &JWTClaims{
		UserID:   123,
		Username: "testuser",
		IsAdmin:  false,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	tokenString, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	require.NoError(t, err)

	userID, username, isAdmin, err := ValidateJWT(tokenString)

	assert.Error(t, err)
	assert.Equal(t, int64(0), userID)
	assert.Empty(t, username)
	assert.False(t, isAdmin)
	assert.Contains(t, err.Error(), "unexpected signing method")
}

func TestJWTClaims_Structure(t *testing.T) {
	claims := &JWTClaims{
		UserID:   456,
		Username: "structuretest",
		IsAdmin:  true,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "456",
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "foliofox",
		},
	}

	// Test that the claims structure is correct
	assert.Equal(t, int64(456), claims.UserID)
	assert.Equal(t, "structuretest", claims.Username)
	assert.True(t, claims.IsAdmin)
	assert.Equal(t, "456", claims.Subject)
	assert.Equal(t, "foliofox", claims.Issuer)
	assert.NotNil(t, claims.IssuedAt)
	assert.NotNil(t, claims.ExpiresAt)
	assert.NotNil(t, claims.NotBefore)
}

// Benchmark tests
func BenchmarkJWTManager_GenerateToken(b *testing.B) {
	manager := NewJWTManager("benchmark-secret-key", 24)
	user := &models.User{
		ID:       123,
		Username: "benchmarkuser",
		IsAdmin:  false,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, err := manager.GenerateToken(user)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkJWTManager_ValidateToken(b *testing.B) {
	manager := NewJWTManager("benchmark-secret-key", 24)
	user := &models.User{
		ID:       123,
		Username: "benchmarkuser",
		IsAdmin:  false,
	}

	tokenString, _, err := manager.GenerateToken(user)
	if err != nil {
		b.Fatal(err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := manager.ValidateToken(tokenString)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkValidateJWT(b *testing.B) {
	// Create a valid token for benchmarking
	secretKey := "your-super-secret-jwt-key-change-this"
	claims := &JWTClaims{
		UserID:   123,
		Username: "benchmarkuser",
		IsAdmin:  false,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "123",
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "foliofox",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secretKey))
	if err != nil {
		b.Fatal(err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, _, err := ValidateJWT(tokenString)
		if err != nil {
			b.Fatal(err)
		}
	}
}

// Table-driven tests for edge cases
func TestJWTManager_EdgeCases(t *testing.T) {
	tests := []struct {
		name           string
		secretKey      string
		tokenDuration  int
		user           *models.User
		expectError    bool
		errorContains  string
	}{
		{
			name:          "valid normal user",
			secretKey:     "valid-secret",
			tokenDuration: 1,
			user: &models.User{
				ID:       1,
				Username: "normaluser",
				IsAdmin:  false,
			},
			expectError: false,
		},
		{
			name:          "valid admin user",
			secretKey:     "valid-secret",
			tokenDuration: 24,
			user: &models.User{
				ID:       2,
				Username: "adminuser",
				IsAdmin:  true,
			},
			expectError: false,
		},
		{
			name:          "user with zero ID",
			secretKey:     "valid-secret",
			tokenDuration: 1,
			user: &models.User{
				ID:       0,
				Username: "zerouser",
				IsAdmin:  false,
			},
			expectError: false, // Zero ID should be allowed
		},
		{
			name:          "user with negative ID",
			secretKey:     "valid-secret",
			tokenDuration: 1,
			user: &models.User{
				ID:       -1,
				Username: "negativeuser",
				IsAdmin:  false,
			},
			expectError: false, // Negative ID should be allowed
		},
		{
			name:          "empty username",
			secretKey:     "valid-secret",
			tokenDuration: 1,
			user: &models.User{
				ID:       3,
				Username: "",
				IsAdmin:  false,
			},
			expectError: false, // Empty username should be allowed
		},
		{
			name:          "very long username",
			secretKey:     "valid-secret",
			tokenDuration: 1,
			user: &models.User{
				ID:       4,
				Username: string(make([]byte, 1000)), // Very long username
				IsAdmin:  false,
			},
			expectError: false, // Long username should be allowed
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			manager := NewJWTManager(tt.secretKey, tt.tokenDuration)

			tokenString, expiresAt, err := manager.GenerateToken(tt.user)

			if tt.expectError {
				assert.Error(t, err)
				if tt.errorContains != "" {
					assert.Contains(t, err.Error(), tt.errorContains)
				}
				assert.Empty(t, tokenString)
				assert.True(t, expiresAt.IsZero())
			} else {
				assert.NoError(t, err)
				assert.NotEmpty(t, tokenString)
				assert.False(t, expiresAt.IsZero())

				// Validate the generated token
				claims, err := manager.ValidateToken(tokenString)
				assert.NoError(t, err)
				assert.Equal(t, tt.user.ID, claims.UserID)
				assert.Equal(t, tt.user.Username, claims.Username)
				assert.Equal(t, tt.user.IsAdmin, claims.IsAdmin)
			}
		})
	}
}

func TestJWTManager_DifferentDurations(t *testing.T) {
	user := &models.User{
		ID:       123,
		Username: "testuser",
		IsAdmin:  false,
	}

	durations := []int{1, 6, 12, 24, 168, 720} // hours

	for _, duration := range durations {
		t.Run(fmt.Sprintf("duration_%d_hours", duration), func(t *testing.T) {
			manager := NewJWTManager("test-secret", duration)

			tokenString, expiresAt, err := manager.GenerateToken(user)

			require.NoError(t, err)
			assert.NotEmpty(t, tokenString)

			expectedExpiry := time.Now().Add(time.Duration(duration) * time.Hour)
			// Allow 1 second tolerance for timing differences
			assert.WithinDuration(t, expectedExpiry, expiresAt, time.Second)

			// Verify token can be validated
			claims, err := manager.ValidateToken(tokenString)
			require.NoError(t, err)
			assert.Equal(t, user.ID, claims.UserID)
		})
	}
}