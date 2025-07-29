# FolioFox Database Performance Tuning Guide

## Overview

This guide provides comprehensive performance optimization strategies for the FolioFox database system, covering SQLite configuration, query optimization, indexing strategies, and monitoring approaches.

## SQLite Configuration Optimization

### 1. Essential PRAGMA Settings

```sql
-- Enable WAL mode for better concurrency
PRAGMA journal_mode = WAL;

-- Balance between safety and performance
PRAGMA synchronous = NORMAL;

-- Increase page cache size (adjust based on available RAM)
PRAGMA cache_size = -64000;  -- 64MB cache

-- Use memory for temporary tables and indexes
PRAGMA temp_store = MEMORY;

-- Enable memory-mapped I/O (adjust based on database size)
PRAGMA mmap_size = 268435456;  -- 256MB

-- Optimize page size for workload (default 4096 is usually good)
PRAGMA page_size = 4096;

-- Enable query planner optimization
PRAGMA optimize;

-- Set busy timeout for concurrent access
PRAGMA busy_timeout = 30000;  -- 30 seconds
```

### 2. Connection Pool Configuration

```python
# SQLite connection pool settings
DATABASE_CONFIG = {
    'database': '/path/to/foliofox.db',
    'check_same_thread': False,
    'timeout': 30.0,
    'isolation_level': None,  # Autocommit mode
    'cached_statements': 100,
    'init_commands': [
        'PRAGMA journal_mode = WAL',
        'PRAGMA synchronous = NORMAL',
        'PRAGMA cache_size = -64000',
        'PRAGMA temp_store = MEMORY',
        'PRAGMA mmap_size = 268435456',
        'PRAGMA foreign_keys = ON',
        'PRAGMA busy_timeout = 30000'
    ]
}

# Connection pool for concurrent access
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

engine = create_engine(
    f"sqlite:///{DATABASE_CONFIG['database']}",
    poolclass=StaticPool,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args={
        'check_same_thread': False,
        'timeout': 30
    }
)
```

## Index Strategy and Optimization

### 1. Core Performance Indexes

```sql
-- High-frequency query indexes
CREATE INDEX IF NOT EXISTS idx_books_title_trigram ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_isbn_composite ON books(isbn_13, isbn_10);
CREATE INDEX IF NOT EXISTS idx_books_rating_date ON books(rating_average DESC, publication_date DESC);

-- Download queue optimization
CREATE INDEX IF NOT EXISTS idx_queue_priority_processing ON download_queue(status, priority, created_at) 
WHERE status IN ('pending', 'downloading');

-- User-specific queries
CREATE INDEX IF NOT EXISTS idx_queue_user_status ON download_queue(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_history_user_date ON download_history(user_id, completed_at DESC);

-- Search optimization
CREATE INDEX IF NOT EXISTS idx_search_hash_expiry ON search_cache(query_hash, expires_at);
CREATE INDEX IF NOT EXISTS idx_search_history_user_date ON search_history(user_id, searched_at DESC);

-- Relationship table indexes
CREATE INDEX IF NOT EXISTS idx_book_authors_book ON book_authors(book_id);
CREATE INDEX IF NOT EXISTS idx_book_authors_author ON book_authors(author_id);
CREATE INDEX IF NOT EXISTS idx_book_genres_book ON book_genres(book_id);
CREATE INDEX IF NOT EXISTS idx_book_files_book_format ON book_files(book_id, format_id);

-- System monitoring indexes
CREATE INDEX IF NOT EXISTS idx_logs_level_time ON system_logs(level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_component_time ON system_logs(component, created_at DESC);
```

### 2. Partial Indexes for Efficiency

```sql
-- Only index active records
CREATE INDEX IF NOT EXISTS idx_users_active ON users(username) 
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_indexers_active ON indexers(priority DESC, name) 
WHERE is_active = TRUE;

-- Index only recent data for time-sensitive queries
CREATE INDEX IF NOT EXISTS idx_logs_recent ON system_logs(level, component, created_at) 
WHERE created_at >= datetime('now', '-7 days');

CREATE INDEX IF NOT EXISTS idx_health_recent ON indexer_health(indexer_id, status, checked_at) 
WHERE checked_at >= datetime('now', '-1 day');
```

### 3. Covering Indexes

```sql
-- Covering index for book search results
CREATE INDEX IF NOT EXISTS idx_books_search_covering ON books(
    rating_average DESC, 
    publication_date DESC, 
    title, 
    id
) WHERE rating_average >= 3.0;

-- Covering index for download queue processing
CREATE INDEX IF NOT EXISTS idx_queue_processing_covering ON download_queue(
    status, 
    priority, 
    created_at, 
    id, 
    user_id, 
    indexer_id
) WHERE status = 'pending';
```

