# FolioFox Redis Caching Strategy

## Overview
This document outlines the Redis caching strategy to complement the SQLite database, focusing on performance optimization and reducing database load for frequently accessed data.

## Cache Architecture

### Cache Layers
1. **Application Cache** - In-memory caching within the application
2. **Redis Cache** - Distributed caching layer 
3. **SQLite Database** - Persistent storage

### Redis Data Structures Used

#### 1. String Cache (GET/SET)
```redis
# Book metadata cache
book:metadata:{book_id} -> JSON string
TTL: 1 hour

# Author information
author:info:{author_id} -> JSON string  
TTL: 6 hours

# Series information
series:info:{series_id} -> JSON string
TTL: 6 hours

# Publisher information  
publisher:info:{publisher_id} -> JSON string
TTL: 12 hours

# User preferences
user:preferences:{user_id} -> JSON string
TTL: 30 minutes

# Indexer configuration
indexer:config:{user_id}:{indexer_id} -> JSON string
TTL: 15 minutes
```

#### 2. Hash Cache (HGETALL/HSET)
```redis
# Book search results
search:results:{query_hash} -> Hash
Fields: query, filters, results, count, expires_at
TTL: 24 hours

# Download queue statistics  
stats:downloads:{user_id} -> Hash
Fields: pending, downloading, completed, failed, total_size
TTL: 5 minutes

# Indexer health status
health:indexers -> Hash  
Fields: {indexer_id} -> status_json
TTL: 15 minutes
```

#### 3. Sorted Sets (ZADD/ZRANGE)
```redis
# Download queue priority
queue:priority:{user_id} -> Sorted Set
Score: priority (lower = higher priority)
Members: download_queue_id
TTL: No expiration (updated in real-time)

# Popular books ranking
books:popular -> Sorted Set
Score: download_count + rating_factor
Members: book_id
TTL: 1 hour

# Recent searches
searches:recent:{user_id} -> Sorted Set
Score: timestamp
Members: search_query
TTL: 7 days
```

#### 4. Lists (LPUSH/RPOP)
```redis
# Download job queue
jobs:download -> List
Members: JSON job objects
TTL: No expiration (processed in real-time)

# Recent activities
activity:recent:{user_id} -> List  
Members: JSON activity objects
TTL: 24 hours (max 100 items)
```

#### 5. Sets (SADD/SMEMBERS)
```redis
# Active download sessions
sessions:active -> Set
Members: session_id
TTL: 1 hour

# User's favorite genres
user:genres:favorite:{user_id} -> Set
Members: genre_id
TTL: 24 hours

# Books in user's library
library:books:{user_id} -> Set
Members: book_id  
TTL: 30 minutes
```

## Caching Patterns

### 1. Cache-Aside (Lazy Loading)
Used for: Book metadata, author information, user preferences

```python
def get_book_details(book_id):
    # Try cache first
    cache_key = f"book:metadata:{book_id}"
    cached_data = redis.get(cache_key)
    
    if cached_data:
        return json.loads(cached_data)
    
    # Cache miss - fetch from database
    book_data = db.execute("""
        SELECT * FROM book_details_view WHERE id = ?
    """, (book_id,)).fetchone()
    
    if book_data:
        # Cache for 1 hour
        redis.setex(cache_key, 3600, json.dumps(book_data))
    
    return book_data
```

### 2. Write-Through
Used for: User preferences, download queue updates

```python
def update_user_preference(user_id, key, value):
    # Update database first
    db.execute("""
        INSERT OR REPLACE INTO user_preferences 
        (user_id, preference_key, preference_value) 
        VALUES (?, ?, ?)
    """, (user_id, key, value))
    
    # Update cache
    cache_key = f"user:preferences:{user_id}"
    cached_prefs = redis.get(cache_key)
    
    if cached_prefs:
        prefs = json.loads(cached_prefs)
        prefs[key] = value
        redis.setex(cache_key, 1800, json.dumps(prefs))
```

### 3. Write-Behind (Write-Back)
Used for: Statistics, activity logs, search history

```python
def record_download_stat(user_id, indexer_id, success):
    # Update cache immediately
    stats_key = f"stats:downloads:{user_id}"
    pipe = redis.pipeline()
    
    if success:
        pipe.hincrby(stats_key, "successful_downloads", 1)
    else:
        pipe.hincrby(stats_key, "failed_downloads", 1)
    
    pipe.hincrby(stats_key, "total_downloads", 1)
    pipe.expire(stats_key, 300)
    pipe.execute()
    
    # Queue for database update (processed async)
    db_update_queue.put({
        'type': 'download_stat',
        'user_id': user_id,
        'indexer_id': indexer_id,
        'success': success,
        'timestamp': datetime.utcnow()
    })
```

## Cache Invalidation Strategies

### 1. Time-Based (TTL)
- All cache entries have appropriate TTL values
- Critical data: 5-15 minutes
- Semi-static data: 1-6 hours  
- Static data: 12-24 hours

