#!/usr/bin/env python3
"""
FolioFox Advanced Download Queue Manager
Comprehensive download queue automation with advanced features and reliability.
"""

import argparse
import asyncio
import json
import logging
import sqlite3
import sys
import time
import signal
import psutil
import aiofiles
import aiohttp
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Set
from dataclasses import dataclass, asdict
from enum import Enum
import yaml
import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess
import shutil

# Configure comprehensive logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/foliofox/advanced_queue_manager.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('foliofox.advanced_queue_manager')

class QueueStatus(Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"  
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"

class Priority(Enum):
    CRITICAL = 1
    HIGH = 2
    NORMAL = 5
    LOW = 7
    BACKGROUND = 10

@dataclass  
class DownloadTask:
    id: int
    user_id: int
    book_id: Optional[int]
    indexer_id: int
    title: str
    author_name: Optional[str]
    download_url: str
    file_format: str
    file_size_bytes: Optional[int]
    priority: int
    status: QueueStatus
    progress_percentage: int
    download_path: Optional[str]
    quality_profile_id: Optional[int]
    retry_count: int
    max_retries: int
    error_message: Optional[str]
    estimated_completion: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

@dataclass
class QueueMetrics:
    total_items: int
    pending: int
    downloading: int
    completed: int
    failed: int
    cancelled: int
    paused: int
    avg_completion_time: Optional[float]
    success_rate: float
    throughput_last_hour: int
    bandwidth_usage_mbps: float
    estimated_completion_time: Optional[datetime]

@dataclass
class SystemResource:
    cpu_percent: float
    memory_percent: float
    disk_usage_percent: float
    network_io_mb: float
    active_connections: int

class AdvancedQueueManager:
    """Advanced download queue manager with comprehensive automation features."""
    
    def __init__(self, config_path: str = "./config/config.yaml"):
        self.config = self._load_config(config_path)
        self.db_path = self.config.get('database', {}).get('path', './data/foliofox.db')
        self.api_base_url = f"http://{self.config.get('server', {}).get('host', 'localhost')}:{self.config.get('server', {}).get('port', 8080)}"
        
        # Advanced configuration
        self.max_concurrent_downloads = self.config.get('downloads', {}).get('max_concurrent', 3)
        self.bandwidth_limit_mbps = self.config.get('downloads', {}).get('bandwidth_limit_mbps', 50)
        self.smart_retry_enabled = self.config.get('downloads', {}).get('smart_retry', True)
        self.predictive_scheduling = self.config.get('downloads', {}).get('predictive_scheduling', True)
        self.auto_quality_adjustment = self.config.get('downloads', {}).get('auto_quality_adjustment', True)
        
        # Monitoring intervals
        self.health_check_interval = 30
        self.metrics_collection_interval = 60
        self.cleanup_interval = 3600  # 1 hour
        self.optimization_interval = 1800  # 30 minutes
        
        # State management
        self.active_downloads: Dict[int, asyncio.Task] = {}
        self.system_resources = SystemResource(0, 0, 0, 0, 0)
        self.bandwidth_monitor = BandwidthMonitor()
        self.running = False
        self.shutdown_event = asyncio.Event()
        
        # Thread pool for I/O operations
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Performance tracking
        self.performance_history: List[Dict] = []
        self.failure_patterns: Dict[str, List] = {}
        
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration with error handling and defaults."""
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
        """Return default configuration."""
        return {
            'database': {'path': './data/foliofox.db'},
            'server': {'host': 'localhost', 'port': 8080},
            'downloads': {
                'max_concurrent': 3,
                'bandwidth_limit_mbps': 50,
                'smart_retry': True,
                'predictive_scheduling': True,
                'auto_quality_adjustment': True,
                'timeout_seconds': 300,
                'chunk_size': 8192
            },
            'monitoring': {
                'enable_metrics': True,
                'enable_alerting': True,
                'resource_thresholds': {
                    'cpu_percent': 80,
                    'memory_percent': 85,
                    'disk_percent': 90
                }
            }
        }
    
    def get_database_connection(self) -> sqlite3.Connection:
        """Get database connection with proper configuration."""
        try:
            conn = sqlite3.connect(self.db_path, timeout=30.0)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA foreign_keys=ON")
            return conn
        except sqlite3.Error as e:
            logger.error(f"Database connection error: {e}")
            raise
    
    async def get_system_resources(self) -> SystemResource:
        """Get current system resource usage."""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            net_io = psutil.net_io_counters()
            
            # Approximate network usage
            network_io_mb = (net_io.bytes_sent + net_io.bytes_recv) / 1024 / 1024
            active_connections = len(psutil.net_connections())
            
            return SystemResource(
                cpu_percent=cpu_percent,
                memory_percent=memory.percent,
                disk_usage_percent=disk.percent,
                network_io_mb=network_io_mb,
                active_connections=active_connections
            )
        except Exception as e:
            logger.error(f"Error getting system resources: {e}")
            return SystemResource(0, 0, 0, 0, 0)
    
    def get_queue_metrics(self) -> QueueMetrics:
        """Get comprehensive queue metrics."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Basic status counts
                cursor.execute("""
                    SELECT status, COUNT(*) as count 
                    FROM download_queue 
                    GROUP BY status
                """)
                status_counts = dict(cursor.fetchall())
                
                # Total items
                cursor.execute("SELECT COUNT(*) FROM download_queue")
                total_items = cursor.fetchone()[0]
                
                # Average completion time (last 7 days)
                cursor.execute("""
                    SELECT AVG(
                        (julianday(completed_at) - julianday(started_at)) * 24 * 60 * 60
                    ) as avg_seconds
                    FROM download_queue 
                    WHERE status = 'completed'
                    AND completed_at > datetime('now', '-7 days')
                    AND started_at IS NOT NULL
                """)
                avg_completion_result = cursor.fetchone()[0]
                
                # Success rate (last 24 hours)
                cursor.execute("""
                    SELECT 
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
                    FROM download_queue 
                    WHERE updated_at > datetime('now', '-1 day')
                    AND status IN ('completed', 'failed')
                """)
                success_rate_result = cursor.fetchone()[0]
                
                # Throughput last hour
                cursor.execute("""
                    SELECT COUNT(*) FROM download_queue 
                    WHERE status = 'completed' 
                    AND completed_at > datetime('now', '-1 hour')
                """)
                throughput_last_hour = cursor.fetchone()[0]
                
                # Estimate completion time for pending items
                cursor.execute("""
                    SELECT COUNT(*) FROM download_queue 
                    WHERE status IN ('pending', 'downloading')
                """)
                pending_items = cursor.fetchone()[0]
                
                estimated_completion = None
                if avg_completion_result and pending_items > 0:
                    avg_time_seconds = avg_completion_result
                    total_time_needed = (pending_items / max(1, self.max_concurrent_downloads)) * avg_time_seconds
                    estimated_completion = datetime.now() + timedelta(seconds=total_time_needed)
                
                return QueueMetrics(
                    total_items=total_items,
                    pending=status_counts.get('pending', 0),
                    downloading=status_counts.get('downloading', 0),
                    completed=status_counts.get('completed', 0),
                    failed=status_counts.get('failed', 0),
                    cancelled=status_counts.get('cancelled', 0),
                    paused=status_counts.get('paused', 0),
                    avg_completion_time=avg_completion_result,
                    success_rate=success_rate_result or 0.0,
                    throughput_last_hour=throughput_last_hour,
                    bandwidth_usage_mbps=self.bandwidth_monitor.get_current_usage(),
                    estimated_completion_time=estimated_completion
                )
                
        except Exception as e:
            logger.error(f"Error getting queue metrics: {e}")
            return QueueMetrics(0, 0, 0, 0, 0, 0, 0, None, 0.0, 0, 0.0, None)
    
    def get_pending_downloads(self, limit: int = None) -> List[DownloadTask]:
        """Get pending downloads with intelligent prioritization."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Smart ordering based on priority, age, and predicted success
                query = """
                    SELECT dq.*, u.username, i.name as indexer_name
                    FROM download_queue dq
                    JOIN users u ON dq.user_id = u.id
                    JOIN indexers i ON dq.indexer_id = i.id
                    WHERE dq.status = 'pending'
                    ORDER BY 
                        dq.priority ASC,
                        CASE WHEN dq.retry_count = 0 THEN 0 ELSE 1 END ASC,
                        dq.created_at ASC
                """
                
                if limit:
                    query += f" LIMIT {limit}"
                
                cursor.execute(query)
                rows = cursor.fetchall()
                
                downloads = []
                for row in rows:
                    downloads.append(self._row_to_download_task(row))
                
                return downloads
                
        except Exception as e:
            logger.error(f"Error getting pending downloads: {e}")
            return []
    
    def get_stale_downloads(self, threshold_minutes: int = 60) -> List[DownloadTask]:
        """Find downloads stuck in downloading state."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM download_queue 
                    WHERE status = 'downloading' 
                    AND updated_at < datetime('now', '-{} minutes')
                """.format(threshold_minutes))
                
                rows = cursor.fetchall()
                return [self._row_to_download_task(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Error finding stale downloads: {e}")
            return []
    
    def get_failed_downloads_for_retry(self) -> List[DownloadTask]:
        """Get failed downloads eligible for retry with smart logic."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Consider retry cooldown and failure patterns
                cursor.execute("""
                    SELECT * FROM download_queue 
                    WHERE status = 'failed' 
                    AND retry_count < max_retries
                    AND updated_at < datetime('now', '-300 seconds')
                    ORDER BY 
                        (retry_count * 300) ASC,  -- Longer wait for more retries
                        priority ASC,
                        updated_at ASC
                    LIMIT 10
                """)
                
                rows = cursor.fetchall()
                downloads = [self._row_to_download_task(row) for row in rows]
                
                # Filter based on failure pattern analysis
                if self.smart_retry_enabled:
                    downloads = self._filter_smart_retry(downloads)
                
                return downloads
                
        except Exception as e:
            logger.error(f"Error getting failed downloads for retry: {e}")
            return []
    
    def _filter_smart_retry(self, downloads: List[DownloadTask]) -> List[DownloadTask]:
        """Filter downloads based on failure pattern analysis."""
        filtered = []
        
        for download in downloads:
            # Check if this indexer has been consistently failing
            pattern_key = f"indexer_{download.indexer_id}"
            
            if pattern_key in self.failure_patterns:
                recent_failures = [
                    f for f in self.failure_patterns[pattern_key]
                    if f['timestamp'] > datetime.now() - timedelta(hours=1)
                ]
                
                # Skip if too many recent failures from this indexer
                if len(recent_failures) > 5:
                    logger.info(f"Skipping retry for download {download.id} due to indexer failure pattern")
                    continue
            
            # Check error message patterns
            if download.error_message:
                if any(pattern in download.error_message.lower() for pattern in 
                       ['404', 'not found', 'removed', 'deleted', 'unavailable']):
                    logger.info(f"Skipping retry for download {download.id} due to permanent error")
                    continue
            
            filtered.append(download)
        
        return filtered
    
    async def start_download(self, download: DownloadTask) -> bool:
        """Start a download with comprehensive error handling."""
        try:
            # Update status to downloading
            await self._update_download_status(download.id, QueueStatus.DOWNLOADING)
            
            # Create download task
            task = asyncio.create_task(self._download_file(download))
            self.active_downloads[download.id] = task
            
            logger.info(f"Started download: {download.title} (ID: {download.id})")
            return True
            
        except Exception as e:
            logger.error(f"Error starting download {download.id}: {e}")
            await self._update_download_status(download.id, QueueStatus.FAILED, str(e))
            return False
    
    async def _download_file(self, download: DownloadTask):
        """Core download implementation with progress tracking."""
        start_time = datetime.now()
        temp_path = None
        
        try:
            # Determine download path
            download_dir = Path(self.config.get('downloads', {}).get('path', './downloads'))
            download_dir.mkdir(parents=True, exist_ok=True)
            
            # Create temporary file
            temp_path = download_dir / f"temp_{download.id}_{int(time.time())}.{download.file_format}"
            final_path = download_dir / f"{self._sanitize_filename(download.title)}.{download.file_format}"
            
            # Download with progress tracking
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=300)) as session:
                async with session.get(download.download_url) as response:
                    if response.status != 200:
                        raise Exception(f"HTTP {response.status}: {response.reason}")
                    
                    total_size = int(response.headers.get('content-length', 0))
                    downloaded = 0
                    
                    async with aiofiles.open(temp_path, 'wb') as f:
                        async for chunk in response.content.iter_chunked(8192):
                            await f.write(chunk)
                            downloaded += len(chunk)
                            
                            # Update progress
                            if total_size > 0:
                                progress = int((downloaded / total_size) * 100)
                                await self._update_download_progress(download.id, progress)
                            
                            # Check bandwidth limits
                            await self.bandwidth_monitor.throttle_if_needed()
                            
                            # Check for cancellation
                            if self.shutdown_event.is_set():
                                raise asyncio.CancelledError("Shutdown requested")
            
            # Verify file integrity
            if total_size > 0 and downloaded != total_size:
                raise Exception(f"File size mismatch: expected {total_size}, got {downloaded}")
            
            # Move to final location
            shutil.move(str(temp_path), str(final_path))
            
            # Update database
            completion_time = datetime.now()
            duration = (completion_time - start_time).total_seconds()
            
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE download_queue 
                    SET status = 'completed',
                        progress_percentage = 100,
                        download_path = ?,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ?
                """, (str(final_path), completion_time.isoformat(), completion_time.isoformat(), download.id))
                
                # Insert into history
                cursor.execute("""
                    INSERT INTO download_history 
                    (queue_id, user_id, book_id, indexer_id, title, author_name, 
                     file_format, file_size_bytes, download_duration_seconds, 
                     final_status, download_path, completed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)
                """, (
                    download.id, download.user_id, download.book_id, download.indexer_id,
                    download.title, download.author_name, download.file_format,
                    downloaded, duration, str(final_path), completion_time.isoformat()
                ))
                
                conn.commit()
            
            logger.info(f"Download completed: {download.title} (ID: {download.id}, Duration: {duration:.1f}s)")
            
        except asyncio.CancelledError:
            logger.info(f"Download cancelled: {download.title} (ID: {download.id})")
            await self._update_download_status(download.id, QueueStatus.CANCELLED)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Download failed: {download.title} (ID: {download.id}) - {error_msg}")
            
            # Record failure pattern
            self._record_failure_pattern(download.indexer_id, error_msg)
            
            # Determine if retry is warranted
            if download.retry_count < download.max_retries:
                await self._update_download_status(download.id, QueueStatus.FAILED, error_msg, increment_retry=True)
            else:
                await self._update_download_status(download.id, QueueStatus.FAILED, error_msg)
            
        finally:
            # Cleanup temporary file
            if temp_path and temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception as e:
                    logger.warning(f"Failed to cleanup temp file {temp_path}: {e}")
            
            # Remove from active downloads
            if download.id in self.active_downloads:
                del self.active_downloads[download.id]
    
    def _record_failure_pattern(self, indexer_id: int, error_message: str):
        """Record failure patterns for smart retry logic."""
        pattern_key = f"indexer_{indexer_id}"
        
        if pattern_key not in self.failure_patterns:
            self.failure_patterns[pattern_key] = []
        
        self.failure_patterns[pattern_key].append({
            'timestamp': datetime.now(),
            'error': error_message
        })
        
        # Keep only recent failures (last 24 hours)
        cutoff = datetime.now() - timedelta(hours=24)
        self.failure_patterns[pattern_key] = [
            f for f in self.failure_patterns[pattern_key]
            if f['timestamp'] > cutoff
        ]
    
    async def _update_download_status(self, download_id: int, status: QueueStatus, 
                                     error_message: str = None, increment_retry: bool = False):
        """Update download status in database."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                if increment_retry:
                    cursor.execute("""
                        UPDATE download_queue 
                        SET status = ?, error_message = ?, retry_count = retry_count + 1, updated_at = ?
                        WHERE id = ?
                    """, (status.value, error_message, datetime.now().isoformat(), download_id))
                else:
                    update_fields = ["status = ?", "updated_at = ?"]
                    params = [status.value, datetime.now().isoformat()]
                    
                    if error_message is not None:
                        update_fields.append("error_message = ?")
                        params.append(error_message)
                    
                    if status == QueueStatus.DOWNLOADING:
                        update_fields.append("started_at = ?")
                        params.append(datetime.now().isoformat())
                    
                    params.append(download_id)
                    
                    cursor.execute(f"""
                        UPDATE download_queue 
                        SET {', '.join(update_fields)}
                        WHERE id = ?
                    """, params)
                
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error updating download status: {e}")
    
    async def _update_download_progress(self, download_id: int, progress: int):
        """Update download progress."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE download_queue 
                    SET progress_percentage = ?, updated_at = ?
                    WHERE id = ?
                """, (progress, datetime.now().isoformat(), download_id))
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error updating download progress: {e}")
    
    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for filesystem compatibility."""
        import re
        # Remove invalid characters
        filename = re.sub(r'[<>:"/\\|?*]', '', filename)
        # Limit length
        if len(filename) > 200:
            filename = filename[:200]
        return filename.strip()
    
    def _row_to_download_task(self, row: sqlite3.Row) -> DownloadTask:
        """Convert database row to DownloadTask object."""
        return DownloadTask(
            id=row['id'],
            user_id=row['user_id'],
            book_id=row['book_id'],
            indexer_id=row['indexer_id'],
            title=row['title'],
            author_name=row['author_name'],
            download_url=row['download_url'],
            file_format=row['file_format'],
            file_size_bytes=row['file_size_bytes'],
            priority=row['priority'],
            status=QueueStatus(row['status']),
            progress_percentage=row['progress_percentage'],
            download_path=row['download_path'],
            quality_profile_id=row['quality_profile_id'],
            retry_count=row['retry_count'],
            max_retries=row['max_retries'],
            error_message=row['error_message'],
            estimated_completion=datetime.fromisoformat(row['estimated_completion']) if row['estimated_completion'] else None,
            started_at=datetime.fromisoformat(row['started_at']) if row['started_at'] else None,
            completed_at=datetime.fromisoformat(row['completed_at']) if row['completed_at'] else None,
            created_at=datetime.fromisoformat(row['created_at']),
            updated_at=datetime.fromisoformat(row['updated_at'])
        )
    
    async def process_download_queue(self):
        """Main download queue processing loop."""
        logger.info("Starting download queue processing")
        
        while self.running and not self.shutdown_event.is_set():
            try:
                # Get system resources
                self.system_resources = await self.get_system_resources()
                
                # Check if system resources allow more downloads
                if self._should_throttle_downloads():
                    logger.info("Throttling downloads due to system resources")
                    await asyncio.sleep(30)
                    continue
                
                # Get available download slots
                available_slots = self.max_concurrent_downloads - len(self.active_downloads)
                
                if available_slots > 0:
                    # Get pending downloads
                    pending_downloads = self.get_pending_downloads(limit=available_slots)
                    
                    # Start new downloads
                    for download in pending_downloads:
                        if available_slots > 0:
                            await self.start_download(download)
                            available_slots -= 1
                        else:
                            break
                
                # Process retries
                failed_downloads = self.get_failed_downloads_for_retry()
                for download in failed_downloads[:available_slots]:
                    await self.start_download(download)
                
                # Handle stale downloads
                stale_downloads = self.get_stale_downloads()
                for download in stale_downloads:
                    logger.warning(f"Resetting stale download: {download.title} (ID: {download.id})")
                    await self._update_download_status(download.id, QueueStatus.PENDING)
                    
                    # Cancel the task if it exists
                    if download.id in self.active_downloads:
                        self.active_downloads[download.id].cancel()
                        del self.active_downloads[download.id]
                
                # Wait before next iteration
                await asyncio.sleep(10)
                
            except Exception as e:
                logger.error(f"Error in download queue processing: {e}")
                await asyncio.sleep(30)
    
    def _should_throttle_downloads(self) -> bool:
        """Check if downloads should be throttled based on system resources."""
        thresholds = self.config.get('monitoring', {}).get('resource_thresholds', {})
        
        if self.system_resources.cpu_percent > thresholds.get('cpu_percent', 80):
            return True
        
        if self.system_resources.memory_percent > thresholds.get('memory_percent', 85):
            return True
        
        if self.system_resources.disk_usage_percent > thresholds.get('disk_percent', 90):
            return True
        
        return False
    
    async def cleanup_old_downloads(self, days_old: int = 30):
        """Clean up old completed/cancelled downloads."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Clean up completed downloads
                cursor.execute("""
                    DELETE FROM download_queue 
                    WHERE status = 'completed' 
                    AND completed_at < datetime('now', '-{} days')
                """.format(days_old))
                
                completed_deleted = cursor.rowcount
                
                # Clean up cancelled downloads (shorter retention)
                cursor.execute("""
                    DELETE FROM download_queue 
                    WHERE status = 'cancelled' 
                    AND updated_at < datetime('now', '-7 days')
                """)
                
                cancelled_deleted = cursor.rowcount
                
                # Clean up failed downloads that exceeded max retries
                cursor.execute("""
                    DELETE FROM download_queue 
                    WHERE status = 'failed' 
                    AND retry_count >= max_retries
                    AND updated_at < datetime('now', '-3 days')
                """)
                
                failed_deleted = cursor.rowcount
                
                conn.commit()
                
                total_deleted = completed_deleted + cancelled_deleted + failed_deleted
                if total_deleted > 0:
                    logger.info(f"Cleaned up {total_deleted} old downloads "
                               f"(completed: {completed_deleted}, cancelled: {cancelled_deleted}, failed: {failed_deleted})")
                
        except Exception as e:
            logger.error(f"Error cleaning up old downloads: {e}")
    
    async def optimize_queue_priorities(self):
        """Optimize queue priorities based on various factors."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                updated_count = 0
                
                # Boost priority for downloads waiting too long
                cursor.execute("""
                    UPDATE download_queue 
                    SET priority = CASE 
                        WHEN priority > 1 THEN priority - 1 
                        ELSE 1 
                    END,
                    updated_at = datetime('now')
                    WHERE status = 'pending' 
                    AND created_at < datetime('now', '-2 hours')
                    AND priority > 1
                """)
                
                updated_count += cursor.rowcount
                
                # Lower priority for repeatedly failed downloads
                cursor.execute("""
                    UPDATE download_queue 
                    SET priority = CASE 
                        WHEN priority < 10 THEN priority + 1 
                        ELSE 10 
                    END,
                    updated_at = datetime('now')
                    WHERE status = 'failed' 
                    AND retry_count >= 2
                    AND priority < 10
                """)
                
                updated_count += cursor.rowcount
                
                # Prioritize smaller files during high load
                if len(self.active_downloads) >= self.max_concurrent_downloads * 0.8:
                    cursor.execute("""
                        UPDATE download_queue 
                        SET priority = CASE 
                            WHEN priority > 1 THEN priority - 1 
                            ELSE 1 
                        END,
                        updated_at = datetime('now')
                        WHERE status = 'pending' 
                        AND file_size_bytes IS NOT NULL
                        AND file_size_bytes < 10000000  -- 10MB
                        AND priority > 1
                    """)
                    
                    updated_count += cursor.rowcount
                
                conn.commit()
                
                if updated_count > 0:
                    logger.info(f"Optimized priorities for {updated_count} downloads")
                
        except Exception as e:
            logger.error(f"Error optimizing queue priorities: {e}")
    
    async def generate_comprehensive_report(self) -> Dict:
        """Generate comprehensive queue report with analytics."""
        try:
            metrics = self.get_queue_metrics()
            
            # Performance analytics
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Download trends (last 7 days)
                cursor.execute("""
                    SELECT 
                        DATE(completed_at) as date,
                        COUNT(*) as completed,
                        AVG(download_duration_seconds) as avg_duration,
                        SUM(file_size_bytes) as total_bytes
                    FROM download_history 
                    WHERE completed_at > datetime('now', '-7 days')
                    AND final_status = 'completed'
                    GROUP BY DATE(completed_at)
                    ORDER BY date DESC
                """)
                
                trends = [dict(row) for row in cursor.fetchall()]
                
                # Indexer performance
                cursor.execute("""
                    SELECT 
                        i.name as indexer_name,
                        COUNT(*) as total_downloads,
                        SUM(CASE WHEN dh.final_status = 'completed' THEN 1 ELSE 0 END) as successful,
                        AVG(dh.download_duration_seconds) as avg_duration
                    FROM download_history dh
                    JOIN indexers i ON dh.indexer_id = i.id
                    WHERE dh.completed_at > datetime('now', '-7 days')
                    GROUP BY i.id, i.name
                    ORDER BY successful DESC
                """)
                
                indexer_performance = [dict(row) for row in cursor.fetchall()]
                
                # Error analysis
                cursor.execute("""
                    SELECT 
                        error_message,
                        COUNT(*) as count
                    FROM download_history 
                    WHERE final_status = 'failed'
                    AND completed_at > datetime('now', '-7 days')
                    AND error_message IS NOT NULL
                    GROUP BY error_message
                    ORDER BY count DESC
                    LIMIT 10
                """)
                
                error_analysis = [dict(row) for row in cursor.fetchall()]
            
            report = {
                "timestamp": datetime.now().isoformat(),
                "metrics": asdict(metrics),
                "system_resources": asdict(self.system_resources),
                "active_downloads": len(self.active_downloads),
                "analytics": {
                    "daily_trends": trends,
                    "indexer_performance": indexer_performance,
                    "error_analysis": error_analysis
                },
                "configuration": {
                    "max_concurrent_downloads": self.max_concurrent_downloads,
                    "bandwidth_limit_mbps": self.bandwidth_limit_mbps,
                    "smart_retry_enabled": self.smart_retry_enabled
                }
            }
            
            return report
            
        except Exception as e:
            logger.error(f"Error generating comprehensive report: {e}")
            return {"error": str(e), "timestamp": datetime.now().isoformat()}
    
    async def run_maintenance_cycle(self):
        """Run comprehensive maintenance cycle."""
        logger.info("Starting comprehensive maintenance cycle")
        
        maintenance_results = {
            "timestamp": datetime.now().isoformat(),
            "actions_taken": []
        }
        
        try:
            # Clean up old downloads
            await self.cleanup_old_downloads()
            maintenance_results["actions_taken"].append("Cleaned up old downloads")
            
            # Optimize priorities
            await self.optimize_queue_priorities()
            maintenance_results["actions_taken"].append("Optimized queue priorities")
            
            # Update statistics
            await self._update_statistics()
            maintenance_results["actions_taken"].append("Updated statistics")
            
            # Database maintenance
            await self._vacuum_database()
            maintenance_results["actions_taken"].append("Performed database vacuum")
            
            logger.info(f"Maintenance cycle completed. {len(maintenance_results['actions_taken'])} actions taken")
            
        except Exception as e:
            logger.error(f"Error during maintenance cycle: {e}")
            maintenance_results["error"] = str(e)
        
        return maintenance_results
    
    async def _update_statistics(self):
        """Update download statistics."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Update daily statistics
                cursor.execute("""
                    INSERT OR REPLACE INTO download_stats 
                    (user_id, indexer_id, date_recorded, total_downloads, 
                     successful_downloads, failed_downloads, total_bytes_downloaded)
                    SELECT 
                        user_id,
                        indexer_id,
                        DATE('now') as date_recorded,
                        COUNT(*) as total_downloads,
                        SUM(CASE WHEN final_status = 'completed' THEN 1 ELSE 0 END) as successful,
                        SUM(CASE WHEN final_status = 'failed' THEN 1 ELSE 0 END) as failed,
                        SUM(COALESCE(file_size_bytes, 0)) as total_bytes
                    FROM download_history 
                    WHERE DATE(completed_at) = DATE('now')
                    GROUP BY user_id, indexer_id
                """)
                
                conn.commit()
                logger.info("Statistics updated successfully")
                
        except Exception as e:
            logger.error(f"Error updating statistics: {e}")
    
    async def _vacuum_database(self):
        """Perform database vacuum for optimization."""
        try:
            with self.get_database_connection() as conn:
                conn.execute("VACUUM")
                conn.execute("ANALYZE")
                logger.info("Database vacuum completed")
                
        except Exception as e:
            logger.error(f"Error during database vacuum: {e}")
    
    def setup_signal_handlers(self):
        """Setup signal handlers for graceful shutdown."""
        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}, initiating graceful shutdown")
            self.shutdown()
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    def shutdown(self):
        """Graceful shutdown of the queue manager."""
        logger.info("Shutting down Advanced Queue Manager")
        self.running = False
        self.shutdown_event.set()
        
        # Cancel all active downloads
        for download_id, task in self.active_downloads.items():
            logger.info(f"Cancelling active download: {download_id}")
            task.cancel()
        
        # Shutdown executor
        self.executor.shutdown(wait=True)
    
    async def run(self):
        """Main run loop for the queue manager."""
        self.running = True
        self.setup_signal_handlers()
        
        logger.info("Advanced Queue Manager starting up")
        
        tasks = [
            asyncio.create_task(self.process_download_queue()),
            asyncio.create_task(self._periodic_maintenance()),
            asyncio.create_task(self._periodic_metrics_collection())
        ]
        
        try:
            await asyncio.gather(*tasks)
        except Exception as e:
            logger.error(f"Error in main run loop: {e}")
        finally:
            self.shutdown()
    
    async def _periodic_maintenance(self):
        """Periodic maintenance tasks."""
        while self.running and not self.shutdown_event.is_set():
            try:
                await asyncio.sleep(self.cleanup_interval)
                if not self.shutdown_event.is_set():
                    await self.run_maintenance_cycle()
            except Exception as e:
                logger.error(f"Error in periodic maintenance: {e}")
    
    async def _periodic_metrics_collection(self):
        """Periodic metrics collection."""
        while self.running and not self.shutdown_event.is_set():
            try:
                await asyncio.sleep(self.metrics_collection_interval)
                if not self.shutdown_event.is_set():
                    metrics = self.get_queue_metrics()
                    self.performance_history.append({
                        "timestamp": datetime.now().isoformat(),
                        "metrics": asdict(metrics)
                    })
                    
                    # Keep only last 24 hours of metrics
                    cutoff = datetime.now() - timedelta(hours=24)
                    self.performance_history = [
                        m for m in self.performance_history
                        if datetime.fromisoformat(m["timestamp"]) > cutoff
                    ]
                    
            except Exception as e:
                logger.error(f"Error in metrics collection: {e}")


