-- FolioFox Large Library Performance Optimizations
-- Advanced database strategies for handling millions of books efficiently

-- =====================================================================
-- PARTITIONING AND SHARDING STRATEGIES
-- =====================================================================

-- Create partitioned books table for large datasets (simulated with views)
-- SQLite doesn't support native partitioning, so we use a view-based approach

-- Books partitioned by publication decade for temporal queries
CREATE VIEW IF NOT EXISTS books_modern AS
SELECT * FROM books WHERE publication_date >= '2000-01-01';

CREATE VIEW IF NOT EXISTS books_classic AS  
SELECT * FROM books WHERE publication_date < '2000-01-01' AND publication_date >= '1900-01-01';

CREATE VIEW IF NOT EXISTS books_vintage AS
SELECT * FROM books WHERE publication_date < '1900-01-01';

-- Indexes for partitioned views
CREATE INDEX IF NOT EXISTS idx_books_modern_search ON books(publication_date, title, rating_average) 
WHERE publication_date >= '2000-01-01';

CREATE INDEX IF NOT EXISTS idx_books_classic_search ON books(publication_date, title, rating_average)
WHERE publication_date < '2000-01-01' AND publication_date >= '1900-01-01';

CREATE INDEX IF NOT EXISTS idx_books_vintage_search ON books(publication_date, title, rating_average)
WHERE publication_date < '1900-01-01';

-- =====================================================================
-- HIERARCHICAL INDEXING FOR LARGE DATASETS
-- =====================================================================

-- Multi-level index structure for efficient large dataset navigation
CREATE INDEX IF NOT EXISTS idx_books_hierarchical_level1 ON books(
    substr(title, 1, 1), -- First letter grouping
    rating_average DESC,
    id
);

CREATE INDEX IF NOT EXISTS idx_books_hierarchical_level2 ON books(
    substr(title, 1, 3), -- Three letter grouping  
    publication_date DESC,
    rating_average DESC,
    id
);

-- Author hierarchical indexing
CREATE INDEX IF NOT EXISTS idx_authors_hierarchical ON authors(
    substr(sort_name, 1, 1),
    sort_name,
    id
);

-- Genre hierarchical indexing with parent-child optimization
CREATE INDEX IF NOT EXISTS idx_genres_hierarchical ON genres(
    parent_id,
    name,
    id
);

-- =====================================================================
-- EFFICIENT PAGINATION FOR LARGE RESULT SETS
-- =====================================================================

-- Cursor-based pagination view for stable large dataset navigation
CREATE VIEW IF NOT EXISTS books_pagination_cursor AS
SELECT 
    b.id,
    b.title,
    b.rating_average,
    b.publication_date,
    -- Create composite cursor for stable pagination
    printf("%010d_%010d", 
        CAST((100 - b.rating_average) * 1000000 AS INTEGER),
        b.id
    ) as pagination_cursor,
    b.created_at,
    b.updated_at
FROM books b
WHERE b.rating_average >= 2.0  -- Filter low quality books
ORDER BY b.rating_average DESC, b.id ASC;

-- Index for cursor-based pagination
CREATE INDEX IF NOT EXISTS idx_books_cursor_pagination ON books(
    rating_average DESC,
    id ASC,
    title
);

-- =====================================================================
-- MATERIALIZED AGGREGATION TABLES
-- =====================================================================

-- Pre-computed aggregation table for fast statistics
CREATE TABLE IF NOT EXISTS library_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stat_type TEXT NOT NULL, -- 'author_count', 'genre_count', 'format_count', etc.
    stat_key TEXT NOT NULL,  -- Author name, genre name, format, etc.
    stat_value INTEGER NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stat_type, stat_key)
);

-- Index for fast statistic lookups
CREATE INDEX IF NOT EXISTS idx_library_stats_type_key ON library_statistics(stat_type, stat_key);
CREATE INDEX IF NOT EXISTS idx_library_stats_value ON library_statistics(stat_type, stat_value DESC);

