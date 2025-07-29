package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfigDefaults(t *testing.T) {
	// Reset viper state
	viper.Reset()
	
	cfg, err := Load()
	require.NoError(t, err)
	assert.NotNil(t, cfg)
	
	// Test server defaults
	assert.Equal(t, "development", cfg.Environment)
	assert.Equal(t, 8080, cfg.Server.Port)
	assert.Equal(t, "0.0.0.0", cfg.Server.Host)
	assert.Equal(t, 30, cfg.Server.ReadTimeoutSeconds)
	assert.Equal(t, 30, cfg.Server.WriteTimeoutSeconds)
	assert.Equal(t, 120, cfg.Server.IdleTimeoutSeconds)
	
	// Test database defaults
	assert.Equal(t, "./data/foliofox.db", cfg.Database.Path)
	
	// Test Redis defaults
	assert.Equal(t, "localhost", cfg.Redis.Host)
	assert.Equal(t, 6379, cfg.Redis.Port)
	assert.Equal(t, "", cfg.Redis.Password)
	assert.Equal(t, 0, cfg.Redis.DB)
	
	// Test log defaults
	assert.Equal(t, "info", cfg.Log.Level)
	
	// Test auth defaults
	assert.Equal(t, "change-me-in-production", cfg.Auth.JWTSecret)
	assert.Equal(t, 24, cfg.Auth.TokenDuration)
	
	// Test download defaults
	assert.Equal(t, 3, cfg.Downloads.MaxConcurrent)
	assert.Equal(t, 300, cfg.Downloads.Timeout)
	assert.Equal(t, 3, cfg.Downloads.RetryCount)
	assert.Equal(t, "FolioFox/1.0", cfg.Downloads.UserAgent)
	assert.Equal(t, "./downloads", cfg.Downloads.DownloadPath)
	
	// Test search defaults
	assert.Equal(t, 60, cfg.Search.CacheTTL)
	assert.Equal(t, 100, cfg.Search.MaxResults)
	assert.Equal(t, 30, cfg.Search.TimeoutSeconds)
	assert.Equal(t, 5, cfg.Search.MaxConcurrent)
	
	// Test Prowlarr defaults
	assert.False(t, cfg.Prowlarr.Enabled)
	assert.Equal(t, "http://localhost:9696", cfg.Prowlarr.BaseURL)
	assert.Equal(t, "", cfg.Prowlarr.APIKey)
	assert.Equal(t, 30, cfg.Prowlarr.TimeoutSeconds)
	assert.Equal(t, 60, cfg.Prowlarr.RateLimitRequests)
	assert.Equal(t, 60, cfg.Prowlarr.RateLimitWindow)
	
	// Test Jackett defaults
	assert.False(t, cfg.Jackett.Enabled)
	assert.Equal(t, "http://localhost:9117", cfg.Jackett.BaseURL)
	assert.Equal(t, "", cfg.Jackett.APIKey)
	assert.Equal(t, 30, cfg.Jackett.TimeoutSeconds)
	assert.Equal(t, 60, cfg.Jackett.RateLimitRequests)
	assert.Equal(t, 60, cfg.Jackett.RateLimitWindow)
}

