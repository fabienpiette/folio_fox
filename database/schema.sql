-- FolioFox Database Schema
-- SQLite Database Design for eBook Management and Download Automation
-- Version: 1.0
-- Last Updated: 2025-07-28

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- =========================================================================
-- SYSTEM CONFIGURATION TABLES
-- =========================================================================

-- Application settings and configuration
CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    data_type TEXT DEFAULT 'string' CHECK (data_type IN ('string', 'integer', 'boolean', 'json')),
    is_encrypted BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for fast settings lookup
CREATE INDEX idx_app_settings_key ON app_settings(key);
CREATE INDEX idx_app_settings_category ON app_settings(category);

-- =========================================================================
-- USER MANAGEMENT TABLES
-- =========================================================================

-- User profiles and preferences
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User preferences and settings
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    preference_key TEXT NOT NULL,
    preference_value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, preference_key)
);

-- Download folders configuration per user
CREATE TABLE download_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    auto_organize BOOLEAN DEFAULT TRUE,
    folder_pattern TEXT DEFAULT '{author}/{series}/{title}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Quality profiles for download preferences
CREATE TABLE quality_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    preferred_formats TEXT NOT NULL, -- JSON array: ["epub", "pdf", "mobi"]
    min_quality_score INTEGER DEFAULT 0,
    max_file_size_mb INTEGER,
    language_preferences TEXT, -- JSON array: ["en", "es", "fr"]
    is_default BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for user tables
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX idx_download_folders_user_id ON download_folders(user_id);
CREATE INDEX idx_quality_profiles_user_id ON quality_profiles(user_id);

-- =========================================================================
-- BOOK METADATA TABLES
-- =========================================================================

-- Authors table
CREATE TABLE authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_name TEXT, -- For sorting: "Tolkien, J.R.R."
    biography TEXT,
    birth_date DATE,
    death_date DATE,
    website TEXT,
    goodreads_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Publishers table
CREATE TABLE publishers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    website TEXT,
    country TEXT,
    founded_year INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Book series table
CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    total_books INTEGER,
    is_completed BOOLEAN DEFAULT FALSE,
    goodreads_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Genres/Categories table
CREATE TABLE genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    parent_id INTEGER,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES genres(id)
);

-- Languages table
CREATE TABLE languages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE, -- ISO 639-1 codes (en, es, fr, etc.)
    name TEXT NOT NULL,
    native_name TEXT
);

-- Book formats table
CREATE TABLE book_formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, -- epub, pdf, mobi, azw3, etc.
    description TEXT,
    mime_type TEXT,
    is_supported BOOLEAN DEFAULT TRUE
);

-- Main books table
CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    isbn_10 TEXT,
    isbn_13 TEXT,
    asin TEXT, -- Amazon ASIN
    goodreads_id TEXT,
    google_books_id TEXT,
    publication_date DATE,
    page_count INTEGER,
    language_id INTEGER,
    publisher_id INTEGER,
    series_id INTEGER,
    series_position DECIMAL(5,2), -- Allows for 1.5, 2.1, etc.
    rating_average DECIMAL(3,2), -- 0.00 to 5.00
    rating_count INTEGER DEFAULT 0,
    tags TEXT, -- JSON array for flexible tagging
    cover_url TEXT,
    cover_local_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (language_id) REFERENCES languages(id),
    FOREIGN KEY (publisher_id) REFERENCES publishers(id),
    FOREIGN KEY (series_id) REFERENCES series(id)
);

-- Book-Author relationship (many-to-many)
CREATE TABLE book_authors (
    book_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    role TEXT DEFAULT 'author', -- author, editor, translator, illustrator
    PRIMARY KEY (book_id, author_id, role),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
);

-- Book-Genre relationship (many-to-many)
CREATE TABLE book_genres (
    book_id INTEGER NOT NULL,
    genre_id INTEGER NOT NULL,
    PRIMARY KEY (book_id, genre_id),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

-- Book files/formats available
CREATE TABLE book_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    format_id INTEGER NOT NULL,
    file_path TEXT,
    file_size_bytes INTEGER,
    quality_score INTEGER DEFAULT 0, -- 0-100 quality rating
    source_url TEXT,
    download_date DATETIME,
    checksum TEXT, -- For file integrity
    is_primary BOOLEAN DEFAULT FALSE, -- Primary format for this book
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (format_id) REFERENCES book_formats(id)
);

