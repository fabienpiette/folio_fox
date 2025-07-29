package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/fabienpiette/folio_fox/internal/models"
)

// JWTClaims represents the JWT claims structure
type JWTClaims struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
	jwt.RegisteredClaims
}

// JWTManager handles JWT token creation and validation
type JWTManager struct {
	secretKey     string
	tokenDuration time.Duration
}

// NewJWTManager creates a new JWT manager instance
func NewJWTManager(secretKey string, tokenDurationHours int) *JWTManager {
	return &JWTManager{
		secretKey:     secretKey,
		tokenDuration: time.Duration(tokenDurationHours) * time.Hour,
	}
}

// GenerateToken generates a JWT token for a user
func (m *JWTManager) GenerateToken(user *models.User) (string, time.Time, error) {
	expiresAt := time.Now().Add(m.tokenDuration)
	
	claims := &JWTClaims{
		UserID:   user.ID,
		Username: user.Username,
		IsAdmin:  user.IsAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", user.ID),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "foliofox",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(m.secretKey))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, expiresAt, nil
}

// ValidateToken validates a JWT token and returns the claims
func (m *JWTManager) ValidateToken(tokenString string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(m.secretKey), nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		// Additional validation
		if claims.ExpiresAt.Before(time.Now()) {
			return nil, fmt.Errorf("token has expired")
		}
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

// RefreshToken creates a new token with extended expiration if the current token is still valid
func (m *JWTManager) RefreshToken(tokenString string) (string, time.Time, error) {
	claims, err := m.ValidateToken(tokenString)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("invalid token for refresh: %w", err)
	}

	// Check if token is within refresh window (e.g., not expired and issued within last 7 days)
	if time.Since(claims.IssuedAt.Time) > 7*24*time.Hour {
		return "", time.Time{}, fmt.Errorf("token too old for refresh")
	}

	// Create new token with same claims but new expiration
	expiresAt := time.Now().Add(m.tokenDuration)
	newClaims := &JWTClaims{
		UserID:   claims.UserID,
		Username: claims.Username,
		IsAdmin:  claims.IsAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   claims.Subject,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "foliofox",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, newClaims)
	newTokenString, err := token.SignedString([]byte(m.secretKey))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("failed to sign refreshed token: %w", err)
	}

	return newTokenString, expiresAt, nil
}