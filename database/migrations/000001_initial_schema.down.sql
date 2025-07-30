-- Drop all tables in reverse dependency order

-- Drop FTS virtual table first
DROP TABLE IF EXISTS books_fts;

-- Drop views (these don't exist in up migration but including for completeness)
DROP VIEW IF EXISTS book_details_view;
DROP VIEW IF EXISTS download_queue_view;
DROP VIEW IF EXISTS indexer_health_summary;

-- Drop system tables
DROP TABLE IF EXISTS backup_history;
DROP TABLE IF EXISTS maintenance_tasks;
DROP TABLE IF EXISTS app_statistics;
DROP TABLE IF EXISTS scheduled_tasks;
DROP TABLE IF EXISTS system_logs;

-- Drop search tables
DROP TABLE IF EXISTS search_cache;
DROP TABLE IF EXISTS search_history;

-- Drop download tables
DROP TABLE IF EXISTS download_stats;
DROP TABLE IF EXISTS download_history;
DROP TABLE IF EXISTS download_queue;

-- Drop indexer tables
DROP TABLE IF EXISTS indexer_search_preferences;
DROP TABLE IF EXISTS indexer_health;
DROP TABLE IF EXISTS user_indexer_config;
DROP TABLE IF EXISTS indexers;

-- Drop book relationship tables
DROP TABLE IF EXISTS book_files;
DROP TABLE IF EXISTS book_genres;
DROP TABLE IF EXISTS book_authors;

-- Drop book tables
DROP TABLE IF EXISTS books;
DROP TABLE IF EXISTS book_formats;
DROP TABLE IF EXISTS languages;
DROP TABLE IF EXISTS genres;
DROP TABLE IF EXISTS series;
DROP TABLE IF EXISTS publishers;
DROP TABLE IF EXISTS authors;

-- Drop user tables
DROP TABLE IF EXISTS quality_profiles;
DROP TABLE IF EXISTS download_folders;
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS users;

-- Drop system configuration tables
DROP TABLE IF EXISTS app_settings;