-- Create indexes for book tables
CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_isbn_10 ON books(isbn_10);
CREATE INDEX idx_books_isbn_13 ON books(isbn_13);
CREATE INDEX idx_books_asin ON books(asin);
CREATE INDEX idx_books_goodreads_id ON books(goodreads_id);
CREATE INDEX idx_books_publication_date ON books(publication_date);
CREATE INDEX idx_books_rating_average ON books(rating_average);
CREATE INDEX idx_books_series_id ON books(series_id);
CREATE INDEX idx_books_language_id ON books(language_id);
CREATE INDEX idx_books_publisher_id ON books(publisher_id);

CREATE INDEX idx_authors_name ON authors(name);
CREATE INDEX idx_authors_sort_name ON authors(sort_name);
CREATE INDEX idx_publishers_name ON publishers(name);
CREATE INDEX idx_series_name ON series(name);
CREATE INDEX idx_genres_name ON genres(name);
CREATE INDEX idx_genres_parent_id ON genres(parent_id);

CREATE INDEX idx_book_authors_book_id ON book_authors(book_id);
CREATE INDEX idx_book_authors_author_id ON book_authors(author_id);
CREATE INDEX idx_book_genres_book_id ON book_genres(book_id);
CREATE INDEX idx_book_genres_genre_id ON book_genres(genre_id);
CREATE INDEX idx_book_files_book_id ON book_files(book_id);
CREATE INDEX idx_book_files_format_id ON book_files(format_id);

-- =========================================================================
-- INDEXER CONFIGURATION TABLES
-- =========================================================================

-- Indexer providers (Libgen, Z-Library, etc.)
CREATE TABLE indexers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    api_endpoint TEXT,
    indexer_type TEXT NOT NULL CHECK (indexer_type IN ('public', 'private', 'semi-private')),
    supports_search BOOLEAN DEFAULT TRUE,
    supports_download BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 1, -- Higher number = higher priority
    rate_limit_requests INTEGER DEFAULT 60, -- Requests per minute
    rate_limit_window INTEGER DEFAULT 60, -- Window in seconds
    timeout_seconds INTEGER DEFAULT 30,
    user_agent TEXT,
    description TEXT,
    website TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexer configuration per user
CREATE TABLE user_indexer_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    indexer_id INTEGER NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    api_key TEXT,
    username TEXT,
    password_hash TEXT,
    custom_settings TEXT, -- JSON for indexer-specific settings
    last_test_date DATETIME,
    last_test_success BOOLEAN,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (indexer_id) REFERENCES indexers(id) ON DELETE CASCADE,
    UNIQUE(user_id, indexer_id)
);

-- Indexer health monitoring
CREATE TABLE indexer_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indexer_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down', 'maintenance')),
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (indexer_id) REFERENCES indexers(id) ON DELETE CASCADE
);

-- Search preferences per indexer
CREATE TABLE indexer_search_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    indexer_id INTEGER NOT NULL,
    search_categories TEXT, -- JSON array of enabled categories
    quality_filters TEXT, -- JSON object with quality preferences
    language_filters TEXT, -- JSON array of preferred languages
    format_filters TEXT, -- JSON array of preferred formats
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (indexer_id) REFERENCES indexers(id) ON DELETE CASCADE,
    UNIQUE(user_id, indexer_id)
);

-- Create indexes for indexer tables
CREATE INDEX idx_indexers_name ON indexers(name);
CREATE INDEX idx_indexers_is_active ON indexers(is_active);
CREATE INDEX idx_indexers_priority ON indexers(priority);
CREATE INDEX idx_user_indexer_config_user_id ON user_indexer_config(user_id);
CREATE INDEX idx_user_indexer_config_indexer_id ON user_indexer_config(indexer_id);
CREATE INDEX idx_indexer_health_indexer_id ON indexer_health(indexer_id);
CREATE INDEX idx_indexer_health_checked_at ON indexer_health(checked_at);

