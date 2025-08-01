-- Migration to restructure user_preferences table from key-value to structured columns
-- This migration converts the existing key-value user_preferences table to structured columns

-- First, create a backup of existing data
CREATE TABLE user_preferences_backup AS SELECT * FROM user_preferences;

-- Drop the old table
DROP TABLE user_preferences;

-- Create the new structured user_preferences table
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark', 'auto')),
    language TEXT DEFAULT 'en',
    timezone TEXT DEFAULT 'UTC',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    auto_download BOOLEAN DEFAULT FALSE,
    preferred_quality_profile_id INTEGER,
    default_download_folder_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (preferred_quality_profile_id) REFERENCES quality_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (default_download_folder_id) REFERENCES download_folders(id) ON DELETE SET NULL,
    UNIQUE(user_id)
);

-- Create indexes
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Create trigger to update timestamp
CREATE TRIGGER update_user_preferences_timestamp 
    AFTER UPDATE ON user_preferences
    FOR EACH ROW
    BEGIN
        UPDATE user_preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Note: Data migration would need to be done manually if there was existing key-value data
-- Since this is a development environment, we'll start with a clean slate