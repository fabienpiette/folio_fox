package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/fabienpiette/folio_fox/internal/models"
)

// SQLiteDownloadRepository implements DownloadRepository using SQLite
type SQLiteDownloadRepository struct {
	db *sql.DB
}

// NewDownloadRepository creates a new SQLite-based download repository
func NewDownloadRepository(db *sql.DB) DownloadRepository {
	return &SQLiteDownloadRepository{
		db: db,
	}
}

// CreateQueueItem creates a new download queue item
func (r *SQLiteDownloadRepository) CreateQueueItem(ctx context.Context, item *models.DownloadQueueItem) error {
	query := `
		INSERT INTO download_queue (
			user_id, book_id, indexer_id, title, author_name, download_url,
			file_format, file_size_bytes, priority, status, progress_percentage,
			download_path, quality_profile_id, retry_count, max_retries,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	`

	result, err := r.db.ExecContext(ctx, query,
		item.UserID, item.BookID, item.IndexerID, item.Title, item.AuthorName,
		item.DownloadURL, item.FileFormat, item.FileSizeBytes, item.Priority,
		item.Status, item.ProgressPercentage, item.DownloadPath,
		item.QualityProfileID, item.RetryCount, item.MaxRetries)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	item.ID = id
	return nil
}

// GetQueueItemByID retrieves a download queue item by ID
func (r *SQLiteDownloadRepository) GetQueueItemByID(ctx context.Context, id int64) (*models.DownloadQueueItem, error) {
	query := `
		SELECT id, user_id, book_id, indexer_id, title, author_name, download_url,
			   file_format, file_size_bytes, priority, status, progress_percentage,
			   download_path, quality_profile_id, retry_count, max_retries,
			   error_message, estimated_completion, started_at, completed_at,
			   created_at, updated_at
		FROM download_queue WHERE id = ?
	`

	item := &models.DownloadQueueItem{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&item.ID, &item.UserID, &item.BookID, &item.IndexerID, &item.Title,
		&item.AuthorName, &item.DownloadURL, &item.FileFormat, &item.FileSizeBytes,
		&item.Priority, &item.Status, &item.ProgressPercentage, &item.DownloadPath,
		&item.QualityProfileID, &item.RetryCount, &item.MaxRetries, &item.ErrorMessage,
		&item.EstimatedCompletion, &item.StartedAt, &item.CompletedAt,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return item, nil
}

// UpdateQueueItem updates an existing download queue item
func (r *SQLiteDownloadRepository) UpdateQueueItem(ctx context.Context, item *models.DownloadQueueItem) error {
	query := `
		UPDATE download_queue SET
			title = ?, author_name = ?, file_format = ?, file_size_bytes = ?,
			priority = ?, status = ?, progress_percentage = ?, download_path = ?,
			quality_profile_id = ?, retry_count = ?, max_retries = ?, error_message = ?,
			estimated_completion = ?, started_at = ?, completed_at = ?, updated_at = datetime('now')
		WHERE id = ?
	`

	_, err := r.db.ExecContext(ctx, query,
		item.Title, item.AuthorName, item.FileFormat, item.FileSizeBytes,
		item.Priority, item.Status, item.ProgressPercentage, item.DownloadPath,
		item.QualityProfileID, item.RetryCount, item.MaxRetries, item.ErrorMessage,
		item.EstimatedCompletion, item.StartedAt, item.CompletedAt, item.ID)
	return err
}

// DeleteQueueItem deletes a download queue item
func (r *SQLiteDownloadRepository) DeleteQueueItem(ctx context.Context, id int64) error {
	query := `DELETE FROM download_queue WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// ListQueueItems retrieves download queue items with filtering and pagination
func (r *SQLiteDownloadRepository) ListQueueItems(ctx context.Context, filters *DownloadQueueFilters) ([]*models.DownloadQueueItem, int, error) {
	baseQuery := `
		SELECT dq.id, dq.user_id, dq.book_id, dq.indexer_id, dq.title, dq.author_name,
			   dq.download_url, dq.file_format, dq.file_size_bytes, dq.priority,
			   dq.status, dq.progress_percentage, dq.download_path, dq.quality_profile_id,
			   dq.retry_count, dq.max_retries, dq.error_message, dq.estimated_completion,
			   dq.started_at, dq.completed_at, dq.created_at, dq.updated_at
		FROM download_queue dq
	`

	countQuery := `SELECT COUNT(*) FROM download_queue dq`

	var conditions []string
	var args []interface{}

	// Build WHERE conditions
	if filters.UserID != nil {
		conditions = append(conditions, "dq.user_id = ?")
		args = append(args, *filters.UserID)
	}

	if filters.Status != nil {
		conditions = append(conditions, "dq.status = ?")
		args = append(args, *filters.Status)
	}

	if filters.IndexerID != nil {
		conditions = append(conditions, "dq.indexer_id = ?")
		args = append(args, *filters.IndexerID)
	}

	if filters.PriorityMin != nil {
		conditions = append(conditions, "dq.priority >= ?")
		args = append(args, *filters.PriorityMin)
	}

	if filters.PriorityMax != nil {
		conditions = append(conditions, "dq.priority <= ?")
		args = append(args, *filters.PriorityMax)
	}

	if filters.CreatedAfter != nil {
		conditions = append(conditions, "dq.created_at >= ?")
		args = append(args, *filters.CreatedAfter)
	}

	if filters.CreatedBefore != nil {
		conditions = append(conditions, "dq.created_at <= ?")
		args = append(args, *filters.CreatedBefore)
	}

	// Add WHERE clause if conditions exist
	if len(conditions) > 0 {
		whereClause := " WHERE " + strings.Join(conditions, " AND ")
		baseQuery += whereClause
		countQuery += whereClause
	}

	// Get total count
	var total int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Add sorting
	sortBy := "dq.updated_at"
	sortOrder := "DESC"
	if filters.SortBy != "" {
		sortBy = "dq." + filters.SortBy
	}
	if filters.SortOrder != "" {
		sortOrder = strings.ToUpper(filters.SortOrder)
	}

	baseQuery += fmt.Sprintf(" ORDER BY %s %s", sortBy, sortOrder)

	// Add pagination
	baseQuery += " LIMIT ? OFFSET ?"
	args = append(args, filters.Limit, filters.Offset)

	// Execute query
	rows, err := r.db.QueryContext(ctx, baseQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var items []*models.DownloadQueueItem
	for rows.Next() {
		item := &models.DownloadQueueItem{}
		err := rows.Scan(
			&item.ID, &item.UserID, &item.BookID, &item.IndexerID, &item.Title,
			&item.AuthorName, &item.DownloadURL, &item.FileFormat, &item.FileSizeBytes,
			&item.Priority, &item.Status, &item.ProgressPercentage, &item.DownloadPath,
			&item.QualityProfileID, &item.RetryCount, &item.MaxRetries, &item.ErrorMessage,
			&item.EstimatedCompletion, &item.StartedAt, &item.CompletedAt,
			&item.CreatedAt, &item.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}

	return items, total, rows.Err()
}

// GetNextPendingItem retrieves the next pending download item for a user
func (r *SQLiteDownloadRepository) GetNextPendingItem(ctx context.Context, userID int64) (*models.DownloadQueueItem, error) {
	query := `
		SELECT id, user_id, book_id, indexer_id, title, author_name, download_url,
			   file_format, file_size_bytes, priority, status, progress_percentage,
			   download_path, quality_profile_id, retry_count, max_retries,
			   error_message, estimated_completion, started_at, completed_at,
			   created_at, updated_at
		FROM download_queue
		WHERE user_id = ? AND status = 'pending'
		ORDER BY priority ASC, created_at ASC
		LIMIT 1
	`

	item := &models.DownloadQueueItem{}
	err := r.db.QueryRowContext(ctx, query, userID).Scan(
		&item.ID, &item.UserID, &item.BookID, &item.IndexerID, &item.Title,
		&item.AuthorName, &item.DownloadURL, &item.FileFormat, &item.FileSizeBytes,
		&item.Priority, &item.Status, &item.ProgressPercentage, &item.DownloadPath,
		&item.QualityProfileID, &item.RetryCount, &item.MaxRetries, &item.ErrorMessage,
		&item.EstimatedCompletion, &item.StartedAt, &item.CompletedAt,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return item, nil
}

// GetActiveDownloads retrieves currently active downloads for a user
func (r *SQLiteDownloadRepository) GetActiveDownloads(ctx context.Context, userID int64) ([]*models.DownloadQueueItem, error) {
	query := `
		SELECT id, user_id, book_id, indexer_id, title, author_name, download_url,
			   file_format, file_size_bytes, priority, status, progress_percentage,
			   download_path, quality_profile_id, retry_count, max_retries,
			   error_message, estimated_completion, started_at, completed_at,
			   created_at, updated_at
		FROM download_queue
		WHERE user_id = ? AND status IN ('downloading', 'processing')
		ORDER BY started_at ASC
	`

	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*models.DownloadQueueItem
	for rows.Next() {
		item := &models.DownloadQueueItem{}
		err := rows.Scan(
			&item.ID, &item.UserID, &item.BookID, &item.IndexerID, &item.Title,
			&item.AuthorName, &item.DownloadURL, &item.FileFormat, &item.FileSizeBytes,
			&item.Priority, &item.Status, &item.ProgressPercentage, &item.DownloadPath,
			&item.QualityProfileID, &item.RetryCount, &item.MaxRetries, &item.ErrorMessage,
			&item.EstimatedCompletion, &item.StartedAt, &item.CompletedAt,
			&item.CreatedAt, &item.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

// UpdateProgress updates the progress of a download
func (r *SQLiteDownloadRepository) UpdateProgress(ctx context.Context, id int64, progress int, bytesDownloaded int64) error {
	query := `
		UPDATE download_queue SET
			progress_percentage = ?, updated_at = datetime('now')
		WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, query, progress, id)
	return err
}