-- =========================================================================
-- DOWNLOAD QUEUE TABLES
-- =========================================================================

-- Download queue items
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
    priority INTEGER DEFAULT 5, -- 1 (highest) to 10 (lowest)
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'downloading', 'completed', 'failed', 'cancelled', 'paused')),
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
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
    FOREIGN KEY (indexer_id) REFERENCES indexers(id),
    FOREIGN KEY (quality_profile_id) REFERENCES quality_profiles(id)
);

-- Download history for completed/failed downloads
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
    final_status TEXT NOT NULL CHECK (final_status IN ('completed', 'failed', 'cancelled')),
    error_message TEXT,
    download_path TEXT,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (queue_id) REFERENCES download_queue(id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
    FOREIGN KEY (indexer_id) REFERENCES indexers(id)
);

-- Download statistics and metrics
CREATE TABLE download_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    indexer_id INTEGER,
    date_recorded DATE NOT NULL,
    total_downloads INTEGER DEFAULT 0,
    successful_downloads INTEGER DEFAULT 0,
    failed_downloads INTEGER DEFAULT 0,
    total_bytes_downloaded INTEGER DEFAULT 0,
    average_download_speed_kbps INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, indexer_id, date_recorded),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (indexer_id) REFERENCES indexers(id) ON DELETE CASCADE
) WITHOUT ROWID;

-- Create indexes for download queue tables
CREATE INDEX idx_download_queue_user_id ON download_queue(user_id);
CREATE INDEX idx_download_queue_status ON download_queue(status);
CREATE INDEX idx_download_queue_priority ON download_queue(priority);
CREATE INDEX idx_download_queue_created_at ON download_queue(created_at);
CREATE INDEX idx_download_queue_book_id ON download_queue(book_id);
CREATE INDEX idx_download_queue_indexer_id ON download_queue(indexer_id);

CREATE INDEX idx_download_history_user_id ON download_history(user_id);
CREATE INDEX idx_download_history_completed_at ON download_history(completed_at);
CREATE INDEX idx_download_history_final_status ON download_history(final_status);
CREATE INDEX idx_download_history_book_id ON download_history(book_id);

-- =========================================================================
-- SEARCH AND INDEXING TABLES
-- =========================================================================

-- Search history for users
CREATE TABLE search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    query TEXT NOT NULL,
    filters TEXT, -- JSON object with applied filters
    results_count INTEGER DEFAULT 0,
    indexers_searched TEXT, -- JSON array of indexer IDs used
    search_duration_ms INTEGER,
    searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Search results cache
CREATE TABLE search_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_hash TEXT NOT NULL UNIQUE, -- MD5/SHA256 of query + filters
    query TEXT NOT NULL,
    filters TEXT, -- JSON object
    indexer_id INTEGER NOT NULL,
    results TEXT NOT NULL, -- JSON array of search results
    results_count INTEGER DEFAULT 0,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (indexer_id) REFERENCES indexers(id) ON DELETE CASCADE
);

-- Full-text search index for books (SQLite FTS5)
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

-- Triggers to maintain FTS index
CREATE TRIGGER books_ai AFTER INSERT ON books BEGIN
    INSERT INTO books_fts(rowid, title, subtitle, description, author_names, series_name, genre_names, tags)
    VALUES (new.id, new.title, new.subtitle, new.description, '', '', '', new.tags);
END;

CREATE TRIGGER books_ad AFTER DELETE ON books BEGIN
    INSERT INTO books_fts(books_fts, rowid, title, subtitle, description, author_names, series_name, genre_names, tags)
    VALUES ('delete', old.id, old.title, old.subtitle, old.description, '', '', '', old.tags);
END;

CREATE TRIGGER books_au AFTER UPDATE ON books BEGIN
    INSERT INTO books_fts(books_fts, rowid, title, subtitle, description, author_names, series_name, genre_names, tags)
    VALUES ('delete', old.id, old.title, old.subtitle, old.description, '', '', '', old.tags);
    INSERT INTO books_fts(rowid, title, subtitle, description, author_names, series_name, genre_names, tags)
    VALUES (new.id, new.title, new.subtitle, new.description, '', '', '', new.tags);
