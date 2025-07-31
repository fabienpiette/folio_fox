package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/services"
)

// SearchHandler handles search-related endpoints
type SearchHandler struct {
	container *services.Container
}

// NewSearchHandler creates a new search handler
func NewSearchHandler(container *services.Container) *SearchHandler {
	return &SearchHandler{
		container: container,
	}
}

// Search performs a multi-indexer search
func (h *SearchHandler) Search(c *gin.Context) {
	// Extract user ID from context (set by auth middleware)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse query parameters
	query := c.Query("query")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter is required"})
		return
	}

	// Build search request
	request := &models.SearchRequest{
		Query:    query,
		UseCache: true,
		Timeout:  30,
		Limit:    50,
	}

	// Parse optional parameters
	if indexers := c.Query("indexers"); indexers != "" {
		// Parse comma-separated indexer IDs
		for _, indexerStr := range strings.Split(indexers, ",") {
			if indexerID, err := strconv.ParseInt(strings.TrimSpace(indexerStr), 10, 64); err == nil {
				request.Indexers = append(request.Indexers, indexerID)
			}
		}
	}

	if formats := c.Query("formats"); formats != "" {
		// Parse comma-separated formats
		for _, format := range strings.Split(formats, ",") {
			request.Formats = append(request.Formats, strings.TrimSpace(format))
		}
	}

	if languages := c.Query("languages"); languages != "" {
		// Parse comma-separated language codes
		for _, lang := range strings.Split(languages, ",") {
			request.Languages = append(request.Languages, strings.TrimSpace(lang))
		}
	}

	if minQuality := c.Query("min_quality"); minQuality != "" {
		if quality, err := strconv.Atoi(minQuality); err == nil {
			request.MinQuality = quality
		}
	}

	if maxSize := c.Query("max_size_mb"); maxSize != "" {
		if size, err := strconv.Atoi(maxSize); err == nil {
			request.MaxSizeMB = size
		}
	}

	if timeout := c.Query("timeout"); timeout != "" {
		if t, err := strconv.Atoi(timeout); err == nil && t >= 5 && t <= 60 {
			request.Timeout = t
		}
	}

	if limit := c.Query("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l >= 1 && l <= 100 {
			request.Limit = l
		}
	}

	if useCache := c.Query("use_cache"); useCache == "false" {
		request.UseCache = false
	}

	// Perform search
	searchService := h.container.GetSearchService()
	if searchService == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search service not available"})
		return
	}

	response, err := searchService.Search(c.Request.Context(), userID.(int64), request)
	if err != nil {
		h.container.GetLogger().Errorf("Search failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Search failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetSuggestions returns search suggestions
func (h *SearchHandler) GetSuggestions(c *gin.Context) {
	// Extract user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse query parameters
	query := c.Query("query")
	if len(query) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query must be at least 2 characters"})
		return
	}

	suggestionType := c.DefaultQuery("type", "all")
	limit := 10
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed >= 1 && parsed <= 20 {
			limit = parsed
		}
	}

	// Get suggestions
	searchService := h.container.GetSearchService()
	if searchService == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search service not available"})
		return
	}

	suggestions, err := searchService.GetSuggestions(c.Request.Context(), userID.(int64), query, suggestionType, limit)
	if err != nil {
		h.container.GetLogger().Errorf("Failed to get suggestions: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get suggestions",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"suggestions": suggestions,
	})
}

// GetHistory returns user's search history
func (h *SearchHandler) GetHistory(c *gin.Context) {
	// Extract user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse query parameters
	limit := 20
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed >= 1 && parsed <= 100 {
			limit = parsed
		}
	}

	days := 30
	if d := c.Query("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed >= 1 && parsed <= 365 {
			days = parsed
		}
	}

	// Get search history
	searchRepo := h.container.GetSearchRepository()
	if searchRepo == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search repository not available"})
		return
	}

	history, err := searchRepo.GetUserSearchHistory(c.Request.Context(), userID.(int64), limit, days)
	if err != nil {
		h.container.GetLogger().Errorf("Failed to get search history: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get search history",
			"details": err.Error(),
		})
		return
	}

	// Calculate statistics
	totalSearches := len(history)
	uniqueQueries := make(map[string]bool)
	for _, entry := range history {
		uniqueQueries[entry.Query] = true
	}

	c.JSON(http.StatusOK, gin.H{
		"history":        history,
		"total_searches": totalSearches,
		"unique_queries": len(uniqueQueries),
	})
}

// ClearHistory clears user's search history
func (h *SearchHandler) ClearHistory(c *gin.Context) {
	// Extract user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse optional days parameter
	var olderThanDays *int
	if d := c.Query("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed >= 1 {
			olderThanDays = &parsed
		}
	}

	// Clear search history
	searchRepo := h.container.GetSearchRepository()
	if searchRepo == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search repository not available"})
		return
	}

	err := searchRepo.DeleteUserSearchHistory(c.Request.Context(), userID.(int64), olderThanDays)
	if err != nil {
		h.container.GetLogger().Errorf("Failed to clear search history: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to clear search history",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}