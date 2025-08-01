package services

import (
	"context"
	"database/sql"
	"sync"

	"github.com/go-redis/redis/v8"
	"github.com/sirupsen/logrus"
	"github.com/fabienpiette/folio_fox/internal/auth"
	"github.com/fabienpiette/folio_fox/internal/config"
	"github.com/fabienpiette/folio_fox/internal/downloads"
	"github.com/fabienpiette/folio_fox/internal/indexers"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/repositories"
	"github.com/fabienpiette/folio_fox/internal/search"
)

// Container holds all the application services and manages their lifecycle
type Container struct {
	// Configuration
	config *config.Config
	logger *logrus.Logger
	
	// Infrastructure
	db          *sql.DB
	redisClient *redis.Client
	
	// Repositories
	userRepo         repositories.UserRepository
	bookRepo         repositories.BookRepository
	downloadRepo     repositories.DownloadRepository
	indexerRepo      repositories.IndexerRepository
	searchRepo       repositories.SearchRepository
	userPrefRepo     repositories.UserPreferencesRepository
	bookFileRepo     repositories.BookFileRepository
	systemRepo       repositories.SystemRepository
	
	// Core Services
	indexerManager  *indexers.Manager
	downloadManager *downloads.Manager
	fileManager     *downloads.FileManager
	searchService   *search.Service
	
	// Auth Services
	jwtManager      *auth.JWTManager
	passwordHasher  *auth.PasswordHasher
	
	// WebSocket hub for real-time updates
	wsHub *WebSocketHub
	
	// Lifecycle management
	stopChan chan struct{}
	wg       sync.WaitGroup
	mu       sync.RWMutex
}

// NewContainer creates a new service container
func NewContainer(db *sql.DB, redisClient *redis.Client, cfg *config.Config) *Container {
	logger := logrus.New()
	logger.SetLevel(logrus.InfoLevel)
	
	if cfg.Log.Level == "debug" {
		logger.SetLevel(logrus.DebugLevel)
	}
	
	container := &Container{
		config:      cfg,
		logger:      logger,
		db:          db,
		redisClient: redisClient,
		stopChan:    make(chan struct{}),
	}
	
	// Initialize repositories
	container.initializeRepositories()
	
	// Initialize core services
	container.initializeCoreServices()
	
	// Initialize WebSocket hub
	container.wsHub = NewWebSocketHub(logger)
	
	return container
}

// Start starts all background services
func (c *Container) Start() {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	c.logger.Info("Starting service container")
	
	// Start WebSocket hub
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		c.wsHub.Start()
	}()
	
	// Start indexer health monitoring
	if c.indexerManager != nil {
		ctx := context.Background()
		c.indexerManager.StartHealthMonitoring(ctx)
	}
	
	// Start download manager
	if c.downloadManager != nil {
		ctx := context.Background()
		c.wg.Add(1)
		go func() {
			defer c.wg.Done()
			c.downloadManager.Start(ctx)
		}()
	}
	
	c.logger.Info("Service container started successfully")
}

// Stop gracefully stops all services
func (c *Container) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	c.logger.Info("Stopping service container")
	
	// Signal all services to stop
	close(c.stopChan)
	
	// Stop core services
	if c.downloadManager != nil {
		c.downloadManager.Stop()
	}
	
	if c.indexerManager != nil {
		c.indexerManager.StopHealthMonitoring()
	}
	
	if c.wsHub != nil {
		c.wsHub.Stop()
	}
	
	// Wait for all goroutines to finish
	c.wg.Wait()
	
	c.logger.Info("Service container stopped")
}

// GetIndexerManager returns the indexer manager
func (c *Container) GetIndexerManager() *indexers.Manager {
	return c.indexerManager
}

// GetDownloadManager returns the download manager
func (c *Container) GetDownloadManager() *downloads.Manager {
	return c.downloadManager
}

// GetFileManager returns the file manager
func (c *Container) GetFileManager() *downloads.FileManager {
	return c.fileManager
}

// GetSearchService returns the search service
func (c *Container) GetSearchService() *search.Service {
	return c.searchService
}

