package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/repositories"
	"github.com/fabienpiette/folio_fox/internal/services"
)

// DownloadHandler handles download-related endpoints
type DownloadHandler struct {
	container *services.Container
}

// NewDownloadHandler creates a new download handler
func NewDownloadHandler(container *services.Container) *DownloadHandler {
	return &DownloadHandler{
		container: container,
	}
}

// GetQueue returns the download queue
func (h *DownloadHandler) GetQueue(c *gin.Context) {
	// Extract user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse query parameters
	filters := &repositories.DownloadQueueFilters{
		SortBy:    "priority",
		SortOrder: "asc",
		Limit:     50,
		Offset:    0,
	}

	// Apply user filter for non-admin users
	isAdmin, _ := c.Get("is_admin")
	if !isAdmin.(bool) {
		uid := userID.(int64)
		filters.UserID = &uid
	}

	// Parse additional filters
	if status := c.Query("status"); status != "" {
		downloadStatus := models.DownloadStatus(status)
		filters.Status = &downloadStatus
	}

	if priorityMin := c.Query("priority_min"); priorityMin != "" {
		if p, err := strconv.Atoi(priorityMin); err == nil {
			filters.PriorityMin = &p
		}
	}

	if priorityMax := c.Query("priority_max"); priorityMax != "" {
		if p, err := strconv.Atoi(priorityMax); err == nil {
			filters.PriorityMax = &p
		}
	}

	if createdAfter := c.Query("created_after"); createdAfter != "" {
		if t, err := time.Parse(time.RFC3339, createdAfter); err == nil {
			filters.CreatedAfter = &t
		}
	}

	if createdBefore := c.Query("created_before"); createdBefore != "" {
		if t, err := time.Parse(time.RFC3339, createdBefore); err == nil {
			filters.CreatedBefore = &t
		}
	}

	if page := c.Query("page"); page != "" {
		if p, err := strconv.Atoi(page); err == nil && p >= 1 {
			filters.Offset = (p - 1) * filters.Limit
		}
	}

	if limit := c.Query("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l >= 1 && l <= 100 {
			filters.Limit = l
		}
	}

	// Get downloads
	downloadRepo := h.container.GetDownloadRepository()
	if downloadRepo == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Download repository not available"})
		return
	}

	downloads, total, err := downloadRepo.ListQueueItems(c.Request.Context(), filters)
	if err != nil {
		h.container.GetLogger().Errorf("Failed to get download queue: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get download queue",
			"details": err.Error(),
		})
		return
	}

	// Calculate pagination info
	currentPage := (filters.Offset / filters.Limit) + 1
	totalPages := (total + filters.Limit - 1) / filters.Limit

	// Calculate queue statistics
	queueStats := map[string]interface{}{
		"total_items": total,
		// Additional stats would be calculated here
	}

	c.JSON(http.StatusOK, gin.H{
		"downloads": downloads,
		"pagination": gin.H{
			"current_page": currentPage,
			"per_page":     filters.Limit,
			"total_pages":  totalPages,
			"total_items":  total,
		},
		"queue_stats": queueStats,
	})
}

// AddToQueue adds a new download to the queue
func (h *DownloadHandler) AddToQueue(c *gin.Context) {
	// Extract user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse request body
	var request models.DownloadCreateRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	// Add download
	downloadManager := h.container.GetDownloadManager()
	if downloadManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Download manager not available"})
		return
	}

	download, err := downloadManager.AddDownload(c.Request.Context(), &request, userID.(int64))
	if err != nil {
		h.container.GetLogger().Errorf("Failed to add download: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to add download",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, download)
}

// GetDownload returns details for a specific download
func (h *DownloadHandler) GetDownload(c *gin.Context) {
	// Parse download ID
	downloadID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid download ID"})
		return
	}

	// Get download
	downloadRepo := h.container.GetDownloadRepository()
	if downloadRepo == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Download repository not available"})
		return
	}

	download, err := downloadRepo.GetQueueItemByID(c.Request.Context(), downloadID)
	if err != nil {
		h.container.GetLogger().Errorf("Failed to get download: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get download",
			"details": err.Error(),
		})
		return
	}

	if download == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Download not found"})
		return
	}

	// Check permission (users can only see their own downloads unless admin)
	userID, _ := c.Get("user_id")
	isAdmin, _ := c.Get("is_admin")
	if !isAdmin.(bool) && download.UserID != userID.(int64) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	c.JSON(http.StatusOK, download)
}

// UpdateDownload updates a download's properties
func (h *DownloadHandler) UpdateDownload(c *gin.Context) {
	// Parse download ID
	downloadID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid download ID"})
		return
	}

	// Parse request body
	var request models.DownloadUpdateRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	// Get existing download to check permissions
	downloadRepo := h.container.GetDownloadRepository()
	if downloadRepo == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Download repository not available"})
		return
	}

	download, err := downloadRepo.GetQueueItemByID(c.Request.Context(), downloadID)
	if err != nil || download == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Download not found"})
		return
	}

	// Check permission
	userID, _ := c.Get("user_id")
	isAdmin, _ := c.Get("is_admin")
	if !isAdmin.(bool) && download.UserID != userID.(int64) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	// Update download properties
	if request.Priority != nil {
		download.Priority = *request.Priority
	}
	if request.DownloadPath != nil {
		download.DownloadPath = request.DownloadPath
	}
	if request.QualityProfileID != nil {
		download.QualityProfileID = request.QualityProfileID
	}
	if request.MaxRetries != nil {
		download.MaxRetries = *request.MaxRetries
	}

	// Save changes
	if err := downloadRepo.UpdateQueueItem(c.Request.Context(), download); err != nil {
		h.container.GetLogger().Errorf("Failed to update download: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update download",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, download)
}