func TestConfigFromFile(t *testing.T) {
	// Create temporary config file
	tempDir := t.TempDir()
	configFile := filepath.Join(tempDir, "config.yaml")
	
	configContent := `
environment: "test"
server:
  port: 9090
  host: "127.0.0.1"
  read_timeout_seconds: 60
  write_timeout_seconds: 60
  idle_timeout_seconds: 240

database:
  path: "/tmp/test.db"

redis:
  host: "redis-server"
  port: 6380
  password: "secret"
  db: 1

log:
  level: "debug"

auth:
  jwt_secret: "test-secret"
  token_duration: 48

downloads:
  max_concurrent: 5
  timeout: 600
  retry_count: 5
  user_agent: "TestAgent/1.0"
  download_path: "/tmp/downloads"

search:
  cache_ttl: 120
  max_results: 200
  timeout_seconds: 60
  max_concurrent: 10

prowlarr:
  enabled: true
  base_url: "http://prowlarr:9696"
  api_key: "prowlarr-key"
  timeout_seconds: 45
  rate_limit_requests: 120
  rate_limit_window: 60

jackett:
  enabled: true
  base_url: "http://jackett:9117"
  api_key: "jackett-key"
  timeout_seconds: 45
  rate_limit_requests: 120
  rate_limit_window: 60
`
	
	err := os.WriteFile(configFile, []byte(configContent), 0644)
	require.NoError(t, err)
	
	// Reset viper and set config path
	viper.Reset()
	viper.AddConfigPath(tempDir)
	
	cfg, err := Load()
	require.NoError(t, err)
	assert.NotNil(t, cfg)
	
	// Test that file values override defaults
	assert.Equal(t, "test", cfg.Environment)
	assert.Equal(t, 9090, cfg.Server.Port)
	assert.Equal(t, "127.0.0.1", cfg.Server.Host)
	assert.Equal(t, "/tmp/test.db", cfg.Database.Path)
	assert.Equal(t, "redis-server", cfg.Redis.Host)
	assert.Equal(t, 6380, cfg.Redis.Port)
	assert.Equal(t, "secret", cfg.Redis.Password)
	assert.Equal(t, 1, cfg.Redis.DB)
	assert.Equal(t, "debug", cfg.Log.Level)
	assert.Equal(t, "test-secret", cfg.Auth.JWTSecret)
	assert.Equal(t, 48, cfg.Auth.TokenDuration)
	assert.Equal(t, 5, cfg.Downloads.MaxConcurrent)
	assert.Equal(t, 600, cfg.Downloads.Timeout)
	assert.Equal(t, 5, cfg.Downloads.RetryCount)
	assert.Equal(t, "TestAgent/1.0", cfg.Downloads.UserAgent)
	assert.Equal(t, "/tmp/downloads", cfg.Downloads.DownloadPath)
	assert.Equal(t, 120, cfg.Search.CacheTTL)
	assert.Equal(t, 200, cfg.Search.MaxResults)
	assert.Equal(t, 60, cfg.Search.TimeoutSeconds)
	assert.Equal(t, 10, cfg.Search.MaxConcurrent)
	assert.True(t, cfg.Prowlarr.Enabled)
	assert.Equal(t, "http://prowlarr:9696", cfg.Prowlarr.BaseURL)
	assert.Equal(t, "prowlarr-key", cfg.Prowlarr.APIKey)
	assert.Equal(t, 45, cfg.Prowlarr.TimeoutSeconds)
	assert.Equal(t, 120, cfg.Prowlarr.RateLimitRequests)
	assert.True(t, cfg.Jackett.Enabled)
	assert.Equal(t, "http://jackett:9117", cfg.Jackett.BaseURL)
	assert.Equal(t, "jackett-key", cfg.Jackett.APIKey)
}

