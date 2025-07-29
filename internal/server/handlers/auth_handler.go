package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/foliofox/foliofox/internal/auth"
	"github.com/foliofox/foliofox/internal/models"
	"github.com/foliofox/foliofox/internal/services"
)

// AuthHandler handles authentication endpoints
type AuthHandler struct {
	container *services.Container
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(container *services.Container) *AuthHandler {
	return &AuthHandler{
		container: container,
	}
}

// LoginRequest represents a login request
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse represents a login response
type LoginResponse struct {
	AccessToken string      `json:"access_token"`
	TokenType   string      `json:"token_type"`
	ExpiresIn   int         `json:"expires_in"`
	User        *models.User `json:"user"`
}

// RefreshRequest represents a token refresh request
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// Login handles user login
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	// Get user repository
	userRepo := h.container.GetUserRepository()
	if userRepo == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "User repository not available",
		})
		return
	}

	// Find user by username
	user, err := userRepo.GetByUsername(c.Request.Context(), req.Username)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid credentials",
		})
		return
	}

	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid credentials",
		})
		return
	}

	// Verify password
	if !auth.VerifyPassword(req.Password, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid credentials",
		})
		return
	}

	// Check if user is active
	if !user.IsActive {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Account is disabled",
		})
		return
	}

	// Generate JWT token
	tokenString, expiresIn, err := auth.GenerateJWT(user.ID, user.Username, user.IsAdmin)
	if err != nil {
		h.container.GetLogger().Errorf("Failed to generate JWT: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to generate authentication token",
		})
		return
	}

	// Update last login time
	if err := userRepo.UpdateLastLogin(c.Request.Context(), user.ID, time.Now()); err != nil {
		h.container.GetLogger().Warnf("Failed to update last login time: %v", err)
	}

	// Remove sensitive information from user object
	user.PasswordHash = ""

	// Return response
	response := LoginResponse{
		AccessToken: tokenString,
		TokenType:   "Bearer",
		ExpiresIn:   expiresIn,
		User:        user,
	}

	c.JSON(http.StatusOK, response)
}

// RefreshToken handles token refresh
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	// Validate refresh token (simplified implementation)
	// In a real implementation, you'd store refresh tokens and validate them
	userID, username, isAdmin, err := auth.ValidateJWT(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid refresh token",
		})
		return
	}

	// Generate new access token
	newToken, expiresIn, err := auth.GenerateJWT(userID, username, isAdmin)
	if err != nil {
		h.container.GetLogger().Errorf("Failed to generate JWT: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to generate authentication token",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token": newToken,
		"expires_in":   expiresIn,
	})
}