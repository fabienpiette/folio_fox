package server

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"github.com/fabienpiette/folio_fox/internal/config"
	"github.com/fabienpiette/folio_fox/internal/middleware"
	"github.com/fabienpiette/folio_fox/internal/server/handlers"
	"github.com/fabienpiette/folio_fox/internal/services"
)

// HTTPServer represents the HTTP server
type HTTPServer struct {
	config    *config.Config
	container *services.Container
	router    *gin.Engine
	server    *http.Server
	logger    *logrus.Logger
}

// NewHTTPServer creates a new HTTP server
func NewHTTPServer(cfg *config.Config, container *services.Container) *HTTPServer {
	// Set Gin mode based on configuration
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	} else {
		gin.SetMode(gin.DebugMode)
	}
	
	router := gin.New()
	logger := container.GetLogger()
	
	server := &HTTPServer{
		config:    cfg,
		container: container,
		router:    router,
		logger:    logger,
	}
	
	// Setup middleware
	server.setupMiddleware()
	
	// Setup routes
	server.setupRoutes()
	
	// Create HTTP server
	server.server = &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  time.Duration(cfg.Server.ReadTimeoutSeconds) * time.Second,
		WriteTimeout: time.Duration(cfg.Server.WriteTimeoutSeconds) * time.Second,
		IdleTimeout:  time.Duration(cfg.Server.IdleTimeoutSeconds) * time.Second,
	}
	
	return server
}

// Start starts the HTTP server
func (s *HTTPServer) Start() error {
	s.logger.Infof("Starting HTTP server on port %d", s.config.Server.Port)
	
	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("failed to start HTTP server: %w", err)
	}
	
	return nil
}

// Shutdown gracefully shuts down the HTTP server
func (s *HTTPServer) Shutdown() error {
	s.logger.Info("Shutting down HTTP server")
	
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	return s.server.Shutdown(ctx)
}

// setupMiddleware configures middleware
func (s *HTTPServer) setupMiddleware() {
	// Logger middleware
	s.router.Use(gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		return fmt.Sprintf("[%s] \"%s %s %s %d %s \"%s\" %s\"\n",
			param.TimeStamp.Format("2006-01-02 15:04:05"),
			param.Method,
			param.Path,
			param.Request.Proto,
			param.StatusCode,
			param.Latency,
			param.Request.UserAgent(),
			param.ErrorMessage,
		)
	}))
	
	// Recovery middleware
	s.router.Use(gin.Recovery())
	
	// CORS middleware
	s.router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Header("Access-Control-Allow-Credentials", "true")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		
		c.Next()
	})
	
	// Request ID middleware
	s.router.Use(func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = fmt.Sprintf("%d", time.Now().UnixNano())
		}
		c.Set("request_id", requestID)
		c.Header("X-Request-ID", requestID)
		c.Next()
	})
	
	// Rate limiting middleware (basic implementation)
	s.router.Use(func(c *gin.Context) {
		// In a production implementation, use a proper rate limiter
		c.Next()
	})
}