class BandwidthMonitor:
    """Monitor and control bandwidth usage for downloads."""
    
    def __init__(self):
        self.current_usage = 0.0
        self.last_check = time.time()
        self.bytes_transferred = 0
    
    def get_current_usage(self) -> float:
        """Get current bandwidth usage in Mbps."""
        return self.current_usage
    
    async def throttle_if_needed(self):
        """Throttle if bandwidth limit is exceeded."""
        # This is a simplified implementation
        # In a real scenario, you'd implement proper bandwidth monitoring
        pass


def main():
    parser = argparse.ArgumentParser(description='FolioFox Advanced Download Queue Manager')
    parser.add_argument('--config', default='./config/config.yaml', help='Configuration file path')
    parser.add_argument('--mode', choices=['run', 'report', 'maintenance', 'metrics'], default='run',
                       help='Operation mode')
    parser.add_argument('--daemon', action='store_true', help='Run as daemon')
    
    args = parser.parse_args()
    
    manager = AdvancedQueueManager(args.config)
    
    if args.mode == 'report':
        # Generate and print comprehensive report
        report = asyncio.run(manager.generate_comprehensive_report())
        print(json.dumps(report, indent=2, default=str))
    elif args.mode == 'maintenance':
        # Run maintenance cycle
        results = asyncio.run(manager.run_maintenance_cycle())
        print(json.dumps(results, indent=2, default=str))
    elif args.mode == 'metrics':
        # Show current metrics
        metrics = manager.get_queue_metrics()
        print(json.dumps(asdict(metrics), indent=2, default=str))
    else:
        # Run main loop
        if args.daemon:
            # Daemon mode implementation would go here
            # For now, just run normally
            pass
        
        try:
            asyncio.run(manager.run())
        except KeyboardInterrupt:
            logger.info("Advanced Queue Manager stopped by user")
            sys.exit(0)


if __name__ == "__main__":
    main()