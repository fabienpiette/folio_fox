package middleware

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/fabienpiette/folio_fox/internal/auth"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/repositories"
)

// AuthRequired creates a middleware that requires authentication
func AuthRequired(userRepo repositories.UserRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get the Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"type":      "https://api.foliofox.local/problems/unauthorized",
				"title":     "Unauthorized",
				"status":    http.StatusUnauthorized,
				"detail":    "Authorization header is required",
				"instance":  c.Request.URL.Path,
				"timestamp": "2025-07-28T10:30:00Z",
			})
			c.Abort()
			return
		}

		// Check if it's a Bearer token
		tokenParts := strings.SplitN(authHeader, " ", 2)
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"type":      "https://api.foliofox.local/problems/unauthorized",
				"title":     "Unauthorized",
				"status":    http.StatusUnauthorized,
				"detail":    "Invalid authorization header format",
				"instance":  c.Request.URL.Path,
				"timestamp": "2025-07-28T10:30:00Z",
			})
			c.Abort()
			return
		}

		token := tokenParts[1]

		// Validate the token
		userID, username, isAdmin, err := auth.ValidateJWT(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"type":      "https://api.foliofox.local/problems/unauthorized",
				"title":     "Unauthorized",
				"status":    http.StatusUnauthorized,
				"detail":    "Invalid or expired token",
				"instance":  c.Request.URL.Path,
				"timestamp": "2025-07-28T10:30:00Z",
			})
			c.Abort()
			return
		}

		// Store user information in context
		c.Set("user_id", userID)
		c.Set("username", username)
		c.Set("is_admin", isAdmin)

		c.Next()
	}
}

// AdminRequired creates a middleware that requires admin privileges
func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		isAdmin, exists := c.Get("is_admin")
		if !exists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{
				"type":      "https://api.foliofox.local/problems/forbidden",
				"title":     "Forbidden",
				"status":    http.StatusForbidden,
				"detail":    "Admin privileges required",
				"instance":  c.Request.URL.Path,
				"timestamp": "2025-07-28T10:30:00Z",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// OptionalAuth creates a middleware that optionally authenticates users
func OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		tokenParts := strings.SplitN(authHeader, " ", 2)
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			c.Next()
			return
		}

		token := tokenParts[1]
		userID, username, isAdmin, err := auth.ValidateJWT(token)
		if err != nil {
			c.Next()
			return
		}

		// Store user information in context
		c.Set("user_id", userID)
		c.Set("username", username)
		c.Set("is_admin", isAdmin)

		c.Next()
	}
}

// GetCurrentUser retrieves the current user from the Gin context
func GetCurrentUser(c *gin.Context) (*models.User, error) {
	userID, exists := c.Get("user_id")
	if !exists {
		return nil, models.ErrUserNotFound
	}

	username, _ := c.Get("username")
	isAdmin, _ := c.Get("is_admin")

	return &models.User{
		ID:       userID.(int64),
		Username: username.(string),
		IsAdmin:  isAdmin.(bool),
	}, nil
}

// GetCurrentUserID retrieves the current user ID from the Gin context
func GetCurrentUserID(c *gin.Context) (int64, error) {
	userID, exists := c.Get("user_id")
	if !exists {
		return 0, models.ErrUserNotFound
	}

	return userID.(int64), nil
}

// RequireUserOrAdmin middleware ensures the user can only access their own resources or is an admin
func RequireUserOrAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"type":      "https://api.foliofox.local/problems/unauthorized",
				"title":     "Unauthorized",
				"status":    http.StatusUnauthorized,
				"detail":    "Authentication required",
				"instance":  c.Request.URL.Path,
				"timestamp": "2025-07-28T10:30:00Z",
			})
			c.Abort()
			return
		}

		isAdmin, _ := c.Get("is_admin")
		if isAdmin.(bool) {
			c.Next() // Admin can access everything
			return
		}

		// Check if the requested user_id matches the current user
		requestedUserIDStr := c.Param("user_id")
		if requestedUserIDStr == "" {
			// If no user_id in path, allow access (they're accessing their own data)
			c.Next()
			return
		}

		requestedUserID, err := strconv.ParseInt(requestedUserIDStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"type":      "https://api.foliofox.local/problems/bad-request",
				"title":     "Bad Request",
				"status":    http.StatusBadRequest,
				"detail":    "Invalid user ID format",
				"instance":  c.Request.URL.Path,
				"timestamp": "2025-07-28T10:30:00Z",
			})
			c.Abort()
			return
		}

		if currentUserID.(int64) != requestedUserID {
			c.JSON(http.StatusForbidden, gin.H{
				"type":      "https://api.foliofox.local/problems/forbidden",
				"title":     "Forbidden",
				"status":    http.StatusForbidden,
				"detail":    "You can only access your own resources",
				"instance":  c.Request.URL.Path,
				"timestamp": "2025-07-28T10:30:00Z",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}