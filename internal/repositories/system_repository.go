package repositories

import (
	"context"
	"database/sql"
	"encoding/json"
)

// SQLiteSystemRepository implements SystemRepository using SQLite
type SQLiteSystemRepository struct {
	db *sql.DB
}

// NewSystemRepository creates a new SQLite-based system repository
func NewSystemRepository(db *sql.DB) SystemRepository {
	return &SQLiteSystemRepository{
		db: db,
	}
}

// GetAppSettings retrieves all application settings
func (r *SQLiteSystemRepository) GetAppSettings(ctx context.Context) (map[string]string, error) {
	query := `SELECT key, value FROM app_settings`
	
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	settings := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		settings[key] = value
	}
	
	return settings, nil
}

// SetAppSetting sets an application setting
func (r *SQLiteSystemRepository) SetAppSetting(ctx context.Context, key, value string) error {
	query := `
		INSERT INTO app_settings (key, value, updated_at) 
		VALUES (?, ?, datetime('now'))
		ON CONFLICT (key) DO UPDATE SET 
			value = excluded.value, 
			updated_at = datetime('now')
	`
	
	_, err := r.db.ExecContext(ctx, query, key, value)
	return err
}

// RecordLog records a system log entry
func (r *SQLiteSystemRepository) RecordLog(ctx context.Context, level, component, message string, details map[string]interface{}, userID *int64) error {
	var detailsJSON []byte
	var err error
	
	if details != nil && len(details) > 0 {
		detailsJSON, err = json.Marshal(details)
		if err != nil {
			return err
		}
	}
	
	query := `
		INSERT INTO system_logs (level, component, message, details, user_id, created_at)
		VALUES (?, ?, ?, ?, ?, datetime('now'))
	`
	
	_, err = r.db.ExecContext(ctx, query, level, component, message, detailsJSON, userID)
	return err
}

// GetLogs retrieves system logs with optional filtering
func (r *SQLiteSystemRepository) GetLogs(ctx context.Context, filters *LogFilters) ([]*LogEntry, error) {
	var query string
	var args []interface{}
	
	query = `SELECT id, level, component, message, details, user_id, created_at FROM system_logs WHERE 1=1`
	
	if filters.Level != nil {
		query += " AND level = ?"
		args = append(args, *filters.Level)
	}
	
	if filters.Component != nil {
		query += " AND component = ?"
		args = append(args, *filters.Component)
	}
	
	if filters.UserID != nil {
		query += " AND user_id = ?"
		args = append(args, *filters.UserID)
	}
	
	if filters.Since != nil {
		query += " AND created_at >= ?"
		args = append(args, filters.Since.Format("2006-01-02 15:04:05"))
	}
	
	if filters.Until != nil {
		query += " AND created_at <= ?"
		args = append(args, filters.Until.Format("2006-01-02 15:04:05"))
	}
	
	query += " ORDER BY created_at DESC"
	
	if filters.Limit > 0 {
		query += " LIMIT ?"
		args = append(args, filters.Limit)
		
		if filters.Offset > 0 {
			query += " OFFSET ?"
			args = append(args, filters.Offset)
		}
	} else {
		query += " LIMIT 1000" // Default limit
	}
	
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var logs []*LogEntry
	
	for rows.Next() {
		var log LogEntry
		var detailsJSON sql.NullString
		var userID sql.NullInt64
		
		err := rows.Scan(&log.ID, &log.Level, &log.Component, &log.Message,
			&detailsJSON, &userID, &log.CreatedAt)
		if err != nil {
			return nil, err
		}
		
		if detailsJSON.Valid && detailsJSON.String != "" {
			var details map[string]interface{}
			if err := json.Unmarshal([]byte(detailsJSON.String), &details); err == nil {
				log.Details = details
			}
		}
		if userID.Valid {
			log.UserID = &userID.Int64
		}
		
		logs = append(logs, &log)
	}
	
	return logs, nil
}

// CleanupOldLogs removes old log entries
func (r *SQLiteSystemRepository) CleanupOldLogs(ctx context.Context, olderThanDays int) error {
	query := `DELETE FROM system_logs WHERE created_at < datetime('now', '-' || ? || ' days')`
	_, err := r.db.ExecContext(ctx, query, olderThanDays)
	return err
}