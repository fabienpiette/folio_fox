-- FolioFox Database Example Queries
-- This file contains common queries used in the FolioFox application
-- with explanations and performance considerations

-- =========================================================================
-- BOOK SEARCH AND DISCOVERY QUERIES
-- =========================================================================

-- 1. Search books by title with full-text search
-- Uses FTS5 index for fast text matching
SELECT 
    b.id,
    b.title,
    b.subtitle,
    GROUP_CONCAT(DISTINCT a.name, ', ') as authors,
    b.rating_average,
    b.publication_date,
    COUNT(bf.id) as available_formats
FROM books_fts fts
JOIN books b ON fts.rowid = b.id
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN book_files bf ON b.id = bf.book_id
WHERE books_fts MATCH 'dune OR "frank herbert"'
GROUP BY b.id
ORDER BY bm25(books_fts), b.rating_average DESC
LIMIT 20;

-- 2. Find books by author with series information
SELECT 
    b.id,
    b.title,
    s.name as series_name,
    b.series_position,
    b.publication_date,
    b.rating_average,
    GROUP_CONCAT(DISTINCT bf.format_id) as available_formats
FROM books b
JOIN book_authors ba ON b.id = ba.book_id
JOIN authors a ON ba.author_id = a.id
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN book_files bf ON b.id = bf.book_id
WHERE a.name LIKE '%Tolkien%'
GROUP BY b.id
ORDER BY s.name, b.series_position, b.publication_date;

-- 3. Advanced book search with multiple filters
SELECT DISTINCT
    b.id,
    b.title,
    GROUP_CONCAT(DISTINCT a.name, ', ') as authors,
    s.name as series_name,
    b.series_position,
    b.rating_average,
    b.publication_date,
    l.name as language,
    p.name as publisher
FROM books b
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN book_genres bg ON b.id = bg.book_id
LEFT JOIN genres g ON bg.genre_id = g.id
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN languages l ON b.language_id = l.id
LEFT JOIN publishers p ON b.publisher_id = p.id
LEFT JOIN book_files bf ON b.id = bf.book_id
WHERE 
    (g.name IN ('Science Fiction', 'Fantasy') OR g.name IS NULL)
    AND b.rating_average >= 4.0
    AND b.publication_date >= '2000-01-01'
    AND l.code = 'en'
    AND bf.format_id IN (1, 2, 3) -- EPUB, PDF, MOBI
GROUP BY b.id
HAVING COUNT(DISTINCT bf.format_id) >= 2 -- At least 2 formats available
ORDER BY b.rating_average DESC, b.rating_count DESC
LIMIT 50;

-- 4. Find similar books based on genre and author
WITH target_book_info AS (
    SELECT 
        b.id,
        GROUP_CONCAT(DISTINCT ba.author_id) as author_ids,
        GROUP_CONCAT(DISTINCT bg.genre_id) as genre_ids
    FROM books b
    LEFT JOIN book_authors ba ON b.id = ba.book_id
    LEFT JOIN book_genres bg ON b.id = bg.book_id
    WHERE b.id = ?
    GROUP BY b.id
)
SELECT 
    b.id,
    b.title,
    GROUP_CONCAT(DISTINCT a.name, ', ') as authors,
    b.rating_average,
    COUNT(DISTINCT CASE WHEN ba.author_id IN (
        SELECT value FROM json_each(tbi.author_ids)
    ) THEN 1 END) as shared_authors,
    COUNT(DISTINCT CASE WHEN bg.genre_id IN (
        SELECT value FROM json_each(tbi.genre_ids)
    ) THEN 1 END) as shared_genres
FROM books b
CROSS JOIN target_book_info tbi
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN book_genres bg ON b.id = bg.book_id
WHERE b.id != tbi.id
GROUP BY b.id
HAVING shared_authors > 0 OR shared_genres >= 2
ORDER BY shared_authors DESC, shared_genres DESC, b.rating_average DESC
LIMIT 10;

-- =========================================================================
-- DOWNLOAD QUEUE MANAGEMENT QUERIES
-- =========================================================================