END;

-- Create indexes for search tables
CREATE INDEX idx_search_history_user_id ON search_history(user_id);
CREATE INDEX idx_search_history_searched_at ON search_history(searched_at);
CREATE INDEX idx_search_cache_query_hash ON search_cache(query_hash);
CREATE INDEX idx_search_cache_expires_at ON search_cache(expires_at);
CREATE INDEX idx_search_cache_indexer_id ON search_cache(indexer_id);

-- =========================================================================
-- SYSTEM TABLES
-- =========================================================================

-- Application logs
CREATE TABLE system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    component TEXT NOT NULL, -- 'downloader', 'indexer', 'api', 'scheduler', etc.
    message TEXT NOT NULL,
    details TEXT, -- JSON object with additional context
    user_id INTEGER,
    session_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Scheduled tasks and jobs
CREATE TABLE scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    task_type TEXT NOT NULL, -- 'cleanup', 'health_check', 'statistics', 'backup'
    schedule_cron TEXT NOT NULL, -- Cron expression
    is_enabled BOOLEAN DEFAULT TRUE,
    last_run DATETIME,
    last_run_status TEXT CHECK (last_run_status IN ('success', 'failed', 'running')),
    last_run_duration_seconds INTEGER,
    last_error_message TEXT,
    next_run DATETIME,
    run_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Application statistics
CREATE TABLE app_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_type TEXT DEFAULT 'counter' CHECK (metric_type IN ('counter', 'gauge', 'histogram')),
    tags TEXT, -- JSON object for metric dimensions
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Database maintenance tasks
CREATE TABLE maintenance_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_name TEXT NOT NULL,
    task_type TEXT NOT NULL CHECK (task_type IN ('vacuum', 'reindex', 'analyze', 'cleanup')),
    table_name TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    started_at DATETIME,
    completed_at DATETIME,
    duration_seconds INTEGER,
    rows_affected INTEGER,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Backup tracking
CREATE TABLE backup_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental', 'schema')),
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER,
    compression_type TEXT, -- 'gzip', 'zip', 'none'
    checksum TEXT,
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'in_progress')),
    duration_seconds INTEGER,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for system tables
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_component ON system_logs(component);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX idx_system_logs_user_id ON system_logs(user_id);

CREATE INDEX idx_scheduled_tasks_is_enabled ON scheduled_tasks(is_enabled);
CREATE INDEX idx_scheduled_tasks_next_run ON scheduled_tasks(next_run);
CREATE INDEX idx_scheduled_tasks_last_run ON scheduled_tasks(last_run);

CREATE INDEX idx_app_statistics_metric_name ON app_statistics(metric_name);
CREATE INDEX idx_app_statistics_recorded_at ON app_statistics(recorded_at);

CREATE INDEX idx_maintenance_tasks_status ON maintenance_tasks(status);
CREATE INDEX idx_maintenance_tasks_created_at ON maintenance_tasks(created_at);

CREATE INDEX idx_backup_history_backup_type ON backup_history(backup_type);
CREATE INDEX idx_backup_history_created_at ON backup_history(created_at);

-- =========================================================================
-- VIEWS FOR COMMON QUERIES
-- =========================================================================

-- View for book details with related information
CREATE VIEW book_details_view AS
SELECT 
    b.id,
    b.title,
    b.subtitle,
    b.description,
    b.isbn_10,
    b.isbn_13,
    b.asin,
    b.publication_date,
    b.page_count,
    b.rating_average,
    b.rating_count,
    b.cover_url,
    b.cover_local_path,
    l.name as language,
    l.code as language_code,
    p.name as publisher,
    s.name as series_name,
    b.series_position,
    GROUP_CONCAT(DISTINCT a.name, '; ') as authors,
    GROUP_CONCAT(DISTINCT g.name, '; ') as genres,
    COUNT(bf.id) as available_formats,
    b.created_at,
    b.updated_at
