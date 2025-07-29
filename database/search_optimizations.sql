-- FolioFox Search Performance Optimizations
-- Advanced indexing strategy for high-performance search operations

-- =====================================================================
-- OPTIMIZED SEARCH INDEXES
-- =====================================================================

-- Composite index for multi-field search operations
CREATE INDEX IF NOT EXISTS idx_books_search_composite ON books(
    title COLLATE NOCASE,
    rating_average DESC,
    publication_date DESC,
    language_id,
    id
) WHERE rating_average >= 2.0;

-- Covering index for search result assembly
CREATE INDEX IF NOT EXISTS idx_books_search_covering ON books(
    id,
    title,
    publication_date,
    rating_average,
    series_id,
    language_id,
    publisher_id,
    cover_url,
    isbn_13
);

-- Optimized author search index
CREATE INDEX IF NOT EXISTS idx_book_authors_search ON book_authors(
    author_id,
    book_id,
    role
) WHERE role = 'author';

-- Fast genre filtering
CREATE INDEX IF NOT EXISTS idx_book_genres_search ON book_genres(
    genre_id,
    book_id
);

-- Search cache performance index
CREATE INDEX IF NOT EXISTS idx_search_cache_performance ON search_cache(
    query_hash,
    expires_at,
    indexer_id
) WHERE expires_at > datetime('now');

-- =====================================================================
-- SEARCH RESULT MATERIALIZED VIEW
-- =====================================================================

-- High-performance search results view with pre-computed joins
CREATE VIEW IF NOT EXISTS search_results_optimized AS
SELECT 
    b.id,
    b.title,
    b.isbn_13,
    b.publication_date,
    b.rating_average,
    b.cover_url,
    l.code as language_code,
    l.name as language_name,
    p.name as publisher_name,
    s.name as series_name,
    b.series_position,
    -- Pre-computed author concatenation
    (
        SELECT GROUP_CONCAT(a.name, ', ')
        FROM book_authors ba
        JOIN authors a ON ba.author_id = a.id
        WHERE ba.book_id = b.id AND ba.role = 'author'
    ) as authors,
    -- Pre-computed genre concatenation  
    (
        SELECT GROUP_CONCAT(g.name, ', ')
        FROM book_genres bg
        JOIN genres g ON bg.genre_id = g.id
        WHERE bg.book_id = b.id
    ) as genres,
    -- File format availability
    (
        SELECT COUNT(DISTINCT bf.format_id)
        FROM book_files bf
        WHERE bf.book_id = b.id
    ) as format_count,
    b.created_at,
    b.updated_at
FROM books b
LEFT JOIN languages l ON b.language_id = l.id
LEFT JOIN publishers p ON b.publisher_id = p.id
LEFT JOIN series s ON b.series_id = s.id
WHERE b.rating_average >= 2.0; -- Filter low-quality results

