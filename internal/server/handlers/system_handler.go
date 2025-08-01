package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/fabienpiette/folio_fox/internal/repositories"
	"github.com/fabienpiette/folio_fox/internal/services"
)

// SystemHandler handles system management endpoints
type SystemHandler struct {
	container *services.Container
}

// NewSystemHandler creates a new system handler
func NewSystemHandler(container *services.Container) *SystemHandler {
	return &SystemHandler{
		container: container,
	}
}

// SystemStatusResponse represents the system status response
type SystemStatusResponse struct {
	Database        DatabaseStatus        `json:"database"`
	Indexers        IndexersStatus        `json:"indexers"`
	DownloadService DownloadServiceStatus `json:"downloadService"`
}

// DatabaseStatus represents database health status
type DatabaseStatus struct {
	Status      string  `json:"status"`
	Message     *string `json:"message,omitempty"`
	ResponseMs  int64   `json:"response_ms"`
	Connections int     `json:"connections"`
}

// IndexersStatus represents indexer service status  
type IndexersStatus struct {
	Total  int    `json:"total"`
	Online int    `json:"online"`
	Status string `json:"status"`
}

// DownloadServiceStatus represents download service status
type DownloadServiceStatus struct {
	Status          string `json:"status"`
	ActiveDownloads int    `json:"activeDownloads"`
}

// GetSystemStatus returns system status with real health checks
func (h *SystemHandler) GetSystemStatus(c *gin.Context) {
	response := SystemStatusResponse{}

	// Check database health
	dbStatus := h.checkDatabaseHealth()
	response.Database = dbStatus

	// Check indexers status
	indexersStatus := h.checkIndexersStatus()
	response.Indexers = indexersStatus

	// Check download service status
	downloadStatus := h.checkDownloadServiceStatus()
	response.DownloadService = downloadStatus

	c.JSON(http.StatusOK, response)
}

// checkDatabaseHealth checks database connection and response time
func (h *SystemHandler) checkDatabaseHealth() DatabaseStatus {
	start := time.Now()
	
	// Test database connection with a simple query
	var count int
	err := h.container.GetDB().QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	
	responseTime := time.Since(start).Milliseconds()
	
	if err != nil {
		message := err.Error()
		return DatabaseStatus{
			Status:      "unhealthy",
			Message:     &message,
			ResponseMs:  responseTime,
			Connections: 0,
		}
	}

	// Get connection stats if available
	stats := h.container.GetDB().Stats()
	connections := stats.OpenConnections

	status := "healthy"
	if responseTime > 1000 { // If query takes more than 1 second
		status = "degraded"
	}

	return DatabaseStatus{
		Status:      status,
		ResponseMs:  responseTime,
		Connections: connections,
	}
}

// checkIndexersStatus checks indexer service health
func (h *SystemHandler) checkIndexersStatus() IndexersStatus {
	// Query indexers table to get total and online count
	var total, online int
	
	// Get total indexers
	err := h.container.GetDB().QueryRow("SELECT COUNT(*) FROM indexers").Scan(&total)
	if err != nil {
		return IndexersStatus{
			Total:  0,
			Online: 0,
			Status: "unhealthy",
		}
	}

	// Get online indexers (is_active = true and health_status = 'healthy')
	query := `SELECT COUNT(*) FROM indexers WHERE is_active = true AND 
			  (health_status = 'healthy' OR health_status IS NULL)`
	err = h.container.GetDB().QueryRow(query).Scan(&online)
	if err != nil {
		online = 0
	}

	// Determine overall status
	status := "healthy"
	if total == 0 {
		status = "unhealthy"
	} else if online < total {
		status = "degraded"
	}

	return IndexersStatus{
		Total:  total,
		Online: online,
		Status: status,
	}
}

// checkDownloadServiceStatus checks download service health
func (h *SystemHandler) checkDownloadServiceStatus() DownloadServiceStatus {
	// Count active downloads
	var activeDownloads int
	query := `SELECT COUNT(*) FROM download_queue 
			  WHERE status IN ('downloading', 'processing')`
	
	err := h.container.GetDB().QueryRow(query).Scan(&activeDownloads)
	if err != nil {
		return DownloadServiceStatus{
			Status:          "error",
			ActiveDownloads: 0,
		}
	}

	// Determine service status based on activity
	status := "idle"
	if activeDownloads > 0 {
		status = "active"
	}

	return DownloadServiceStatus{
		Status:          status,
		ActiveDownloads: activeDownloads,
	}
}

// GetLogs returns system logs
func (h *SystemHandler) GetLogs(c *gin.Context) {
	var filters repositories.LogFilters
	
	// Parse query parameters
	if level := c.Query("level"); level != "" {
		filters.Level = &level
	}
	if component := c.Query("component"); component != "" {
		filters.Component = &component
	}
	if since := c.Query("since"); since != "" {
		// Parse the since date - expected format: RFC3339 or similar
		if sinceTime, err := time.Parse(time.RFC3339, since); err == nil {
			filters.Since = &sinceTime
		}
	}
	if until := c.Query("until"); until != "" {
		if untilTime, err := time.Parse(time.RFC3339, until); err == nil {
			filters.Until = &untilTime
		}
	}
	if limit := c.Query("limit"); limit != "" {
		if limitInt, err := strconv.Atoi(limit); err == nil {
			filters.Limit = limitInt
		}
	} else {
		filters.Limit = 100 // Default limit
	}
	if offset := c.Query("offset"); offset != "" {
		if offsetInt, err := strconv.Atoi(offset); err == nil {
			filters.Offset = offsetInt
		}
	}
	
	logs, err := h.container.GetSystemRepository().GetLogs(c.Request.Context(), &filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve system logs"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// RunMaintenance runs maintenance tasks
func (h *SystemHandler) RunMaintenance(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "RunMaintenance not yet implemented"})
}

// GetSettings returns system settings
func (h *SystemHandler) GetSettings(c *gin.Context) {
	settings, err := h.container.GetSystemRepository().GetAppSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve system settings"})
		return
	}
	
	c.JSON(http.StatusOK, settings)
}

// UpdateSettings updates system settings
func (h *SystemHandler) UpdateSettings(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	for key, value := range req {
		err := h.container.GetSystemRepository().SetAppSetting(c.Request.Context(), key, value)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update system settings"})
			return
		}
	}
	
	// Return updated settings
	settings, err := h.container.GetSystemRepository().GetAppSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve updated settings"})
		return
	}
	
	c.JSON(http.StatusOK, settings)
}