FROM books b
LEFT JOIN languages l ON b.language_id = l.id
LEFT JOIN publishers p ON b.publisher_id = p.id
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN book_genres bg ON b.id = bg.book_id
LEFT JOIN genres g ON bg.genre_id = g.id
LEFT JOIN book_files bf ON b.id = bf.book_id
GROUP BY b.id;

-- View for download queue with related information
CREATE VIEW download_queue_view AS
SELECT 
    dq.id,
    dq.title,
    dq.author_name,
    dq.file_format,
    dq.file_size_bytes,
    dq.priority,
    dq.status,
    dq.progress_percentage,
    dq.retry_count,
    dq.max_retries,
    dq.error_message,
    dq.created_at,
    dq.started_at,
    dq.estimated_completion,
    u.username,
    i.name as indexer_name,
    qp.name as quality_profile_name
FROM download_queue dq
JOIN users u ON dq.user_id = u.id
JOIN indexers i ON dq.indexer_id = i.id
LEFT JOIN quality_profiles qp ON dq.quality_profile_id = qp.id;

-- View for indexer health summary
CREATE VIEW indexer_health_summary AS
SELECT 
    i.id,
    i.name,
    i.is_active,
    i.priority,
    ih.status,
    ih.response_time_ms,
    ih.error_message,
    ih.checked_at,
    COUNT(uic.user_id) as active_users
FROM indexers i
LEFT JOIN indexer_health ih ON i.id = ih.indexer_id 
    AND ih.id = (SELECT MAX(id) FROM indexer_health WHERE indexer_id = i.id)
LEFT JOIN user_indexer_config uic ON i.id = uic.indexer_id AND uic.is_enabled = TRUE
GROUP BY i.id;

-- =========================================================================
-- INITIAL DATA SEEDING
-- =========================================================================

