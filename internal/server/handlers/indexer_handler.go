package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/services"
)

// IndexerHandler handles indexer management endpoints
type IndexerHandler struct {
	container *services.Container
}

// NewIndexerHandler creates a new indexer handler
func NewIndexerHandler(container *services.Container) *IndexerHandler {
	return &IndexerHandler{
		container: container,
	}
}

// CreateIndexerRequest represents the request payload for creating an indexer
type CreateIndexerRequest struct {
	Name               string                `json:"name" binding:"required"`
	BaseURL            string                `json:"base_url" binding:"required"`
	APIEndpoint        *string               `json:"api_endpoint,omitempty"`
	IndexerType        models.IndexerType    `json:"indexer_type" binding:"required"`
	SupportsSearch     bool                  `json:"supports_search"`
	SupportsDownload   bool                  `json:"supports_download"`
	IsActive           bool                  `json:"is_active"`
	Priority           int                   `json:"priority"`
	RateLimitRequests  int                   `json:"rate_limit_requests"`
	RateLimitWindow    int                   `json:"rate_limit_window"`
	TimeoutSeconds     int                   `json:"timeout_seconds"`
	UserAgent          *string               `json:"user_agent,omitempty"`
	Description        *string               `json:"description,omitempty"`
	Website            *string               `json:"website,omitempty"`
}

// UpdateIndexerConfigRequest represents the request payload for updating user indexer config
type UpdateIndexerConfigRequest struct {
	IsEnabled       bool    `json:"is_enabled"`
	APIKey          *string `json:"api_key,omitempty"`
	Username        *string `json:"username,omitempty"`
	Password        *string `json:"password,omitempty"`
	CustomSettings  *string `json:"custom_settings,omitempty"`
}

// IndexerResponse represents the response format for indexer data
type IndexerResponse struct {
	*models.Indexer
	UserConfig *models.UserIndexerConfig `json:"user_config,omitempty"`
}

// ListIndexers lists available indexers for the authenticated user
func (h *IndexerHandler) ListIndexers(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	uid, ok := userID.(int64)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID"})
		return
	}
	
	// Get all active indexers
	indexers, err := h.container.GetIndexerRepository().List(c.Request.Context(), true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch indexers"})
		return
	}
	
	// Get user configs for each indexer
	var response []IndexerResponse
	for _, indexer := range indexers {
		userConfig, err := h.container.GetIndexerRepository().GetUserConfig(c.Request.Context(), uid, indexer.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user configuration"})
			return
		}
		
		// Mask sensitive data in response
		if userConfig != nil && userConfig.APIKey != nil {
			maskedKey := "***" + (*userConfig.APIKey)[len(*userConfig.APIKey)-4:]
			userConfig.APIKey = &maskedKey
		}
		
		response = append(response, IndexerResponse{
			Indexer:    indexer,
			UserConfig: userConfig,
		})
	}
	
	c.JSON(http.StatusOK, gin.H{
		"indexers": response,
		"total":    len(response),
	})
}

// GetIndexer gets a specific indexer with user configuration
func (h *IndexerHandler) GetIndexer(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	uid, ok := userID.(int64)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID"})
		return
	}
	
	indexerIDStr := c.Param("id")
	indexerID, err := strconv.ParseInt(indexerIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid indexer ID"})
		return
	}
	
	// Get indexer
	indexer, err := h.container.GetIndexerRepository().GetByID(c.Request.Context(), indexerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch indexer"})
		return
	}
	
	if indexer == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Indexer not found"})
		return
	}
	
	// Get user config
	userConfig, err := h.container.GetIndexerRepository().GetUserConfig(c.Request.Context(), uid, indexerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user configuration"})
		return
	}
	
	// Mask sensitive data
	if userConfig != nil && userConfig.APIKey != nil {
		maskedKey := "***" + (*userConfig.APIKey)[len(*userConfig.APIKey)-4:]
		userConfig.APIKey = &maskedKey
	}
	
	response := IndexerResponse{
		Indexer:    indexer,
		UserConfig: userConfig,
	}
	
	c.JSON(http.StatusOK, response)
}