-- 5. Get next downloads to process (priority queue)
SELECT 
    dq.id,
    dq.title,
    dq.author_name,
    dq.download_url,
    dq.file_format,
    dq.priority,
    dq.retry_count,
    dq.max_retries,
    u.username,
    i.name as indexer_name,
    i.rate_limit_requests,
    i.rate_limit_window
FROM download_queue dq
JOIN users u ON dq.user_id = u.id
JOIN indexers i ON dq.indexer_id = i.id
WHERE dq.status = 'pending'
    AND dq.retry_count < dq.max_retries
    AND i.is_active = TRUE
ORDER BY dq.priority ASC, dq.created_at ASC
LIMIT 5;

-- 6. Update download progress
UPDATE download_queue 
SET 
    status = ?,
    progress_percentage = ?,
    estimated_completion = datetime('now', '+' || ? || ' seconds'),
    updated_at = CURRENT_TIMESTAMP
WHERE id = ?;

-- 7. Get user's download history with statistics
SELECT 
    dh.title,
    dh.author_name,
    dh.file_format,
    dh.file_size_bytes,
    dh.download_duration_seconds,
    dh.final_status,
    dh.completed_at,
    i.name as indexer_name,
    ROUND(dh.file_size_bytes / 1024.0 / 1024.0, 2) as size_mb,
    CASE 
        WHEN dh.download_duration_seconds > 0 
        THEN ROUND(dh.file_size_bytes / dh.download_duration_seconds / 1024.0, 2)
        ELSE NULL 
    END as speed_kbps
FROM download_history dh
JOIN indexers i ON dh.indexer_id = i.id
WHERE dh.user_id = ?
ORDER BY dh.completed_at DESC
LIMIT 100;

-- 8. Download statistics by user and time period
SELECT 
    DATE(dh.completed_at) as download_date,
    COUNT(*) as total_downloads,
    SUM(CASE WHEN dh.final_status = 'completed' THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN dh.final_status = 'failed' THEN 1 ELSE 0 END) as failed,
    SUM(dh.file_size_bytes) as total_bytes,
    AVG(dh.download_duration_seconds) as avg_duration,
    AVG(CASE 
        WHEN dh.download_duration_seconds > 0 
        THEN dh.file_size_bytes / dh.download_duration_seconds 
    END) as avg_speed_bps
FROM download_history dh
WHERE dh.user_id = ?
    AND dh.completed_at >= date('now', '-30 days')
GROUP BY DATE(dh.completed_at)
ORDER BY download_date DESC;

-- =========================================================================
-- INDEXER MANAGEMENT AND HEALTH QUERIES
-- =========================================================================

-- 9. Get indexer health summary
SELECT 
    i.id,
    i.name,
    i.is_active,
    i.priority,
    ih.status,
    ih.response_time_ms,
    ih.error_message,
    ih.checked_at,
    COUNT(uic.id) as configured_users,
    COUNT(CASE WHEN uic.is_enabled = TRUE THEN 1 END) as active_users
FROM indexers i
LEFT JOIN indexer_health ih ON i.id = ih.indexer_id 
    AND ih.id = (
        SELECT MAX(id) FROM indexer_health 
        WHERE indexer_id = i.id
    )
LEFT JOIN user_indexer_config uic ON i.id = uic.indexer_id
GROUP BY i.id
ORDER BY i.priority DESC, i.name;

-- 10. Find indexers needing health checks
SELECT 
    i.id,
    i.name,
    i.base_url,
    COALESCE(MAX(ih.checked_at), '1970-01-01') as last_checked,
    (julianday('now') - julianday(COALESCE(MAX(ih.checked_at), '1970-01-01'))) * 24 * 60 as minutes_since_check
FROM indexers i
LEFT JOIN indexer_health ih ON i.id = ih.indexer_id
WHERE i.is_active = TRUE
GROUP BY i.id
HAVING minutes_since_check >= 15 -- 15 minutes
ORDER BY minutes_since_check DESC;

