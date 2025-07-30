package config

import (
	"strings"
	
	"github.com/spf13/viper"
)

// Config represents the application configuration
type Config struct {
	Environment string         `mapstructure:"environment"`
	Server      ServerConfig   `mapstructure:"server"`
	Database    DatabaseConfig `mapstructure:"database"`
	Redis       RedisConfig    `mapstructure:"redis"`
	Log         LogConfig      `mapstructure:"log"`
	Auth        AuthConfig     `mapstructure:"auth"`
	Downloads   DownloadConfig `mapstructure:"downloads"`
	Search      SearchConfig   `mapstructure:"search"`
	Prowlarr    ProwlarrConfig `mapstructure:"prowlarr"`
	Jackett     JackettConfig  `mapstructure:"jackett"`
}

// ServerConfig contains HTTP server configuration
type ServerConfig struct {
	Port               int    `mapstructure:"port"`
	Host               string `mapstructure:"host"`
	ReadTimeoutSeconds int    `mapstructure:"read_timeout_seconds"`
	WriteTimeoutSeconds int   `mapstructure:"write_timeout_seconds"`
	IdleTimeoutSeconds  int   `mapstructure:"idle_timeout_seconds"`
}

// DatabaseConfig contains database configuration
type DatabaseConfig struct {
	Path string `mapstructure:"path"`
}

// RedisConfig contains Redis configuration
type RedisConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
}

// LogConfig contains logging configuration
type LogConfig struct {
	Level string `mapstructure:"level"`
}

// AuthConfig contains authentication configuration
type AuthConfig struct {
	JWTSecret     string `mapstructure:"jwt_secret"`
	TokenDuration int    `mapstructure:"token_duration"` // in hours
}

// DownloadConfig contains download system configuration
type DownloadConfig struct {
	MaxConcurrent int    `mapstructure:"max_concurrent"`
	Timeout       int    `mapstructure:"timeout"`        // in seconds
	RetryCount    int    `mapstructure:"retry_count"`
	UserAgent     string `mapstructure:"user_agent"`
	DownloadPath  string `mapstructure:"download_path"`
}

// SearchConfig contains search system configuration
type SearchConfig struct {
	CacheTTL        int `mapstructure:"cache_ttl"`         // in minutes
	MaxResults      int `mapstructure:"max_results"`
	TimeoutSeconds  int `mapstructure:"timeout_seconds"`
	MaxConcurrent   int `mapstructure:"max_concurrent"`
}

// ProwlarrConfig contains Prowlarr integration configuration
type ProwlarrConfig struct {
	Enabled            bool   `mapstructure:"enabled"`
	BaseURL            string `mapstructure:"base_url"`
	APIKey             string `mapstructure:"api_key"`
	TimeoutSeconds     int    `mapstructure:"timeout_seconds"`
	RateLimitRequests  int    `mapstructure:"rate_limit_requests"`
	RateLimitWindow    int    `mapstructure:"rate_limit_window"`
}

// JackettConfig contains Jackett integration configuration
type JackettConfig struct {
	Enabled            bool   `mapstructure:"enabled"`
	BaseURL            string `mapstructure:"base_url"`
	APIKey             string `mapstructure:"api_key"`
	TimeoutSeconds     int    `mapstructure:"timeout_seconds"`
	RateLimitRequests  int    `mapstructure:"rate_limit_requests"`
	RateLimitWindow    int    `mapstructure:"rate_limit_window"`
}

// Load loads the configuration from file and environment variables
func Load() (*Config, error) {
	// Set default values
	viper.SetDefault("environment", "development")
	
	viper.SetDefault("server.port", 8080)
	viper.SetDefault("server.host", "0.0.0.0")
	viper.SetDefault("server.read_timeout_seconds", 30)
	viper.SetDefault("server.write_timeout_seconds", 30)
	viper.SetDefault("server.idle_timeout_seconds", 120)

	viper.SetDefault("database.path", "./data/foliofox.db")

	viper.SetDefault("redis.host", "localhost")
	viper.SetDefault("redis.port", 6379)
	viper.SetDefault("redis.password", "")
	viper.SetDefault("redis.db", 0)

	viper.SetDefault("log.level", "info")

	viper.SetDefault("auth.jwt_secret", "change-me-in-production")
	viper.SetDefault("auth.token_duration", 24)

	viper.SetDefault("downloads.max_concurrent", 3)
	viper.SetDefault("downloads.timeout", 300)
	viper.SetDefault("downloads.retry_count", 3)
	viper.SetDefault("downloads.user_agent", "FolioFox/1.0")
	viper.SetDefault("downloads.download_path", "./downloads")

	viper.SetDefault("search.cache_ttl", 60)
	viper.SetDefault("search.max_results", 100)
	viper.SetDefault("search.timeout_seconds", 30)
	viper.SetDefault("search.max_concurrent", 5)
	
	// Prowlarr defaults
	viper.SetDefault("prowlarr.enabled", false)
	viper.SetDefault("prowlarr.base_url", "http://localhost:9696")
	viper.SetDefault("prowlarr.api_key", "")
	viper.SetDefault("prowlarr.timeout_seconds", 30)
	viper.SetDefault("prowlarr.rate_limit_requests", 60)
	viper.SetDefault("prowlarr.rate_limit_window", 60)
	
	// Jackett defaults
	viper.SetDefault("jackett.enabled", false)
	viper.SetDefault("jackett.base_url", "http://localhost:9117")
	viper.SetDefault("jackett.api_key", "")
	viper.SetDefault("jackett.timeout_seconds", 30)
	viper.SetDefault("jackett.rate_limit_requests", 60)
	viper.SetDefault("jackett.rate_limit_window", 60)

	// Configuration file settings
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")
	viper.AddConfigPath("/etc/foliofox")

	// Environment variable settings
	viper.SetEnvPrefix("FOLIOFOX")
	viper.AutomaticEnv()
	
	// Set key replacer to handle nested keys
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// Read configuration file (optional)
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, err
		}
		// Config file not found, using defaults and env vars
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, err
	}

	return &config, nil
}