// CreateIndexer creates a new indexer (admin only)
func (h *IndexerHandler) CreateIndexer(c *gin.Context) {
	// Check if user is admin
	isAdmin, exists := c.Get("is_admin")
	if !exists || !isAdmin.(bool) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
		return
	}
	
	var req CreateIndexerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Create indexer model
	indexer := &models.Indexer{
		Name:               req.Name,
		BaseURL:            req.BaseURL,
		APIEndpoint:        req.APIEndpoint,
		IndexerType:        req.IndexerType,
		SupportsSearch:     req.SupportsSearch,
		SupportsDownload:   req.SupportsDownload,
		IsActive:           req.IsActive,
		Priority:           req.Priority,
		RateLimitRequests:  req.RateLimitRequests,
		RateLimitWindow:    req.RateLimitWindow,
		TimeoutSeconds:     req.TimeoutSeconds,
		UserAgent:          req.UserAgent,
		Description:        req.Description,
		Website:            req.Website,
	}
	
	// Set defaults
	if indexer.Priority == 0 {
		indexer.Priority = 1
	}
	if indexer.RateLimitRequests == 0 {
		indexer.RateLimitRequests = 60
	}
	if indexer.RateLimitWindow == 0 {
		indexer.RateLimitWindow = 60
	}
	if indexer.TimeoutSeconds == 0 {
		indexer.TimeoutSeconds = 30
	}
	
	err := h.container.GetIndexerRepository().Create(c.Request.Context(), indexer)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create indexer"})
		return
	}
	
	c.JSON(http.StatusCreated, indexer)
}

// UpdateIndexer updates an existing indexer (admin only)
func (h *IndexerHandler) UpdateIndexer(c *gin.Context) {
	// Check if user is admin
	isAdmin, exists := c.Get("is_admin")
	if !exists || !isAdmin.(bool) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
		return
	}
	
	indexerIDStr := c.Param("id")
	indexerID, err := strconv.ParseInt(indexerIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid indexer ID"})
		return
	}
	
	var req CreateIndexerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Get existing indexer
	indexer, err := h.container.GetIndexerRepository().GetByID(c.Request.Context(), indexerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch indexer"})
		return
	}
	
	if indexer == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Indexer not found"})
		return
	}
	
	// Update fields
	indexer.Name = req.Name
	indexer.BaseURL = req.BaseURL
	indexer.APIEndpoint = req.APIEndpoint
	indexer.IndexerType = req.IndexerType
	indexer.SupportsSearch = req.SupportsSearch
	indexer.SupportsDownload = req.SupportsDownload
	indexer.IsActive = req.IsActive
	indexer.Priority = req.Priority
	indexer.RateLimitRequests = req.RateLimitRequests
	indexer.RateLimitWindow = req.RateLimitWindow
	indexer.TimeoutSeconds = req.TimeoutSeconds
	indexer.UserAgent = req.UserAgent
	indexer.Description = req.Description
	indexer.Website = req.Website
	
	err = h.container.GetIndexerRepository().Update(c.Request.Context(), indexer)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update indexer"})
		return
	}
	
	c.JSON(http.StatusOK, indexer)
}

// DeleteIndexer deletes an indexer (admin only)
func (h *IndexerHandler) DeleteIndexer(c *gin.Context) {
	// Check if user is admin
	isAdmin, exists := c.Get("is_admin")
	if !exists || !isAdmin.(bool) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
		return
	}
	
	indexerIDStr := c.Param("id")
	indexerID, err := strconv.ParseInt(indexerIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid indexer ID"})
		return
	}
	
	err = h.container.GetIndexerRepository().Delete(c.Request.Context(), indexerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete indexer"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Indexer deleted successfully"})
}