func TestConfigFromEnvironmentVariables(t *testing.T) {
	// Set environment variables
	envVars := map[string]string{
		"FOLIOFOX_ENVIRONMENT":                "production",
		"FOLIOFOX_SERVER_PORT":               "8090",
		"FOLIOFOX_SERVER_HOST":               "0.0.0.0",
		"FOLIOFOX_DATABASE_PATH":             "/data/prod.db",
		"FOLIOFOX_REDIS_HOST":                "redis.example.com",
		"FOLIOFOX_REDIS_PORT":                "6379",
		"FOLIOFOX_REDIS_PASSWORD":            "redispass",
		"FOLIOFOX_REDIS_DB":                  "2",
		"FOLIOFOX_LOG_LEVEL":                 "warn",
		"FOLIOFOX_AUTH_JWT_SECRET":           "super-secret-key",
		"FOLIOFOX_AUTH_TOKEN_DURATION":       "12",
		"FOLIOFOX_DOWNLOADS_MAX_CONCURRENT":  "2",
		"FOLIOFOX_DOWNLOADS_TIMEOUT":         "180",
		"FOLIOFOX_DOWNLOADS_RETRY_COUNT":     "1",
		"FOLIOFOX_DOWNLOADS_USER_AGENT":      "ProdAgent/2.0",
		"FOLIOFOX_DOWNLOADS_DOWNLOAD_PATH":   "/var/downloads",
		"FOLIOFOX_SEARCH_CACHE_TTL":          "30",
		"FOLIOFOX_SEARCH_MAX_RESULTS":        "25",
		"FOLIOFOX_SEARCH_TIMEOUT_SECONDS":    "15",
		"FOLIOFOX_SEARCH_MAX_CONCURRENT":     "2",
		"FOLIOFOX_PROWLARR_ENABLED":          "true",
		"FOLIOFOX_PROWLARR_BASE_URL":         "http://prowlarr.internal:9696",
		"FOLIOFOX_PROWLARR_API_KEY":          "prowlarr-prod-key",
		"FOLIOFOX_PROWLARR_TIMEOUT_SECONDS":  "20",
		"FOLIOFOX_JACKETT_ENABLED":           "true",
		"FOLIOFOX_JACKETT_BASE_URL":          "http://jackett.internal:9117",
		"FOLIOFOX_JACKETT_API_KEY":           "jackett-prod-key",
		"FOLIOFOX_JACKETT_TIMEOUT_SECONDS":   "20",
	}
	
	// Set all environment variables
	for key, value := range envVars {
		os.Setenv(key, value)
	}
	
	// Cleanup environment variables after test
	t.Cleanup(func() {
		for key := range envVars {
			os.Unsetenv(key)
		}
	})
	
	// Reset viper state
	viper.Reset()
	
	cfg, err := Load()
	require.NoError(t, err)
	assert.NotNil(t, cfg)
	
	// Test that environment variables override defaults
	assert.Equal(t, "production", cfg.Environment)
	assert.Equal(t, 8090, cfg.Server.Port)
	assert.Equal(t, "0.0.0.0", cfg.Server.Host)
	assert.Equal(t, "/data/prod.db", cfg.Database.Path)
	assert.Equal(t, "redis.example.com", cfg.Redis.Host)
	assert.Equal(t, 6379, cfg.Redis.Port)
	assert.Equal(t, "redispass", cfg.Redis.Password)
	assert.Equal(t, 2, cfg.Redis.DB)
	assert.Equal(t, "warn", cfg.Log.Level)
	assert.Equal(t, "super-secret-key", cfg.Auth.JWTSecret)
	assert.Equal(t, 12, cfg.Auth.TokenDuration)
	assert.Equal(t, 2, cfg.Downloads.MaxConcurrent)
	assert.Equal(t, 180, cfg.Downloads.Timeout)
	assert.Equal(t, 1, cfg.Downloads.RetryCount)
	assert.Equal(t, "ProdAgent/2.0", cfg.Downloads.UserAgent)
	assert.Equal(t, "/var/downloads", cfg.Downloads.DownloadPath)
	assert.Equal(t, 30, cfg.Search.CacheTTL)
	assert.Equal(t, 25, cfg.Search.MaxResults)
	assert.Equal(t, 15, cfg.Search.TimeoutSeconds)
	assert.Equal(t, 2, cfg.Search.MaxConcurrent)
	assert.True(t, cfg.Prowlarr.Enabled)
	assert.Equal(t, "http://prowlarr.internal:9696", cfg.Prowlarr.BaseURL)
	assert.Equal(t, "prowlarr-prod-key", cfg.Prowlarr.APIKey)
	assert.Equal(t, 20, cfg.Prowlarr.TimeoutSeconds)
	assert.True(t, cfg.Jackett.Enabled)
	assert.Equal(t, "http://jackett.internal:9117", cfg.Jackett.BaseURL)
	assert.Equal(t, "jackett-prod-key", cfg.Jackett.APIKey)
	assert.Equal(t, 20, cfg.Jackett.TimeoutSeconds)
}

func TestConfigFileNotFound(t *testing.T) {
	// Reset viper and set a non-existent config path
	viper.Reset()
	viper.AddConfigPath("/non/existent/path")
	
	// Should not error when config file is not found, should use defaults
	cfg, err := Load()
	require.NoError(t, err)
	assert.NotNil(t, cfg)
	
	// Should use default values
	assert.Equal(t, "development", cfg.Environment)
	assert.Equal(t, 8080, cfg.Server.Port)
}

