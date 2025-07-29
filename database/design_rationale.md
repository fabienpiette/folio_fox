# FolioFox Database Design Rationale

## Executive Summary

The FolioFox database schema is designed to support a robust eBook management and download automation system. The design prioritizes data integrity, query performance, and scalability while maintaining simplicity for a SQLite-based architecture with Redis caching.

## Architecture Decisions

### 1. Database Technology Choice

**Primary Storage: SQLite**
- **Rationale**: Simplified deployment, zero administration, excellent performance for read-heavy workloads
- **Benefits**: 
  - Single file deployment
  - ACID compliance
  - Full-text search with FTS5
  - Excellent performance for < 1TB databases
  - No network latency
- **Trade-offs**: Limited concurrent write performance, single-server deployment

**Caching Layer: Redis**
- **Rationale**: High-performance in-memory caching to reduce database load
- **Benefits**:
  - Sub-millisecond response times
  - Rich data structures (hashes, sets, sorted sets)
  - Built-in expiration and memory management
  - Horizontal scaling capability

### 2. Schema Design Philosophy

**Normalized Design with Performance Optimizations**
- **Core Principle**: Balance between normalization (data integrity) and denormalization (query performance)
- **Approach**: 3NF normalization with strategic denormalization for frequently accessed data
- **Examples**:
  - `author_names` in search index for performance
  - Computed fields like `rating_average` instead of real-time calculation

## Core Entity Design

### 1. Book Metadata Architecture

#### Books Table
```sql
CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    isbn_10 TEXT,
    isbn_13 TEXT,
    asin TEXT,
    goodreads_id TEXT,
    google_books_id TEXT,
    publication_date DATE,
    page_count INTEGER,
    language_id INTEGER,
    publisher_id INTEGER,
    series_id INTEGER,
    series_position DECIMAL(5,2),
    rating_average DECIMAL(3,2),
    rating_count INTEGER DEFAULT 0,
    tags TEXT, -- JSON array
    cover_url TEXT,
    cover_local_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Design Decisions:**
- **Multiple Identifiers**: Support for ISBN-10, ISBN-13, ASIN, and external service IDs enables comprehensive book matching
- **Series Position as DECIMAL**: Allows for fractional positions (1.5, 2.1) common in book series
- **JSON Tags Field**: Flexible tagging system without rigid category constraints  
- **Separate Cover Storage**: Both URL and local path support for cover image management
- **Computed Rating Fields**: Pre-calculated averages to avoid expensive real-time calculations

#### Relationship Tables

**Many-to-Many Relationships:**
```sql
-- Books can have multiple authors, authors can write multiple books
CREATE TABLE book_authors (
    book_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    role TEXT DEFAULT 'author', -- author, editor, translator, illustrator
    PRIMARY KEY (book_id, author_id, role)
);

-- Books can belong to multiple genres
CREATE TABLE book_genres (
    book_id INTEGER NOT NULL,
    genre_id INTEGER NOT NULL,
    PRIMARY KEY (book_id, genre_id)
);
```

**Benefits:**
- Eliminates data duplication
- Supports complex relationships (co-authors, multiple genres)
- Flexible role assignment for contributors

### 2. Download Queue Architecture

#### Queue Management
```sql
CREATE TABLE download_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER,
    indexer_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    author_name TEXT,
    download_url TEXT NOT NULL,
    file_format TEXT NOT NULL,
    file_size_bytes INTEGER,
    priority INTEGER DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'pending',
    progress_percentage INTEGER DEFAULT 0,
    download_path TEXT,
    quality_profile_id INTEGER,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    estimated_completion DATETIME,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Design Decisions:**
- **Priority System**: Integer-based priority (1-10) for flexible queue ordering
- **Status Tracking**: Comprehensive status management with retry logic
- **Progress Monitoring**: Real-time download progress tracking
- **Quality Profiles**: User-defined download preferences and format priorities
- **Error Handling**: Built-in retry mechanism with configurable limits
- **Time Tracking**: Complete audit trail of download lifecycle

#### Historical Data Management
```sql
CREATE TABLE download_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    book_id INTEGER,
    indexer_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    author_name TEXT,
    file_format TEXT NOT NULL,
    file_size_bytes INTEGER,
    download_duration_seconds INTEGER,
    final_status TEXT NOT NULL,
    error_message TEXT,
    download_path TEXT,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Benefits:**
- Maintains complete download history for analytics
- Enables performance monitoring and optimization
- Supports user activity tracking and reporting

### 3. Indexer Configuration System

#### Indexer Management
```sql
CREATE TABLE indexers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    api_endpoint TEXT,
    indexer_type TEXT NOT NULL,
    supports_search BOOLEAN DEFAULT TRUE,
    supports_download BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 1,
    rate_limit_requests INTEGER DEFAULT 60,
    rate_limit_window INTEGER DEFAULT 60,
    timeout_seconds INTEGER DEFAULT 30,
    user_agent TEXT,
    description TEXT,
    website TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Design Decisions:**
