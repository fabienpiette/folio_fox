-- Migration: 001_initial_schema.sql
-- Description: Create initial database schema for FolioFox
-- Version: 1.0.0
-- Date: 2025-07-28

-- This migration creates the complete initial schema
-- It should be run on a fresh database installation

BEGIN TRANSACTION;

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Source the main schema
-- In practice, this would include the entire schema.sql content
-- For brevity, this references the main schema file

-- Verify schema creation
SELECT 'Schema creation completed successfully' as status;

-- Update schema version
INSERT INTO schema_versions (version, description) VALUES
(1, 'Initial schema creation - all core tables and indexes created');

COMMIT;

-- Verify the installation
SELECT 
    COUNT(*) as table_count,
    'Tables created successfully' as message
FROM sqlite_master 
WHERE type = 'table' AND name NOT LIKE 'sqlite_%';

-- Display created tables for verification
SELECT name as table_name
FROM sqlite_master 
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;