-- Rollback migration to revert user_preferences table back to key-value structure

-- Drop the structured table
DROP TABLE user_preferences;

-- Recreate the original key-value user_preferences table
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

-- Create indexes
CREATE INDEX idx_user_preferences_user_key ON user_preferences(user_id, preference_key);
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Create trigger to update timestamp
CREATE TRIGGER update_user_preferences_timestamp 
    AFTER UPDATE ON user_preferences
    FOR EACH ROW
    BEGIN
        UPDATE user_preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Restore backup data if it exists (development environments may not have backup)
INSERT OR IGNORE INTO user_preferences SELECT * FROM user_preferences_backup WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_preferences_backup');

-- Drop backup table
DROP TABLE IF EXISTS user_preferences_backup;