// UpdateConfig updates user-specific indexer configuration
func (h *IndexerHandler) UpdateConfig(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	uid, ok := userID.(int64)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID"})
		return
	}
	
	indexerIDStr := c.Param("id")
	indexerID, err := strconv.ParseInt(indexerIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid indexer ID"})
		return
	}
	
	var req UpdateIndexerConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Verify indexer exists
	indexer, err := h.container.GetIndexerRepository().GetByID(c.Request.Context(), indexerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch indexer"})
		return
	}
	
	if indexer == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Indexer not found"})
		return
	}
	
	// Create or update user config
	config := &models.UserIndexerConfig{
		UserID:       uid,
		IndexerID:    indexerID,
		IsEnabled:    req.IsEnabled,
		APIKey:       req.APIKey,
		Username:     req.Username,
		CustomSettings: req.CustomSettings,
	}
	
	// Hash password if provided
	if req.Password != nil && *req.Password != "" {
		// TODO: Implement password hashing
		// For now, storing plain text (should be hashed in production)
		config.PasswordHash = req.Password
	}
	
	err = h.container.GetIndexerRepository().UpdateUserConfig(c.Request.Context(), config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update configuration"})
		return
	}
	
	// Return updated config (masked)
	if config.APIKey != nil {
		maskedKey := "***" + (*config.APIKey)[len(*config.APIKey)-4:]
		config.APIKey = &maskedKey
	}
	
	c.JSON(http.StatusOK, config)
}

// TestIndexer tests an indexer connection
func (h *IndexerHandler) TestIndexer(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	uid, ok := userID.(int64)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID"})
		return
	}
	
	indexerIDStr := c.Param("id")
	indexerID, err := strconv.ParseInt(indexerIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid indexer ID"})
		return
	}
	
	// Get indexer and user config
	indexer, err := h.container.GetIndexerRepository().GetByID(c.Request.Context(), indexerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch indexer"})
		return
	}
	
	if indexer == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Indexer not found"})
		return
	}
	
	userConfig, err := h.container.GetIndexerRepository().GetUserConfig(c.Request.Context(), uid, indexerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user configuration"})
		return
	}
	
	// TODO: Implement actual indexer testing logic
	// For now, return a mock successful test
	testResult := &models.IndexerTestResult{
		IndexerID:      indexerID,
		Success:        true,
		ResponseTimeMS: 200,
		Capabilities:   []string{"search", "download"},
		Version:        nil,
	}
	
	// Record health check
	health := &models.IndexerHealth{
		IndexerID:      indexerID,
		Status:         models.IndexerStatusHealthy,
		ResponseTimeMS: &testResult.ResponseTimeMS,
		ErrorMessage:   nil,
	}
	
	err = h.container.GetIndexerRepository().RecordHealthCheck(c.Request.Context(), health)
	if err != nil {
		// Log error but don't fail the test
		// TODO: Add proper logging
	}
	
	// Update test result in user config
	if userConfig != nil {
		now := time.Now()
		userConfig.LastTestDate = &now
		userConfig.LastTestSuccess = &testResult.Success
		
		err = h.container.GetIndexerRepository().UpdateUserConfig(c.Request.Context(), userConfig)
		if err != nil {
			// Log error but don't fail the test
		}
	}
	
	c.JSON(http.StatusOK, testResult)
}

// GetIndexerHealth gets indexer health status
func (h *IndexerHandler) GetIndexerHealth(c *gin.Context) {
	indexerIDStr := c.Param("id")
	indexerID, err := strconv.ParseInt(indexerIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid indexer ID"})
		return
	}
	
	health, err := h.container.GetIndexerRepository().GetLatestHealth(c.Request.Context(), indexerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch health status"})
		return
	}
	
	if health == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No health data available"})
		return
	}
	
	c.JSON(http.StatusOK, health)
}