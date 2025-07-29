package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/fabienpiette/folio_fox/internal/config"
	"github.com/fabienpiette/folio_fox/internal/database"
	"github.com/fabienpiette/folio_fox/internal/redis"
	"github.com/fabienpiette/folio_fox/internal/server"
	"github.com/fabienpiette/folio_fox/internal/services"
	"github.com/sirupsen/logrus"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Setup logging
	setupLogging(cfg.Log.Level)

	logrus.Info("Starting FolioFox backend server...")

	// Initialize database
	db, err := database.Initialize(cfg.Database.Path)
	if err != nil {
		logrus.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Initialize Redis
	redisClient, err := redis.Initialize(cfg.Redis)
	if err != nil {
		logrus.Fatalf("Failed to initialize Redis: %v", err)
	}
	defer redisClient.Close()

	// Initialize services
	serviceContainer := services.NewContainer(db, redisClient, cfg)

	// Initialize HTTP server
	httpServer := server.NewHTTPServer(cfg, serviceContainer)

	// Start services
	logrus.Info("Starting background services...")
	serviceContainer.Start()

	// Start HTTP server
	go func() {
		logrus.Infof("Starting HTTP server on port %d", cfg.Server.Port)
		if err := httpServer.Start(); err != nil {
			logrus.Fatalf("Failed to start HTTP server: %v", err)
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logrus.Info("Shutting down FolioFox backend server...")

	// Graceful shutdown
	if err := httpServer.Shutdown(); err != nil {
		logrus.Errorf("Error during HTTP server shutdown: %v", err)
	}

	serviceContainer.Stop()
	logrus.Info("FolioFox backend server stopped")
}

func setupLogging(level string) {
	logrus.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: "2006-01-02T15:04:05.000Z07:00",
	})

	switch level {
	case "debug":
		logrus.SetLevel(logrus.DebugLevel)
	case "info":
		logrus.SetLevel(logrus.InfoLevel)
	case "warn":
		logrus.SetLevel(logrus.WarnLevel)
	case "error":
		logrus.SetLevel(logrus.ErrorLevel)
	default:
		logrus.SetLevel(logrus.InfoLevel)
	}

	logrus.Info("Logging initialized")
}