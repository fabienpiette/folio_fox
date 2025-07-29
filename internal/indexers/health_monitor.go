package indexers

import (
	"context"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/repositories"
)

// HealthMonitor monitors indexer health and manages failover logic
type HealthMonitor struct {
	indexerRepo     repositories.IndexerRepository
	logger          *logrus.Logger
	checkInterval   time.Duration
	healthThreshold time.Duration
	stopChan        chan struct{}
	wg              sync.WaitGroup
	mu              sync.RWMutex
	healthCache     map[int64]*models.IndexerHealth
}

// NewHealthMonitor creates a new health monitor
func NewHealthMonitor(indexerRepo repositories.IndexerRepository, logger *logrus.Logger) *HealthMonitor {
	return &HealthMonitor{
		indexerRepo:     indexerRepo,
		logger:          logger,
		checkInterval:   15 * time.Minute, // Default 15 minute check interval
		healthThreshold: 30 * time.Minute, // Mark as down if no health check in 30 minutes
		stopChan:        make(chan struct{}),
		healthCache:     make(map[int64]*models.IndexerHealth),
	}
}

// Start begins the health monitoring process
func (hm *HealthMonitor) Start(ctx context.Context) {
	hm.logger.Info("Starting indexer health monitoring")
	
	hm.wg.Add(1)
	go hm.monitorLoop(ctx)
}

// Stop stops the health monitoring process
func (hm *HealthMonitor) Stop() {
	hm.logger.Info("Stopping indexer health monitoring")
	close(hm.stopChan)
	hm.wg.Wait()
}

// RecordHealthCheck records a health check result for an indexer
func (hm *HealthMonitor) RecordHealthCheck(ctx context.Context, indexerID int64, status models.IndexerStatus, responseTimeMS *int, errorMessage *string) {
	health := &models.IndexerHealth{
		IndexerID:      indexerID,
		Status:         status,
		ResponseTimeMS: responseTimeMS,
		ErrorMessage:   errorMessage,
		CheckedAt:      time.Now(),
	}

	// Store in database
	if err := hm.indexerRepo.RecordHealthCheck(ctx, health); err != nil {
		hm.logger.Errorf("Failed to record health check for indexer %d: %v", indexerID, err)
		return
	}

	// Update cache
	hm.mu.Lock()
	hm.healthCache[indexerID] = health
	hm.mu.Unlock()

	hm.logger.Debugf("Recorded health check for indexer %d: %s", indexerID, status)
}

// GetHealthStatus returns the current health status of an indexer
func (hm *HealthMonitor) GetHealthStatus(ctx context.Context, indexerID int64) (*models.IndexerHealth, error) {
	// Try cache first
	hm.mu.RLock()
	if cached, exists := hm.healthCache[indexerID]; exists {
		hm.mu.RUnlock()
		return cached, nil
	}
	hm.mu.RUnlock()

	// Fallback to database
	health, err := hm.indexerRepo.GetLatestHealth(ctx, indexerID)
	if err != nil {
		return nil, err
	}

	// Update cache
	if health != nil {
		hm.mu.Lock()
		hm.healthCache[indexerID] = health
		hm.mu.Unlock()
	}

	return health, nil
}

// GetHealthyIndexers returns a list of currently healthy indexers
func (hm *HealthMonitor) GetHealthyIndexers(ctx context.Context, userID int64) ([]*models.Indexer, error) {
	// Get user's enabled indexers
	allIndexers, err := hm.indexerRepo.GetUserEnabledIndexers(ctx, userID)
	if err != nil {
		return nil, err
	}

	var healthyIndexers []*models.Indexer
	for _, indexer := range allIndexers {
		health, err := hm.GetHealthStatus(ctx, indexer.ID)
		if err != nil {
			hm.logger.Warnf("Failed to get health status for indexer %d: %v", indexer.ID, err)
			continue
		}

		// Consider indexer healthy if:
		// 1. No health record exists (assume healthy for new indexers)
		// 2. Last status was healthy and within threshold
		// 3. Status is degraded but still functional
		if health == nil {
			healthyIndexers = append(healthyIndexers, indexer)
		} else if time.Since(health.CheckedAt) > hm.healthThreshold {
			// Mark as down if no recent health check
			hm.RecordHealthCheck(ctx, indexer.ID, models.IndexerStatusDown, nil, stringPtr("No recent health check"))
		} else if health.Status == models.IndexerStatusHealthy || health.Status == models.IndexerStatusDegraded {
			healthyIndexers = append(healthyIndexers, indexer)
		}
	}

	return healthyIndexers, nil
}