// CancelDownload cancels a download
func (h *DownloadHandler) CancelDownload(c *gin.Context) {
	// Parse download ID
	downloadID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid download ID"})
		return
	}

	deletePartial := c.DefaultQuery("delete_partial", "true") == "true"

	// Cancel download
	downloadManager := h.container.GetDownloadManager()
	if downloadManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Download manager not available"})
		return
	}

	if err := downloadManager.CancelDownload(c.Request.Context(), downloadID, deletePartial); err != nil {
		h.container.GetLogger().Errorf("Failed to cancel download: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to cancel download",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

// PauseDownload pauses a download
func (h *DownloadHandler) PauseDownload(c *gin.Context) {
	// Parse download ID
	downloadID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid download ID"})
		return
	}

	// Pause download
	downloadManager := h.container.GetDownloadManager()
	if downloadManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Download manager not available"})
		return
	}

	if err := downloadManager.PauseDownload(c.Request.Context(), downloadID); err != nil {
		h.container.GetLogger().Errorf("Failed to pause download: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Failed to pause download",
			"details": err.Error(),
		})
		return
	}

	// Get updated download
	downloadRepo := h.container.GetDownloadRepository()
	download, _ := downloadRepo.GetQueueItemByID(c.Request.Context(), downloadID)

	c.JSON(http.StatusOK, download)
}

// ResumeDownload resumes a paused download
func (h *DownloadHandler) ResumeDownload(c *gin.Context) {
	// Parse download ID
	downloadID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid download ID"})
		return
	}

	// Resume download
	downloadManager := h.container.GetDownloadManager()
	if downloadManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Download manager not available"})
		return
	}

	if err := downloadManager.ResumeDownload(c.Request.Context(), downloadID); err != nil {
		h.container.GetLogger().Errorf("Failed to resume download: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Failed to resume download",
			"details": err.Error(),
		})
		return
	}

	// Get updated download
	downloadRepo := h.container.GetDownloadRepository()
	download, _ := downloadRepo.GetQueueItemByID(c.Request.Context(), downloadID)

	c.JSON(http.StatusOK, download)
}

// RetryDownload retries a failed download
func (h *DownloadHandler) RetryDownload(c *gin.Context) {
	// Parse download ID
	downloadID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid download ID"})
		return
	}

	// Retry download
	downloadManager := h.container.GetDownloadManager()
	if downloadManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Download manager not available"})
		return
	}

	if err := downloadManager.RetryDownload(c.Request.Context(), downloadID); err != nil {
		h.container.GetLogger().Errorf("Failed to retry download: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Failed to retry download",
			"details": err.Error(),
		})
		return
	}

	// Get updated download
	downloadRepo := h.container.GetDownloadRepository()
	download, _ := downloadRepo.GetQueueItemByID(c.Request.Context(), downloadID)

	c.JSON(http.StatusOK, download)
}

// BatchOperation performs batch operations on multiple downloads
func (h *DownloadHandler) BatchOperation(c *gin.Context) {
	// Parse request body
	var request struct {
		Action      string  `json:"action" binding:"required"`
		DownloadIDs []int64 `json:"download_ids" binding:"required"`
		Options     struct {
			DeletePartial bool `json:"delete_partial"`
		} `json:"options"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	if len(request.DownloadIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No download IDs provided"})
		return
	}

	if len(request.DownloadIDs) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Too many downloads (max 100)"})
		return
	}

	// Get download manager
	downloadManager := h.container.GetDownloadManager()
	if downloadManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Download manager not available"})
		return
	}

	// Perform batch operation
	results := make([]map[string]interface{}, len(request.DownloadIDs))
	successCount := 0
	failedCount := 0

	for i, downloadID := range request.DownloadIDs {
		var err error
		
		switch request.Action {
		case "pause":
			err = downloadManager.PauseDownload(c.Request.Context(), downloadID)
		case "resume":
			err = downloadManager.ResumeDownload(c.Request.Context(), downloadID)
		case "cancel", "delete":
			err = downloadManager.CancelDownload(c.Request.Context(), downloadID, request.Options.DeletePartial)
		case "retry":
			err = downloadManager.RetryDownload(c.Request.Context(), downloadID)
		default:
			err = fmt.Errorf("unknown action: %s", request.Action)
		}

		results[i] = map[string]interface{}{
			"download_id": downloadID,
			"success":     err == nil,
		}

		if err != nil {
			results[i]["error"] = err.Error()
			failedCount++
		} else {
			successCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success_count": successCount,
		"failed_count":  failedCount,
		"results":       results,
	})
}

// GetHistory returns download history
func (h *DownloadHandler) GetHistory(c *gin.Context) {
	// Implementation similar to GetQueue but for history
	c.JSON(http.StatusOK, gin.H{
		"history": []interface{}{},
		"pagination": gin.H{
			"current_page": 1,
			"per_page":     50,
			"total_pages":  0,
			"total_items":  0,
		},
	})
}

// GetStats returns download statistics
func (h *DownloadHandler) GetStats(c *gin.Context) {
	// Extract user ID for non-admin users
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	isAdmin, _ := c.Get("is_admin")
	var userIDPtr *int64
	if !isAdmin.(bool) {
		uid := userID.(int64)
		userIDPtr = &uid
	}

	period := c.DefaultQuery("period", "month")

	// Get statistics
	downloadRepo := h.container.GetDownloadRepository()
	if downloadRepo == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Download repository not available"})
		return
	}

	stats, err := downloadRepo.GetDownloadStats(c.Request.Context(), userIDPtr, period)
	if err != nil {
		h.container.GetLogger().Errorf("Failed to get download stats: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get download statistics",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, stats)
}