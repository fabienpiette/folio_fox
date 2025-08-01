package repositories

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/fabienpiette/folio_fox/internal/models"
)

type searchRepository struct {
	db    *sql.DB
	redis *redis.Client
}

// NewSearchRepository creates a new search repository instance
func NewSearchRepository(db *sql.DB, redisClient *redis.Client) SearchRepository {
	return &searchRepository{
		db:    db,
		redis: redisClient,
	}
}

// CreateHistoryEntry creates a new search history entry
func (r *searchRepository) CreateHistoryEntry(ctx context.Context, entry *models.SearchHistoryEntry) error {
	query := `
		INSERT INTO search_history (user_id, query, filters, results_count, indexers_searched, search_duration_ms, searched_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	
	// Convert complex types to JSON
	var filtersJSON, indexersJSON []byte
	var err error
	
	if entry.Filters != nil {
		filtersJSON, err = json.Marshal(entry.Filters)
		if err != nil {
			return err
		}
	}
	
	if entry.IndexersSearched != nil {
		indexersJSON, err = json.Marshal(entry.IndexersSearched)
		if err != nil {
			return err
		}
	}
	
	result, err := r.db.ExecContext(ctx, query,
		entry.UserID,
		entry.Query,
		string(filtersJSON),
		entry.ResultsCount,
		string(indexersJSON),
		entry.SearchDurationMS,
		entry.SearchedAt,
	)
	if err != nil {
		return err
	}
	
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	
	entry.ID = id
	return nil
}

// GetUserSearchHistory retrieves search history for a user
func (r *searchRepository) GetUserSearchHistory(ctx context.Context, userID int64, limit int, days int) ([]*models.SearchHistoryEntry, error) {
	query := `
		SELECT id, user_id, query, filters, results_count, indexers_searched, search_duration_ms, searched_at
		FROM search_history
		WHERE user_id = ? AND searched_at >= datetime('now', '-' || ? || ' days')
		ORDER BY searched_at DESC
		LIMIT ?
	`
	
	rows, err := r.db.QueryContext(ctx, query, userID, days, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var entries []*models.SearchHistoryEntry
	for rows.Next() {
		entry := &models.SearchHistoryEntry{}
		var filtersJSON, indexersJSON sql.NullString
		
		err := rows.Scan(
			&entry.ID,
			&entry.UserID,
			&entry.Query,
			&filtersJSON,
			&entry.ResultsCount,
			&indexersJSON,
			&entry.SearchDurationMS,
			&entry.SearchedAt,
		)
		if err != nil {
			return nil, err
		}
		
		// Parse JSON fields
		if filtersJSON.Valid && filtersJSON.String != "" {
			if err := json.Unmarshal([]byte(filtersJSON.String), &entry.Filters); err != nil {
				// Continue with nil filters if unmarshal fails
				entry.Filters = nil
			}
		}
		
		if indexersJSON.Valid && indexersJSON.String != "" {
			if err := json.Unmarshal([]byte(indexersJSON.String), &entry.IndexersSearched); err != nil {
				// Continue with nil indexers if unmarshal fails
				entry.IndexersSearched = nil
			}
		}
		
		entries = append(entries, entry)
	}
	
	return entries, rows.Err()
}

// DeleteUserSearchHistory deletes search history for a user
func (r *searchRepository) DeleteUserSearchHistory(ctx context.Context, userID int64, olderThanDays *int) error {
	var query string
	var args []interface{}
	
	if olderThanDays != nil {
		query = `DELETE FROM search_history WHERE user_id = ? AND searched_at < datetime('now', '-' || ? || ' days')`
		args = []interface{}{userID, *olderThanDays}
	} else {
		query = `DELETE FROM search_history WHERE user_id = ?`
		args = []interface{}{userID}
	}
	
	_, err := r.db.ExecContext(ctx, query, args...)
	return err
}

// CacheSearchResults caches search results in Redis and database
func (r *searchRepository) CacheSearchResults(ctx context.Context, queryHash string, results *models.SearchResponse, ttlMinutes int) error {
	// Cache in Redis for fast access
	if r.redis != nil {
		resultsJSON, err := json.Marshal(results)
		if err != nil {
			return err
		}
		
		err = r.redis.Set(ctx, "search_cache:"+queryHash, resultsJSON, time.Duration(ttlMinutes)*time.Minute).Err()
		if err != nil {
			// Log error but don't fail the operation
			// The database cache will still work
		}
	}
	
	// Cache in database for persistence
	expiresAt := time.Now().Add(time.Duration(ttlMinutes) * time.Minute)
	
	// For multiple indexers, we'll cache the combined result
	// In a more complex implementation, you might cache per indexer
	resultsJSON, err := json.Marshal(results.Results)
	if err != nil {
		return err
	}
	
	filtersJSON, err := json.Marshal(map[string]interface{}{
		"indexers": results.IndexersSearched,
		"query":    results.Query,
	})
	if err != nil {
		return err
	}
	
	query := `
		INSERT OR REPLACE INTO search_cache 
		(query_hash, query, filters, indexer_id, results, results_count, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	
	// Use first indexer ID or 0 for combined results
	indexerID := int64(0)
	if len(results.IndexersSearched) > 0 {
		indexerID = results.IndexersSearched[0].IndexerID
	}
	
	_, err = r.db.ExecContext(ctx, query,
		queryHash,
		results.Query,
		string(filtersJSON),
		indexerID,
		string(resultsJSON),
		results.TotalResults,
		expiresAt,
		time.Now(),
	)
	
	return err
}

// GetCachedSearchResults retrieves cached search results
func (r *searchRepository) GetCachedSearchResults(ctx context.Context, queryHash string) (*models.SearchResponse, error) {
	// Try Redis first for faster access
	if r.redis != nil {
		cached, err := r.redis.Get(ctx, "search_cache:"+queryHash).Result()
		if err == nil {
			var results models.SearchResponse
			if err := json.Unmarshal([]byte(cached), &results); err == nil {
				results.Cached = true
				return &results, nil
			}
		}
	}
	
	// Fall back to database cache
	query := `
		SELECT query, filters, results, results_count, expires_at, created_at
		FROM search_cache
		WHERE query_hash = ? AND expires_at > datetime('now')
		LIMIT 1
	`
	
	var (
		queryText, filtersJSON, resultsJSON string
		resultsCount                       int
		expiresAt, createdAt              time.Time
	)
	
	err := r.db.QueryRowContext(ctx, query, queryHash).Scan(
		&queryText,
		&filtersJSON,
		&resultsJSON,
		&resultsCount,
		&expiresAt,
		&createdAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Cache miss
		}
		return nil, err
	}
	
	// Parse results
	var results []models.SearchResult
	if err := json.Unmarshal([]byte(resultsJSON), &results); err != nil {
		return nil, err
	}
	
	response := &models.SearchResponse{
		Query:        queryText,
		Results:      results,
		TotalResults: resultsCount,
		Cached:       true,
		CacheExpiresAt: &expiresAt,
	}
	
	return response, nil
}

// DeleteExpiredCache removes expired cache entries
func (r *searchRepository) DeleteExpiredCache(ctx context.Context) error {
	// Clean up database cache
	_, err := r.db.ExecContext(ctx, "DELETE FROM search_cache WHERE expires_at <= datetime('now')")
	if err != nil {
		return err
	}
	
	// Note: Redis entries expire automatically due to TTL
	// No explicit cleanup needed for Redis
	
	return nil
}