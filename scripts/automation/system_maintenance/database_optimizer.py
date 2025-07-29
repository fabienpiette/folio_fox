#!/usr/bin/env python3
"""
FolioFox Database Optimizer
Comprehensive database maintenance, optimization, and monitoring with automated cleanup.
"""

import argparse
import asyncio
import json
import logging
import sqlite3
import sys
import time
import os
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from enum import Enum
import yaml
import psutil

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/foliofox/database_optimizer.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('foliofox.database_optimizer')

class MaintenanceType(Enum):
    VACUUM = "vacuum"
    REINDEX = "reindex"
    ANALYZE = "analyze"
    CLEANUP = "cleanup"
    BACKUP = "backup"
    INTEGRITY_CHECK = "integrity_check"

class OptimizationStatus(Enum):
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    PARTIAL = "partial"
    IN_PROGRESS = "in_progress"

@dataclass
class MaintenanceTask:
    task_id: str
    task_type: MaintenanceType
    table_name: Optional[str]
    status: OptimizationStatus
    started_at: datetime
    completed_at: Optional[datetime]
    duration_seconds: Optional[float]
    rows_affected: Optional[int]
    space_freed_bytes: Optional[int]
    error_message: Optional[str]
    details: Dict[str, Any]

@dataclass
class DatabaseStats:
    database_size_bytes: int
    table_count: int
    index_count: int
    page_count: int
    page_size: int
    fragmentation_percent: float
    largest_tables: List[Dict[str, Any]]
    unused_space_bytes: int
    journal_mode: str
    synchronous_mode: str
    cache_size: int

@dataclass
class OptimizationReport:
    timestamp: datetime
    database_path: str
    initial_stats: DatabaseStats
    final_stats: DatabaseStats
    tasks_performed: List[MaintenanceTask]
    total_duration_seconds: float
    space_freed_bytes: int
    performance_improvement_percent: float
    recommendations: List[str]

