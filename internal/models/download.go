package models

import (
	"time"
)

// DownloadStatus represents the status of a download
type DownloadStatus string

const (
	DownloadStatusPending     DownloadStatus = "pending"
	DownloadStatusDownloading DownloadStatus = "downloading"
	DownloadStatusCompleted   DownloadStatus = "completed"
	DownloadStatusFailed      DownloadStatus = "failed"
	DownloadStatusCancelled   DownloadStatus = "cancelled"
	DownloadStatusPaused      DownloadStatus = "paused"
)

// DownloadQueueItem represents an item in the download queue
type DownloadQueueItem struct {
	ID                    int64            `json:"id" db:"id"`
	UserID                int64            `json:"user_id" db:"user_id"`
	BookID                *int64           `json:"book_id,omitempty" db:"book_id"`
	IndexerID             int64            `json:"indexer_id" db:"indexer_id"`
	Title                 string           `json:"title" db:"title"`
	AuthorName            *string          `json:"author_name,omitempty" db:"author_name"`
	DownloadURL           string           `json:"download_url" db:"download_url"`
	FileFormat            string           `json:"file_format" db:"file_format"`
	FileSizeBytes         *int64           `json:"file_size_bytes,omitempty" db:"file_size_bytes"`
	Priority              int              `json:"priority" db:"priority"`
	Status                DownloadStatus   `json:"status" db:"status"`
	ProgressPercentage    int              `json:"progress_percentage" db:"progress_percentage"`
	DownloadPath          *string          `json:"download_path,omitempty" db:"download_path"`
	QualityProfileID      *int64           `json:"quality_profile_id,omitempty" db:"quality_profile_id"`
	RetryCount            int              `json:"retry_count" db:"retry_count"`
	MaxRetries            int              `json:"max_retries" db:"max_retries"`
	ErrorMessage          *string          `json:"error_message,omitempty" db:"error_message"`
	EstimatedCompletion   *time.Time       `json:"estimated_completion,omitempty" db:"estimated_completion"`
	StartedAt             *time.Time       `json:"started_at,omitempty" db:"started_at"`
	CompletedAt           *time.Time       `json:"completed_at,omitempty" db:"completed_at"`
	CreatedAt             time.Time        `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time        `json:"updated_at" db:"updated_at"`

	// Relationships
	User            *User            `json:"user,omitempty"`
	Book            *Book            `json:"book,omitempty"`
	Indexer         *Indexer         `json:"indexer,omitempty"`
	QualityProfile  *QualityProfile  `json:"quality_profile,omitempty"`

	// Runtime fields
	DownloadSpeedKBPS   *float64 `json:"download_speed_kbps,omitempty"`
	ETASeconds          *int     `json:"eta_seconds,omitempty"`
	BytesDownloaded     int64    `json:"bytes_downloaded,omitempty"`
	FileSizeHuman       string   `json:"file_size_human,omitempty"`
}

// DownloadHistoryItem represents a completed download in the history
type DownloadHistoryItem struct {
	ID                      int64      `json:"id" db:"id"`
	QueueID                 int64      `json:"queue_id" db:"queue_id"`
	UserID                  int64      `json:"user_id" db:"user_id"`
	BookID                  *int64     `json:"book_id,omitempty" db:"book_id"`
	IndexerID               int64      `json:"indexer_id" db:"indexer_id"`
	Title                   string     `json:"title" db:"title"`
	AuthorName              *string    `json:"author_name,omitempty" db:"author_name"`
	FileFormat              string     `json:"file_format" db:"file_format"`
	FileSizeBytes           *int64     `json:"file_size_bytes,omitempty" db:"file_size_bytes"`
	DownloadDurationSeconds *int       `json:"download_duration_seconds,omitempty" db:"download_duration_seconds"`
	FinalStatus             string     `json:"final_status" db:"final_status"`
	ErrorMessage            *string    `json:"error_message,omitempty" db:"error_message"`
	DownloadPath            *string    `json:"download_path,omitempty" db:"download_path"`
	CompletedAt             time.Time  `json:"completed_at" db:"completed_at"`

	// Relationships
	User    *User    `json:"user,omitempty"`
	Book    *Book    `json:"book,omitempty"`
	Indexer *Indexer `json:"indexer,omitempty"`

	// Computed fields
	FileSizeHuman        string  `json:"file_size_human,omitempty"`
	DownloadDurationHuman string `json:"download_duration_human,omitempty"`
	AverageSpeedKBPS     *float64 `json:"average_speed_kbps,omitempty"`
}

// DownloadCreateRequest represents a request to add an item to the download queue
type DownloadCreateRequest struct {
	Title            string            `json:"title" binding:"required"`
	AuthorName       *string           `json:"author_name,omitempty"`
	DownloadURL      string            `json:"download_url" binding:"required,url"`
	FileFormat       string            `json:"file_format" binding:"required"`
	FileSizeBytes    *int64            `json:"file_size_bytes,omitempty"`
	IndexerID        int64             `json:"indexer_id" binding:"required"`
	BookID           *int64            `json:"book_id,omitempty"`
	Priority         int               `json:"priority,omitempty"`
	QualityProfileID *int64            `json:"quality_profile_id,omitempty"`
	DownloadFolderID *int64            `json:"download_folder_id,omitempty"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
}