-- Index for the materialized view
CREATE INDEX IF NOT EXISTS idx_search_results_optimized_title ON search_results_optimized(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_search_results_optimized_rating ON search_results_optimized(rating_average DESC);
CREATE INDEX IF NOT EXISTS idx_search_results_optimized_date ON search_results_optimized(publication_date DESC);

-- =====================================================================
-- SEARCH QUERY OPTIMIZATION FUNCTIONS
-- =====================================================================

-- Optimized full-text search query
CREATE VIRTUAL TABLE IF NOT EXISTS books_fts_optimized USING fts5(
    title,
    subtitle,
    description,
    author_names,
    series_name,
    genre_names,
    tags,
    content='search_results_optimized',
    content_rowid='id',
    prefix='2,3,4',
    tokenize='porter unicode61 remove_diacritics 1'
);

-- Search performance statistics table
CREATE TABLE IF NOT EXISTS search_performance_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_hash TEXT NOT NULL,
    query_text TEXT NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    result_count INTEGER NOT NULL,
    cache_hit BOOLEAN DEFAULT FALSE,
    indexer_response_times TEXT, -- JSON array of response times
    memory_usage_mb INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_perf_stats_query ON search_performance_stats(query_hash, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_search_perf_stats_time ON search_performance_stats(execution_time_ms DESC);

-- =====================================================================
-- SEARCH CACHE OPTIMIZATION
-- =====================================================================

-- Hierarchical cache structure for different query types
CREATE TABLE IF NOT EXISTS search_cache_hierarchy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_level INTEGER NOT NULL, -- 1=query, 2=category, 3=global
    cache_key TEXT NOT NULL UNIQUE,
    parent_key TEXT,
    query_pattern TEXT,
    hit_count INTEGER DEFAULT 0,
    last_hit DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_cache_hierarchy_level ON search_cache_hierarchy(cache_level, expires_at);
CREATE INDEX IF NOT EXISTS idx_search_cache_hierarchy_pattern ON search_cache_hierarchy(query_pattern, cache_level);

-- =====================================================================
-- QUERY PERFORMANCE MONITORING
-- =====================================================================

-- Trigger to automatically log slow queries
CREATE TRIGGER IF NOT EXISTS log_slow_search_queries
AFTER INSERT ON search_performance_stats
WHEN NEW.execution_time_ms > 1000 -- Log queries taking > 1 second
BEGIN
    INSERT INTO system_logs (level, component, message, details)
    VALUES (
        'WARNING',
        'search_performance',
        'Slow search query detected',
        json_object(
            'query_hash', NEW.query_hash,
            'query_text', NEW.query_text,
            'execution_time_ms', NEW.execution_time_ms,
            'result_count', NEW.result_count,
            'cache_hit', NEW.cache_hit
        )
    );
END;

-- =====================================================================
-- MAINTENANCE PROCEDURES
-- =====================================================================

-- Procedure to rebuild FTS indexes for optimal performance
CREATE TRIGGER IF NOT EXISTS rebuild_fts_optimization
AFTER INSERT ON scheduled_tasks
WHEN NEW.name = 'rebuild_search_fts' AND NEW.last_run < date('now', '-7 days')
BEGIN
    -- Rebuild FTS5 index
    INSERT INTO books_fts_optimized(books_fts_optimized) VALUES('rebuild');
    
    -- Update statistics
    INSERT INTO books_fts_optimized(books_fts_optimized) VALUES('optimize');
    
    -- Update task completion
    UPDATE scheduled_tasks 
    SET last_run = datetime('now'), last_run_status = 'success' 
    WHERE id = NEW.id;
END;

-- Clean up expired search cache entries
CREATE TRIGGER IF NOT EXISTS cleanup_search_cache
AFTER INSERT ON scheduled_tasks  
WHEN NEW.name = 'cleanup_search_cache' AND NEW.last_run < datetime('now', '-1 hour')
BEGIN
    -- Remove expired cache entries
    DELETE FROM search_cache WHERE expires_at < datetime('now');
    DELETE FROM search_cache_hierarchy WHERE expires_at < datetime('now');
    
    -- Update cache hit statistics
    UPDATE search_cache_hierarchy 
    SET hit_count = hit_count + 1, last_hit = datetime('now')
    WHERE cache_key IN (
        SELECT cache_key FROM search_performance_stats 
        WHERE cache_hit = TRUE AND timestamp >= datetime('now', '-1 hour')
    );
    
    -- Mark task complete
    UPDATE scheduled_tasks 
    SET last_run = datetime('now'), last_run_status = 'success'
    WHERE id = NEW.id;
END;

-- =====================================================================
-- SEARCH OPTIMIZATION HINTS
-- =====================================================================

-- Query optimization hints for SQLite query planner
PRAGMA optimize;
PRAGMA analysis_limit = 1000;

-- Analyze search-critical tables
ANALYZE books;
ANALYZE book_authors;
ANALYZE book_genres; 
ANALYZE search_cache;
ANALYZE search_results_optimized;