class DatabaseOptimizer:
    """Comprehensive database optimization and maintenance system."""
    
    def __init__(self, config_path: str = "./config/config.yaml"):
        self.config = self._load_config(config_path)
        self.db_path = self.config.get('database', {}).get('path', './data/foliofox.db')
        
        # Optimization configuration
        self.auto_vacuum_threshold = self.config.get('maintenance', {}).get('auto_vacuum_threshold_mb', 100)
        self.fragmentation_threshold = self.config.get('maintenance', {}).get('fragmentation_threshold_percent', 25)
        self.cleanup_retention_days = self.config.get('maintenance', {}).get('cleanup_retention_days', 90)
        self.backup_retention_days = self.config.get('maintenance', {}).get('backup_retention_days', 30)
        self.max_concurrent_operations = self.config.get('maintenance', {}).get('max_concurrent_operations', 1)
        
        # Backup configuration
        self.backup_dir = Path(self.config.get('backup', {}).get('backup_dir', './backups'))
        self.backup_compression = self.config.get('backup', {}).get('enable_compression', True)
        self.backup_verification = self.config.get('backup', {}).get('enable_verification', True)
        
        # Performance monitoring
        self.enable_performance_monitoring = self.config.get('monitoring', {}).get('enable_performance_monitoring', True)
        self.query_timeout_seconds = self.config.get('monitoring', {}).get('query_timeout_seconds', 300)
        
        # Create directories
        self.backup_dir.mkdir(exist_ok=True, parents=True)
        
        # Statistics tracking
        self.maintenance_history: List[MaintenanceTask] = []
        self.performance_metrics: Dict[str, List[float]] = {
            'query_response_time': [],
            'database_size': [],
            'fragmentation_level': []
        }
        
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration with maintenance-specific defaults."""
        try:
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
                logger.info(f"Configuration loaded from {config_path}")
                return config
        except FileNotFoundError:
            logger.warning(f"Config file {config_path} not found, using defaults")
            return self._get_default_config()
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return self._get_default_config()
    
    def _get_default_config(self) -> Dict:
        """Return default database optimization configuration."""
        return {
            'database': {'path': './data/foliofox.db'},
            'maintenance': {
                'auto_vacuum_threshold_mb': 100,
                'fragmentation_threshold_percent': 25,
                'cleanup_retention_days': 90,
                'backup_retention_days': 30,
                'max_concurrent_operations': 1
            },
            'backup': {
                'backup_dir': './backups',
                'enable_compression': True,
                'enable_verification': True
            },
            'monitoring': {
                'enable_performance_monitoring': True,
                'query_timeout_seconds': 300
            }
        }
    
    def get_database_connection(self, read_only: bool = False) -> sqlite3.Connection:
        """Get database connection with proper configuration."""
        try:
            uri = f"file:{self.db_path}?mode={'ro' if read_only else 'rw'}"
            conn = sqlite3.connect(uri, uri=True, timeout=30.0)
            conn.row_factory = sqlite3.Row
            
            if not read_only:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("PRAGMA synchronous=NORMAL")
            
            conn.execute("PRAGMA foreign_keys=ON")
            return conn
        except sqlite3.Error as e:
            logger.error(f"Database connection error: {e}")
            raise
    
    async def analyze_database_stats(self) -> DatabaseStats:
        """Analyze current database statistics and health."""
        logger.info("Analyzing database statistics...")
        
        try:
            with self.get_database_connection(read_only=True) as conn:
                cursor = conn.cursor()
                
                # Basic database info
                cursor.execute("PRAGMA page_count")
                page_count = cursor.fetchone()[0]
                
                cursor.execute("PRAGMA page_size")
                page_size = cursor.fetchone()[0]
                
                database_size = page_count * page_size
                
                # Get table and index counts
                cursor.execute("""
                    SELECT COUNT(*) FROM sqlite_master 
                    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
                """)
                table_count = cursor.fetchone()[0]
                
                cursor.execute("""
                    SELECT COUNT(*) FROM sqlite_master 
                    WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
                """)
                index_count = cursor.fetchone()[0]
                
                # Calculate fragmentation
                cursor.execute("PRAGMA freelist_count")
                freelist_count = cursor.fetchone()[0]
                fragmentation_percent = (freelist_count / max(page_count, 1)) * 100
                
                # Get largest tables
                cursor.execute("""
                    SELECT name, 
                           (SELECT COUNT(*) FROM pragma_table_info(name)) as column_count
                    FROM sqlite_master 
                    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
                """)
                
                largest_tables = []
                for row in cursor.fetchall():
                    table_name = row[0]
                    column_count = row[1]
                    
                    # Get row count and size estimate
                    try:
                        cursor.execute(f"SELECT COUNT(*) FROM [{table_name}]")
                        row_count = cursor.fetchone()[0]
                        
                        # Estimate table size (rough calculation)
                        estimated_size = row_count * column_count * 50  # Rough bytes per field
                        
                        largest_tables.append({
                            'name': table_name,
                            'row_count': row_count,
                            'column_count': column_count,
                            'estimated_size_bytes': estimated_size
                        })
                    except sqlite3.Error:
                        # Skip problematic tables
                        continue
                
                # Sort by estimated size
                largest_tables.sort(key=lambda x: x['estimated_size_bytes'], reverse=True)
                largest_tables = largest_tables[:10]  # Top 10 largest
                
                # Get unused space
                unused_space = freelist_count * page_size
                
                # Get current pragma settings
                cursor.execute("PRAGMA journal_mode")
                journal_mode = cursor.fetchone()[0]
                
                cursor.execute("PRAGMA synchronous")
                synchronous_mode = cursor.fetchone()[0]
                
                cursor.execute("PRAGMA cache_size")
                cache_size = cursor.fetchone()[0]
                
                return DatabaseStats(
                    database_size_bytes=database_size,
                    table_count=table_count,
                    index_count=index_count,
                    page_count=page_count,
                    page_size=page_size,
                    fragmentation_percent=fragmentation_percent,
                    largest_tables=largest_tables,
                    unused_space_bytes=unused_space,
                    journal_mode=journal_mode,
                    synchronous_mode=str(synchronous_mode),
                    cache_size=cache_size
                )
                
        except Exception as e:
            logger.error(f"Error analyzing database stats: {e}")
            raise
    
    async def perform_vacuum(self, table_name: Optional[str] = None) -> MaintenanceTask:
        """Perform VACUUM operation to reclaim space and reduce fragmentation."""
        task_id = f"vacuum_{int(time.time())}"
        task = MaintenanceTask(
            task_id=task_id,
            task_type=MaintenanceType.VACUUM,
            table_name=table_name,
            status=OptimizationStatus.IN_PROGRESS,
            started_at=datetime.now(),
            completed_at=None,
            duration_seconds=None,
            rows_affected=None,
            space_freed_bytes=None,
            error_message=None,
            details={}
        )
        
        logger.info(f"Starting VACUUM operation (Task: {task_id})")
        
        try:
            # Get initial size
            initial_size = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
            
            with self.get_database_connection() as conn:
                if table_name:
                    # SQLite doesn't support per-table VACUUM, but we can REINDEX
                    logger.info(f"Reindexing table: {table_name}")
                    conn.execute(f"REINDEX [{table_name}]")
                    task.details['operation'] = f'REINDEX {table_name}'
                else:
                    # Full database VACUUM
                    logger.info("Performing full database VACUUM...")
                    conn.execute("VACUUM")
                    task.details['operation'] = 'VACUUM'
                
                conn.commit()
            
            # Calculate space freed
            final_size = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
            space_freed = max(0, initial_size - final_size)
            
            task.status = OptimizationStatus.SUCCESS
            task.space_freed_bytes = space_freed
            task.details.update({
                'initial_size_bytes': initial_size,
                'final_size_bytes': final_size,
                'space_freed_mb': round(space_freed / 1024 / 1024, 2)
            })
            
            logger.info(f"VACUUM completed successfully. Space freed: {space_freed / 1024 / 1024:.2f} MB")
            
        except Exception as e:
            task.status = OptimizationStatus.FAILED
            task.error_message = str(e)
            logger.error(f"VACUUM operation failed: {e}")
        
        task.completed_at = datetime.now()
        task.duration_seconds = (task.completed_at - task.started_at).total_seconds()
        
        return task
    
    async def perform_analyze(self, table_name: Optional[str] = None) -> MaintenanceTask:
        """Perform ANALYZE to update query planner statistics."""
        task_id = f"analyze_{int(time.time())}"
        task = MaintenanceTask(
            task_id=task_id,
            task_type=MaintenanceType.ANALYZE,
            table_name=table_name,
            status=OptimizationStatus.IN_PROGRESS,
            started_at=datetime.now(),
            completed_at=None,
            duration_seconds=None,
            rows_affected=None,
            space_freed_bytes=None,
            error_message=None,
            details={}
        )
        
        logger.info(f"Starting ANALYZE operation (Task: {task_id})")
        
        try:
            with self.get_database_connection() as conn:
                if table_name:
                    logger.info(f"Analyzing table: {table_name}")
                    conn.execute(f"ANALYZE [{table_name}]")
                    task.details['operation'] = f'ANALYZE {table_name}'
                else:
                    logger.info("Analyzing all tables...")
                    conn.execute("ANALYZE")
                    task.details['operation'] = 'ANALYZE'
                
                conn.commit()
            
            task.status = OptimizationStatus.SUCCESS
            logger.info("ANALYZE completed successfully")
            
        except Exception as e:
            task.status = OptimizationStatus.FAILED
            task.error_message = str(e)
            logger.error(f"ANALYZE operation failed: {e}")
        
        task.completed_at = datetime.now()
        task.duration_seconds = (task.completed_at - task.started_at).total_seconds()
        
        return task
    
    async def perform_reindex(self, table_name: Optional[str] = None) -> MaintenanceTask:
        """Perform REINDEX to rebuild database indexes."""
        task_id = f"reindex_{int(time.time())}"
        task = MaintenanceTask(
            task_id=task_id,
            task_type=MaintenanceType.REINDEX,
            table_name=table_name,
            status=OptimizationStatus.IN_PROGRESS,
            started_at=datetime.now(),
            completed_at=None,
            duration_seconds=None,
            rows_affected=None,
            space_freed_bytes=None,
            error_message=None,
            details={}
        )
        
        logger.info(f"Starting REINDEX operation (Task: {task_id})")
        
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                if table_name:
                    logger.info(f"Reindexing table: {table_name}")
                    conn.execute(f"REINDEX [{table_name}]")
                    task.details['operation'] = f'REINDEX {table_name}'
                    
                    # Count indexes for this table
                    cursor.execute("""
                        SELECT COUNT(*) FROM sqlite_master 
                        WHERE type = 'index' AND tbl_name = ?
                    """, (table_name,))
                    index_count = cursor.fetchone()[0]
                    task.details['indexes_rebuilt'] = index_count
                else:
                    logger.info("Reindexing all indexes...")
                    conn.execute("REINDEX")
                    task.details['operation'] = 'REINDEX'
                    
                    # Count total indexes
                    cursor.execute("""
                        SELECT COUNT(*) FROM sqlite_master 
                        WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
                    """)
                    index_count = cursor.fetchone()[0]
                    task.details['indexes_rebuilt'] = index_count
                
                conn.commit()
            
            task.status = OptimizationStatus.SUCCESS
            logger.info(f"REINDEX completed successfully. Rebuilt {task.details.get('indexes_rebuilt', 0)} indexes")
            
        except Exception as e:
            task.status = OptimizationStatus.FAILED
            task.error_message = str(e)
            logger.error(f"REINDEX operation failed: {e}")
        
        task.completed_at = datetime.now()
        task.duration_seconds = (task.completed_at - task.started_at).total_seconds()
        
        return task
    
    async def perform_cleanup(self) -> MaintenanceTask:
        """Perform data cleanup operations."""
        task_id = f"cleanup_{int(time.time())}"
        task = MaintenanceTask(
            task_id=task_id,
            task_type=MaintenanceType.CLEANUP,
            table_name=None,
            status=OptimizationStatus.IN_PROGRESS,
            started_at=datetime.now(),
            completed_at=None,
            duration_seconds=None,
            rows_affected=None,
            space_freed_bytes=None,
            error_message=None,
            details={}
        )
        
        logger.info(f"Starting cleanup operation (Task: {task_id})")
        
        try:
            total_rows_deleted = 0
            cleanup_operations = []
            
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Clean up old system logs
                cutoff_date = (datetime.now() - timedelta(days=self.cleanup_retention_days)).isoformat()
                cursor.execute("""
                    DELETE FROM system_logs 
                    WHERE created_at < ? AND level NOT IN ('ERROR', 'CRITICAL')
                """, (cutoff_date,))
                
                logs_deleted = cursor.rowcount
                total_rows_deleted += logs_deleted
                cleanup_operations.append(f"Deleted {logs_deleted} old system logs")
                
                # Clean up old search cache entries
                cursor.execute("""
                    DELETE FROM search_cache 
                    WHERE expires_at < datetime('now')
                """)
                
                cache_deleted = cursor.rowcount
                total_rows_deleted += cache_deleted
                cleanup_operations.append(f"Deleted {cache_deleted} expired search cache entries")
                
                # Clean up old indexer health records
                health_cutoff = (datetime.now() - timedelta(days=30)).isoformat()
                cursor.execute("""
                    DELETE FROM indexer_health 
                    WHERE checked_at < ?
                    AND id NOT IN (
                        SELECT MAX(id) 
                        FROM indexer_health 
                        GROUP BY indexer_id
                    )
                """, (health_cutoff,))
                
                health_deleted = cursor.rowcount
                total_rows_deleted += health_deleted
                cleanup_operations.append(f"Deleted {health_deleted} old health check records")
                
                # Clean up completed downloads older than retention period
                download_cutoff = (datetime.now() - timedelta(days=self.cleanup_retention_days)).isoformat()
                cursor.execute("""
                    DELETE FROM download_history 
                    WHERE completed_at < ? AND final_status = 'completed'
                """, (download_cutoff,))
                
                downloads_deleted = cursor.rowcount
                total_rows_deleted += downloads_deleted
                cleanup_operations.append(f"Deleted {downloads_deleted} old download history records")
                
                # Clean up old maintenance task records
                cursor.execute("""
                    DELETE FROM maintenance_tasks 
                    WHERE created_at < ? AND status = 'completed'
                """, (cutoff_date,))
                
                maintenance_deleted = cursor.rowcount
                total_rows_deleted += maintenance_deleted
                cleanup_operations.append(f"Deleted {maintenance_deleted} old maintenance task records")
                
                conn.commit()
            
            task.status = OptimizationStatus.SUCCESS
            task.rows_affected = total_rows_deleted
            task.details['cleanup_operations'] = cleanup_operations
            task.details['total_rows_deleted'] = total_rows_deleted
            
            logger.info(f"Cleanup completed successfully. Deleted {total_rows_deleted} rows total")
            
        except Exception as e:
            task.status = OptimizationStatus.FAILED
            task.error_message = str(e)
            logger.error(f"Cleanup operation failed: {e}")
        
        task.completed_at = datetime.now()
        task.duration_seconds = (task.completed_at - task.started_at).total_seconds()
        
        return task
    
    async def perform_integrity_check(self) -> MaintenanceTask:
        """Perform database integrity check."""
        task_id = f"integrity_{int(time.time())}"
        task = MaintenanceTask(
            task_id=task_id,
            task_type=MaintenanceType.INTEGRITY_CHECK,
            table_name=None,
            status=OptimizationStatus.IN_PROGRESS,
            started_at=datetime.now(),
            completed_at=None,
            duration_seconds=None,
            rows_affected=None,
            space_freed_bytes=None,
            error_message=None,
            details={}
        )
        
        logger.info(f"Starting integrity check (Task: {task_id})")
        
        try:
            with self.get_database_connection(read_only=True) as conn:
                cursor = conn.cursor()
                
                # Quick integrity check
                cursor.execute("PRAGMA quick_check")
                quick_check_results = cursor.fetchall()
                
                quick_check_ok = len(quick_check_results) == 1 and quick_check_results[0][0] == 'ok'
                
                task.details['quick_check_passed'] = quick_check_ok
                task.details['quick_check_results'] = [row[0] for row in quick_check_results]
                
                if quick_check_ok:
                    logger.info("Quick integrity check passed")
                else:
                    logger.warning(f"Quick integrity check issues: {quick_check_results}")
                
                # Foreign key check
                cursor.execute("PRAGMA foreign_key_check")
                fk_violations = cursor.fetchall()
                
                fk_check_ok = len(fk_violations) == 0
                task.details['foreign_key_check_passed'] = fk_check_ok
                
                if not fk_check_ok:
                    task.details['foreign_key_violations'] = [
                        {
                            'table': row[0],
                            'rowid': row[1],
                            'parent': row[2],
                            'fkid': row[3]
                        }
                        for row in fk_violations
                    ]
                    logger.warning(f"Found {len(fk_violations)} foreign key violations")
                else:
                    logger.info("Foreign key check passed")
                
                # Overall status
                if quick_check_ok and fk_check_ok:
                    task.status = OptimizationStatus.SUCCESS
                    logger.info("Database integrity check passed")
                else:
                    task.status = OptimizationStatus.PARTIAL
                    logger.warning("Database integrity check found issues")
            
        except Exception as e:
            task.status = OptimizationStatus.FAILED
            task.error_message = str(e)
            logger.error(f"Integrity check failed: {e}")
        
        task.completed_at = datetime.now()
        task.duration_seconds = (task.completed_at - task.started_at).total_seconds()
        
        return task
    
    async def create_backup(self) -> MaintenanceTask:
        """Create database backup with optional compression."""
        task_id = f"backup_{int(time.time())}"
        task = MaintenanceTask(
            task_id=task_id,
            task_type=MaintenanceType.BACKUP,
            table_name=None,
            status=OptimizationStatus.IN_PROGRESS,
            started_at=datetime.now(),
            completed_at=None,
            duration_seconds=None,
            rows_affected=None,
            space_freed_bytes=None,
            error_message=None,
            details={}
        )
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_filename = f"foliofox_backup_{timestamp}.db"
        backup_path = self.backup_dir / backup_filename
        
        logger.info(f"Creating database backup: {backup_path}")
        
        try:
            # Create backup using SQLite backup API
            with self.get_database_connection(read_only=True) as source_conn:
                backup_conn = sqlite3.connect(str(backup_path))
                
                try:
                    # Perform backup
                    source_conn.backup(backup_conn)
                    backup_conn.close()
                    
                    # Get backup file size
                    backup_size = backup_path.stat().st_size
                    task.details['backup_size_bytes'] = backup_size
                    task.details['backup_size_mb'] = round(backup_size / 1024 / 1024, 2)
                    
                    # Compress if enabled
                    if self.backup_compression:
                        compressed_path = backup_path.with_suffix('.db.gz')
                        
                        import gzip
                        with open(backup_path, 'rb') as f_in:
                            with gzip.open(compressed_path, 'wb') as f_out:
                                shutil.copyfileobj(f_in, f_out)
                        
                        # Remove uncompressed file
                        backup_path.unlink()
                        backup_path = compressed_path
                        
                        compressed_size = backup_path.stat().st_size
                        compression_ratio = (1 - compressed_size / backup_size) * 100
                        
                        task.details['compressed_size_bytes'] = compressed_size
                        task.details['compressed_size_mb'] = round(compressed_size / 1024 / 1024, 2)
                        task.details['compression_ratio_percent'] = round(compression_ratio, 2)
                        
                        logger.info(f"Backup compressed: {compression_ratio:.1f}% size reduction")
                    
                    # Verify backup if enabled
                    if self.backup_verification:
                        verification_success = await self._verify_backup(backup_path)
                        task.details['verification_passed'] = verification_success
                        
                        if not verification_success:
                            task.status = OptimizationStatus.PARTIAL
                            logger.warning("Backup verification failed")
                        else:
                            logger.info("Backup verification passed")
                    
                    # Clean up old backups
                    await self._cleanup_old_backups()
                    
                    task.status = OptimizationStatus.SUCCESS if task.status != OptimizationStatus.PARTIAL else OptimizationStatus.PARTIAL
                    task.details['backup_path'] = str(backup_path)
                    
                    logger.info(f"Backup created successfully: {backup_path}")
                    
                except Exception as e:
                    backup_conn.close()
                    # Clean up failed backup file
                    if backup_path.exists():
                        backup_path.unlink()
                    raise e
            
        except Exception as e:
            task.status = OptimizationStatus.FAILED
            task.error_message = str(e)
            logger.error(f"Backup creation failed: {e}")
        
        task.completed_at = datetime.now()
        task.duration_seconds = (task.completed_at - task.started_at).total_seconds()
        
        return task
    
    async def _verify_backup(self, backup_path: Path) -> bool:
        """Verify backup file integrity."""
        try:
            if backup_path.suffix == '.gz':
                # Handle compressed backup
                import gzip
                import tempfile
                
                with tempfile.NamedTemporaryFile(suffix='.db') as temp_file:
                    with gzip.open(backup_path, 'rb') as f_in:
                        shutil.copyfileobj(f_in, temp_file)
                    
                    temp_file.flush()
                    
                    # Verify the temporary uncompressed file
                    test_conn = sqlite3.connect(temp_file.name)
                    cursor = test_conn.cursor()
                    cursor.execute("PRAGMA quick_check")
                    result = cursor.fetchone()
                    test_conn.close()
                    
                    return result and result[0] == 'ok'
            else:
                # Verify uncompressed backup
                test_conn = sqlite3.connect(str(backup_path))
                cursor = test_conn.cursor()
                cursor.execute("PRAGMA quick_check")
                result = cursor.fetchone()
                test_conn.close()
                
                return result and result[0] == 'ok'
                
        except Exception as e:
            logger.error(f"Backup verification error: {e}")
            return False
    
    async def _cleanup_old_backups(self):
        """Clean up old backup files."""
        try:
            cutoff_date = datetime.now() - timedelta(days=self.backup_retention_days)
            
            deleted_count = 0
            total_size_freed = 0
            
            for backup_file in self.backup_dir.glob("foliofox_backup_*.db*"):
                try:
                    # Extract timestamp from filename
                    timestamp_str = backup_file.stem.split('_')[-2] + '_' + backup_file.stem.split('_')[-1]
                    if backup_file.suffix == '.gz':
                        timestamp_str = timestamp_str.replace('.db', '')
                    
                    file_date = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                    
                    if file_date < cutoff_date:
                        file_size = backup_file.stat().st_size
                        backup_file.unlink()
                        deleted_count += 1
                        total_size_freed += file_size
                        
                        logger.info(f"Deleted old backup: {backup_file}")
                        
                except (ValueError, IndexError) as e:
                    # Skip files with unexpected naming
                    logger.warning(f"Skipping backup file with unexpected name: {backup_file}")
                    continue
            
            if deleted_count > 0:
                logger.info(f"Cleaned up {deleted_count} old backups, freed {total_size_freed / 1024 / 1024:.2f} MB")
            
        except Exception as e:
            logger.error(f"Error cleaning up old backups: {e}")
    
    async def run_comprehensive_optimization(self) -> OptimizationReport:
        """Run comprehensive database optimization workflow."""
        logger.info("Starting comprehensive database optimization")
        
        start_time = datetime.now()
        
        # Get initial statistics
        initial_stats = await self.analyze_database_stats()
        
        tasks_performed = []
        recommendations = []
        
        try:
            # 1. Integrity check first
            integrity_task = await self.perform_integrity_check()
            tasks_performed.append(integrity_task)
            
            if integrity_task.status == OptimizationStatus.FAILED:
                recommendations.append("Database integrity check failed. Manual intervention required.")
                logger.error("Stopping optimization due to integrity check failure")
            else:
                # 2. Cleanup old data
                cleanup_task = await self.perform_cleanup()
                tasks_performed.append(cleanup_task)
                
                # 3. Analyze tables for query optimizer
                analyze_task = await self.perform_analyze()
                tasks_performed.append(analyze_task)
                
                # 4. Reindex if fragmentation is high
                if initial_stats.fragmentation_percent > self.fragmentation_threshold:
                    reindex_task = await self.perform_reindex()
                    tasks_performed.append(reindex_task)
                    recommendations.append("High fragmentation detected and indexes rebuilt")
                
                # 5. Vacuum if database is large enough or fragmented
                db_size_mb = initial_stats.database_size_bytes / 1024 / 1024
                if (db_size_mb > self.auto_vacuum_threshold or 
                    initial_stats.fragmentation_percent > self.fragmentation_threshold):
                    vacuum_task = await self.perform_vacuum()
                    tasks_performed.append(vacuum_task)
                
                # 6. Create backup
                backup_task = await self.create_backup()
                tasks_performed.append(backup_task)
            
            # Get final statistics
            final_stats = await self.analyze_database_stats()
            
            # Calculate improvements
            total_duration = (datetime.now() - start_time).total_seconds()
            space_freed = max(0, initial_stats.database_size_bytes - final_stats.database_size_bytes)
            
            # Calculate performance improvement (simplified)
            fragmentation_improvement = max(0, initial_stats.fragmentation_percent - final_stats.fragmentation_percent)
            performance_improvement = min(100, fragmentation_improvement * 2)  # Rough estimate
            
            # Generate recommendations
            if final_stats.fragmentation_percent > 20:
                recommendations.append("Consider running VACUUM more frequently")
            
            if final_stats.database_size_bytes > 1024 * 1024 * 1024:  # 1GB
                recommendations.append("Database is large. Consider archiving old data")
            
            if len(final_stats.largest_tables) > 0:
                largest_table = final_stats.largest_tables[0]
                if largest_table['row_count'] > 1000000:
                    recommendations.append(f"Table '{largest_table['name']}' has many rows. Consider partitioning or archiving")
            
            # Store maintenance history
            for task in tasks_performed:
                self.maintenance_history.append(task)
                await self._record_maintenance_task_in_db(task)
            
            # Update performance metrics
            self.performance_metrics['database_size'].append(final_stats.database_size_bytes)
            self.performance_metrics['fragmentation_level'].append(final_stats.fragmentation_percent)
            
            report = OptimizationReport(
                timestamp=datetime.now(),
                database_path=self.db_path,
                initial_stats=initial_stats,
                final_stats=final_stats,
                tasks_performed=tasks_performed,
                total_duration_seconds=total_duration,
                space_freed_bytes=space_freed,
                performance_improvement_percent=performance_improvement,
                recommendations=recommendations
            )
            
            logger.info(f"Comprehensive optimization completed in {total_duration:.1f}s. "
                       f"Space freed: {space_freed / 1024 / 1024:.2f} MB")
            
            return report
            
        except Exception as e:
            logger.error(f"Comprehensive optimization failed: {e}")
            raise
    
    async def _record_maintenance_task_in_db(self, task: MaintenanceTask):
        """Record maintenance task in database."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    INSERT INTO maintenance_tasks 
                    (task_name, task_type, table_name, status, started_at, 
                     completed_at, duration_seconds, rows_affected, error_message, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    task.task_id,
                    task.task_type.value,
                    task.table_name,
                    task.status.value,
                    task.started_at.isoformat(),
                    task.completed_at.isoformat() if task.completed_at else None,
                    task.duration_seconds,
                    task.rows_affected,
                    task.error_message,
                    datetime.now().isoformat()
                ))
                
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error recording maintenance task: {e}")
    
    def generate_optimization_report(self) -> Dict:
        """Generate comprehensive optimization report."""
        try:
            # Get current database stats
            current_stats = asyncio.run(self.analyze_database_stats())
            
            # Get recent maintenance history
            recent_tasks = [
                task for task in self.maintenance_history
                if task.started_at > datetime.now() - timedelta(days=7)
            ]
            
            # Calculate success rates
            total_tasks = len(recent_tasks)
            successful_tasks = len([t for t in recent_tasks if t.status == OptimizationStatus.SUCCESS])
            success_rate = (successful_tasks / total_tasks * 100) if total_tasks > 0 else 0
            
            # System resource usage
            try:
                memory_usage = psutil.virtual_memory()
                disk_usage = psutil.disk_usage(os.path.dirname(self.db_path))
                
                system_resources = {
                    'memory_percent': memory_usage.percent,
                    'disk_percent': disk_usage.percent,
                    'available_disk_gb': disk_usage.free / 1024 / 1024 / 1024
                }
            except Exception:
                system_resources = {}
            
            return {
                'timestamp': datetime.now().isoformat(),
                'database_statistics': asdict(current_stats),
                'maintenance_summary': {
                    'recent_tasks': total_tasks,
                    'success_rate_percent': round(success_rate, 1),
                    'total_space_freed_mb': sum(
                        t.space_freed_bytes or 0 for t in recent_tasks
                    ) / 1024 / 1024,
                    'avg_task_duration_seconds': sum(
                        t.duration_seconds or 0 for t in recent_tasks
                    ) / max(total_tasks, 1)
                },
                'recent_tasks': [asdict(task) for task in recent_tasks[-10:]],  # Last 10 tasks
                'system_resources': system_resources,
                'performance_trends': {
                    'database_size_trend': self.performance_metrics['database_size'][-30:],
                    'fragmentation_trend': self.performance_metrics['fragmentation_level'][-30:]
                },
                'configuration': {
                    'auto_vacuum_threshold_mb': self.auto_vacuum_threshold,
                    'fragmentation_threshold_percent': self.fragmentation_threshold,
                    'cleanup_retention_days': self.cleanup_retention_days,
                    'backup_retention_days': self.backup_retention_days
                }
            }
            
        except Exception as e:
            logger.error(f"Error generating optimization report: {e}")
            return {'error': str(e), 'timestamp': datetime.now().isoformat()}