// SetStatus sets the status of a download
func (r *SQLiteDownloadRepository) SetStatus(ctx context.Context, id int64, status models.DownloadStatus, errorMessage *string) error {
	query := `
		UPDATE download_queue SET
			status = ?, error_message = ?, updated_at = datetime('now')
		WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, query, status, errorMessage, id)
	return err
}

// CompleteDownload marks a download as completed
func (r *SQLiteDownloadRepository) CompleteDownload(ctx context.Context, id int64, finalPath string) error {
	query := `
		UPDATE download_queue SET
			status = 'completed', download_path = ?, completed_at = datetime('now'),
			progress_percentage = 100, updated_at = datetime('now')
		WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, query, finalPath, id)
	return err
}

// CreateHistoryItem creates a download history entry
func (r *SQLiteDownloadRepository) CreateHistoryItem(ctx context.Context, item *models.DownloadHistoryItem) error {
	query := `
		INSERT INTO download_history (
			queue_id, user_id, book_id, indexer_id, title, author_name,
			file_format, file_size_bytes, download_duration_seconds,
			final_status, error_message, download_path, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	result, err := r.db.ExecContext(ctx, query,
		item.QueueID, item.UserID, item.BookID, item.IndexerID,
		item.Title, item.AuthorName, item.FileFormat, item.FileSizeBytes,
		item.DownloadDurationSeconds, item.FinalStatus, item.ErrorMessage,
		item.DownloadPath, item.CompletedAt)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	item.ID = id
	return nil
}

// ListHistoryItems retrieves download history with filtering and pagination
func (r *SQLiteDownloadRepository) ListHistoryItems(ctx context.Context, filters *DownloadHistoryFilters) ([]*models.DownloadHistoryItem, int, error) {
	baseQuery := `
		SELECT id, queue_id, user_id, book_id, indexer_id, title, author_name,
			   file_format, file_size_bytes, download_duration_seconds,
			   final_status, error_message, download_path, completed_at
		FROM download_history
	`

	countQuery := `SELECT COUNT(*) FROM download_history`

	var conditions []string
	var args []interface{}

	// Build WHERE conditions
	if filters.UserID != nil {
		conditions = append(conditions, "user_id = ?")
		args = append(args, *filters.UserID)
	}

	if filters.Status != nil {
		conditions = append(conditions, "final_status = ?")
		args = append(args, *filters.Status)
	}

	if filters.IndexerID != nil {
		conditions = append(conditions, "indexer_id = ?")
		args = append(args, *filters.IndexerID)
	}

	if filters.DateFrom != nil {
		conditions = append(conditions, "completed_at >= ?")
		args = append(args, *filters.DateFrom)
	}

	if filters.DateTo != nil {
		conditions = append(conditions, "completed_at <= ?")
		args = append(args, *filters.DateTo)
	}

	// Add WHERE clause if conditions exist
	if len(conditions) > 0 {
		whereClause := " WHERE " + strings.Join(conditions, " AND ")
		baseQuery += whereClause
		countQuery += whereClause
	}

	// Get total count
	var total int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Add sorting
	sortBy := "completed_at"
	sortOrder := "DESC"
	if filters.SortBy != "" {
		sortBy = filters.SortBy
	}
	if filters.SortOrder != "" {
		sortOrder = strings.ToUpper(filters.SortOrder)
	}

	baseQuery += fmt.Sprintf(" ORDER BY %s %s", sortBy, sortOrder)

	// Add pagination
	baseQuery += " LIMIT ? OFFSET ?"
	args = append(args, filters.Limit, filters.Offset)

	// Execute query
	rows, err := r.db.QueryContext(ctx, baseQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var items []*models.DownloadHistoryItem
	for rows.Next() {
		item := &models.DownloadHistoryItem{}
		err := rows.Scan(
			&item.ID, &item.QueueID, &item.UserID, &item.BookID, &item.IndexerID,
			&item.Title, &item.AuthorName, &item.FileFormat, &item.FileSizeBytes,
			&item.DownloadDurationSeconds, &item.FinalStatus, &item.ErrorMessage,
			&item.DownloadPath, &item.CompletedAt,
		)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, total, rows.Err()
}

// GetDownloadStats retrieves download statistics
func (r *SQLiteDownloadRepository) GetDownloadStats(ctx context.Context, userID *int64, period string) (*models.DownloadStats, error) {
	stats := &models.DownloadStats{
		Period: period,
	}

	// Build date condition based on period
	var dateCondition string
	switch period {
	case "day":
		dateCondition = "DATE(created_at) = DATE('now')"
	case "week":
		dateCondition = "DATE(created_at) >= DATE('now', '-7 days')"
	case "month":
		dateCondition = "DATE(created_at) >= DATE('now', '-30 days')"
	case "year":
		dateCondition = "DATE(created_at) >= DATE('now', '-1 year')"
	default:
		dateCondition = "1=1" // No date filter
	}

	// Build user condition
	userCondition := ""
	args := []interface{}{}
	if userID != nil {
		userCondition = " AND user_id = ?"
		args = append(args, *userID)
	}

	// Get basic statistics from download_queue
	query := fmt.Sprintf(`
		SELECT 
			COUNT(*) as total_downloads,
			COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_downloads,
			COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_downloads,
			COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_downloads
		FROM download_queue 
		WHERE %s %s`, dateCondition, userCondition)

	err := r.db.QueryRowContext(ctx, query, args...).Scan(
		&stats.TotalDownloads, &stats.SuccessfulDownloads,
		&stats.FailedDownloads, &stats.CancelledDownloads)
	if err != nil {
		return nil, err
	}

	// Calculate success rate
	if stats.TotalDownloads > 0 {
		stats.SuccessRate = float64(stats.SuccessfulDownloads) / float64(stats.TotalDownloads) * 100
	}

	// Get bytes downloaded from completed downloads
	bytesQuery := fmt.Sprintf(`
		SELECT 
			COALESCE(SUM(file_size_bytes), 0) as total_bytes,
			COALESCE(AVG(file_size_bytes / 1024.0 / 1024.0), 0) as avg_file_size_mb
		FROM download_queue 
		WHERE status = 'completed' AND file_size_bytes IS NOT NULL AND %s %s`, dateCondition, userCondition)

	err = r.db.QueryRowContext(ctx, bytesQuery, args...).Scan(
		&stats.TotalBytesDownloaded, &stats.AverageFileSizeMB)
	if err != nil {
		return nil, err
	}

	// Format total bytes
	stats.TotalBytesHuman = formatBytes(stats.TotalBytesDownloaded)

	// Get most downloaded format
	formatQuery := fmt.Sprintf(`
		SELECT file_format, COUNT(*) as count
		FROM download_queue 
		WHERE status = 'completed' AND %s %s
		GROUP BY file_format 
		ORDER BY count DESC 
		LIMIT 1`, dateCondition, userCondition)

	err = r.db.QueryRowContext(ctx, formatQuery, args...).Scan(&stats.MostDownloadedFormat, nil)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	// Get downloads by day for the last 30 days
	dailyQuery := fmt.Sprintf(`
		SELECT 
			DATE(created_at) as date,
			COUNT(*) as count,
			COALESCE(SUM(file_size_bytes), 0) as bytes
		FROM download_queue 
		WHERE DATE(created_at) >= DATE('now', '-30 days') %s
		GROUP BY DATE(created_at) 
		ORDER BY date DESC`, userCondition)

	dailyRows, err := r.db.QueryContext(ctx, dailyQuery, args...)
	if err != nil {
		return nil, err
	}
	defer dailyRows.Close()

	stats.DownloadsByDay = []models.DailyDownloadStats{}
	for dailyRows.Next() {
		var daily models.DailyDownloadStats
		err := dailyRows.Scan(&daily.Date, &daily.Count, &daily.Bytes)
		if err != nil {
			return nil, err
		}
		stats.DownloadsByDay = append(stats.DownloadsByDay, daily)
	}

	// Get downloads by format
	formatStatsQuery := fmt.Sprintf(`
		SELECT 
			file_format,
			COUNT(*) as count,
			ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM download_queue WHERE status = 'completed' AND %s %s), 2) as percentage
		FROM download_queue 
		WHERE status = 'completed' AND %s %s
		GROUP BY file_format 
		ORDER BY count DESC`, dateCondition, userCondition, dateCondition, userCondition)

	formatRows, err := r.db.QueryContext(ctx, formatStatsQuery, append(args, args...)...)
	if err != nil {
		return nil, err
	}
	defer formatRows.Close()

	stats.DownloadsByFormat = []models.FormatDownloadStats{}
	for formatRows.Next() {
		var formatStat models.FormatDownloadStats
		err := formatRows.Scan(&formatStat.Format, &formatStat.Count, &formatStat.Percentage)
		if err != nil {
			return nil, err
		}
		stats.DownloadsByFormat = append(stats.DownloadsByFormat, formatStat)
	}

	return stats, nil
}

// GetDownloadStatsCounts gets specific counts for dashboard
func (r *SQLiteDownloadRepository) GetDownloadStatsCounts(ctx context.Context, userID *int64) (map[string]int, error) {
	userCondition := ""
	args := []interface{}{}
	if userID != nil {
		userCondition = " WHERE user_id = ?"
		args = append(args, *userID)
	}

	query := fmt.Sprintf(`
		SELECT 
			COUNT(CASE WHEN status IN ('downloading', 'processing') THEN 1 END) as active_downloads,
			COUNT(CASE WHEN status IN ('pending', 'queued') THEN 1 END) as queue_items,
			COUNT(CASE WHEN status IN ('failed', 'error') THEN 1 END) as failed_downloads
		FROM download_queue %s`, userCondition)

	var activeDownloads, queueItems, failedDownloads int
	err := r.db.QueryRowContext(ctx, query, args...).Scan(&activeDownloads, &queueItems, &failedDownloads)
	if err != nil {
		return nil, err
	}

	return map[string]int{
		"activeDownloads": activeDownloads,
		"queueItems":      queueItems,
		"failedDownloads": failedDownloads,
	}, nil
}

// formatBytes formats bytes into human readable format
func formatBytes(bytes int64) string {
	if bytes < 1024 {
		return fmt.Sprintf("%d B", bytes)
	}
	if bytes < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(bytes)/1024)
	}
	if bytes < 1024*1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(bytes)/(1024*1024))
	}
	return fmt.Sprintf("%.1f GB", float64(bytes)/(1024*1024*1024))
}