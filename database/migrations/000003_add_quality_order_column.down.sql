-- Remove quality_order column from quality_profiles table

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
CREATE TABLE quality_profiles_temp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    preferred_formats TEXT NOT NULL,
    min_quality_score INTEGER DEFAULT 0,
    max_file_size_mb INTEGER,
    language_preferences TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Copy data excluding quality_order
INSERT INTO quality_profiles_temp (id, user_id, name, preferred_formats, min_quality_score, max_file_size_mb, language_preferences, is_default, created_at, updated_at)
SELECT id, user_id, name, preferred_formats, min_quality_score, max_file_size_mb, language_preferences, is_default, created_at, updated_at FROM quality_profiles;

-- Drop old table and rename temp
DROP TABLE quality_profiles;
ALTER TABLE quality_profiles_temp RENAME TO quality_profiles;

-- Recreate indexes and triggers
CREATE INDEX idx_quality_profiles_user_id ON quality_profiles(user_id);
CREATE TRIGGER update_quality_profiles_timestamp 
    AFTER UPDATE ON quality_profiles
    FOR EACH ROW
    BEGIN
        UPDATE quality_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;