## Query Optimization Techniques

### 1. Efficient JOIN Patterns

```sql
-- Use EXISTS instead of IN for better performance
SELECT b.* FROM books b
WHERE EXISTS (
    SELECT 1 FROM book_authors ba 
    JOIN authors a ON ba.author_id = a.id 
    WHERE ba.book_id = b.id AND a.name LIKE '%Tolkien%'
);

-- Use JOIN instead of subqueries when possible
SELECT b.title, a.name as author
FROM books b
JOIN book_authors ba ON b.id = ba.book_id
JOIN authors a ON ba.author_id = a.id
WHERE a.name LIKE '%Tolkien%';

-- Avoid N+1 queries with proper JOINs
SELECT 
    b.id,
    b.title,
    GROUP_CONCAT(a.name, ', ') as authors,
    GROUP_CONCAT(g.name, ', ') as genres
FROM books b
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN book_genres bg ON b.id = bg.book_id
LEFT JOIN genres g ON bg.genre_id = g.id
WHERE b.id IN (1, 2, 3, 4, 5)
GROUP BY b.id;
```

### 2. Limit and Pagination Optimization

```sql
-- Use LIMIT with ORDER BY index
SELECT * FROM books 
ORDER BY rating_average DESC, id DESC 
LIMIT 20 OFFSET ?;

-- For large offsets, use cursor-based pagination
SELECT * FROM books 
WHERE (rating_average, id) < (?, ?)
ORDER BY rating_average DESC, id DESC 
LIMIT 20;

-- Use window functions for ranked results
SELECT 
    *,
    ROW_NUMBER() OVER (ORDER BY rating_average DESC) as rank
FROM books
WHERE rank BETWEEN ? AND ?;
```

### 3. Aggregate Query Optimization

```sql
-- Use covering indexes for COUNT queries
SELECT COUNT(*) FROM download_queue 
WHERE status = 'pending' AND user_id = ?;

-- Optimize GROUP BY with proper indexing
SELECT 
    DATE(completed_at) as date,
    COUNT(*) as downloads,
    SUM(file_size_bytes) as total_size
FROM download_history
WHERE user_id = ? AND completed_at >= date('now', '-30 days')
GROUP BY DATE(completed_at)
ORDER BY date DESC;

-- Use HAVING efficiently
SELECT author_id, COUNT(*) as book_count
FROM book_authors
GROUP BY author_id
HAVING book_count > 10
ORDER BY book_count DESC;
```

## Full-Text Search Optimization

### 1. FTS5 Configuration

```sql
-- Create optimized FTS5 index
CREATE VIRTUAL TABLE books_fts USING fts5(
    title='title',
    content='subtitle',  
    content='description',
    author_names,
    series_name,
    genre_names,
    tags,
    content='books',
    content_rowid='id',
    prefix='2,3',        -- Enable prefix matching
    tokenize='porter'    -- Use Porter stemmer
);

-- Optimize FTS5 index
INSERT INTO books_fts(books_fts) VALUES('optimize');

-- Rebuild FTS5 index if needed
INSERT INTO books_fts(books_fts) VALUES('rebuild');
```

### 2. Search Query Optimization

```sql
-- Use FTS5 ranking with BM25
SELECT 
    b.*,
    bm25(books_fts) as relevance_score
FROM books_fts 
JOIN books b ON books_fts.rowid = b.id
WHERE books_fts MATCH 'science fiction'
ORDER BY bm25(books_fts), b.rating_average DESC
LIMIT 50;

-- Use phrase queries for exact matches
SELECT * FROM books_fts WHERE books_fts MATCH '"lord of the rings"';

-- Use prefix matching for autocomplete
SELECT DISTINCT title FROM books_fts 
WHERE books_fts MATCH 'harr*' 
LIMIT 10;
```

## Caching Strategy Implementation

### 1. Application-Level Caching

```python
import redis
import json
from functools import wraps
import hashlib

redis_client = redis.Redis(host='localhost', port=6379, db=0)

def cache_result(ttl=3600, key_prefix=''):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{func.__name__}:"
            cache_key += hashlib.md5(str(args + tuple(kwargs.items())).encode()).hexdigest()
            
            # Try cache first
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            redis_client.setex(cache_key, ttl, json.dumps(result, default=str))
            return result
        return wrapper
    return decorator

# Usage example
@cache_result(ttl=1800, key_prefix='book_search')
def search_books(query, filters=None):
    # Database query logic here
    pass
```

