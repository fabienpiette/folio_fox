package repositories

import (
	"context"
	"database/sql"
	"time"

	"github.com/fabienpiette/folio_fox/internal/models"
)

// SQLiteIndexerRepository implements IndexerRepository using SQLite
type SQLiteIndexerRepository struct {
	db *sql.DB
}

// NewIndexerRepository creates a new SQLite-based indexer repository
func NewIndexerRepository(db *sql.DB) IndexerRepository {
	return &SQLiteIndexerRepository{
		db: db,
	}
}

// Create creates a new indexer
func (r *SQLiteIndexerRepository) Create(ctx context.Context, indexer *models.Indexer) error {
	query := `
		INSERT INTO indexers (
			name, base_url, api_endpoint, indexer_type, supports_search, supports_download,
			is_active, priority, rate_limit_requests, rate_limit_window, timeout_seconds,
			user_agent, description, website, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	`
	
	result, err := r.db.ExecContext(ctx, query,
		indexer.Name, indexer.BaseURL, indexer.APIEndpoint, indexer.IndexerType,
		indexer.SupportsSearch, indexer.SupportsDownload, indexer.IsActive, indexer.Priority,
		indexer.RateLimitRequests, indexer.RateLimitWindow, indexer.TimeoutSeconds,
		indexer.UserAgent, indexer.Description, indexer.Website)
	if err != nil {
		return err
	}
	
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	
	indexer.ID = id
	indexer.CreatedAt = time.Now()
	indexer.UpdatedAt = time.Now()
	return nil
}

// GetByID retrieves an indexer by ID
func (r *SQLiteIndexerRepository) GetByID(ctx context.Context, id int64) (*models.Indexer, error) {
	query := `
		SELECT id, name, base_url, api_endpoint, indexer_type, supports_search, supports_download,
			is_active, priority, rate_limit_requests, rate_limit_window, timeout_seconds,
			user_agent, description, website, created_at, updated_at
		FROM indexers WHERE id = ?
	`
	
	var indexer models.Indexer
	var apiEndpoint, userAgent, description, website sql.NullString
	
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&indexer.ID, &indexer.Name, &indexer.BaseURL, &apiEndpoint, &indexer.IndexerType,
		&indexer.SupportsSearch, &indexer.SupportsDownload, &indexer.IsActive, &indexer.Priority,
		&indexer.RateLimitRequests, &indexer.RateLimitWindow, &indexer.TimeoutSeconds,
		&userAgent, &description, &website, &indexer.CreatedAt, &indexer.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	// Handle nullable fields
	if apiEndpoint.Valid {
		indexer.APIEndpoint = &apiEndpoint.String
	}
	if userAgent.Valid {
		indexer.UserAgent = &userAgent.String
	}
	if description.Valid {
		indexer.Description = &description.String
	}
	if website.Valid {
		indexer.Website = &website.String
	}
	
	// Get latest health status
	healthQuery := `
		SELECT status, response_time_ms, error_message, checked_at
		FROM indexer_health
		WHERE indexer_id = ?
		ORDER BY checked_at DESC
		LIMIT 1
	`
	
	var status sql.NullString
	var responseTime sql.NullInt64
	var errorMessage sql.NullString
	var checkedAt sql.NullTime
	
	err = r.db.QueryRowContext(ctx, healthQuery, id).Scan(&status, &responseTime, &errorMessage, &checkedAt)
	if err == nil {
		if status.Valid {
			indexerStatus := models.IndexerStatus(status.String)
			indexer.Status = &indexerStatus
		}
		if responseTime.Valid {
			responseTimeInt := int(responseTime.Int64)
			indexer.ResponseTimeMS = &responseTimeInt
		}
		if errorMessage.Valid {
			indexer.ErrorMessage = &errorMessage.String
		}
		if checkedAt.Valid {
			indexer.LastHealthCheck = &checkedAt.Time
		}
	}
	
	return &indexer, nil
}

