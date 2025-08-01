package models

import (
	"time"
)

// User represents a user in the system
type User struct {
	ID        int64      `json:"id" db:"id"`
	Username  string     `json:"username" db:"username"`
	Email     *string    `json:"email,omitempty" db:"email"`
	PasswordHash string  `json:"-" db:"password_hash"`
	IsActive  bool       `json:"is_active" db:"is_active"`
	IsAdmin   bool       `json:"is_admin" db:"is_admin"`
	LastLogin *time.Time `json:"last_login,omitempty" db:"last_login"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`

	// Relationships (loaded separately)
	Preferences      *UserPreferences   `json:"preferences,omitempty"`
	DownloadFolders  []DownloadFolder   `json:"download_folders,omitempty"`
	QualityProfiles  []QualityProfile   `json:"quality_profiles,omitempty"`
}

// UserPreferences represents user preferences and settings
type UserPreferences struct {
	ID                        int64  `json:"id" db:"id"`
	UserID                    int64  `json:"user_id" db:"user_id"`
	Theme                     string `json:"theme" db:"theme"`
	Language                  string `json:"language" db:"language"`
	Timezone                  string `json:"timezone" db:"timezone"`
	NotificationsEnabled      bool   `json:"notifications_enabled" db:"notifications_enabled"`
	AutoDownload              bool   `json:"auto_download" db:"auto_download"`
	PreferredQualityProfileID *int64 `json:"preferred_quality_profile_id,omitempty" db:"preferred_quality_profile_id"`
	DefaultDownloadFolderID   *int64 `json:"default_download_folder_id,omitempty" db:"default_download_folder_id"`
	CreatedAt                 time.Time `json:"created_at" db:"created_at"`
	UpdatedAt                 time.Time `json:"updated_at" db:"updated_at"`
}

// DownloadFolder represents a download folder configuration
type DownloadFolder struct {
	ID            int64     `json:"id" db:"id"`
	UserID        int64     `json:"user_id" db:"user_id"`
	Name          string    `json:"name" db:"name"`
	Path          string    `json:"path" db:"path"`
	IsDefault     bool      `json:"is_default" db:"is_default"`
	AutoOrganize  bool      `json:"auto_organize" db:"auto_organize"`
	FolderPattern string    `json:"folder_pattern" db:"folder_pattern"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

// LoginRequest represents a login request
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse represents a login response
type LoginResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	User        *User  `json:"user"`
}

// RefreshTokenRequest represents a refresh token request
type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// UserCreateRequest represents a request to create a new user
type UserCreateRequest struct {
	Username string  `json:"username" binding:"required,min=3,max=50"`
	Email    *string `json:"email,omitempty" binding:"omitempty,email"`
	Password string  `json:"password" binding:"required,min=8"`
	IsAdmin  bool    `json:"is_admin,omitempty"`
}

// UserUpdateRequest represents a request to update a user
type UserUpdateRequest struct {
	Email           *string `json:"email,omitempty" binding:"omitempty,email"`
	CurrentPassword *string `json:"current_password,omitempty"`
	NewPassword     *string `json:"new_password,omitempty" binding:"omitempty,min=8"`
	IsActive        *bool   `json:"is_active,omitempty"`
	IsAdmin         *bool   `json:"is_admin,omitempty"`
}

// UserPreferencesUpdateRequest represents a request to update user preferences
type UserPreferencesUpdateRequest struct {
	Theme                     *string `json:"theme,omitempty" binding:"omitempty,oneof=light dark auto"`
	Language                  *string `json:"language,omitempty"`
	Timezone                  *string `json:"timezone,omitempty"`
	NotificationsEnabled      *bool   `json:"notifications_enabled,omitempty"`
	AutoDownload              *bool   `json:"auto_download,omitempty"`
	PreferredQualityProfileID *int64  `json:"preferred_quality_profile_id,omitempty"`
	DefaultDownloadFolderID   *int64  `json:"default_download_folder_id,omitempty"`
}

// DownloadFolderCreateRequest represents a request to create a download folder
type DownloadFolderCreateRequest struct {
	Name          string `json:"name" binding:"required"`
	Path          string `json:"path" binding:"required"`
	IsDefault     bool   `json:"is_default,omitempty"`
	AutoOrganize  bool   `json:"auto_organize,omitempty"`
	FolderPattern string `json:"folder_pattern,omitempty"`
}

// DownloadFolderUpdateRequest represents a request to update a download folder
type DownloadFolderUpdateRequest struct {
	Name          *string `json:"name,omitempty"`
	Path          *string `json:"path,omitempty"`
	IsDefault     *bool   `json:"is_default,omitempty"`
	AutoOrganize  *bool   `json:"auto_organize,omitempty"`
	FolderPattern *string `json:"folder_pattern,omitempty"`
}

// QualityProfileCreateRequest represents a request to create a quality profile
type QualityProfileCreateRequest struct {
	Name                string   `json:"name" binding:"required"`
	PreferredFormats    []string `json:"preferred_formats" binding:"required,min=1"`
	MinQualityScore     int      `json:"min_quality_score,omitempty"`
	MaxFileSizeMB       *int     `json:"max_file_size_mb,omitempty"`
	LanguagePreferences []string `json:"language_preferences,omitempty"`
	QualityOrder        []string `json:"quality_order,omitempty"`
	IsDefault           bool     `json:"is_default,omitempty"`
}

// QualityProfileUpdateRequest represents a request to update a quality profile
type QualityProfileUpdateRequest struct {
	Name                *string  `json:"name,omitempty"`
	PreferredFormats    []string `json:"preferred_formats,omitempty"`
	MinQualityScore     *int     `json:"min_quality_score,omitempty"`
	MaxFileSizeMB       *int     `json:"max_file_size_mb,omitempty"`
	LanguagePreferences []string `json:"language_preferences,omitempty"`
	QualityOrder        []string `json:"quality_order,omitempty"`
	IsDefault           *bool    `json:"is_default,omitempty"`
}

// UserSession represents an active user session
type UserSession struct {
	ID        string    `json:"id"`
	UserID    int64     `json:"user_id"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
}