### 2. Query Result Caching

```python
class QueryCache:
    def __init__(self, redis_client, default_ttl=3600):
        self.redis = redis_client
        self.default_ttl = default_ttl
    
    def get_or_set(self, key, query_func, ttl=None):
        ttl = ttl or self.default_ttl
        
        # Check cache
        cached_result = self.redis.get(key)
        if cached_result:
            return json.loads(cached_result)
        
        # Execute query and cache
        result = query_func()
        self.redis.setex(key, ttl, json.dumps(result, default=str))
        return result
    
    def invalidate_pattern(self, pattern):
        keys = self.redis.keys(pattern)
        if keys:
            self.redis.delete(*keys)

# Usage
cache = QueryCache(redis_client)

def get_popular_books(limit=20):
    return cache.get_or_set(
        f'popular_books:{limit}',
        lambda: execute_popular_books_query(limit),
        ttl=1800
    )
```

## Database Maintenance and Monitoring

### 1. Automated Maintenance

```sql
-- Daily maintenance routine
CREATE TRIGGER IF NOT EXISTS daily_maintenance
AFTER INSERT ON scheduled_tasks
WHEN NEW.name = 'daily_maintenance' AND NEW.last_run < date('now')
BEGIN
    -- Update statistics
    ANALYZE;
    
    -- Clean expired cache
    DELETE FROM search_cache WHERE expires_at < datetime('now');
    
    -- Archive old logs
    DELETE FROM system_logs 
    WHERE created_at < datetime('now', '-30 days') 
        AND level NOT IN ('ERROR', 'CRITICAL');
    
    -- Update task completion
    UPDATE scheduled_tasks 
    SET last_run = datetime('now'), last_run_status = 'success' 
    WHERE id = NEW.id;
END;

-- Weekly optimization
CREATE TRIGGER IF NOT EXISTS weekly_optimization
AFTER INSERT ON scheduled_tasks
WHEN NEW.name = 'weekly_optimization' AND NEW.last_run < date('now', '-7 days')
BEGIN
    -- Optimize database
    PRAGMA optimize;
    
    -- Rebuild FTS index if needed
    INSERT INTO books_fts(books_fts) VALUES('optimize');
    
    -- Vacuum if needed (check free pages first)
    UPDATE scheduled_tasks 
    SET last_run = datetime('now'), last_run_status = 'success' 
    WHERE id = NEW.id;
END;
```

### 2. Performance Monitoring

```python
import time
import logging
from contextlib import contextmanager

logger = logging.getLogger(__name__)

@contextmanager
def query_timer(query_name, slow_threshold=1.0):
    start_time = time.time()
    try:
        yield
    finally:
        duration = time.time() - start_time
        if duration > slow_threshold:
            logger.warning(f"Slow query detected: {query_name} took {duration:.2f}s")
        
        # Log to system_logs table
        log_query_performance(query_name, duration)

def log_query_performance(query_name, duration_seconds):
    with get_db_connection() as conn:
        conn.execute("""
            INSERT INTO system_logs (level, component, message, details)
            VALUES (?, ?, ?, ?)
        """, (
            'WARNING' if duration_seconds > 1.0 else 'INFO',
            'database',
            f'Query performance: {query_name}',
            json.dumps({
                'query_name': query_name,
                'duration_ms': duration_seconds * 1000,
                'timestamp': datetime.utcnow().isoformat()
            })
        ))

# Usage
def search_books_with_monitoring(query):
    with query_timer('book_search'):
        return execute_book_search(query)
```

### 3. Index Usage Analysis

```sql
-- Analyze index usage (run periodically)
SELECT 
    name as index_name,
    tbl as table_name
FROM sqlite_master 
WHERE type = 'index' AND name NOT LIKE 'sqlite_%';

-- Check for unused indexes
EXPLAIN QUERY PLAN 
SELECT * FROM books WHERE title LIKE '%test%';

-- Identify missing indexes from slow queries
SELECT 
    component,
    COUNT(*) as slow_query_count,
    AVG(CAST(json_extract(details, '$.duration_ms') AS REAL)) as avg_duration
FROM system_logs 
WHERE message LIKE '%slow query%'
    AND created_at >= datetime('now', '-7 days')
GROUP BY component
ORDER BY avg_duration DESC;
```

## Memory Management

### 1. Cache Size Tuning

```python
def optimize_cache_size():
    # Get available system memory
    import psutil
    available_memory = psutil.virtual_memory().available
    
    # Use 25% of available memory for SQLite cache
    cache_size_bytes = int(available_memory * 0.25)
    cache_size_pages = -(cache_size_bytes // 4096)  # Negative for bytes
    
    with get_db_connection() as conn:
        conn.execute(f'PRAGMA cache_size = {cache_size_pages}')
        
        # Verify setting
        result = conn.execute('PRAGMA cache_size').fetchone()
        print(f"Cache size set to: {result[0]} pages")
```

