package models

import (
	"time"
)

// IndexerType represents the type of indexer
type IndexerType string

const (
	IndexerTypePublic      IndexerType = "public"
	IndexerTypePrivate     IndexerType = "private"
	IndexerTypeSemiPrivate IndexerType = "semi-private"
)

// IndexerStatus represents the health status of an indexer
type IndexerStatus string

const (
	IndexerStatusHealthy     IndexerStatus = "healthy"
	IndexerStatusDegraded    IndexerStatus = "degraded"
	IndexerStatusDown        IndexerStatus = "down"
	IndexerStatusMaintenance IndexerStatus = "maintenance"
)

// Indexer represents an indexer/source for book downloads
type Indexer struct {
	ID               int64       `json:"id" db:"id"`
	Name             string      `json:"name" db:"name"`
	BaseURL          string      `json:"base_url" db:"base_url"`
	APIEndpoint      *string     `json:"api_endpoint,omitempty" db:"api_endpoint"`
	IndexerType      IndexerType `json:"indexer_type" db:"indexer_type"`
	SupportsSearch   bool        `json:"supports_search" db:"supports_search"`
	SupportsDownload bool        `json:"supports_download" db:"supports_download"`
	IsActive         bool        `json:"is_active" db:"is_active"`
	Priority         int         `json:"priority" db:"priority"`
	RateLimitRequests int        `json:"rate_limit_requests" db:"rate_limit_requests"`
	RateLimitWindow  int         `json:"rate_limit_window" db:"rate_limit_window"`
	TimeoutSeconds   int         `json:"timeout_seconds" db:"timeout_seconds"`
	UserAgent        *string     `json:"user_agent,omitempty" db:"user_agent"`
	Description      *string     `json:"description,omitempty" db:"description"`
	Website          *string     `json:"website,omitempty" db:"website"`
	CreatedAt        time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time   `json:"updated_at" db:"updated_at"`

	// Current health status (from latest health check)
	Status           *IndexerStatus `json:"status,omitempty"`
	LastHealthCheck  *time.Time     `json:"last_health_check,omitempty"`
	ResponseTimeMS   *int           `json:"response_time_ms,omitempty"`
	ErrorMessage     *string        `json:"error_message,omitempty"`
}

// UserIndexerConfig represents per-user indexer configuration
type UserIndexerConfig struct {
	ID              int64      `json:"id" db:"id"`
	UserID          int64      `json:"user_id" db:"user_id"`
	IndexerID       int64      `json:"indexer_id" db:"indexer_id"`
	IsEnabled       bool       `json:"is_enabled" db:"is_enabled"`
	APIKey          *string    `json:"api_key,omitempty" db:"api_key"`
	Username        *string    `json:"username,omitempty" db:"username"`
	PasswordHash    *string    `json:"-" db:"password_hash"`
	CustomSettings  *string    `json:"custom_settings,omitempty" db:"custom_settings"` // JSON
	LastTestDate    *time.Time `json:"last_test_date,omitempty" db:"last_test_date"`
	LastTestSuccess *bool      `json:"last_test_success,omitempty" db:"last_test_success"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`

	// Relationships
	Indexer *Indexer `json:"indexer,omitempty"`
}

// IndexerHealth represents health monitoring data for an indexer
type IndexerHealth struct {
	ID             int64         `json:"id" db:"id"`
	IndexerID      int64         `json:"indexer_id" db:"indexer_id"`
	Status         IndexerStatus `json:"status" db:"status"`
	ResponseTimeMS *int          `json:"response_time_ms,omitempty" db:"response_time_ms"`
	ErrorMessage   *string       `json:"error_message,omitempty" db:"error_message"`
	CheckedAt      time.Time     `json:"checked_at" db:"checked_at"`
}