-- Insert default book formats
INSERT INTO book_formats (name, description, mime_type, is_supported) VALUES
('EPUB', 'Electronic Publication', 'application/epub+zip', TRUE),
('PDF', 'Portable Document Format', 'application/pdf', TRUE),
('MOBI', 'Mobipocket eBook', 'application/x-mobipocket-ebook', TRUE),
('AZW3', 'Amazon Kindle Format', 'application/vnd.amazon.ebook', TRUE),
('TXT', 'Plain Text', 'text/plain', TRUE),
('DJVU', 'DjVu Document', 'image/vnd.djvu', TRUE),
('FB2', 'FictionBook', 'application/x-fictionbook+xml', TRUE),
('RTF', 'Rich Text Format', 'application/rtf', TRUE),
('DOC', 'Microsoft Word Document', 'application/msword', FALSE),
('DOCX', 'Microsoft Word Open XML', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', FALSE);

-- Insert common languages
INSERT INTO languages (code, name, native_name) VALUES
('en', 'English', 'English'),
('es', 'Spanish', 'Español'),
('fr', 'French', 'Français'),
('de', 'German', 'Deutsch'),
('it', 'Italian', 'Italiano'),
('pt', 'Portuguese', 'Português'),
('ru', 'Russian', 'Русский'),
('zh', 'Chinese', '中文'),
('ja', 'Japanese', '日本語'),
('ko', 'Korean', '한국어'),
('ar', 'Arabic', 'العربية'),
('hi', 'Hindi', 'हिन्दी');

-- Insert common genres
INSERT INTO genres (name, description) VALUES
('Fiction', 'Literary works of imagination'),
('Non-Fiction', 'Factual and informational works'),
('Science Fiction', 'Speculative fiction with futuristic concepts'),
('Fantasy', 'Fiction involving magical or supernatural elements'),
('Mystery', 'Fiction dealing with puzzling crimes or events'),
('Thriller', 'Fiction designed to hold interest through suspense'),
('Romance', 'Fiction focusing on romantic relationships'),
('Horror', 'Fiction intended to frighten or create suspense'),
('Biography', 'Account of someone\'s life written by someone else'),
('History', 'Study of past events'),
('Science', 'Systematic study of the natural world'),
('Technology', 'Application of scientific knowledge'),
('Philosophy', 'Study of fundamental questions about existence'),
('Religion', 'Spiritual beliefs and practices'),
('Self-Help', 'Books aimed at self-improvement'),
('Business', 'Commercial and economic topics'),
('Health', 'Physical and mental well-being'),
('Travel', 'Guides and accounts of journeys'),
('Cooking', 'Food preparation and recipes'),
('Art', 'Visual and creative arts');

-- Insert default application settings
INSERT INTO app_settings (key, value, description, category, data_type) VALUES
('app_version', '1.0.0', 'Current application version', 'system', 'string'),
('max_concurrent_downloads', '3', 'Maximum number of simultaneous downloads', 'downloads', 'integer'),
('download_timeout_seconds', '300', 'Timeout for download operations', 'downloads', 'integer'),
('search_cache_ttl_hours', '24', 'Time to live for search cache entries', 'search', 'integer'),
('max_search_results', '100', 'Maximum number of search results to return', 'search', 'integer'),
('log_retention_days', '30', 'Number of days to retain log entries', 'system', 'integer'),
('backup_retention_days', '90', 'Number of days to retain backup files', 'system', 'integer'),
('health_check_interval_minutes', '15', 'Interval between indexer health checks', 'monitoring', 'integer'),
('enable_telemetry', 'false', 'Enable anonymous usage statistics', 'privacy', 'boolean'),
('theme', 'dark', 'Application theme preference', 'ui', 'string');

-- Insert default scheduled tasks
INSERT INTO scheduled_tasks (name, description, task_type, schedule_cron, is_enabled) VALUES
('cleanup_logs', 'Remove old log entries', 'cleanup', '0 2 * * *', TRUE),
('cleanup_search_cache', 'Remove expired search cache entries', 'cleanup', '0 3 * * *', TRUE),
('indexer_health_check', 'Check health of all indexers', 'health_check', '*/15 * * * *', TRUE),
('generate_statistics', 'Generate daily statistics', 'statistics', '0 1 * * *', TRUE),
('database_maintenance', 'Perform database optimization', 'cleanup', '0 4 * * 0', TRUE),
('backup_database', 'Create database backup', 'backup', '0 5 * * *', TRUE);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_app_settings_timestamp 
    AFTER UPDATE ON app_settings
    BEGIN
        UPDATE app_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_users_timestamp 
    AFTER UPDATE ON users
    BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_user_preferences_timestamp 
    AFTER UPDATE ON user_preferences
    BEGIN
        UPDATE user_preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_download_folders_timestamp 
    AFTER UPDATE ON download_folders
    BEGIN
        UPDATE download_folders SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_quality_profiles_timestamp 
    AFTER UPDATE ON quality_profiles
    BEGIN
        UPDATE quality_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_authors_timestamp 
    AFTER UPDATE ON authors
    BEGIN
        UPDATE authors SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_publishers_timestamp 
    AFTER UPDATE ON publishers
    BEGIN
        UPDATE publishers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_series_timestamp 
    AFTER UPDATE ON series
    BEGIN
        UPDATE series SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_books_timestamp 
    AFTER UPDATE ON books
    BEGIN
        UPDATE books SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_indexers_timestamp 
    AFTER UPDATE ON indexers
    BEGIN
        UPDATE indexers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_user_indexer_config_timestamp 
    AFTER UPDATE ON user_indexer_config
    BEGIN
        UPDATE user_indexer_config SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_indexer_search_preferences_timestamp 
    AFTER UPDATE ON indexer_search_preferences
    BEGIN
        UPDATE indexer_search_preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_download_queue_timestamp 
    AFTER UPDATE ON download_queue
    BEGIN
        UPDATE download_queue SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_scheduled_tasks_timestamp 
    AFTER UPDATE ON scheduled_tasks
    BEGIN
        UPDATE scheduled_tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- =========================================================================
-- DATABASE VERSION TRACKING
-- =========================================================================

-- Schema version table for migrations
CREATE TABLE schema_versions (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial schema version
INSERT INTO schema_versions (version, description) VALUES
(1, 'Initial schema creation with all core tables and indexes');

-- =========================================================================
-- PERFORMANCE OPTIMIZATION QUERIES
-- =========================================================================

-- Analyze tables for query optimization
ANALYZE;

-- Set SQLite pragmas for performance
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456; -- 256MB