- **Flexible Configuration**: Support for various indexer types and capabilities
- **Rate Limiting**: Built-in rate limiting configuration per indexer
- **Priority System**: Enables search order optimization
- **Health Monitoring**: Status tracking and performance monitoring
- **User-Specific Config**: Per-user indexer settings and authentication

#### Health Monitoring
```sql
CREATE TABLE indexer_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indexer_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Benefits:**
- Real-time health monitoring
- Performance trend analysis
- Automatic failover capabilities
- User-facing status information

### 4. Search and Indexing System

#### Full-Text Search
```sql
CREATE VIRTUAL TABLE books_fts USING fts5(
    title,
    subtitle,
    description,
    author_names,
    series_name,
    genre_names,
    tags,
    content='books',
    content_rowid='id'
);
```

**Design Decisions:**
- **SQLite FTS5**: Native full-text search with excellent performance
- **Comprehensive Indexing**: All searchable fields included
- **Automatic Maintenance**: Triggers keep FTS index synchronized
- **Flexible Queries**: Support for phrase queries, boolean operators, proximity

#### Search Caching
```sql
CREATE TABLE search_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_hash TEXT NOT NULL UNIQUE,
    query TEXT NOT NULL,
    filters TEXT, -- JSON object
    indexer_id INTEGER NOT NULL,
    results TEXT NOT NULL, -- JSON array
    results_count INTEGER DEFAULT 0,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Benefits:**
- Reduces indexer API calls
- Improves response times for common queries
- Configurable TTL for cache freshness
- Query deduplication across users

## Performance Optimization Strategy

### 1. Indexing Strategy

**Primary Indexes:**
```sql
-- High-frequency lookup indexes
CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_isbn_13 ON books(isbn_13);
CREATE INDEX idx_download_queue_status ON download_queue(status);
CREATE INDEX idx_download_queue_user_id ON download_queue(user_id);
```

**Composite Indexes:**
```sql
-- Multi-column indexes for complex queries
CREATE INDEX idx_books_series_position ON books(series_id, series_position);
CREATE INDEX idx_download_queue_user_status ON download_queue(user_id, status);
```

**Design Principles:**
- Index all foreign keys for join performance
- Create composite indexes for common query patterns
- Balance index count vs. write performance
- Regular index usage analysis and optimization

### 2. Query Optimization Patterns

#### Efficient Book Searches
```sql
-- Optimized book detail view
CREATE VIEW book_details_view AS
SELECT 
    b.id,
    b.title,
    b.subtitle,
    -- ... other book fields
    GROUP_CONCAT(DISTINCT a.name, '; ') as authors,
    GROUP_CONCAT(DISTINCT g.name, '; ') as genres,
    COUNT(bf.id) as available_formats
FROM books b
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN book_genres bg ON b.id = bg.book_id
LEFT JOIN genres g ON bg.genre_id = g.id
LEFT JOIN book_files bf ON b.id = bf.book_id
GROUP BY b.id;
```

**Benefits:**
- Pre-joined data reduces query complexity
- Aggregated fields avoid N+1 query problems
- Simplified application code

#### Download Queue Optimization
```sql
-- Efficient queue processing query
SELECT * FROM download_queue 
WHERE status = 'pending' 
ORDER BY priority ASC, created_at ASC 
LIMIT 10;
```

**Index Support:**
```sql
CREATE INDEX idx_download_queue_processing ON download_queue(status, priority, created_at);
```

### 3. Data Archiving Strategy

#### Historical Data Management
```sql
-- Archive old download history
CREATE TABLE download_history_archive AS 
SELECT * FROM download_history 
WHERE completed_at < date('now', '-1 year');

DELETE FROM download_history 
WHERE completed_at < date('now', '-1 year');
```

#### Log Rotation
```sql
-- Automated log cleanup via scheduled tasks
DELETE FROM system_logs 
WHERE created_at < datetime('now', '-30 days');
```

## Scalability Considerations

### 1. Horizontal Scaling Preparation

**Read Replicas:**
- SQLite's WAL mode enables concurrent readers
- Read-only database copies for heavy analytics
- Load balancing across multiple database files

**Sharding Strategy:**
- User-based sharding for multi-tenant scenarios
- Time-based sharding for historical data
- Geographic sharding for global deployments