### 2. Event-Based Invalidation
```python
def on_book_updated(book_id):
    # Invalidate related caches
    keys_to_delete = [
        f"book:metadata:{book_id}",
        f"search:results:*",  # Wildcard deletion
    ]
    
    for key in keys_to_delete:
        if '*' in key:
            # Handle wildcard deletion
            for k in redis.scan_iter(match=key):
                redis.delete(k)
        else:
            redis.delete(key)
    
    # Update related sorted sets
    redis.zrem("books:popular", book_id)
```

### 3. Version-Based Invalidation
```python
def get_versioned_cache_key(base_key, version):
    return f"{base_key}:v{version}"

def increment_cache_version(entity_type, entity_id):
    version_key = f"version:{entity_type}:{entity_id}"
    return redis.incr(version_key)
```

## Memory Management

### 1. Memory Policies
```redis
# Redis configuration
maxmemory 512mb
maxmemory-policy allkeys-lru
```

### 2. Memory Monitoring
```python
def monitor_redis_memory():
    info = redis.info('memory')
    used_memory = info['used_memory']
    max_memory = info['maxmemory']
    
    if max_memory > 0:
        usage_percent = (used_memory / max_memory) * 100
        
        if usage_percent > 90:
            # Trigger aggressive cleanup
            cleanup_expired_keys()
            
        elif usage_percent > 80:
            # Reduce TTL for less critical data
            reduce_cache_ttl()
```

### 3. Cache Warming
```python
def warm_cache_on_startup():
    # Pre-load popular books
    popular_books = db.execute("""
        SELECT id FROM books 
        ORDER BY rating_count DESC, rating_average DESC 
        LIMIT 100
    """).fetchall()
    
    for book in popular_books:
        get_book_details(book['id'])  # This will cache the data
    
    # Pre-load active indexers
    active_indexers = db.execute("""
        SELECT * FROM indexers WHERE is_active = TRUE
    """).fetchall()
    
    for indexer in active_indexers:
        cache_key = f"indexer:config:{indexer['id']}"
        redis.setex(cache_key, 900, json.dumps(dict(indexer)))
```

## Performance Monitoring

### 1. Cache Hit Ratio Tracking
```python
def track_cache_performance(operation, cache_hit):
    pipe = redis.pipeline()
    
    # Daily metrics
    date_key = datetime.now().strftime('%Y-%m-%d')
    metrics_key = f"metrics:cache:{date_key}"
    
    pipe.hincrby(metrics_key, f"{operation}:total", 1)
    if cache_hit:
        pipe.hincrby(metrics_key, f"{operation}:hits", 1)
    
    pipe.expire(metrics_key, 86400 * 7)  # Keep for 7 days
    pipe.execute()
```

### 2. Performance Metrics
- Cache hit ratio per operation type
- Average response time with/without cache
- Memory usage trends
- Cache eviction rates
- Key expiration patterns

## Security Considerations

### 1. Data Sanitization
```python
def sanitize_cache_data(data):
    # Remove sensitive fields before caching
    sensitive_fields = ['password_hash', 'api_key', 'session_token']
    
    if isinstance(data, dict):
        return {k: v for k, v in data.items() if k not in sensitive_fields}
    
    return data
```

### 2. Access Control
```python
def get_user_cache_key(user_id, base_key):
    # Ensure users can only access their own cached data
    return f"user:{user_id}:{base_key}"
```

## Disaster Recovery

### 1. Cache Rebuild Strategy
```python
def rebuild_critical_cache():
    # Rebuild essential caches after Redis failure
    critical_caches = [
        'active_downloads',
        'indexer_health', 
        'user_sessions'
    ]
    
    for cache_type in critical_caches:
        rebuild_function = getattr(cache_rebuilders, f"rebuild_{cache_type}")
        rebuild_function()
```

### 2. Graceful Degradation
```python
def get_with_fallback(cache_key, fallback_function, *args, **kwargs):
    try:
        cached_data = redis.get(cache_key)
        if cached_data:
            return json.loads(cached_data)
    except (redis.RedisError, json.JSONDecodeError):
        # Log error but continue with fallback
        logger.warning(f"Cache miss/error for key: {cache_key}")
    
    # Fallback to database
    return fallback_function(*args, **kwargs)
```

## Configuration Examples

### Redis Configuration (redis.conf)
```ini
# Basic settings
port 6379
bind 127.0.0.1
protected-mode yes
requirepass your_redis_password

# Memory management
maxmemory 512mb
maxmemory-policy allkeys-lru

# Persistence (optional for cache-only usage)
save ""
appendonly no

# Performance tuning
tcp-keepalive 300
timeout 0
tcp-backlog 511
```

### Application Configuration
```python
REDIS_CONFIG = {
    'host': 'localhost',
    'port': 6379,
    'password': 'your_redis_password',
    'db': 0,
    'decode_responses': True,
    'socket_connect_timeout': 5,
    'socket_timeout': 5,
    'retry_on_timeout': True,
    'connection_pool_kwargs': {
        'max_connections': 50
    }
}

CACHE_SETTINGS = {
    'default_ttl': 3600,  # 1 hour
    'max_key_length': 250,
    'key_prefix': 'foliofox:',
    'enable_compression': True,
    'compression_threshold': 1024  # Compress values > 1KB
}
```

This caching strategy provides a robust, scalable solution that complements the SQLite database while ensuring optimal performance for FolioFox users.