// GetJWTManager returns the JWT manager
func (c *Container) GetJWTManager() *auth.JWTManager {
	return c.jwtManager
}

// GetPasswordHasher returns the password hasher
func (c *Container) GetPasswordHasher() *auth.PasswordHasher {
	return c.passwordHasher
}

// GetWebSocketHub returns the WebSocket hub
func (c *Container) GetWebSocketHub() *WebSocketHub {
	return c.wsHub
}

// Repository getters
func (c *Container) GetUserRepository() repositories.UserRepository {
	return c.userRepo
}

func (c *Container) GetBookRepository() repositories.BookRepository {
	return c.bookRepo
}

func (c *Container) GetDownloadRepository() repositories.DownloadRepository {
	return c.downloadRepo
}

func (c *Container) GetIndexerRepository() repositories.IndexerRepository {
	return c.indexerRepo
}

func (c *Container) GetSearchRepository() repositories.SearchRepository {
	return c.searchRepo
}

func (c *Container) GetUserPreferencesRepository() repositories.UserPreferencesRepository {
	return c.userPrefRepo
}

func (c *Container) GetBookFileRepository() repositories.BookFileRepository {
	return c.bookFileRepo
}

func (c *Container) GetSystemRepository() repositories.SystemRepository {
	return c.systemRepo
}

// GetLogger returns the logger instance
func (c *Container) GetLogger() *logrus.Logger {
	return c.logger
}

// GetConfig returns the configuration
func (c *Container) GetConfig() *config.Config {
	return c.config
}

// GetDB returns the database connection
func (c *Container) GetDB() *sql.DB {
	return c.db
}

// initializeRepositories creates all repository instances
func (c *Container) initializeRepositories() {
	// Initialize repositories
	c.userRepo = repositories.NewUserRepository(c.db)
	c.bookRepo = repositories.NewBookRepository(c.db)
	c.downloadRepo = repositories.NewDownloadRepository(c.db)
	c.indexerRepo = repositories.NewIndexerRepository(c.db)
	c.searchRepo = repositories.NewSearchRepository(c.db, c.redisClient)
	c.userPrefRepo = repositories.NewUserPreferencesRepository(c.db)
	c.systemRepo = repositories.NewSystemRepository(c.db)
	// TODO: Implement other repositories when needed
	// c.bookFileRepo = repositories.NewBookFileRepository(c.db)
	
	c.logger.Info("Repositories initialized")
}

// initializeCoreServices creates all core service instances
func (c *Container) initializeCoreServices() {
	// Initialize indexer manager
	if c.indexerRepo != nil && c.searchRepo != nil {
		c.indexerManager = indexers.NewManager(c.indexerRepo, c.searchRepo, c.logger)
		
		// Configure Prowlarr client if enabled
		if c.config.Prowlarr.Enabled {
			prowlarrConfig := &models.ProwlarrConfig{
				Enabled:           c.config.Prowlarr.Enabled,
				BaseURL:           c.config.Prowlarr.BaseURL,
				APIKey:            c.config.Prowlarr.APIKey,
				TimeoutSeconds:    c.config.Prowlarr.TimeoutSeconds,
				RateLimitRequests: c.config.Prowlarr.RateLimitRequests,
				RateLimitWindow:   c.config.Prowlarr.RateLimitWindow,
				SyncIntervalHours: 24, // Default value
				Status:            "connected",
			}
			prowlarrClient := indexers.NewProwlarrClient(prowlarrConfig, c.logger)
			c.indexerManager.SetProwlarrClient(prowlarrClient)
		}
		
		// Configure Jackett client if enabled
		if c.config.Jackett.Enabled {
			jackettConfig := &models.JackettConfig{
				Enabled:           c.config.Jackett.Enabled,
				BaseURL:           c.config.Jackett.BaseURL,
				APIKey:            c.config.Jackett.APIKey,
				TimeoutSeconds:    c.config.Jackett.TimeoutSeconds,
				RateLimitRequests: c.config.Jackett.RateLimitRequests,
				RateLimitWindow:   c.config.Jackett.RateLimitWindow,
				Status:            "connected",
			}
			jackettClient := indexers.NewJackettClient(jackettConfig, c.logger)
			c.indexerManager.SetJackettClient(jackettClient)
		}
	}
	
	// Initialize file manager
	if c.bookRepo != nil && c.bookFileRepo != nil && c.userPrefRepo != nil {
		c.fileManager = downloads.NewFileManager(c.bookRepo, c.bookFileRepo, c.userPrefRepo, c.logger)
	}
	
	// Initialize download manager
	if c.downloadRepo != nil && c.userPrefRepo != nil && c.fileManager != nil {
		maxConcurrent := 3 // Default, could be from config
		if c.config.Downloads.MaxConcurrent > 0 {
			maxConcurrent = c.config.Downloads.MaxConcurrent
		}
		
		c.downloadManager = downloads.NewManager(
			c.downloadRepo,
			c.userPrefRepo,
			c.fileManager,
			c.logger,
			maxConcurrent,
		)
	}
	
	// Initialize search service
	if c.indexerManager != nil && c.bookRepo != nil && c.searchRepo != nil {
		c.searchService = search.NewService(c.indexerManager, c.bookRepo, c.searchRepo, c.logger)
	}
	
	// Initialize auth services
	c.jwtManager = auth.NewJWTManager(c.config.Auth.JWTSecret, c.config.Auth.TokenDuration)
	c.passwordHasher = auth.NewPasswordHasher()
	
	c.logger.Info("Core services initialized")
}