### 2. Caching Architecture

**Multi-Level Caching:**
1. **Application Cache**: In-memory caching within application processes
2. **Redis Cache**: Distributed caching layer for frequently accessed data
3. **Database Cache**: SQLite's built-in page cache optimization

**Cache Invalidation:**
- Event-driven cache invalidation
- TTL-based expiration for time-sensitive data
- Version-based cache keys for consistency

### 3. Performance Monitoring

**Key Metrics:**
- Query execution times
- Cache hit ratios
- Database file size growth
- Index usage statistics
- Connection pool utilization

**Monitoring Queries:**
```sql
-- Slow query identification
EXPLAIN QUERY PLAN SELECT ...

-- Index usage analysis
SELECT * FROM sqlite_stat1;

-- Database size monitoring
SELECT page_count * page_size as database_size 
FROM pragma_page_count(), pragma_page_size();
```

## Security Considerations

### 1. Data Protection

**Sensitive Data Handling:**
- Password hashing with bcrypt/scrypt
- API key encryption in database
- PII data minimization
- Configurable data retention policies

**Access Control:**
```sql
-- Row-level security simulation
SELECT * FROM books 
WHERE user_id = ? OR is_public = TRUE;
```

### 2. SQL Injection Prevention

**Parameterized Queries:**
```python
# Always use parameterized queries
cursor.execute(
    "SELECT * FROM books WHERE title = ? AND author_id = ?",
    (title, author_id)
)
```

**Input Validation:**
- Strict input sanitization
- Data type validation
- Length limits on text fields
- Whitelist-based validation

## Backup and Recovery

### 1. Backup Strategy

**Automated Backups:**
```sql
-- SQLite backup command
VACUUM INTO '/backup/foliofox_backup_20250728.db';
```

**Backup Types:**
- **Full Backups**: Complete database copy (daily)
- **Incremental Backups**: WAL file archiving (hourly)
- **Schema Backups**: Structure-only backups (weekly)

### 2. Disaster Recovery

**Recovery Procedures:**
1. **Point-in-Time Recovery**: WAL replay to specific timestamp
2. **Corruption Recovery**: Database integrity check and repair
3. **Data Validation**: Post-recovery data consistency verification

**Testing:**
- Regular backup restoration testing
- Automated recovery procedure validation
- Disaster recovery drills

## Migration Strategy

### 1. Schema Evolution

**Migration Principles:**
- Backward compatibility where possible
- Non-destructive changes preferred
- Comprehensive rollback procedures
- Data validation at each step

**Migration Types:**
- **Additive**: New tables, columns, indexes
- **Transformative**: Data format changes
- **Destructive**: Column/table removal (with deprecation period)

### 2. Zero-Downtime Migrations

**Strategies:**
- Shadow table creation and data copying
- Blue-green deployment patterns
- Feature flags for new functionality
- Gradual rollout procedures

## Monitoring and Maintenance

### 1. Database Health Monitoring

**Key Metrics:**
```sql
-- Database statistics
SELECT 
    (SELECT COUNT(*) FROM books) as total_books,
    (SELECT COUNT(*) FROM download_queue WHERE status = 'pending') as pending_downloads,
    (SELECT COUNT(*) FROM users WHERE is_active = TRUE) as active_users,
    (SELECT AVG(response_time_ms) FROM indexer_health 
     WHERE checked_at > datetime('now', '-1 hour')) as avg_indexer_response;
```

**Automated Maintenance:**
```sql
-- Scheduled maintenance tasks
INSERT INTO scheduled_tasks (name, description, task_type, schedule_cron) VALUES
('vacuum_database', 'Optimize database storage', 'cleanup', '0 3 * * 0'),
('update_statistics', 'Update query optimizer statistics', 'analyze', '0 4 * * *'),
('cleanup_temp_files', 'Remove temporary download files', 'cleanup', '0 5 * * *');
```

### 2. Performance Tuning

**SQLite Configuration:**
```sql
PRAGMA journal_mode = WAL;        -- Enable concurrent reads
PRAGMA synchronous = NORMAL;      -- Balance safety vs performance  
PRAGMA cache_size = 10000;        -- Increase page cache
PRAGMA temp_store = MEMORY;       -- Use memory for temp tables
PRAGMA mmap_size = 268435456;     -- Enable memory mapping
```

**Query Optimization:**
- Regular ANALYZE runs for statistics updates
- Index usage monitoring and optimization
- Query plan analysis for performance bottlenecks
- Batch processing for bulk operations

This comprehensive database design provides a solid foundation for FolioFox while maintaining flexibility for future enhancements and optimizations.