package repositories

import (
	"context"
	"database/sql"
	"time"

	"github.com/fabienpiette/folio_fox/internal/models"
)

// SQLiteUserPreferencesRepository implements UserPreferencesRepository using SQLite
type SQLiteUserPreferencesRepository struct {
	db *sql.DB
}

// NewUserPreferencesRepository creates a new SQLite-based user preferences repository
func NewUserPreferencesRepository(db *sql.DB) UserPreferencesRepository {
	return &SQLiteUserPreferencesRepository{
		db: db,
	}
}

// GetByUserID retrieves user preferences by user ID
func (r *SQLiteUserPreferencesRepository) GetByUserID(ctx context.Context, userID int64) (*models.UserPreferences, error) {
	query := `
		SELECT id, user_id, theme, language, timezone, notifications_enabled, auto_download,
			   preferred_quality_profile_id, default_download_folder_id, created_at, updated_at
		FROM user_preferences
		WHERE user_id = ?
	`
	
	var prefs models.UserPreferences
	var qualityProfileID, downloadFolderID sql.NullInt64
	
	err := r.db.QueryRowContext(ctx, query, userID).Scan(
		&prefs.ID, &prefs.UserID, &prefs.Theme, &prefs.Language, &prefs.Timezone,
		&prefs.NotificationsEnabled, &prefs.AutoDownload, &qualityProfileID,
		&downloadFolderID, &prefs.CreatedAt, &prefs.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return r.createDefaultPreferences(ctx, userID)
		}
		return nil, err
	}
	
	if qualityProfileID.Valid {
		prefs.PreferredQualityProfileID = &qualityProfileID.Int64
	}
	if downloadFolderID.Valid {
		prefs.DefaultDownloadFolderID = &downloadFolderID.Int64
	}
	
	return &prefs, nil
}

// createDefaultPreferences creates default preferences for a user
func (r *SQLiteUserPreferencesRepository) createDefaultPreferences(ctx context.Context, userID int64) (*models.UserPreferences, error) {
	prefs := &models.UserPreferences{
		UserID:               userID,
		Theme:                "dark",
		Language:             "en",
		Timezone:             "UTC",
		NotificationsEnabled: true,
		AutoDownload:         false,
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}
	
	err := r.CreateOrUpdate(ctx, prefs)
	if err != nil {
		return nil, err
	}
	
	return prefs, nil
}

// CreateOrUpdate creates or updates user preferences
func (r *SQLiteUserPreferencesRepository) CreateOrUpdate(ctx context.Context, preferences *models.UserPreferences) error {
	// Try to update first
	query := `
		UPDATE user_preferences SET
			theme = ?, language = ?, timezone = ?, notifications_enabled = ?, auto_download = ?,
			preferred_quality_profile_id = ?, default_download_folder_id = ?, updated_at = datetime('now')
		WHERE user_id = ?
	`
	
	result, err := r.db.ExecContext(ctx, query,
		preferences.Theme, preferences.Language, preferences.Timezone, preferences.NotificationsEnabled,
		preferences.AutoDownload, preferences.PreferredQualityProfileID, preferences.DefaultDownloadFolderID,
		preferences.UserID)
	if err != nil {
		return err
	}
	
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	
	if rowsAffected == 0 {
		// No rows updated, create new record
		insertQuery := `
			INSERT INTO user_preferences (
				user_id, theme, language, timezone, notifications_enabled, auto_download,
				preferred_quality_profile_id, default_download_folder_id, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
		`
		
		result, err := r.db.ExecContext(ctx, insertQuery,
			preferences.UserID, preferences.Theme, preferences.Language, preferences.Timezone,
			preferences.NotificationsEnabled, preferences.AutoDownload,
			preferences.PreferredQualityProfileID, preferences.DefaultDownloadFolderID)
		if err != nil {
			return err
		}
		
		if preferences.ID == 0 {
			id, err := result.LastInsertId()
			if err != nil {
				return err
			}
			preferences.ID = id
		}
		preferences.CreatedAt = time.Now()
	}
	
	preferences.UpdatedAt = time.Now()
	return nil
}

// GetDownloadFolders retrieves all download folders for a user
func (r *SQLiteUserPreferencesRepository) GetDownloadFolders(ctx context.Context, userID int64) ([]*models.DownloadFolder, error) {
	query := `
		SELECT id, user_id, name, path, is_default, auto_organize, folder_pattern, created_at, updated_at
		FROM download_folders
		WHERE user_id = ?
		ORDER BY is_default DESC, name ASC
	`
	
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var folders []*models.DownloadFolder
	
	for rows.Next() {
		var folder models.DownloadFolder
		
		err := rows.Scan(&folder.ID, &folder.UserID, &folder.Name, &folder.Path,
			&folder.IsDefault, &folder.AutoOrganize, &folder.FolderPattern,
			&folder.CreatedAt, &folder.UpdatedAt)
		if err != nil {
			return nil, err
		}
		
		folders = append(folders, &folder)
	}
	
	return folders, nil
}