// GetFailoverIndexers returns alternative indexers when primary ones are down
func (hm *HealthMonitor) GetFailoverIndexers(ctx context.Context, userID int64, excludeIDs []int64) ([]*models.Indexer, error) {
	healthyIndexers, err := hm.GetHealthyIndexers(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Create exclude map for efficient lookup
	excludeMap := make(map[int64]bool)
	for _, id := range excludeIDs {
		excludeMap[id] = true
	}

	// Filter out excluded indexers
	var failoverIndexers []*models.Indexer
	for _, indexer := range healthyIndexers {
		if !excludeMap[indexer.ID] {
			failoverIndexers = append(failoverIndexers, indexer)
		}
	}

	return failoverIndexers, nil
}

// monitorLoop runs the periodic health check loop
func (hm *HealthMonitor) monitorLoop(ctx context.Context) {
	defer hm.wg.Done()

	ticker := time.NewTicker(hm.checkInterval)
	defer ticker.Stop()

	// Run initial health check
	hm.performHealthChecks(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-hm.stopChan:
			return
		case <-ticker.C:
			hm.performHealthChecks(ctx)
		}
	}
}

// performHealthChecks runs health checks on all active indexers
func (hm *HealthMonitor) performHealthChecks(ctx context.Context) {
	hm.logger.Debug("Starting periodic health checks")

	indexers, err := hm.indexerRepo.List(ctx, true) // Only active indexers
	if err != nil {
		hm.logger.Errorf("Failed to get indexers for health check: %v", err)
		return
	}

	var wg sync.WaitGroup
	for _, indexer := range indexers {
		wg.Add(1)
		go func(idx *models.Indexer) {
			defer wg.Done()
			hm.checkIndexerHealth(ctx, idx)
		}(indexer)
	}

	wg.Wait()
	hm.logger.Debugf("Completed health checks for %d indexers", len(indexers))
}

// checkIndexerHealth performs a health check on a specific indexer
func (hm *HealthMonitor) checkIndexerHealth(ctx context.Context, indexer *models.Indexer) {
	start := time.Now()
	
	// Create a timeout context for the health check
	checkCtx, cancel := context.WithTimeout(ctx, time.Duration(indexer.TimeoutSeconds)*time.Second)
	defer cancel()

	var status models.IndexerStatus
	var errorMessage *string
	responseTime := int(time.Since(start).Milliseconds())

	// Perform basic connectivity check (simplified - in real implementation, this would
	// use the appropriate client to test the indexer)
	select {
	case <-checkCtx.Done():
		status = models.IndexerStatusDown
		errMsg := "Health check timeout"
		errorMessage = &errMsg
	default:
		// For now, mark as healthy if we can reach this point
		// In a real implementation, this would make an actual HTTP request
		status = models.IndexerStatusHealthy
	}

	// Record the health check result
	hm.RecordHealthCheck(ctx, indexer.ID, status, &responseTime, errorMessage)
}

// UpdateHealthThreshold updates the health check threshold
func (hm *HealthMonitor) UpdateHealthThreshold(threshold time.Duration) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.healthThreshold = threshold
}

// UpdateCheckInterval updates the health check interval
func (hm *HealthMonitor) UpdateCheckInterval(interval time.Duration) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.checkInterval = interval
}

// GetHealthSummary returns a summary of all indexer health statuses
func (hm *HealthMonitor) GetHealthSummary(ctx context.Context) (map[string]int, error) {
	indexers, err := hm.indexerRepo.List(ctx, false) // All indexers
	if err != nil {
		return nil, err
	}

	summary := map[string]int{
		string(models.IndexerStatusHealthy):     0,
		string(models.IndexerStatusDegraded):    0,
		string(models.IndexerStatusDown):        0,
		string(models.IndexerStatusMaintenance): 0,
	}

	for _, indexer := range indexers {
		health, err := hm.GetHealthStatus(ctx, indexer.ID)
		if err != nil {
			continue
		}

		if health == nil {
			summary[string(models.IndexerStatusHealthy)]++
		} else {
			summary[string(health.Status)]++
		}
	}

	return summary, nil
}

// Helper function to create string pointer
func stringPtr(s string) *string {
	return &s
}