// GetByName retrieves an indexer by name
func (r *SQLiteIndexerRepository) GetByName(ctx context.Context, name string) (*models.Indexer, error) {
	query := `
		SELECT id, name, base_url, api_endpoint, indexer_type, supports_search, supports_download,
			is_active, priority, rate_limit_requests, rate_limit_window, timeout_seconds,
			user_agent, description, website, created_at, updated_at
		FROM indexers WHERE name = ?
	`
	
	var indexer models.Indexer
	var apiEndpoint, userAgent, description, website sql.NullString
	
	err := r.db.QueryRowContext(ctx, query, name).Scan(
		&indexer.ID, &indexer.Name, &indexer.BaseURL, &apiEndpoint, &indexer.IndexerType,
		&indexer.SupportsSearch, &indexer.SupportsDownload, &indexer.IsActive, &indexer.Priority,
		&indexer.RateLimitRequests, &indexer.RateLimitWindow, &indexer.TimeoutSeconds,
		&userAgent, &description, &website, &indexer.CreatedAt, &indexer.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	// Handle nullable fields
	if apiEndpoint.Valid {
		indexer.APIEndpoint = &apiEndpoint.String
	}
	if userAgent.Valid {
		indexer.UserAgent = &userAgent.String
	}
	if description.Valid {
		indexer.Description = &description.String
	}
	if website.Valid {
		indexer.Website = &website.String
	}
	
	return &indexer, nil
}

// Update updates an indexer
func (r *SQLiteIndexerRepository) Update(ctx context.Context, indexer *models.Indexer) error {
	query := `
		UPDATE indexers SET
			name = ?, base_url = ?, api_endpoint = ?, indexer_type = ?, supports_search = ?,
			supports_download = ?, is_active = ?, priority = ?, rate_limit_requests = ?,
			rate_limit_window = ?, timeout_seconds = ?, user_agent = ?, description = ?,
			website = ?, updated_at = datetime('now')
		WHERE id = ?
	`
	
	_, err := r.db.ExecContext(ctx, query,
		indexer.Name, indexer.BaseURL, indexer.APIEndpoint, indexer.IndexerType,
		indexer.SupportsSearch, indexer.SupportsDownload, indexer.IsActive, indexer.Priority,
		indexer.RateLimitRequests, indexer.RateLimitWindow, indexer.TimeoutSeconds,
		indexer.UserAgent, indexer.Description, indexer.Website, indexer.ID)
	
	if err != nil {
		return err
	}
	
	indexer.UpdatedAt = time.Now()
	return nil
}

// Delete deletes an indexer by ID
func (r *SQLiteIndexerRepository) Delete(ctx context.Context, id int64) error {
	query := `DELETE FROM indexers WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// List returns all indexers, optionally filtered by active status
func (r *SQLiteIndexerRepository) List(ctx context.Context, activeOnly bool) ([]*models.Indexer, error) {
	var query string
	var args []interface{}
	
	if activeOnly {
		query = `
			SELECT id, name, base_url, api_endpoint, indexer_type, supports_search, supports_download,
				is_active, priority, rate_limit_requests, rate_limit_window, timeout_seconds,
				user_agent, description, website, created_at, updated_at
			FROM indexers WHERE is_active = ?
			ORDER BY priority DESC, name ASC
		`
		args = []interface{}{true}
	} else {
		query = `
			SELECT id, name, base_url, api_endpoint, indexer_type, supports_search, supports_download,
				is_active, priority, rate_limit_requests, rate_limit_window, timeout_seconds,
				user_agent, description, website, created_at, updated_at
			FROM indexers
			ORDER BY priority DESC, name ASC
		`
	}
	
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var indexers []*models.Indexer
	
	for rows.Next() {
		var indexer models.Indexer
		var apiEndpoint, userAgent, description, website sql.NullString
		
		err := rows.Scan(
			&indexer.ID, &indexer.Name, &indexer.BaseURL, &apiEndpoint, &indexer.IndexerType,
			&indexer.SupportsSearch, &indexer.SupportsDownload, &indexer.IsActive, &indexer.Priority,
			&indexer.RateLimitRequests, &indexer.RateLimitWindow, &indexer.TimeoutSeconds,
			&userAgent, &description, &website, &indexer.CreatedAt, &indexer.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		
		// Handle nullable fields
		if apiEndpoint.Valid {
			indexer.APIEndpoint = &apiEndpoint.String
		}
		if userAgent.Valid {
			indexer.UserAgent = &userAgent.String
		}
		if description.Valid {
			indexer.Description = &description.String
		}
		if website.Valid {
			indexer.Website = &website.String
		}
		
		indexers = append(indexers, &indexer)
	}
	
	// Get health status for each indexer
	for _, indexer := range indexers {
		healthQuery := `
			SELECT status, response_time_ms, error_message, checked_at
			FROM indexer_health
			WHERE indexer_id = ?
			ORDER BY checked_at DESC
			LIMIT 1
		`
		
		var status sql.NullString
		var responseTime sql.NullInt64
		var errorMessage sql.NullString
		var checkedAt sql.NullTime
		
		err = r.db.QueryRowContext(ctx, healthQuery, indexer.ID).Scan(&status, &responseTime, &errorMessage, &checkedAt)
		if err == nil {
			if status.Valid {
				indexerStatus := models.IndexerStatus(status.String)
				indexer.Status = &indexerStatus
			}
			if responseTime.Valid {
				responseTimeInt := int(responseTime.Int64)
				indexer.ResponseTimeMS = &responseTimeInt
			}
			if errorMessage.Valid {
				indexer.ErrorMessage = &errorMessage.String
			}
			if checkedAt.Valid {
				indexer.LastHealthCheck = &checkedAt.Time
			}
		}
	}
	
	return indexers, nil
}

// GetUserConfig retrieves user-specific indexer configuration
func (r *SQLiteIndexerRepository) GetUserConfig(ctx context.Context, userID, indexerID int64) (*models.UserIndexerConfig, error) {
	query := `
		SELECT id, user_id, indexer_id, is_enabled, api_key, username, password_hash,
			custom_settings, last_test_date, last_test_success, created_at, updated_at
		FROM user_indexer_config
		WHERE user_id = ? AND indexer_id = ?
	`
	
	var config models.UserIndexerConfig
	var apiKey, username, passwordHash, customSettings sql.NullString
	var lastTestDate sql.NullTime
	var lastTestSuccess sql.NullBool
	
	err := r.db.QueryRowContext(ctx, query, userID, indexerID).Scan(
		&config.ID, &config.UserID, &config.IndexerID, &config.IsEnabled,
		&apiKey, &username, &passwordHash, &customSettings,
		&lastTestDate, &lastTestSuccess, &config.CreatedAt, &config.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	// Handle nullable fields
	if apiKey.Valid {
		config.APIKey = &apiKey.String
	}
	if username.Valid {
		config.Username = &username.String
	}
	if passwordHash.Valid {
		config.PasswordHash = &passwordHash.String
	}
	if customSettings.Valid {
		config.CustomSettings = &customSettings.String
	}
	if lastTestDate.Valid {
		config.LastTestDate = &lastTestDate.Time
	}
	if lastTestSuccess.Valid {
		config.LastTestSuccess = &lastTestSuccess.Bool
	}
	
	return &config, nil
}

// UpdateUserConfig creates or updates user-specific indexer configuration
func (r *SQLiteIndexerRepository) UpdateUserConfig(ctx context.Context, config *models.UserIndexerConfig) error {
	// Check if config already exists
	existingConfig, err := r.GetUserConfig(ctx, config.UserID, config.IndexerID)
	if err != nil {
		return err
	}
	
	if existingConfig == nil {
		// Create new config
		query := `
			INSERT INTO user_indexer_config (
				user_id, indexer_id, is_enabled, api_key, username, password_hash,
				custom_settings, last_test_date, last_test_success, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
		`
		
		result, err := r.db.ExecContext(ctx, query,
			config.UserID, config.IndexerID, config.IsEnabled, config.APIKey,
			config.Username, config.PasswordHash, config.CustomSettings,
			config.LastTestDate, config.LastTestSuccess)
		if err != nil {
			return err
		}
		
		id, err := result.LastInsertId()
		if err != nil {
			return err
		}
		
		config.ID = id
		config.CreatedAt = time.Now()
		config.UpdatedAt = time.Now()
	} else {
		// Update existing config
		query := `
			UPDATE user_indexer_config SET
				is_enabled = ?, api_key = ?, username = ?, password_hash = ?,
				custom_settings = ?, last_test_date = ?, last_test_success = ?,
				updated_at = datetime('now')
			WHERE id = ?
		`
		
		_, err := r.db.ExecContext(ctx, query,
			config.IsEnabled, config.APIKey, config.Username, config.PasswordHash,
			config.CustomSettings, config.LastTestDate, config.LastTestSuccess,
			existingConfig.ID)
		if err != nil {
			return err
		}
		
		config.ID = existingConfig.ID
		config.CreatedAt = existingConfig.CreatedAt
		config.UpdatedAt = time.Now()
	}
	
	return nil
}

// GetUserEnabledIndexers returns all indexers enabled for a specific user
func (r *SQLiteIndexerRepository) GetUserEnabledIndexers(ctx context.Context, userID int64) ([]*models.Indexer, error) {
	query := `
		SELECT i.id, i.name, i.base_url, i.api_endpoint, i.indexer_type, i.supports_search,
			i.supports_download, i.is_active, i.priority, i.rate_limit_requests, i.rate_limit_window,
			i.timeout_seconds, i.user_agent, i.description, i.website, i.created_at, i.updated_at
		FROM indexers i
		INNER JOIN user_indexer_config uic ON i.id = uic.indexer_id
		WHERE uic.user_id = ? AND uic.is_enabled = ? AND i.is_active = ?
		ORDER BY i.priority DESC, i.name ASC
	`
	
	rows, err := r.db.QueryContext(ctx, query, userID, true, true)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var indexers []*models.Indexer
	
	for rows.Next() {
		var indexer models.Indexer
		var apiEndpoint, userAgent, description, website sql.NullString
		
		err := rows.Scan(
			&indexer.ID, &indexer.Name, &indexer.BaseURL, &apiEndpoint, &indexer.IndexerType,
			&indexer.SupportsSearch, &indexer.SupportsDownload, &indexer.IsActive, &indexer.Priority,
			&indexer.RateLimitRequests, &indexer.RateLimitWindow, &indexer.TimeoutSeconds,
			&userAgent, &description, &website, &indexer.CreatedAt, &indexer.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		
		// Handle nullable fields
		if apiEndpoint.Valid {
			indexer.APIEndpoint = &apiEndpoint.String
		}
		if userAgent.Valid {
			indexer.UserAgent = &userAgent.String
		}
		if description.Valid {
			indexer.Description = &description.String
		}
		if website.Valid {
			indexer.Website = &website.String
		}
		
		indexers = append(indexers, &indexer)
	}
	
	return indexers, nil
}

// RecordHealthCheck records a health check result for an indexer
func (r *SQLiteIndexerRepository) RecordHealthCheck(ctx context.Context, health *models.IndexerHealth) error {
	query := `
		INSERT INTO indexer_health (indexer_id, status, response_time_ms, error_message, checked_at)
		VALUES (?, ?, ?, ?, datetime('now'))
	`
	
	result, err := r.db.ExecContext(ctx, query,
		health.IndexerID, health.Status, health.ResponseTimeMS, health.ErrorMessage)
	if err != nil {
		return err
	}
	
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	
	health.ID = id
	health.CheckedAt = time.Now()
	return nil
}

// GetLatestHealth retrieves the latest health check for an indexer
func (r *SQLiteIndexerRepository) GetLatestHealth(ctx context.Context, indexerID int64) (*models.IndexerHealth, error) {
	query := `
		SELECT id, indexer_id, status, response_time_ms, error_message, checked_at
		FROM indexer_health
		WHERE indexer_id = ?
		ORDER BY checked_at DESC
		LIMIT 1
	`
	
	var health models.IndexerHealth
	var responseTime sql.NullInt64
	var errorMessage sql.NullString
	
	err := r.db.QueryRowContext(ctx, query, indexerID).Scan(
		&health.ID, &health.IndexerID, &health.Status, &responseTime, &errorMessage, &health.CheckedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	// Handle nullable fields
	if responseTime.Valid {
		responseTimeInt := int(responseTime.Int64)
		health.ResponseTimeMS = &responseTimeInt
	}
	if errorMessage.Valid {
		health.ErrorMessage = &errorMessage.String
	}
	
	return &health, nil
}