// CreateDownloadFolder creates a new download folder
func (r *SQLiteUserPreferencesRepository) CreateDownloadFolder(ctx context.Context, folder *models.DownloadFolder) error {
	// If this is being set as default, unset other defaults first
	if folder.IsDefault {
		_, err := r.db.ExecContext(ctx, "UPDATE download_folders SET is_default = false WHERE user_id = ?", folder.UserID)
		if err != nil {
			return err
		}
	}
	
	query := `
		INSERT INTO download_folders (
			user_id, name, path, is_default, auto_organize, folder_pattern, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	`
	
	result, err := r.db.ExecContext(ctx, query,
		folder.UserID, folder.Name, folder.Path, folder.IsDefault, folder.AutoOrganize, folder.FolderPattern)
	if err != nil {
		return err
	}
	
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	
	folder.ID = id
	folder.CreatedAt = time.Now()
	folder.UpdatedAt = time.Now()
	
	return nil
}

// UpdateDownloadFolder updates a download folder
func (r *SQLiteUserPreferencesRepository) UpdateDownloadFolder(ctx context.Context, folder *models.DownloadFolder) error {
	// If this is being set as default, unset other defaults first
	if folder.IsDefault {
		_, err := r.db.ExecContext(ctx, "UPDATE download_folders SET is_default = false WHERE user_id = ? AND id != ?", folder.UserID, folder.ID)
		if err != nil {
			return err
		}
	}
	
	query := `
		UPDATE download_folders SET
			name = ?, path = ?, is_default = ?, auto_organize = ?, folder_pattern = ?, updated_at = datetime('now')
		WHERE id = ?
	`
	
	_, err := r.db.ExecContext(ctx, query,
		folder.Name, folder.Path, folder.IsDefault, folder.AutoOrganize, folder.FolderPattern, folder.ID)
	if err != nil {
		return err
	}
	
	folder.UpdatedAt = time.Now()
	return nil
}

// DeleteDownloadFolder deletes a download folder
func (r *SQLiteUserPreferencesRepository) DeleteDownloadFolder(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM download_folders WHERE id = ?", id)
	return err
}

// GetQualityProfiles retrieves all quality profiles for a user
func (r *SQLiteUserPreferencesRepository) GetQualityProfiles(ctx context.Context, userID int64) ([]*models.QualityProfile, error) {
	query := `
		SELECT id, user_id, name, preferred_formats, min_quality_score, max_file_size_mb,
			   language_preferences, is_default, created_at, updated_at
		FROM quality_profiles
		WHERE user_id = ?
		ORDER BY is_default DESC, name ASC
	`
	
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var profiles []*models.QualityProfile
	
	for rows.Next() {
		var profile models.QualityProfile
		var maxFileSizeMB sql.NullInt64
		
		err := rows.Scan(&profile.ID, &profile.UserID, &profile.Name, &profile.PreferredFormats,
			&profile.MinQualityScore, &maxFileSizeMB, &profile.LanguagePreferences,
			&profile.IsDefault, &profile.CreatedAt, &profile.UpdatedAt)
		if err != nil {
			return nil, err
		}
		
		if maxFileSizeMB.Valid {
			maxSize := int(maxFileSizeMB.Int64)
			profile.MaxFileSizeMB = &maxSize
		}
		
		profiles = append(profiles, &profile)
	}
	
	return profiles, nil
}

// CreateQualityProfile creates a new quality profile
func (r *SQLiteUserPreferencesRepository) CreateQualityProfile(ctx context.Context, profile *models.QualityProfile) error {
	// If this is being set as default, unset other defaults first
	if profile.IsDefault {
		_, err := r.db.ExecContext(ctx, "UPDATE quality_profiles SET is_default = false WHERE user_id = ?", profile.UserID)
		if err != nil {
			return err
		}
	}
	
	query := `
		INSERT INTO quality_profiles (
			user_id, name, preferred_formats, min_quality_score, max_file_size_mb,
			language_preferences, is_default, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	`
	
	result, err := r.db.ExecContext(ctx, query,
		profile.UserID, profile.Name, profile.PreferredFormats, profile.MinQualityScore, profile.MaxFileSizeMB,
		profile.LanguagePreferences, profile.IsDefault)
	if err != nil {
		return err
	}
	
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	
	profile.ID = id
	profile.CreatedAt = time.Now()
	profile.UpdatedAt = time.Now()
	
	return nil
}

// UpdateQualityProfile updates a quality profile
func (r *SQLiteUserPreferencesRepository) UpdateQualityProfile(ctx context.Context, profile *models.QualityProfile) error {
	// If this is being set as default, unset other defaults first
	if profile.IsDefault {
		_, err := r.db.ExecContext(ctx, "UPDATE quality_profiles SET is_default = false WHERE user_id = ? AND id != ?", profile.UserID, profile.ID)
		if err != nil {
			return err
		}
	}
	
	query := `
		UPDATE quality_profiles SET
			name = ?, preferred_formats = ?, min_quality_score = ?, max_file_size_mb = ?,
			language_preferences = ?, is_default = ?, updated_at = datetime('now')
		WHERE id = ?
	`
	
	_, err := r.db.ExecContext(ctx, query,
		profile.Name, profile.PreferredFormats, profile.MinQualityScore, profile.MaxFileSizeMB,
		profile.LanguagePreferences, profile.IsDefault, profile.ID)
	if err != nil {
		return err
	}
	
	profile.UpdatedAt = time.Now()
	return nil
}

// DeleteQualityProfile deletes a quality profile
func (r *SQLiteUserPreferencesRepository) DeleteQualityProfile(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM quality_profiles WHERE id = ?", id)
	return err
}