-- Trigger to maintain author book counts
CREATE TRIGGER IF NOT EXISTS maintain_author_stats
AFTER INSERT ON book_authors
BEGIN
    INSERT OR REPLACE INTO library_statistics (stat_type, stat_key, stat_value, last_updated)
    SELECT 
        'author_book_count',
        a.name,
        COUNT(*),
        datetime('now')
    FROM book_authors ba
    JOIN authors a ON ba.author_id = a.id
    WHERE ba.author_id = NEW.author_id
    GROUP BY a.name;
END;

-- Trigger to maintain genre book counts
CREATE TRIGGER IF NOT EXISTS maintain_genre_stats
AFTER INSERT ON book_genres  
BEGIN
    INSERT OR REPLACE INTO library_statistics (stat_type, stat_key, stat_value, last_updated)
    SELECT
        'genre_book_count',
        g.name,
        COUNT(*),
        datetime('now') 
    FROM book_genres bg
    JOIN genres g ON bg.genre_id = g.id
    WHERE bg.genre_id = NEW.genre_id
    GROUP BY g.name;
END;

-- =====================================================================
-- DENORMALIZED SEARCH TABLES
-- =====================================================================

-- Denormalized table for ultra-fast search operations
CREATE TABLE IF NOT EXISTS books_search_denormalized (
    book_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    title_normalized TEXT NOT NULL, -- Lowercased, stripped
    authors TEXT NOT NULL, -- Concatenated author names
    authors_normalized TEXT NOT NULL,
    genres TEXT NOT NULL, -- Concatenated genre names
    series_info TEXT, -- Series name and position
    publication_year INTEGER,
    rating_average REAL,
    format_list TEXT, -- Available formats
    language_code TEXT,
    isbn_combined TEXT, -- ISBN-10 and ISBN-13 combined
    search_boost REAL DEFAULT 1.0, -- Boost factor for popular books
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Optimized indexes for denormalized search
CREATE INDEX IF NOT EXISTS idx_search_denorm_title ON books_search_denormalized(title_normalized);
CREATE INDEX IF NOT EXISTS idx_search_denorm_authors ON books_search_denormalized(authors_normalized);
CREATE INDEX IF NOT EXISTS idx_search_denorm_combined ON books_search_denormalized(
    title_normalized,
    authors_normalized,
    rating_average DESC
);
CREATE INDEX IF NOT EXISTS idx_search_denorm_boost ON books_search_denormalized(
    search_boost DESC,
    rating_average DESC,
    book_id
);

-- Trigger to maintain denormalized search table
CREATE TRIGGER IF NOT EXISTS maintain_search_denormalized
AFTER UPDATE ON books
BEGIN
    INSERT OR REPLACE INTO books_search_denormalized (
        book_id,
        title,
        title_normalized,
        authors,
        authors_normalized,
        genres,
        series_info,
        publication_year,
        rating_average,
        format_list,
        language_code,
        isbn_combined,
        search_boost,
        last_updated
    )
    SELECT 
        NEW.id,
        NEW.title,
        lower(trim(NEW.title)),
        COALESCE((
            SELECT GROUP_CONCAT(a.name, '; ')
            FROM book_authors ba
            JOIN authors a ON ba.author_id = a.id
            WHERE ba.book_id = NEW.id
        ), ''),
        COALESCE(lower((
            SELECT GROUP_CONCAT(a.name, '; ')
            FROM book_authors ba  
            JOIN authors a ON ba.author_id = a.id
            WHERE ba.book_id = NEW.id
        )), ''),
        COALESCE((
            SELECT GROUP_CONCAT(g.name, '; ')
            FROM book_genres bg
            JOIN genres g ON bg.genre_id = g.id
            WHERE bg.book_id = NEW.id
        ), ''),
        CASE 
            WHEN NEW.series_id IS NOT NULL THEN
                (SELECT s.name || ' #' || CAST(NEW.series_position AS TEXT)
                 FROM series s WHERE s.id = NEW.series_id)
            ELSE NULL
        END,
        CAST(strftime('%Y', NEW.publication_date) AS INTEGER),
        NEW.rating_average,
        COALESCE((
            SELECT GROUP_CONCAT(bf.name, '; ')
            FROM book_files bfs
            JOIN book_formats bf ON bfs.format_id = bf.id
            WHERE bfs.book_id = NEW.id
        ), ''),
        COALESCE((SELECT code FROM languages WHERE id = NEW.language_id), ''),
        COALESCE(NEW.isbn_13, '') || '|' || COALESCE(NEW.isbn_10, ''),
        -- Calculate search boost based on rating and popularity
        CASE 
            WHEN NEW.rating_average >= 4.5 THEN 2.0
            WHEN NEW.rating_average >= 4.0 THEN 1.5
            WHEN NEW.rating_average >= 3.5 THEN 1.2
            ELSE 1.0
        END,
        datetime('now');
END;

-- =====================================================================
-- LARGE DATASET QUERY OPTIMIZATION FUNCTIONS
-- =====================================================================

-- Optimized function for counting large result sets (uses approximation for very large counts)
CREATE VIEW IF NOT EXISTS book_count_estimates AS
SELECT 
    'total_books' as category,
    COUNT(*) as estimated_count,
    CASE 
        WHEN COUNT(*) > 1000000 THEN 'exact'
        ELSE 'estimated'
    END as count_type
FROM books
UNION ALL
SELECT 
    'books_with_ratings' as category,
    COUNT(*) as estimated_count,
    'exact' as count_type
FROM books 
WHERE rating_average > 0
UNION ALL
SELECT
    'modern_books' as category,
    COUNT(*) as estimated_count,
    'exact' as count_type
FROM books
WHERE publication_date >= '2000-01-01';

-- =====================================================================
-- BULK OPERATION OPTIMIZATIONS
-- =====================================================================

-- Optimized bulk insert procedure (simulated with prepared statement guidance)
-- For bulk operations, use batched inserts with transaction management

-- Create temporary table for bulk book imports
CREATE TEMP TABLE IF NOT EXISTS books_bulk_import (
    temp_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT,
    author_names TEXT, -- Pipe-separated author names
    genre_names TEXT,  -- Pipe-separated genre names
    isbn_13 TEXT,
    isbn_10 TEXT,
    publication_date DATE,
    rating_average REAL,
    language_code TEXT,
    series_name TEXT,
    series_position REAL,
    format_name TEXT,
    file_size_bytes INTEGER,
    import_batch_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for bulk import processing
CREATE INDEX IF NOT EXISTS idx_bulk_import_batch ON books_bulk_import(import_batch_id);

-- =====================================================================
-- MEMORY-EFFICIENT QUERIES FOR LARGE LIBRARIES
-- =====================================================================

-- Memory-efficient book browsing with minimal data transfer
CREATE VIEW IF NOT EXISTS books_browse_minimal AS
SELECT 
    b.id,
    b.title,
    substr(b.title, 1, 100) as title_short, -- Limit title length
    COALESCE((
        SELECT a.name 
        FROM book_authors ba 
        JOIN authors a ON ba.author_id = a.id 
        WHERE ba.book_id = b.id 
        ORDER BY ba.author_id 
        LIMIT 1
    ), 'Unknown') as primary_author,
    b.rating_average,
    strftime('%Y', b.publication_date) as pub_year,
    b.cover_url,
    -- Minimal metadata for list views
    CASE 
        WHEN b.series_id IS NOT NULL THEN 
            (SELECT s.name FROM series s WHERE s.id = b.series_id LIMIT 1)
        ELSE NULL 
    END as series_name
FROM books b
WHERE b.rating_average >= 2.0; -- Filter out very low quality

-- Index for browse minimal view
CREATE INDEX IF NOT EXISTS idx_books_browse_minimal ON books(
    rating_average,
    id,
    title,
    series_id
) WHERE rating_average >= 2.0;

-- =====================================================================
-- ADVANCED CACHING TABLES
-- =====================================================================

-- Search result cache optimized for large libraries  
CREATE TABLE IF NOT EXISTS search_results_cache_large (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_signature TEXT NOT NULL UNIQUE, -- Hash of normalized query + filters
    result_ids TEXT NOT NULL, -- JSON array of book IDs
    result_count INTEGER NOT NULL,
    total_matches INTEGER NOT NULL, -- Total matches (may be larger than returned)
    cache_level INTEGER DEFAULT 1, -- 1=full, 2=partial, 3=summary
    search_duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    hit_count INTEGER DEFAULT 0,
    last_hit DATETIME
);

-- Hierarchical cache indexes
CREATE INDEX IF NOT EXISTS idx_search_cache_large_sig ON search_results_cache_large(query_signature);
CREATE INDEX IF NOT EXISTS idx_search_cache_large_expires ON search_results_cache_large(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_cache_large_hits ON search_results_cache_large(hit_count DESC, last_hit DESC);

-- Popular searches cache for autocomplete
CREATE TABLE IF NOT EXISTS popular_searches_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_term TEXT NOT NULL UNIQUE,
    search_count INTEGER DEFAULT 1,
    last_searched DATETIME DEFAULT CURRENT_TIMESTAMP,
    result_count INTEGER DEFAULT 0,
    avg_rating REAL DEFAULT 0.0,
    category TEXT DEFAULT 'general' -- 'author', 'title', 'series', 'genre'
);

CREATE INDEX IF NOT EXISTS idx_popular_searches_count ON popular_searches_cache(search_count DESC);
CREATE INDEX IF NOT EXISTS idx_popular_searches_recent ON popular_searches_cache(last_searched DESC);
CREATE INDEX IF NOT EXISTS idx_popular_searches_category ON popular_searches_cache(category, search_count DESC);

-- =====================================================================
-- MAINTENANCE PROCEDURES FOR LARGE LIBRARIES
-- =====================================================================

-- Incremental statistics update for large libraries
CREATE TABLE IF NOT EXISTS maintenance_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    batch_size INTEGER DEFAULT 10000,
    last_processed_id INTEGER DEFAULT 0,
    total_records INTEGER DEFAULT 0,
    processed_records INTEGER DEFAULT 0,
    started_at DATETIME,
    completed_at DATETIME,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    error_message TEXT
);

-- Insert maintenance tasks
INSERT OR IGNORE INTO maintenance_schedule (task_name, table_name, batch_size) VALUES
('rebuild_search_denormalized', 'books_search_denormalized', 5000),
('update_library_statistics', 'library_statistics', 10000),
('cleanup_expired_cache', 'search_results_cache_large', 50000),
('optimize_fts_index', 'books_fts_optimized', 1000),
('analyze_tables', 'all_tables', 0);

-- =====================================================================
-- PERFORMANCE MONITORING FOR LARGE LIBRARIES
-- =====================================================================

-- Query performance tracking table
CREATE TABLE IF NOT EXISTS query_performance_large (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_type TEXT NOT NULL, -- 'search', 'browse', 'detail', 'bulk'
    query_signature TEXT NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    rows_examined INTEGER,
    rows_returned INTEGER,
    memory_usage_mb REAL,
    cpu_usage_percent REAL,
    cache_hit BOOLEAN DEFAULT FALSE,
    query_date DATE DEFAULT (date('now')),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_query_perf_large_type ON query_performance_large(query_type, query_date);
CREATE INDEX IF NOT EXISTS idx_query_perf_large_time ON query_performance_large(execution_time_ms DESC);
CREATE INDEX IF NOT EXISTS idx_query_perf_large_date ON query_performance_large(query_date DESC);

-- System resource tracking for large library operations
CREATE TABLE IF NOT EXISTS system_resource_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type TEXT NOT NULL,
    memory_usage_mb INTEGER NOT NULL,
    cpu_usage_percent REAL NOT NULL,
    disk_io_read_mb REAL DEFAULT 0,
    disk_io_write_mb REAL DEFAULT 0,
    active_connections INTEGER DEFAULT 0,
    queue_length INTEGER DEFAULT 0,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resource_usage_operation ON system_resource_usage(operation_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_usage_memory ON system_resource_usage(memory_usage_mb DESC);

-- =====================================================================
-- OPTIMIZATION PROCEDURES
-- =====================================================================

-- Create stored procedure equivalents using triggers for maintenance

-- Trigger for automatic index maintenance on large tables
CREATE TRIGGER IF NOT EXISTS large_library_maintenance
AFTER INSERT ON scheduled_tasks
WHEN NEW.name = 'large_library_optimization' AND NEW.last_run < datetime('now', '-1 day')
BEGIN
    -- Rebuild search denormalized table incrementally
    INSERT INTO books_search_denormalized (
        book_id, title, title_normalized, authors, authors_normalized,
        genres, series_info, publication_year, rating_average,
        format_list, language_code, isbn_combined, search_boost, last_updated
    )
    SELECT 
        b.id,
        b.title,
        lower(trim(b.title)),
        COALESCE((
            SELECT GROUP_CONCAT(a.name, '; ')
            FROM book_authors ba
            JOIN authors a ON ba.author_id = a.id
            WHERE ba.book_id = b.id
        ), ''),
        COALESCE(lower((
            SELECT GROUP_CONCAT(a.name, '; ')
            FROM book_authors ba
            JOIN authors a ON ba.author_id = a.id
            WHERE ba.book_id = b.id
        )), ''),
        COALESCE((
            SELECT GROUP_CONCAT(g.name, '; ')
            FROM book_genres bg
            JOIN genres g ON bg.genre_id = g.id
            WHERE bg.book_id = b.id
        ), ''),
        CASE 
            WHEN b.series_id IS NOT NULL THEN
                (SELECT s.name || ' #' || CAST(b.series_position AS TEXT)
                 FROM series s WHERE s.id = b.series_id)
            ELSE NULL
        END,
        CAST(strftime('%Y', b.publication_date) AS INTEGER),
        b.rating_average,
        COALESCE((
            SELECT GROUP_CONCAT(bf.name, '; ')
            FROM book_files bfs
            JOIN book_formats bf ON bfs.format_id = bf.id
            WHERE bfs.book_id = b.id
        ), ''),
        COALESCE((SELECT code FROM languages WHERE id = b.language_id), ''),
        COALESCE(b.isbn_13, '') || '|' || COALESCE(b.isbn_10, ''),
        CASE 
            WHEN b.rating_average >= 4.5 THEN 2.0
            WHEN b.rating_average >= 4.0 THEN 1.5
            WHEN b.rating_average >= 3.5 THEN 1.2
            ELSE 1.0
        END,
        datetime('now')
    FROM books b
    WHERE b.id NOT IN (SELECT book_id FROM books_search_denormalized)
       OR b.updated_at > (SELECT last_updated FROM books_search_denormalized WHERE book_id = b.id)
    LIMIT 10000; -- Process in batches

    -- Update task completion
    UPDATE scheduled_tasks 
    SET last_run = datetime('now'), last_run_status = 'success'
    WHERE id = NEW.id;
END;

-- Analysis and optimization
ANALYZE books;
ANALYZE book_authors;
ANALYZE book_genres;
ANALYZE books_search_denormalized;
ANALYZE library_statistics;

-- Set optimization pragma for large datasets
PRAGMA optimize;
PRAGMA cache_size = -131072; -- 128MB cache for large libraries
PRAGMA mmap_size = 536870912; -- 512MB memory-mapped I/O