func TestConfigInvalidYaml(t *testing.T) {
	// Create temporary config file with invalid YAML
	tempDir := t.TempDir()
	configFile := filepath.Join(tempDir, "config.yaml")
	
	invalidYaml := `
server:
  port: 8080
  invalid yaml here [[[
database:
  path: /tmp/test.db
`
	
	err := os.WriteFile(configFile, []byte(invalidYaml), 0644)
	require.NoError(t, err)
	
	// Reset viper and set config path
	viper.Reset()
	viper.AddConfigPath(tempDir)
	
	// Should return error for invalid YAML
	_, err = Load()
	require.Error(t, err)
}

func TestConfigStructValidation(t *testing.T) {
	viper.Reset()
	
	cfg, err := Load()
	require.NoError(t, err)
	
	// Test that all required nested structs are initialized
	assert.NotNil(t, cfg.Server)
	assert.NotNil(t, cfg.Database)
	assert.NotNil(t, cfg.Redis)
	assert.NotNil(t, cfg.Log)
	assert.NotNil(t, cfg.Auth)
	assert.NotNil(t, cfg.Downloads)
	assert.NotNil(t, cfg.Search)
	assert.NotNil(t, cfg.Prowlarr)
	assert.NotNil(t, cfg.Jackett)
}

func TestConfigMixedSources(t *testing.T) {
	// Test that environment variables override file values
	tempDir := t.TempDir()
	configFile := filepath.Join(tempDir, "config.yaml")
	
	// Create config file with some values
	configContent := `
server:
  port: 8080
  host: "localhost"
database:
  path: "/tmp/file.db"
redis:
  host: "localhost"
  port: 6379
`
	
	err := os.WriteFile(configFile, []byte(configContent), 0644)
	require.NoError(t, err)
	
	// Set some environment variables that should override file values
	os.Setenv("FOLIOFOX_SERVER_PORT", "9090")
	os.Setenv("FOLIOFOX_REDIS_HOST", "redis-server")
	
	t.Cleanup(func() {
		os.Unsetenv("FOLIOFOX_SERVER_PORT")
		os.Unsetenv("FOLIOFOX_REDIS_HOST")
	})
	
	// Reset viper and set config path
	viper.Reset()
	viper.AddConfigPath(tempDir)
	
	cfg, err := Load()
	require.NoError(t, err)
	
	// Environment variables should override file values
	assert.Equal(t, 9090, cfg.Server.Port)        // overridden by env var
	assert.Equal(t, "localhost", cfg.Server.Host) // from file
	assert.Equal(t, "/tmp/file.db", cfg.Database.Path) // from file
	assert.Equal(t, "redis-server", cfg.Redis.Host)    // overridden by env var
	assert.Equal(t, 6379, cfg.Redis.Port)              // from file
}

func TestConfigValidation(t *testing.T) {
	tests := []struct {
		name    string
		setup   func()
		wantErr bool
	}{
		{
			name: "valid config",
			setup: func() {
				viper.Reset()
			},
			wantErr: false,
		},
		{
			name: "negative port",
			setup: func() {
				viper.Reset()
				viper.Set("server.port", -1)
			},
			wantErr: false, // Currently no validation, but could be added
		},
		{
			name: "empty jwt secret",
			setup: func() {
				viper.Reset()
				viper.Set("auth.jwt_secret", "")
			},
			wantErr: false, // Currently no validation, but could be added
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()
			
			cfg, err := Load()
			
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, cfg)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, cfg)
			}
		})
	}
}

// Benchmark config loading
func BenchmarkConfigLoad(b *testing.B) {
	for i := 0; i < b.N; i++ {
		viper.Reset()
		_, err := Load()
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkConfigLoadWithFile(b *testing.B) {
	// Create temporary config file
	tempDir := b.TempDir()
	configFile := filepath.Join(tempDir, "config.yaml")
	
	configContent := `
server:
  port: 8080
  host: "localhost"
database:
  path: "/tmp/test.db"
redis:
  host: "localhost"
  port: 6379
`
	
	err := os.WriteFile(configFile, []byte(configContent), 0644)
	if err != nil {
		b.Fatal(err)
	}
	
	b.ResetTimer()
	
	for i := 0; i < b.N; i++ {
		viper.Reset()
		viper.AddConfigPath(tempDir)
		_, err := Load()
		if err != nil {
			b.Fatal(err)
		}
	}
}