def main():
    parser = argparse.ArgumentParser(description='FolioFox Database Optimizer')
    parser.add_argument('--config', default='./config/config.yaml', help='Configuration file path')
    parser.add_argument('--mode', 
                       choices=['analyze', 'vacuum', 'reindex', 'analyze-tables', 'cleanup', 
                               'backup', 'integrity-check', 'full-optimization', 'report'], 
                       default='analyze', help='Operation mode')
    parser.add_argument('--table', help='Specific table name for targeted operations')
    
    args = parser.parse_args()
    
    optimizer = DatabaseOptimizer(args.config)
    
    async def run_operation():
        if args.mode == 'analyze':
            stats = await optimizer.analyze_database_stats()
            print(json.dumps(asdict(stats), indent=2, default=str))
            
        elif args.mode == 'vacuum':
            task = await optimizer.perform_vacuum(args.table)
            print(json.dumps(asdict(task), indent=2, default=str))
            
        elif args.mode == 'reindex':
            task = await optimizer.perform_reindex(args.table)
            print(json.dumps(asdict(task), indent=2, default=str))
            
        elif args.mode == 'analyze-tables':
            task = await optimizer.perform_analyze(args.table)
            print(json.dumps(asdict(task), indent=2, default=str))
            
        elif args.mode == 'cleanup':
            task = await optimizer.perform_cleanup()
            print(json.dumps(asdict(task), indent=2, default=str))
            
        elif args.mode == 'backup':
            task = await optimizer.create_backup()
            print(json.dumps(asdict(task), indent=2, default=str))
            
        elif args.mode == 'integrity-check':
            task = await optimizer.perform_integrity_check()
            print(json.dumps(asdict(task), indent=2, default=str))
            
        elif args.mode == 'full-optimization':
            report = await optimizer.run_comprehensive_optimization()
            print(json.dumps(asdict(report), indent=2, default=str))
            
        elif args.mode == 'report':
            report = optimizer.generate_optimization_report()
            print(json.dumps(report, indent=2, default=str))
    
    try:
        asyncio.run(run_operation())
    except KeyboardInterrupt:
        logger.info("Database optimizer stopped by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Database optimizer failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()