-- 11. Indexer performance analysis
SELECT 
    i.name,
    COUNT(ih.id) as total_checks,
    AVG(ih.response_time_ms) as avg_response_time,
    MIN(ih.response_time_ms) as min_response_time,
    MAX(ih.response_time_ms) as max_response_time,
    SUM(CASE WHEN ih.status = 'healthy' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as uptime_percentage,
    COUNT(CASE WHEN ih.status = 'down' THEN 1 END) as downtime_incidents
FROM indexers i
JOIN indexer_health ih ON i.id = ih.indexer_id
WHERE ih.checked_at >= datetime('now', '-7 days')
GROUP BY i.id, i.name
ORDER BY uptime_percentage DESC, avg_response_time ASC;

-- =========================================================================
-- USER MANAGEMENT AND PREFERENCES QUERIES
-- =========================================================================

-- 12. Get user's complete configuration
SELECT 
    u.id,
    u.username,
    u.email,
    u.is_active,
    u.last_login,
    json_group_object(up.preference_key, up.preference_value) as preferences,
    COUNT(DISTINCT df.id) as download_folders,
    COUNT(DISTINCT qp.id) as quality_profiles,
    COUNT(DISTINCT uic.id) as configured_indexers
FROM users u
LEFT JOIN user_preferences up ON u.id = up.user_id
LEFT JOIN download_folders df ON u.id = df.user_id
LEFT JOIN quality_profiles qp ON u.id = qp.user_id
LEFT JOIN user_indexer_config uic ON u.id = uic.user_id AND uic.is_enabled = TRUE
WHERE u.id = ?
GROUP BY u.id;

-- 13. User activity summary
SELECT 
    u.username,
    COUNT(DISTINCT dh.id) as total_downloads,
    SUM(dh.file_size_bytes) as total_bytes_downloaded,
    MAX(dh.completed_at) as last_download,
    COUNT(DISTINCT sh.id) as total_searches,
    MAX(sh.searched_at) as last_search,
    COUNT(DISTINCT DATE(dh.completed_at)) as active_days
FROM users u
LEFT JOIN download_history dh ON u.id = dh.user_id 
    AND dh.completed_at >= datetime('now', '-30 days')
LEFT JOIN search_history sh ON u.id = sh.user_id 
    AND sh.searched_at >= datetime('now', '-30 days')
WHERE u.is_active = TRUE
GROUP BY u.id, u.username
ORDER BY total_downloads DESC;

-- =========================================================================
-- SEARCH AND CACHING QUERIES
-- =========================================================================

-- 14. Check search cache before querying indexers
SELECT 
    sc.results,
    sc.results_count,
    (julianday(sc.expires_at) - julianday('now')) * 24 * 60 as minutes_until_expiry
FROM search_cache sc
WHERE sc.query_hash = ?
    AND sc.expires_at > datetime('now')
    AND sc.indexer_id = ?
ORDER BY sc.created_at DESC
LIMIT 1;

-- 15. Popular search queries
SELECT 
    sh.query,
    COUNT(*) as search_count,
    COUNT(DISTINCT sh.user_id) as unique_users,
    AVG(sh.results_count) as avg_results,
    MAX(sh.searched_at) as last_searched
FROM search_history sh
WHERE sh.searched_at >= datetime('now', '-7 days')
GROUP BY sh.query
HAVING search_count >= 3
ORDER BY search_count DESC, unique_users DESC
LIMIT 20;

-- 16. Clean expired cache entries
DELETE FROM search_cache 
WHERE expires_at < datetime('now');

-- =========================================================================
-- SYSTEM MONITORING AND MAINTENANCE QUERIES
-- =========================================================================

-- 17. Database health check
SELECT 
    'books' as table_name,
    COUNT(*) as row_count,
    AVG(LENGTH(title) + LENGTH(COALESCE(description, ''))) as avg_row_size
FROM books
UNION ALL
SELECT 
    'download_queue' as table_name,
    COUNT(*) as row_count,
    AVG(LENGTH(title) + LENGTH(COALESCE(error_message, ''))) as avg_row_size
FROM download_queue
UNION ALL
SELECT 
    'download_history' as table_name,
    COUNT(*) as row_count,
    AVG(file_size_bytes) as avg_row_size
FROM download_history
UNION ALL
SELECT 
    'system_logs' as table_name,
    COUNT(*) as row_count,
    AVG(LENGTH(message) + LENGTH(COALESCE(details, ''))) as avg_row_size
FROM system_logs;

-- 18. System performance metrics
SELECT 
    'active_downloads' as metric,
    COUNT(*) as value
FROM download_queue 
WHERE status IN ('downloading', 'pending')
UNION ALL
SELECT 
    'healthy_indexers' as metric,
    COUNT(*) as value
FROM indexers i
JOIN indexer_health ih ON i.id = ih.indexer_id
WHERE i.is_active = TRUE 
    AND ih.status = 'healthy'
    AND ih.id = (SELECT MAX(id) FROM indexer_health WHERE indexer_id = i.id)
UNION ALL
SELECT 
    'recent_errors' as metric,
    COUNT(*) as value
FROM system_logs 
WHERE level IN ('ERROR', 'CRITICAL')
    AND created_at >= datetime('now', '-1 hour')
UNION ALL
SELECT 
    'cache_hit_ratio' as metric,
    ROUND(
        SUM(CASE WHEN message LIKE '%cache_hit%' THEN 1 ELSE 0 END) * 100.0 / 
        NULLIF(SUM(CASE WHEN message LIKE '%cache_%' THEN 1 ELSE 0 END), 0),
        2
    ) as value
FROM system_logs 
WHERE created_at >= datetime('now', '-1 hour');

-- 19. Identify slow queries for optimization
SELECT 
    component,
    message,
    COUNT(*) as occurrence_count,
    AVG(CAST(json_extract(details, '$.duration_ms') AS REAL)) as avg_duration_ms,
    MAX(CAST(json_extract(details, '$.duration_ms') AS REAL)) as max_duration_ms
FROM system_logs 
WHERE level = 'WARNING'
    AND message LIKE '%slow_query%'
    AND created_at >= datetime('now', '-24 hours')
GROUP BY component, message
HAVING avg_duration_ms > 1000 -- Queries taking more than 1 second
ORDER BY avg_duration_ms DESC;

-- 20. Database size and growth analysis
SELECT 
    'database_size_mb' as metric,
    ROUND((page_count * page_size) / 1024.0 / 1024.0, 2) as value
FROM pragma_page_count(), pragma_page_size()
UNION ALL
SELECT 
    'free_pages' as metric,
    freelist_count as value
FROM pragma_freelist_count()
UNION ALL
SELECT 
    'integrity_check' as metric,
    CASE WHEN integrity_check = 'ok' THEN 1 ELSE 0 END as value
FROM pragma_integrity_check;

-- =========================================================================
-- CLEANUP AND MAINTENANCE QUERIES
-- =========================================================================

-- 21. Archive old download history
INSERT INTO download_history_archive 
SELECT * FROM download_history 
WHERE completed_at < date('now', '-1 year');

DELETE FROM download_history 
WHERE completed_at < date('now', '-1 year');

-- 22. Clean up old system logs
DELETE FROM system_logs 
WHERE created_at < datetime('now', '-30 days')
    AND level NOT IN ('ERROR', 'CRITICAL');

-- 23. Remove orphaned book files
DELETE FROM book_files 
WHERE book_id NOT IN (SELECT id FROM books);

-- 24. Update book statistics (run periodically)
UPDATE books 
SET rating_count = (
    SELECT COUNT(*) 
    FROM user_book_ratings 
    WHERE book_id = books.id
),
rating_average = (
    SELECT AVG(rating) 
    FROM user_book_ratings 
    WHERE book_id = books.id
)
WHERE id IN (
    SELECT DISTINCT book_id 
    FROM user_book_ratings 
    WHERE updated_at >= datetime('now', '-1 day')
);

-- 25. Optimize database (run weekly)
PRAGMA optimize;
ANALYZE;
VACUUM;