// IndexerSearchPreferences represents search preferences per indexer per user
type IndexerSearchPreferences struct {
	ID              int64     `json:"id" db:"id"`
	UserID          int64     `json:"user_id" db:"user_id"`
	IndexerID       int64     `json:"indexer_id" db:"indexer_id"`
	SearchCategories *string  `json:"search_categories,omitempty" db:"search_categories"` // JSON array
	QualityFilters  *string   `json:"quality_filters,omitempty" db:"quality_filters"`   // JSON object
	LanguageFilters *string   `json:"language_filters,omitempty" db:"language_filters"` // JSON array
	FormatFilters   *string   `json:"format_filters,omitempty" db:"format_filters"`     // JSON array
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

// SearchResult represents a search result from an indexer
type SearchResult struct {
	IndexerID        int64             `json:"indexer_id"`
	IndexerName      string            `json:"indexer_name"`
	Title            string            `json:"title"`
	Author           *string           `json:"author,omitempty"`
	Description      *string           `json:"description,omitempty"`
	Format           string            `json:"format"`
	FileSizeBytes    *int64            `json:"file_size_bytes,omitempty"`
	FileSizeHuman    string            `json:"file_size_human"`
	QualityScore     int               `json:"quality_score"`
	DownloadURL      string            `json:"download_url"`
	SourceURL        *string           `json:"source_url,omitempty"`
	Language         *string           `json:"language,omitempty"`
	PublicationYear  *int              `json:"publication_year,omitempty"`
	ISBN             *string           `json:"isbn,omitempty"`
	CoverURL         *string           `json:"cover_url,omitempty"`
	Tags             []string          `json:"tags,omitempty"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
	FoundAt          time.Time         `json:"found_at"`
	RelevanceScore   float64           `json:"relevance_score,omitempty"`
}

// SearchRequest represents a search request across indexers
type SearchRequest struct {
	Query        string   `json:"query" binding:"required"`
	Indexers     []int64  `json:"indexers,omitempty"`
	Formats      []string `json:"formats,omitempty"`
	Languages    []string `json:"languages,omitempty"`
	MinQuality   int      `json:"min_quality,omitempty"`
	MaxSizeMB    int      `json:"max_size_mb,omitempty"`
	Timeout      int      `json:"timeout,omitempty"`
	Limit        int      `json:"limit,omitempty"`
	UseCache     bool     `json:"use_cache,omitempty"`
}

// SearchResponse represents a search response with results from multiple indexers
type SearchResponse struct {
	Query             string                    `json:"query"`
	Results           []SearchResult            `json:"results"`
	TotalResults      int                       `json:"total_results"`
	IndexersSearched  []IndexerSearchResult     `json:"indexers_searched"`
	SearchDurationMS  int                       `json:"search_duration_ms"`
	Cached            bool                      `json:"cached"`
	CacheExpiresAt    *time.Time                `json:"cache_expires_at,omitempty"`
}

// IndexerSearchResult represents the result from searching a specific indexer
type IndexerSearchResult struct {
	IndexerID      int64   `json:"indexer_id"`
	IndexerName    string  `json:"indexer_name"`
	ResultCount    int     `json:"result_count"`
	ResponseTimeMS int     `json:"response_time_ms"`
	Error          *string `json:"error,omitempty"`
}

// SearchHistoryEntry represents a user's search history entry
type SearchHistoryEntry struct {
	ID               int64                  `json:"id" db:"id"`
	UserID           int64                  `json:"user_id" db:"user_id"`
	Query            string                 `json:"query" db:"query"`
	Filters          map[string]interface{} `json:"filters,omitempty" db:"filters"` // JSON
	ResultsCount     int                    `json:"results_count" db:"results_count"`
	IndexersSearched []int64                `json:"indexers_searched" db:"indexers_searched"` // JSON array
	SearchDurationMS int                    `json:"search_duration_ms" db:"search_duration_ms"`
	SearchedAt       time.Time              `json:"searched_at" db:"searched_at"`
}

// IndexerTestResult represents the result of testing an indexer connection
type IndexerTestResult struct {
	IndexerID      int64    `json:"indexer_id"`
	Success        bool     `json:"success"`
	ResponseTimeMS int      `json:"response_time_ms"`
	ErrorMessage   *string  `json:"error_message,omitempty"`
	Capabilities   []string `json:"capabilities,omitempty"`
	Version        *string  `json:"version,omitempty"`
}

// Prowlarr-specific types

// ProwlarrConfig represents Prowlarr integration configuration
type ProwlarrConfig struct {
	Enabled            bool       `json:"enabled"`
	BaseURL            string     `json:"base_url"`
	APIKey             string     `json:"api_key,omitempty"` // Masked in responses
	TimeoutSeconds     int        `json:"timeout_seconds"`
	RateLimitRequests  int        `json:"rate_limit_requests"`
	RateLimitWindow    int        `json:"rate_limit_window"`
	SyncIntervalHours  int        `json:"sync_interval_hours"`
	LastSync           *time.Time `json:"last_sync,omitempty"`
	Version            *string    `json:"version,omitempty"`
	Status             string     `json:"status"`
}

// ProwlarrIndexer represents an indexer from Prowlarr
type ProwlarrIndexer struct {
	ProwlarrID      int         `json:"prowlarr_id"`
	Name            string      `json:"name"`
	Description     *string     `json:"description,omitempty"`
	Language        string      `json:"language"`
	Type            string      `json:"type"`
	Protocol        string      `json:"protocol"`
	Categories      []int       `json:"categories"`
	Capabilities    []string    `json:"capabilities"`
	IsEnabled       bool        `json:"is_enabled"`
	Priority        int         `json:"priority"`
	LastRSSSync     *time.Time  `json:"last_rss_sync,omitempty"`
	LocalIndexerID  *int64      `json:"local_indexer_id,omitempty"`
}

// Jackett-specific types

// JackettConfig represents Jackett integration configuration
type JackettConfig struct {
	Enabled        bool    `json:"enabled"`
	BaseURL        string  `json:"base_url"`
	APIKey         string  `json:"api_key,omitempty"` // Masked in responses
	TimeoutSeconds int     `json:"timeout_seconds"`
	RateLimitRequests int  `json:"rate_limit_requests"`
	RateLimitWindow   int  `json:"rate_limit_window"`
	Version        *string `json:"version,omitempty"`
	Status         string  `json:"status"`
}

// JackettIndexer represents an indexer from Jackett
type JackettIndexer struct {
	JackettID     string   `json:"jackett_id"`
	Name          string   `json:"name"`
	Description   *string  `json:"description,omitempty"`
	Language      string   `json:"language"`
	Type          string   `json:"type"`
	Category      string   `json:"category"`
	IsConfigured  bool     `json:"is_configured"`
	IsWorking     *bool    `json:"is_working,omitempty"`
	LastError     *string  `json:"last_error,omitempty"`
	Capabilities  []string `json:"capabilities"`
}