// DownloadUpdateRequest represents a request to update a download queue item
type DownloadUpdateRequest struct {
	Priority         *int    `json:"priority,omitempty"`
	DownloadPath     *string `json:"download_path,omitempty"`
	QualityProfileID *int64  `json:"quality_profile_id,omitempty"`
	MaxRetries       *int    `json:"max_retries,omitempty"`
}

// DownloadProgress represents real-time download progress information
type DownloadProgress struct {
	DownloadID        int64            `json:"download_id"`
	Status            DownloadStatus   `json:"status"`
	ProgressPercentage int             `json:"progress_percentage"`
	BytesDownloaded   int64            `json:"bytes_downloaded"`
	TotalBytes        *int64           `json:"total_bytes,omitempty"`
	DownloadSpeedKBPS *float64         `json:"download_speed_kbps,omitempty"`
	ETASeconds        *int             `json:"eta_seconds,omitempty"`
	ErrorMessage      *string          `json:"error_message,omitempty"`
	UpdatedAt         time.Time        `json:"updated_at"`
}

// DownloadStats represents download statistics
type DownloadStats struct {
	Period                     string                    `json:"period"`
	TotalDownloads            int                       `json:"total_downloads"`
	SuccessfulDownloads       int                       `json:"successful_downloads"`
	FailedDownloads           int                       `json:"failed_downloads"`
	CancelledDownloads        int                       `json:"cancelled_downloads"`
	SuccessRate               float64                   `json:"success_rate"`
	TotalBytesDownloaded      int64                     `json:"total_bytes_downloaded"`
	TotalBytesHuman           string                    `json:"total_bytes_human"`
	AverageDownloadSpeedKBPS  float64                   `json:"average_download_speed_kbps"`
	AverageFileSizeMB         float64                   `json:"average_file_size_mb"`
	MostDownloadedFormat      string                    `json:"most_downloaded_format"`
	TopIndexers               []IndexerDownloadStats    `json:"top_indexers"`
	DownloadsByDay            []DailyDownloadStats      `json:"downloads_by_day"`
	DownloadsByFormat         []FormatDownloadStats     `json:"downloads_by_format"`
}

// IndexerDownloadStats represents download statistics per indexer
type IndexerDownloadStats struct {
	IndexerName   string  `json:"indexer_name"`
	DownloadCount int     `json:"download_count"`
	SuccessRate   float64 `json:"success_rate"`
}

// DailyDownloadStats represents daily download statistics
type DailyDownloadStats struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
	Bytes int64  `json:"bytes"`
}

// FormatDownloadStats represents download statistics per format
type FormatDownloadStats struct {
	Format     string  `json:"format"`
	Count      int     `json:"count"`
	Percentage float64 `json:"percentage"`
}

// QualityProfile represents user download quality preferences
type QualityProfile struct {
	ID                  int64      `json:"id" db:"id"`
	UserID              int64      `json:"user_id" db:"user_id"`
	Name                string     `json:"name" db:"name"`
	PreferredFormats    StringList `json:"preferred_formats" db:"preferred_formats"`
	MinQualityScore     int        `json:"min_quality_score" db:"min_quality_score"`
	MaxFileSizeMB       *int       `json:"max_file_size_mb,omitempty" db:"max_file_size_mb"`
	LanguagePreferences StringList `json:"language_preferences" db:"language_preferences"`
	IsDefault           bool       `json:"is_default" db:"is_default"`
	CreatedAt           time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at" db:"updated_at"`
}