### 2. Connection Management

```python
class DatabasePool:
    def __init__(self, database_path, max_connections=10):
        self.database_path = database_path
        self.max_connections = max_connections
        self.pool = []
        self.active_connections = 0
    
    def get_connection(self):
        if self.pool:
            return self.pool.pop()
        
        if self.active_connections < self.max_connections:
            conn = sqlite3.connect(
                self.database_path,
                check_same_thread=False,
                timeout=30.0
            )
            self._configure_connection(conn)
            self.active_connections += 1
            return conn
        
        raise Exception("Connection pool exhausted")
    
    def return_connection(self, conn):
        if conn:
            self.pool.append(conn)
    
    def _configure_connection(self, conn):
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA journal_mode = WAL')
        conn.execute('PRAGMA synchronous = NORMAL')
        conn.execute('PRAGMA cache_size = -64000')
        conn.execute('PRAGMA temp_store = MEMORY')
        conn.execute('PRAGMA foreign_keys = ON')
```

## Performance Testing and Benchmarking

### 1. Query Performance Testing

```python
import time
import statistics

def benchmark_query(query, params=None, iterations=100):
    times = []
    
    for _ in range(iterations):
        start = time.time()
        with get_db_connection() as conn:
            cursor = conn.execute(query, params or ())
            results = cursor.fetchall()
        end = time.time()
        times.append(end - start)
    
    return {
        'min_time': min(times),
        'max_time': max(times),
        'avg_time': statistics.mean(times),
        'median_time': statistics.median(times),
        'std_dev': statistics.stdev(times),
        'iterations': iterations
    }

# Benchmark critical queries
book_search_perf = benchmark_query(
    "SELECT * FROM book_details_view WHERE title LIKE ? LIMIT 20",
    ('%science%',)
)

print(f"Book search avg time: {book_search_perf['avg_time']:.3f}s")
```

### 2. Load Testing

```python
import concurrent.futures
import threading

def load_test_concurrent_reads(num_threads=10, queries_per_thread=100):
    def worker():
        results = []
        for _ in range(queries_per_thread):
            start = time.time()
            with get_db_connection() as conn:
                cursor = conn.execute("SELECT COUNT(*) FROM books")
                result = cursor.fetchone()
            end = time.time()
            results.append(end - start)
        return results
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(worker) for _ in range(num_threads)]
        all_times = []
        
        for future in concurrent.futures.as_completed(futures):
            all_times.extend(future.result())
    
    return {
        'total_queries': len(all_times),
        'avg_time': statistics.mean(all_times),
        'max_time': max(all_times),
        'queries_per_second': len(all_times) / sum(all_times)
    }
```

## Troubleshooting Common Performance Issues

### 1. Slow Queries

```sql
-- Enable query logging (temporarily)
PRAGMA query_only = ON;

-- Check for table scans
EXPLAIN QUERY PLAN SELECT * FROM books WHERE description LIKE '%keyword%';

-- Solutions:
-- 1. Add appropriate indexes
-- 2. Use FTS for text search
-- 3. Limit result sets
-- 4. Use covering indexes
```

### 2. Lock Contention

```python
# Detect lock issues
def detect_lock_contention():
    with get_db_connection() as conn:
        # Check for busy timeouts in logs
        cursor = conn.execute("""
            SELECT COUNT(*) as lock_errors
            FROM system_logs 
            WHERE message LIKE '%database is locked%'
                AND created_at >= datetime('now', '-1 hour')
        """)
        
        lock_errors = cursor.fetchone()[0]
        if lock_errors > 10:
            print(f"Warning: {lock_errors} lock errors in the last hour")
            return True
    return False

# Solutions:
# 1. Use WAL mode
# 2. Reduce transaction time
# 3. Implement retry logic
# 4. Use connection pooling
```

### 3. Database Growth Issues

```sql
-- Monitor database size
SELECT page_count * page_size / 1024 / 1024 as size_mb
FROM pragma_page_count(), pragma_page_size();

-- Check for fragmentation
SELECT freelist_count FROM pragma_freelist_count();

-- Solutions:
-- 1. Regular VACUUM operations
-- 2. Archive old data
-- 3. Implement data retention policies
-- 4. Use incremental vacuum
```

This performance tuning guide provides a comprehensive approach to optimizing FolioFox database performance across all aspects of the system.