// setupRoutes configures all API routes
func (s *HTTPServer) setupRoutes() {
	// Health check endpoint (no auth required)
	s.router.GET("/health", s.healthCheckHandler)
	s.router.GET("/metrics", s.metricsHandler)
	
	// API v1 routes
	v1 := s.router.Group("/api/v1")
	
	// Authentication routes (no auth required)
	authGroup := v1.Group("/auth")
	{
		authHandler := handlers.NewAuthHandler(s.container)
		authGroup.POST("/login", authHandler.Login)
		authGroup.POST("/refresh", authHandler.RefreshToken)
	}
	
	// WebSocket endpoint
	v1.GET("/ws", s.websocketHandler)
	
	// Protected routes (require authentication)
	protected := v1.Group("/")
	protected.Use(middleware.AuthRequired(s.container.GetUserRepository()))
	
	// User management
	userGroup := protected.Group("/users")
	{
		userHandler := handlers.NewUserHandler(s.container)
		userGroup.GET("/profile", userHandler.GetProfile)
		userGroup.PUT("/profile", userHandler.UpdateProfile)
		userGroup.GET("/preferences", userHandler.GetPreferences)
		userGroup.PUT("/preferences", userHandler.UpdatePreferences)
	}
	
	// Library management
	libraryGroup := protected.Group("/books")
	{
		libraryHandler := handlers.NewLibraryHandler(s.container)
		libraryGroup.GET("", libraryHandler.ListBooks)
		libraryGroup.POST("", libraryHandler.CreateBook)
		libraryGroup.GET("/:id", libraryHandler.GetBook)
		libraryGroup.PUT("/:id", libraryHandler.UpdateBook)
		libraryGroup.DELETE("/:id", libraryHandler.DeleteBook)
		libraryGroup.GET("/:id/files", libraryHandler.GetBookFiles)
		libraryGroup.POST("/:id/files", libraryHandler.AddBookFile)
		libraryGroup.GET("/:id/files/:file_id", libraryHandler.DownloadBookFile)
		libraryGroup.DELETE("/:id/files/:file_id", libraryHandler.DeleteBookFile)
	}
	
	// Search functionality
	searchGroup := protected.Group("/search")
	{
		searchHandler := handlers.NewSearchHandler(s.container)
		searchGroup.GET("", searchHandler.Search)
		searchGroup.GET("/suggestions", searchHandler.GetSuggestions)
		searchGroup.GET("/history", searchHandler.GetHistory)
		searchGroup.DELETE("/history", searchHandler.ClearHistory)
	}
	
	// Download management
	downloadGroup := protected.Group("/downloads")
	{
		downloadHandler := handlers.NewDownloadHandler(s.container)
		downloadGroup.GET("/queue", downloadHandler.GetQueue)
		downloadGroup.POST("/queue", downloadHandler.AddToQueue)
		downloadGroup.GET("/queue/:id", downloadHandler.GetDownload)
		downloadGroup.PUT("/queue/:id", downloadHandler.UpdateDownload)
		downloadGroup.DELETE("/queue/:id", downloadHandler.CancelDownload)
		downloadGroup.POST("/queue/:id/pause", downloadHandler.PauseDownload)
		downloadGroup.POST("/queue/:id/resume", downloadHandler.ResumeDownload)
		downloadGroup.POST("/queue/:id/retry", downloadHandler.RetryDownload)
		downloadGroup.POST("/queue/batch", downloadHandler.BatchOperation)
		downloadGroup.GET("/history", downloadHandler.GetHistory)
		downloadGroup.GET("/stats", downloadHandler.GetStats)
		downloadGroup.GET("/dashboard-stats", downloadHandler.GetDashboardStats)
	}
	
	// Indexer management
	indexerGroup := protected.Group("/indexers")
	{
		indexerHandler := handlers.NewIndexerHandler(s.container)
		indexerGroup.GET("", indexerHandler.ListIndexers)
		indexerGroup.GET("/:id", indexerHandler.GetIndexer)
		indexerGroup.POST("/:id/test", indexerHandler.TestIndexer)
		indexerGroup.GET("/:id/health", indexerHandler.GetIndexerHealth)
		indexerGroup.PUT("/:id/config", indexerHandler.UpdateConfig)
	}
	
	// System management (admin only)
	systemGroup := protected.Group("/system")
	systemGroup.Use(middleware.AdminRequired())
	{
		systemHandler := handlers.NewSystemHandler(s.container)
		systemGroup.GET("/status", systemHandler.GetSystemStatus)
		systemGroup.GET("/logs", systemHandler.GetLogs)
		systemGroup.POST("/maintenance", systemHandler.RunMaintenance)
		systemGroup.GET("/settings", systemHandler.GetSettings)
		systemGroup.PUT("/settings", systemHandler.UpdateSettings)
	}
}

// healthCheckHandler handles health check requests
func (s *HTTPServer) healthCheckHandler(c *gin.Context) {
	ctx := c.Request.Context()
	health := s.container.HealthCheck(ctx)
	
	status := http.StatusOK
	if health["status"] != "healthy" {
		status = http.StatusServiceUnavailable
	}
	
	c.JSON(status, health)
}

// metricsHandler handles metrics requests
func (s *HTTPServer) metricsHandler(c *gin.Context) {
	ctx := c.Request.Context()
	metrics := s.container.GetMetrics(ctx)
	c.JSON(http.StatusOK, metrics)
}

// websocketHandler handles WebSocket upgrade requests
func (s *HTTPServer) websocketHandler(c *gin.Context) {
	// Extract user ID from token (in a real implementation)
	userID := int64(1) // Placeholder
	clientID := c.GetHeader("X-Client-ID")
	if clientID == "" {
		clientID = fmt.Sprintf("client_%d", time.Now().UnixNano())
	}
	
	wsHub := s.container.GetWebSocketHub()
	wsHub.HandleWebSocket(c.Writer, c.Request, userID, clientID)
}