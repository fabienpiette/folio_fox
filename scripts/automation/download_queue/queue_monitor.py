#!/usr/bin/env python3
"""
FolioFox Download Queue Monitor
Provides automated monitoring, retry logic, and queue optimization for downloads.
"""

import argparse
import asyncio
import json
import logging
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import aiohttp
import requests
from dataclasses import dataclass
from enum import Enum

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/foliofox/queue_monitor.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('foliofox.queue_monitor')

class DownloadStatus(Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"

@dataclass
class DownloadItem:
    id: int
    user_id: int
    title: str
    author_name: Optional[str]
    download_url: str
    file_format: str
    status: DownloadStatus
    retry_count: int
    max_retries: int
    priority: int
    created_at: datetime
    updated_at: datetime
    error_message: Optional[str] = None
    download_path: Optional[str] = None

@dataclass
class QueueStats:
    total_items: int
    pending: int
    downloading: int
    completed: int
    failed: int
    cancelled: int
    paused: int
    avg_completion_time: Optional[float]
    success_rate: float

class QueueMonitor:
    """Main class for monitoring and managing the download queue."""
    
    def __init__(self, config_path: str = "./config/config.yaml"):
        self.config = self._load_config(config_path)
        self.db_path = self.config.get('database', {}).get('path', './data/foliofox.db')
        self.api_base_url = f"http://{self.config.get('server', {}).get('host', 'localhost')}:{self.config.get('server', {}).get('port', 8080)}"
        
        # Configuration parameters
        self.check_interval = 30  # seconds
        self.stale_download_threshold = 3600  # 1 hour in seconds
        self.max_retry_attempts = self.config.get('downloads', {}).get('retry_count', 3)
        self.queue_size_alert_threshold = 100
        self.failed_download_alert_threshold = 10
        
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration from YAML file."""
        try:
            import yaml
            with open(config_path, 'r') as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            logger.warning(f"Config file {config_path} not found, using defaults")
            return {}
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return {}
    
    def get_database_connection(self) -> sqlite3.Connection:
        """Get database connection with proper error handling."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            return conn
        except sqlite3.Error as e:
            logger.error(f"Database connection error: {e}")
            raise
    
    def get_queue_stats(self) -> QueueStats:
        """Get comprehensive statistics about the download queue."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Get status counts
                cursor.execute("""
                    SELECT status, COUNT(*) as count 
                    FROM download_queue 
                    GROUP BY status
                """)
                status_counts = dict(cursor.fetchall())
                
                # Get total items
                cursor.execute("SELECT COUNT(*) FROM download_queue")
                total_items = cursor.fetchone()[0]
                
                # Calculate average completion time for successful downloads
                cursor.execute("""
                    SELECT AVG(
                        (julianday(updated_at) - julianday(created_at)) * 24 * 60
                    ) as avg_minutes
                    FROM download_queue 
                    WHERE status = 'completed'
                    AND updated_at > datetime('now', '-7 days')
                """)
                avg_completion_result = cursor.fetchone()[0]
                avg_completion_time = avg_completion_result * 60 if avg_completion_result else None  # Convert to seconds
                
                # Calculate success rate (last 24 hours)
                cursor.execute("""
                    SELECT 
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
                    FROM download_queue 
                    WHERE updated_at > datetime('now', '-1 day')
                """)
                success_rate_result = cursor.fetchone()[0]
                success_rate = success_rate_result if success_rate_result else 0.0
                
                return QueueStats(
                    total_items=total_items,
                    pending=status_counts.get('pending', 0),
                    downloading=status_counts.get('downloading', 0),
                    completed=status_counts.get('completed', 0),
                    failed=status_counts.get('failed', 0),
                    cancelled=status_counts.get('cancelled', 0),
                    paused=status_counts.get('paused', 0),
                    avg_completion_time=avg_completion_time,
                    success_rate=success_rate
                )
        except Exception as e:
            logger.error(f"Error getting queue stats: {e}")
            raise
    
    def get_stale_downloads(self) -> List[DownloadItem]:
        """Find downloads that have been in 'downloading' state for too long."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM download_queue 
                    WHERE status = 'downloading' 
                    AND updated_at < datetime('now', '-{} seconds')
                """.format(self.stale_download_threshold))
                
                rows = cursor.fetchall()
                return [self._row_to_download_item(row) for row in rows]
        except Exception as e:
            logger.error(f"Error finding stale downloads: {e}")
            return []
    
    def get_failed_downloads_for_retry(self) -> List[DownloadItem]:
        """Find failed downloads that can be retried."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM download_queue 
                    WHERE status = 'failed' 
                    AND retry_count < max_retries
                    AND updated_at < datetime('now', '-300 seconds')
                    ORDER BY priority ASC, updated_at ASC
                    LIMIT 10
                """)
                
                rows = cursor.fetchall()
                return [self._row_to_download_item(row) for row in rows]
        except Exception as e:
            logger.error(f"Error finding downloads for retry: {e}")
            return []
    
    def get_queue_health_issues(self) -> List[str]:
        """Identify potential health issues with the queue."""
        issues = []
        stats = self.get_queue_stats()
        
        # Check for large queue backlog
        if stats.pending > self.queue_size_alert_threshold:
            issues.append(f"Large queue backlog: {stats.pending} pending downloads")
        
        # Check for high failure rate
        if stats.success_rate < 80.0:
            issues.append(f"Low success rate: {stats.success_rate:.1f}%")
        
        # Check for too many failed downloads
        if stats.failed > self.failed_download_alert_threshold:
            issues.append(f"High number of failed downloads: {stats.failed}")
        
        # Check for stale downloads
        stale_downloads = self.get_stale_downloads()
        if stale_downloads:
            issues.append(f"Found {len(stale_downloads)} stale downloads")
        
        return issues
    
    def retry_failed_download(self, download_id: int) -> bool:
        """Retry a specific failed download."""
        try:
            response = requests.post(
                f"{self.api_base_url}/api/downloads/{download_id}/retry",
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully retried download {download_id}")
                return True
            else:
                logger.error(f"Failed to retry download {download_id}: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Error retrying download {download_id}: {e}")
            return False
    
    def cancel_stale_download(self, download_id: int) -> bool:
        """Cancel a stale download that's been stuck."""
        try:
            response = requests.post(
                f"{self.api_base_url}/api/downloads/{download_id}/cancel",
                json={"delete_partial": True},
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully cancelled stale download {download_id}")
                return True
            else:
                logger.error(f"Failed to cancel download {download_id}: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Error cancelling download {download_id}: {e}")
            return False
    
    def cleanup_old_completed_downloads(self, days_old: int = 30) -> int:
        """Clean up old completed downloads from the queue table."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    DELETE FROM download_queue 
                    WHERE status = 'completed' 
                    AND updated_at < datetime('now', '-{} days')
                """.format(days_old))
                
                deleted_count = cursor.rowcount
                conn.commit()
                
                if deleted_count > 0:
                    logger.info(f"Cleaned up {deleted_count} old completed downloads")
                
                return deleted_count
        except Exception as e:
            logger.error(f"Error cleaning up old downloads: {e}")
            return 0
    
    def optimize_queue_priorities(self) -> int:
        """Optimize queue priorities based on various factors."""
        try:
            updated_count = 0
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Boost priority for downloads that have been pending for a while
                cursor.execute("""
                    UPDATE download_queue 
                    SET priority = CASE 
                        WHEN priority > 1 THEN priority - 1 
                        ELSE 1 
                    END,
                    updated_at = datetime('now')
                    WHERE status = 'pending' 
                    AND created_at < datetime('now', '-1 hour')
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
                conn.commit()
                
                if updated_count > 0:
                    logger.info(f"Optimized priorities for {updated_count} downloads")
                
                return updated_count
        except Exception as e:
            logger.error(f"Error optimizing queue priorities: {e}")
            return 0
    
    def generate_report(self) -> Dict:
        """Generate a comprehensive queue status report."""
        stats = self.get_queue_stats()
        stale_downloads = self.get_stale_downloads()
        failed_for_retry = self.get_failed_downloads_for_retry()
        health_issues = self.get_queue_health_issues()
        
        report = {
            "timestamp": datetime.now().isoformat(),
            "statistics": {
                "total_items": stats.total_items,
                "by_status": {
                    "pending": stats.pending,
                    "downloading": stats.downloading,
                    "completed": stats.completed,
                    "failed": stats.failed,
                    "cancelled": stats.cancelled,
                    "paused": stats.paused
                },
                "performance": {
                    "success_rate_percent": round(stats.success_rate, 2),
                    "avg_completion_time_seconds": stats.avg_completion_time
                }
            },
            "issues": {
                "stale_downloads": len(stale_downloads),
                "failed_ready_for_retry": len(failed_for_retry),
                "health_issues": health_issues
            },
            "recommendations": []
        }
        
        # Add recommendations based on findings
        if stale_downloads:
            report["recommendations"].append("Cancel or restart stale downloads")
        
        if failed_for_retry:
            report["recommendations"].append("Retry failed downloads that haven't exceeded max attempts")
        
        if stats.pending > 50:
            report["recommendations"].append("Consider increasing concurrent download limit")
        
        if stats.success_rate < 85:
            report["recommendations"].append("Investigate indexer health and network connectivity")
        
        return report
    
    def run_maintenance_cycle(self) -> Dict:
        """Run a complete maintenance cycle on the download queue."""
        logger.info("Starting download queue maintenance cycle")
        
        maintenance_results = {
            "timestamp": datetime.now().isoformat(),
            "actions_taken": []
        }
        
        try:
            # 1. Handle stale downloads
            stale_downloads = self.get_stale_downloads()
            for download in stale_downloads:
                if self.cancel_stale_download(download.id):
                    maintenance_results["actions_taken"].append(
                        f"Cancelled stale download: {download.title} (ID: {download.id})"
                    )
            
            # 2. Retry failed downloads
            failed_downloads = self.get_failed_downloads_for_retry()
            for download in failed_downloads:
                if self.retry_failed_download(download.id):
                    maintenance_results["actions_taken"].append(
                        f"Retried failed download: {download.title} (ID: {download.id})"
                    )
            
            # 3. Optimize priorities
            priority_updates = self.optimize_queue_priorities()
            if priority_updates > 0:
                maintenance_results["actions_taken"].append(
                    f"Optimized priorities for {priority_updates} downloads"
                )
            
            # 4. Clean up old completed downloads
            cleaned_up = self.cleanup_old_completed_downloads()
            if cleaned_up > 0:
                maintenance_results["actions_taken"].append(
                    f"Cleaned up {cleaned_up} old completed downloads"
                )
            
            logger.info(f"Maintenance cycle completed. {len(maintenance_results['actions_taken'])} actions taken.")
            
        except Exception as e:
            logger.error(f"Error during maintenance cycle: {e}")
            maintenance_results["error"] = str(e)
        
        return maintenance_results
    
    async def monitor_loop(self):
        """Main monitoring loop."""
        logger.info("Starting download queue monitoring loop")
        
        while True:
            try:
                # Generate status report
                report = self.generate_report()
                
                # Log important metrics
                stats = report["statistics"]
                logger.info(
                    f"Queue Status - Pending: {stats['by_status']['pending']}, "
                    f"Downloading: {stats['by_status']['downloading']}, "
                    f"Failed: {stats['by_status']['failed']}, "
                    f"Success Rate: {stats['performance']['success_rate_percent']}%"
                )
                
                # Check for critical issues
                if report["issues"]["health_issues"]:
                    logger.warning(f"Health issues detected: {', '.join(report['issues']['health_issues'])}")
                
                # Run maintenance if needed
                if (report["issues"]["stale_downloads"] > 0 or 
                    report["issues"]["failed_ready_for_retry"] > 0):
                    self.run_maintenance_cycle()
                
                # Save report to file
                report_path = Path(f"/var/log/foliofox/queue_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
                report_path.parent.mkdir(parents=True, exist_ok=True)
                with open(report_path, 'w') as f:
                    json.dump(report, f, indent=2)
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
            
            # Wait for next check
            await asyncio.sleep(self.check_interval)
    
    def _row_to_download_item(self, row: sqlite3.Row) -> DownloadItem:
        """Convert database row to DownloadItem object."""
        return DownloadItem(
            id=row['id'],
            user_id=row['user_id'],
            title=row['title'],
            author_name=row['author_name'],
            download_url=row['download_url'],
            file_format=row['file_format'],
            status=DownloadStatus(row['status']),
            retry_count=row['retry_count'],
            max_retries=row['max_retries'],
            priority=row['priority'],
            created_at=datetime.fromisoformat(row['created_at']),
            updated_at=datetime.fromisoformat(row['updated_at']),
            error_message=row.get('error_message'),
            download_path=row.get('download_path')
        )

def main():
    parser = argparse.ArgumentParser(description='FolioFox Download Queue Monitor')
    parser.add_argument('--config', default='./config/config.yaml', help='Configuration file path')
    parser.add_argument('--mode', choices=['monitor', 'report', 'maintenance'], default='monitor',
                       help='Operation mode')
    parser.add_argument('--daemon', action='store_true', help='Run as daemon')
    parser.add_argument('--interval', type=int, default=30, help='Check interval in seconds')
    
    args = parser.parse_args()
    
    monitor = QueueMonitor(args.config)
    monitor.check_interval = args.interval
    
    if args.mode == 'report':
        # Generate and print report
        report = monitor.generate_report()
        print(json.dumps(report, indent=2))
    elif args.mode == 'maintenance':
        # Run maintenance cycle
        results = monitor.run_maintenance_cycle()
        print(json.dumps(results, indent=2))
    else:
        # Run monitoring loop
        if args.daemon:
            # Daemon mode - redirect output to log files
            import daemon
            with daemon.DaemonContext():
                asyncio.run(monitor.monitor_loop())
        else:
            # Interactive mode
            try:
                asyncio.run(monitor.monitor_loop())
            except KeyboardInterrupt:
                logger.info("Monitoring stopped by user")
                sys.exit(0)

if __name__ == "__main__":
    main()