// HealthCheck performs a health check on all services
func (c *Container) HealthCheck(ctx context.Context) map[string]interface{} {
	health := map[string]interface{}{
		"status":    "healthy",
		"timestamp": "2025-07-28T00:00:00Z",
		"services":  map[string]interface{}{},
	}
	
	// Check database
	if err := c.db.PingContext(ctx); err != nil {
		health["services"].(map[string]interface{})["database"] = map[string]interface{}{
			"status": "unhealthy",
			"error":  err.Error(),
		}
		health["status"] = "degraded"
	} else {
		health["services"].(map[string]interface{})["database"] = map[string]interface{}{
			"status": "healthy",
		}
	}
	
	// Check Redis
	if err := c.redisClient.Ping(ctx).Err(); err != nil {
		health["services"].(map[string]interface{})["redis"] = map[string]interface{}{
			"status": "unhealthy",
			"error":  err.Error(),
		}
		health["status"] = "degraded"
	} else {
		health["services"].(map[string]interface{})["redis"] = map[string]interface{}{
			"status": "healthy",
		}
	}
	
	// Check indexer manager
	if c.indexerManager != nil {
		health["services"].(map[string]interface{})["indexer_manager"] = map[string]interface{}{
			"status": "healthy",
		}
	}
	
	// Check download manager
	if c.downloadManager != nil {
		health["services"].(map[string]interface{})["download_manager"] = map[string]interface{}{
			"status": "healthy",
		}
	}
	
	return health
}

// GetMetrics returns application metrics
func (c *Container) GetMetrics(ctx context.Context) map[string]interface{} {
	metrics := map[string]interface{}{
		"timestamp": "2025-07-28T00:00:00Z",
		"uptime":    "0h 0m 0s", // Would be calculated from start time
		"version":   "1.0.0",
	}
	
	// Add download statistics if available
	if c.downloadRepo != nil {
		if stats, err := c.downloadRepo.GetDownloadStats(ctx, nil, "day"); err == nil {
			metrics["downloads"] = map[string]interface{}{
				"total_today":      stats.TotalDownloads,
				"successful_today": stats.SuccessfulDownloads,
				"failed_today":     stats.FailedDownloads,
				"success_rate":     stats.SuccessRate,
			}
		}
	}
	
	// Add indexer health summary if available
	if c.indexerManager != nil {
		// This would get health summary from the health monitor
		metrics["indexers"] = map[string]interface{}{
			"total_healthy":   0,
			"total_degraded":  0,
			"total_down":      0,
		}
	}
	
	return metrics
}