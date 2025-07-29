#!/usr/bin/env python3
"""
FolioFox Database Migration Manager

This module provides database migration functionality for FolioFox,
ensuring safe schema evolution and data consistency.
"""

import os
import sqlite3
import logging
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class Migration:
    """Represents a database migration"""
    version: int
    filename: str
    description: str
    sql_content: str
    checksum: str
    applied_at: Optional[datetime] = None

class MigrationManager:
    """Manages database schema migrations for FolioFox"""
    
    def __init__(self, db_path: str, migrations_dir: str = None):
        self.db_path = db_path
        self.migrations_dir = migrations_dir or os.path.join(
            os.path.dirname(__file__), 'migrations'
        )
        self.migrations_dir = Path(self.migrations_dir)
        
    def get_db_connection(self) -> sqlite3.Connection:
        """Get database connection with proper configuration"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn
        
    def init_migration_tracking(self) -> None:
        """Initialize migration tracking table if it doesn't exist"""
        with self.get_db_connection() as conn:
            # Check if schema_versions table exists
            cursor = conn.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='schema_versions'
            """)
            
            if not cursor.fetchone():
                # Create schema_versions table
                conn.execute("""
                    CREATE TABLE schema_versions (
                        version INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL,
                        description TEXT NOT NULL,
                        checksum TEXT NOT NULL,
                        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                logger.info("Created schema_versions table")
                
    def get_current_version(self) -> int:
        """Get the current database schema version"""
        try:
            with self.get_db_connection() as conn:
                cursor = conn.execute("""
                    SELECT MAX(version) as current_version 
                    FROM schema_versions
                """)
                result = cursor.fetchone()
                return result['current_version'] or 0
        except sqlite3.OperationalError:
            # Table doesn't exist yet
            return 0
            
    def get_applied_migrations(self) -> List[Migration]:
        """Get list of applied migrations"""
        try:
            with self.get_db_connection() as conn:
                cursor = conn.execute("""
                    SELECT version, filename, description, checksum, applied_at
                    FROM schema_versions
                    ORDER BY version
                """)
                
                migrations = []
                for row in cursor.fetchall():
                    migrations.append(Migration(
                        version=row['version'],
                        filename=row['filename'],
                        description=row['description'],
                        sql_content='',  # Not stored in DB
                        checksum=row['checksum'],
                        applied_at=datetime.fromisoformat(row['applied_at'])
                    ))
                return migrations
        except sqlite3.OperationalError:
            return []
            
    def discover_migrations(self) -> List[Migration]:
        """Discover available migration files"""
        migrations = []
        
        if not self.migrations_dir.exists():
            logger.warning(f"Migrations directory not found: {self.migrations_dir}")
            return migrations
            
        # Find all .sql files in migrations directory
        for migration_file in sorted(self.migrations_dir.glob("*.sql")):
            try:
                # Extract version from filename (e.g., 001_initial_schema.sql -> 1)
                version_str = migration_file.stem.split('_')[0]
                version = int(version_str)
                
                # Read migration content
                sql_content = migration_file.read_text(encoding='utf-8')
                
                # Calculate checksum
                checksum = hashlib.sha256(sql_content.encode()).hexdigest()
                
                # Extract description from first comment line
                description = self._extract_description(sql_content)
                
                migrations.append(Migration(
                    version=version,
                    filename=migration_file.name,
                    description=description,
                    sql_content=sql_content,
                    checksum=checksum
                ))
                
            except (ValueError, IOError) as e:
                logger.error(f"Error reading migration file {migration_file}: {e}")
                continue
                
        return sorted(migrations, key=lambda m: m.version)
        
    def _extract_description(self, sql_content: str) -> str:
        """Extract description from migration SQL content"""
        lines = sql_content.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith('-- Description:'):
                return line.replace('-- Description:', '').strip()
        return "No description provided"
        
    def validate_migration_integrity(self) -> List[str]:
        """Validate migration file integrity against applied migrations"""
        issues = []
        applied_migrations = {m.version: m for m in self.get_applied_migrations()}
        available_migrations = {m.version: m for m in self.discover_migrations()}
        
        # Check for checksum mismatches
        for version, applied in applied_migrations.items():
            if version in available_migrations:
                available = available_migrations[version]
                if applied.checksum != available.checksum:
                    issues.append(
                        f"Migration {version} checksum mismatch: "
                        f"applied={applied.checksum[:8]}, "
                        f"available={available.checksum[:8]}"
                    )
            else:
                issues.append(f"Applied migration {version} not found in files")
                
        return issues
        
    def get_pending_migrations(self) -> List[Migration]:
        """Get list of migrations that need to be applied"""
        current_version = self.get_current_version()
        available_migrations = self.discover_migrations()
        
        return [m for m in available_migrations if m.version > current_version]
        
    def apply_migration(self, migration: Migration, dry_run: bool = False) -> bool:
        """Apply a single migration"""
        if dry_run:
            logger.info(f"DRY RUN: Would apply migration {migration.version}")
            return True
            
        logger.info(f"Applying migration {migration.version}: {migration.description}")
        
        try:
            with self.get_db_connection() as conn:
                # Start transaction
                conn.execute("BEGIN TRANSACTION")
                
                try:
                    # Execute migration SQL
                    conn.executescript(migration.sql_content)
                    
                    # Record migration in schema_versions
                    conn.execute("""
                        INSERT OR REPLACE INTO schema_versions 
                        (version, filename, description, checksum, applied_at)
                        VALUES (?, ?, ?, ?, ?)
                    """, (
                        migration.version,
                        migration.filename,
                        migration.description,
                        migration.checksum,
                        datetime.utcnow().isoformat()
                    ))
                    
                    # Commit transaction
                    conn.execute("COMMIT")
                    logger.info(f"Successfully applied migration {migration.version}")
                    return True
                    
                except Exception as e:
                    # Rollback on error
                    conn.execute("ROLLBACK")
                    logger.error(f"Error applying migration {migration.version}: {e}")
                    raise
                    
        except Exception as e:
            logger.error(f"Database error applying migration {migration.version}: {e}")
            return False
            
    def rollback_migration(self, target_version: int) -> bool:
        """Rollback to a specific schema version"""
        current_version = self.get_current_version()
        
        if target_version >= current_version:
            logger.warning(f"Target version {target_version} is not less than current {current_version}")
            return False
            
        logger.warning(f"Rolling back from version {current_version} to {target_version}")
        logger.warning("This operation may result in data loss!")
        
        # For SQLite, rollbacks typically require full database reconstruction
        # This is a simplified approach - in production, you'd want more sophisticated rollback logic
        
        try:
            with self.get_db_connection() as conn:
                # Remove migration records for versions > target_version
                conn.execute("""
                    DELETE FROM schema_versions 
                    WHERE version > ?
                """, (target_version,))
                
                logger.info(f"Rolled back migration records to version {target_version}")
                return True
                
        except Exception as e:
            logger.error(f"Error during rollback: {e}")
            return False
            
    def migrate(self, target_version: Optional[int] = None, dry_run: bool = False) -> bool:
        """Run all pending migrations up to target version"""
        # Initialize migration tracking
        self.init_migration_tracking()
        
        # Validate existing migrations
        issues = self.validate_migration_integrity()
        if issues:
            logger.error("Migration integrity issues found:")
            for issue in issues:
                logger.error(f"  - {issue}")
            return False
            
        # Get pending migrations
        pending = self.get_pending_migrations()
        
        if target_version:
            pending = [m for m in pending if m.version <= target_version]
            
        if not pending:
            logger.info("No pending migrations to apply")
            return True
            
        logger.info(f"Found {len(pending)} pending migrations")
        
        # Apply migrations in order
        for migration in pending:
            if not self.apply_migration(migration, dry_run):
                logger.error(f"Failed to apply migration {migration.version}")
                return False
                
        if not dry_run:
            current_version = self.get_current_version()
            logger.info(f"Database migrated to version {current_version}")
            
        return True
        
    def create_backup(self, backup_path: Optional[str] = None) -> str:
        """Create a database backup before migration"""
        if not backup_path:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = f"{self.db_path}.backup_{timestamp}"
            
        try:
            # Use SQLite's backup API for consistent backup
            with sqlite3.connect(self.db_path) as source:
                with sqlite3.connect(backup_path) as backup:
                    source.backup(backup)
                    
            logger.info(f"Database backup created: {backup_path}")
            return backup_path
            
        except Exception as e:
            logger.error(f"Failed to create backup: {e}")
            raise
            
    def get_migration_status(self) -> Dict:
        """Get current migration status"""
        current_version = self.get_current_version()
        applied_migrations = self.get_applied_migrations()
        pending_migrations = self.get_pending_migrations()
        available_migrations = self.discover_migrations()
        
        return {
            'current_version': current_version,
            'applied_count': len(applied_migrations),
            'pending_count': len(pending_migrations),
            'available_count': len(available_migrations),
            'integrity_issues': self.validate_migration_integrity(),
            'last_applied': applied_migrations[-1].applied_at if applied_migrations else None
        }

def main():
    """CLI interface for migration manager"""
    import argparse
    
    parser = argparse.ArgumentParser(description='FolioFox Database Migration Manager')
    parser.add_argument('--db-path', required=True, help='Path to SQLite database')
    parser.add_argument('--migrations-dir', help='Path to migrations directory')
    parser.add_argument('--action', choices=['status', 'migrate', 'rollback', 'validate'],
                       default='status', help='Action to perform')
    parser.add_argument('--target-version', type=int, help='Target migration version')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done')
    parser.add_argument('--backup', action='store_true', help='Create backup before migration')
    parser.add_argument('--verbose', action='store_true', help='Enable verbose logging')
    
    args = parser.parse_args()
    
    # Setup logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Create migration manager
    manager = MigrationManager(args.db_path, args.migrations_dir)
    
    try:
        if args.action == 'status':
            status = manager.get_migration_status()
            print("Migration Status:")
            print(f"  Current Version: {status['current_version']}")
            print(f"  Applied Migrations: {status['applied_count']}")
            print(f"  Pending Migrations: {status['pending_count']}")
            print(f"  Available Migrations: {status['available_count']}")
            
            if status['integrity_issues']:
                print("  Integrity Issues:")
                for issue in status['integrity_issues']:
                    print(f"    - {issue}")
                    
            if status['last_applied']:
                print(f"  Last Applied: {status['last_applied']}")
                
        elif args.action == 'migrate':
            if args.backup:
                backup_path = manager.create_backup()
                print(f"Backup created: {backup_path}")
                
            success = manager.migrate(args.target_version, args.dry_run)
            exit_code = 0 if success else 1
            exit(exit_code)
            
        elif args.action == 'rollback':
            if not args.target_version:
                print("Target version required for rollback")
                exit(1)
                
            if args.backup:
                backup_path = manager.create_backup()
                print(f"Backup created: {backup_path}")
                
            success = manager.rollback_migration(args.target_version)
            exit_code = 0 if success else 1
            exit(exit_code)
            
        elif args.action == 'validate':
            issues = manager.validate_migration_integrity()
            if issues:
                print("Migration integrity issues found:")
                for issue in issues:
                    print(f"  - {issue}")
                exit(1)
            else:
                print("All migrations validated successfully")
                
    except Exception as e:
        logger.error(f"Migration operation failed: {e}")
        exit(1)

if __name__ == '__main__':
    main()