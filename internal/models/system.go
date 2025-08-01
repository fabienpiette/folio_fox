package models

import (
	"time"
)

// SystemSettings represents global system configuration
type SystemSettings struct {
	ID                     int64     `json:"id" db:"id"`
	ApplicationName        string    `json:"application_name" db:"application_name"`
	MaxConcurrentDownloads int       `json:"max_concurrent_downloads" db:"max_concurrent_downloads"`
	DefaultRetryCount      int       `json:"default_retry_count" db:"default_retry_count"`
	DefaultTimeoutSeconds  int       `json:"default_timeout_seconds" db:"default_timeout_seconds"`
	EnableWebhooks         bool      `json:"enable_webhooks" db:"enable_webhooks"`
	WebhookURL             *string   `json:"webhook_url,omitempty" db:"webhook_url"`
	EnableMetrics          bool      `json:"enable_metrics" db:"enable_metrics"`
	LogLevel               string    `json:"log_level" db:"log_level"`
	DatabaseMaintenanceHour int      `json:"database_maintenance_hour" db:"database_maintenance_hour"`
	AutoCleanupEnabled     bool      `json:"auto_cleanup_enabled" db:"auto_cleanup_enabled"`
	AutoCleanupDays        int       `json:"auto_cleanup_days" db:"auto_cleanup_days"`
	CreatedAt              time.Time `json:"created_at" db:"created_at"`
	UpdatedAt              time.Time `json:"updated_at" db:"updated_at"`
}

// SystemSettingsUpdateRequest represents a request to update system settings
type SystemSettingsUpdateRequest struct {
	ApplicationName        *string `json:"application_name,omitempty"`
	MaxConcurrentDownloads *int    `json:"max_concurrent_downloads,omitempty" binding:"omitempty,min=1,max=10"`
	DefaultRetryCount      *int    `json:"default_retry_count,omitempty" binding:"omitempty,min=0,max=10"`
	DefaultTimeoutSeconds  *int    `json:"default_timeout_seconds,omitempty" binding:"omitempty,min=5,max=300"`
	EnableWebhooks         *bool   `json:"enable_webhooks,omitempty"`
	WebhookURL             *string `json:"webhook_url,omitempty" binding:"omitempty,url"`
	EnableMetrics          *bool   `json:"enable_metrics,omitempty"`
	LogLevel               *string `json:"log_level,omitempty" binding:"omitempty,oneof=debug info warn error"`
	DatabaseMaintenanceHour *int   `json:"database_maintenance_hour,omitempty" binding:"omitempty,min=0,max=23"`
	AutoCleanupEnabled     *bool   `json:"auto_cleanup_enabled,omitempty"`
	AutoCleanupDays        *int    `json:"auto_cleanup_days,omitempty" binding:"omitempty,min=1,max=365"`
}

// SystemLog represents a system log entry
type SystemLog struct {
	ID        int64     `json:"id" db:"id"`
	Level     string    `json:"level" db:"level"`
	Component string    `json:"component" db:"component"`
	Message   string    `json:"message" db:"message"`
	Context   *string   `json:"context,omitempty" db:"context"`
	UserID    *int64    `json:"user_id,omitempty" db:"user_id"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// MaintenanceTask represents a system maintenance task
type MaintenanceTask struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
}

// MaintenanceResult represents the result of running maintenance tasks
type MaintenanceResult struct {
	TaskName    string    `json:"task_name"`
	Success     bool      `json:"success"`
	Message     string    `json:"message"`
	StartedAt   time.Time `json:"started_at"`
	CompletedAt time.Time `json:"completed_at"`
	Duration    string    `json:"duration"`
}

// MaintenanceResponse represents the response from running maintenance
type MaintenanceResponse struct {
	Message   string              `json:"message"`
	Results   []MaintenanceResult `json:"results"`
	StartedAt time.Time           `json:"started_at"`
	Duration  string              `json:"duration"`
}

// SystemLogParams represents parameters for querying system logs
type SystemLogParams struct {
	Level     string `form:"level"`
	Component string `form:"component"`
	Since     string `form:"since"`
	Limit     int    `form:"limit"`
}