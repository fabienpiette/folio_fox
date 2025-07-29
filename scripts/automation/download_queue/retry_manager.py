#!/usr/bin/env python3
"""
FolioFox Download Retry Manager
Intelligent retry logic for failed downloads with exponential backoff and failure analysis.
"""

import argparse
import json
import logging
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import requests
import hashlib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/foliofox/retry_manager.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('foliofox.retry_manager')

class RetryReason(Enum):
    NETWORK_ERROR = "network_error"
    TIMEOUT = "timeout"
    SERVER_ERROR = "server_error"
    RATE_LIMITED = "rate_limited"
    INDEXER_DOWN = "indexer_down"
    FILE_CORRUPTED = "file_corrupted"
    DISK_FULL = "disk_full"
    PERMISSION_ERROR = "permission_error"
    UNKNOWN = "unknown"

@dataclass
class RetryConfig:
    base_delay: int = 60  # Base delay in seconds
    max_delay: int = 3600  # Maximum delay (1 hour)
    exponential_base: float = 2.0
    max_retries: int = 5
    rate_limit_backoff: int = 300  # 5 minutes for rate limiting
    server_error_backoff: int = 900  # 15 minutes for server errors

@dataclass
class FailedDownload:
    id: int
    user_id: int
    indexer_id: int
    title: str
    author_name: Optional[str]
    download_url: str
    file_format: str
    retry_count: int
    max_retries: int
    error_message: Optional[str]
    last_attempt: datetime
    created_at: datetime
    priority: int

class RetryManager:
    """Manages intelligent retry logic for failed downloads."""
    
    def __init__(self, config_path: str = "./config/config.yaml"):
        self.config = self._load_config(config_path)
        self.db_path = self.config.get('database', {}).get('path', './data/foliofox.db')
        self.api_base_url = f"http://{self.config.get('server', {}).get('host', 'localhost')}:{self.config.get('server', {}).get('port', 8080)}"
        
        self.retry_config = RetryConfig()
        self.failure_patterns = self._initialize_failure_patterns()
        
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
    
    def _initialize_failure_patterns(self) -> Dict[RetryReason, Dict]:
        """Initialize patterns for categorizing failure reasons."""
        return {
            RetryReason.NETWORK_ERROR: {
                'patterns': ['connection refused', 'network unreachable', 'dns lookup failed', 'connection reset'],
                'retry_multiplier': 1.5,
                'immediate_retry': False
            },
            RetryReason.TIMEOUT: {
                'patterns': ['timeout', 'deadline exceeded', 'request timeout'],
                'retry_multiplier': 1.2,
                'immediate_retry': False
            },
            RetryReason.SERVER_ERROR: {
                'patterns': ['500', '502', '503', '504', 'internal server error', 'bad gateway'],
                'retry_multiplier': 2.0,
                'immediate_retry': False
            },
            RetryReason.RATE_LIMITED: {
                'patterns': ['429', 'rate limit', 'too many requests', 'quota exceeded'],
                'retry_multiplier': 3.0,
                'immediate_retry': False
            },
            RetryReason.INDEXER_DOWN: {
                'patterns': ['indexer unavailable', 'indexer offline', 'indexer maintenance'],
                'retry_multiplier': 2.5,
                'immediate_retry': False
            },
            RetryReason.FILE_CORRUPTED: {
                'patterns': ['checksum mismatch', 'corrupted file', 'invalid file format'],
                'retry_multiplier': 1.0,
                'immediate_retry': True
            },
            RetryReason.DISK_FULL: {
                'patterns': ['no space left', 'disk full', 'insufficient space'],
                'retry_multiplier': 1.0,
                'immediate_retry': False
            },
            RetryReason.PERMISSION_ERROR: {
                'patterns': ['permission denied', 'access denied', 'forbidden'],
                'retry_multiplier': 1.0,
                'immediate_retry': False
            }
        }
    
    def get_database_connection(self) -> sqlite3.Connection:
        """Get database connection with proper error handling."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            return conn
        except sqlite3.Error as e:
            logger.error(f"Database connection error: {e}")
            raise
    
    def categorize_failure(self, error_message: str) -> RetryReason:
        """Categorize failure based on error message patterns."""
        if not error_message:
            return RetryReason.UNKNOWN
        
        error_lower = error_message.lower()
        
        for reason, config in self.failure_patterns.items():
            for pattern in config['patterns']:
                if pattern in error_lower:
                    return reason
        
        return RetryReason.UNKNOWN
    
    def calculate_retry_delay(self, retry_count: int, failure_reason: RetryReason) -> int:
        """Calculate the delay before next retry attempt."""
        failure_config = self.failure_patterns.get(failure_reason, {})
        multiplier = failure_config.get('retry_multiplier', 1.0)
        
        # Special handling for specific failure types
        if failure_reason == RetryReason.RATE_LIMITED:
            return self.retry_config.rate_limit_backoff
        elif failure_reason == RetryReason.SERVER_ERROR:
            return self.retry_config.server_error_backoff
        elif failure_config.get('immediate_retry', False):
            return 0
        
        # Exponential backoff with jitter
        delay = min(
            self.retry_config.base_delay * (self.retry_config.exponential_base ** retry_count) * multiplier,
            self.retry_config.max_delay
        )
        
        # Add jitter (±20%)
        import random
        jitter = random.uniform(0.8, 1.2)
        return int(delay * jitter)
    
    def get_failed_downloads(self) -> List[FailedDownload]:
        """Get all failed downloads that are eligible for retry."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT id, user_id, indexer_id, title, author_name, download_url, 
                           file_format, retry_count, max_retries, error_message, 
                           updated_at, created_at, priority
                    FROM download_queue 
                    WHERE status = 'failed' 
                    AND retry_count < max_retries
                    ORDER BY priority ASC, updated_at ASC
                """)
                
                rows = cursor.fetchall()
                return [self._row_to_failed_download(row) for row in rows]
        except Exception as e:
            logger.error(f"Error getting failed downloads: {e}")
            return []
    
    def get_retry_candidates(self) -> List[Tuple[FailedDownload, int]]:
        """Get downloads ready for retry with their calculated delays."""
        failed_downloads = self.get_failed_downloads()
        candidates = []
        
        current_time = datetime.now()
        
        for download in failed_downloads:
            failure_reason = self.categorize_failure(download.error_message or "")
            retry_delay = self.calculate_retry_delay(download.retry_count, failure_reason)
            
            # Check if enough time has passed since last attempt
            time_since_last_attempt = (current_time - download.last_attempt).total_seconds()
            
            if time_since_last_attempt >= retry_delay:
                candidates.append((download, retry_delay))
                logger.info(
                    f"Download {download.id} ready for retry (attempt {download.retry_count + 1})"
                    f" - Reason: {failure_reason.value}, Delay was: {retry_delay}s"
                )
        
        return candidates
    
    def retry_download(self, download_id: int) -> bool:
        """Retry a specific download."""
        try:
            response = requests.post(
                f"{self.api_base_url}/api/downloads/{download_id}/retry",
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully queued retry for download {download_id}")
                return True
            else:
                logger.error(f"Failed to retry download {download_id}: HTTP {response.status_code}")
                if response.text:
                    logger.error(f"Response: {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error retrying download {download_id}: {e}")
            return False
    
    def update_retry_metadata(self, download_id: int, failure_reason: RetryReason, 
                             next_retry_at: datetime):
        """Update retry metadata in the database."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Check if retry_metadata table exists, create if not
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS download_retry_metadata (
                        download_id INTEGER PRIMARY KEY,
                        failure_reason TEXT,
                        retry_history TEXT,
                        next_retry_at TEXT,
                        total_retry_time INTEGER DEFAULT 0,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (download_id) REFERENCES download_queue (id)
                    )
                """)
                
                # Get existing retry history
                cursor.execute("""
                    SELECT retry_history, total_retry_time 
                    FROM download_retry_metadata 
                    WHERE download_id = ?
                """, (download_id,))
                
                existing = cursor.fetchone()
                retry_history = []
                total_retry_time = 0
                
                if existing:
                    retry_history = json.loads(existing[0] or "[]")
                    total_retry_time = existing[1] or 0
                
                # Add current retry to history
                retry_entry = {
                    "timestamp": datetime.now().isoformat(),
                    "reason": failure_reason.value,
                    "next_retry_at": next_retry_at.isoformat()
                }
                retry_history.append(retry_entry)
                
                # Calculate time spent on retries
                if len(retry_history) > 1:
                    last_retry = datetime.fromisoformat(retry_history[-2]["timestamp"])
                    current_retry = datetime.fromisoformat(retry_entry["timestamp"])
                    total_retry_time += int((current_retry - last_retry).total_seconds())
                
                # Update or insert retry metadata
                cursor.execute("""
                    INSERT OR REPLACE INTO download_retry_metadata 
                    (download_id, failure_reason, retry_history, next_retry_at, 
                     total_retry_time, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    download_id,
                    failure_reason.value,
                    json.dumps(retry_history),
                    next_retry_at.isoformat(),
                    total_retry_time,
                    datetime.now().isoformat()
                ))
                
                conn.commit()
                logger.debug(f"Updated retry metadata for download {download_id}")
                
        except Exception as e:
            logger.error(f"Error updating retry metadata for download {download_id}: {e}")
    
    def analyze_failure_patterns(self) -> Dict:
        """Analyze failure patterns to identify common issues."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Get failure statistics
                cursor.execute("""
                    SELECT error_message, COUNT(*) as count,
                           AVG(retry_count) as avg_retries
                    FROM download_queue 
                    WHERE status = 'failed' 
                    AND updated_at > datetime('now', '-7 days')
                    AND error_message IS NOT NULL
                    GROUP BY error_message
                    ORDER BY count DESC
                    LIMIT 20
                """)
                
                failures = cursor.fetchall()
                
                # Categorize failures
                analysis = {
                    "timeframe": "last 7 days",
                    "total_failures": sum(row[1] for row in failures),
                    "categories": {},
                    "top_errors": [],
                    "recommendations": []
                }
                
                category_counts = {}
                
                for error_msg, count, avg_retries in failures:
                    reason = self.categorize_failure(error_msg)
                    category_counts[reason.value] = category_counts.get(reason.value, 0) + count
                    
                    analysis["top_errors"].append({
                        "error": error_msg,
                        "count": count,
                        "category": reason.value,
                        "avg_retries": round(avg_retries, 2)
                    })
                
                analysis["categories"] = dict(sorted(category_counts.items(), 
                                                   key=lambda x: x[1], reverse=True))
                
                # Generate recommendations
                if category_counts.get(RetryReason.RATE_LIMITED.value, 0) > 10:
                    analysis["recommendations"].append(
                        "High rate limiting detected - consider increasing delays between requests"
                    )
                
                if category_counts.get(RetryReason.NETWORK_ERROR.value, 0) > 15:
                    analysis["recommendations"].append(
                        "Network issues detected - check connectivity and DNS resolution"
                    )
                
                if category_counts.get(RetryReason.SERVER_ERROR.value, 0) > 10:
                    analysis["recommendations"].append(
                        "Server errors detected - indexers may be unstable or overloaded"
                    )
                
                return analysis
                
        except Exception as e:
            logger.error(f"Error analyzing failure patterns: {e}")
            return {"error": str(e)}
    
    def cleanup_excessive_failures(self, max_age_days: int = 7) -> int:
        """Clean up downloads that have failed too many times and are too old."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT id, title FROM download_queue 
                    WHERE status = 'failed' 
                    AND retry_count >= max_retries
                    AND updated_at < datetime('now', '-{} days')
                """.format(max_age_days))
                
                old_failures = cursor.fetchall()
                
                if not old_failures:
                    return 0
                
                # Move to history before deletion
                for failure_id, title in old_failures:
                    self._archive_failed_download(conn, failure_id)
                
                # Delete from queue
                cursor.execute("""
                    DELETE FROM download_queue 
                    WHERE status = 'failed' 
                    AND retry_count >= max_retries
                    AND updated_at < datetime('now', '-{} days')
                """.format(max_age_days))
                
                deleted_count = cursor.rowcount
                conn.commit()
                
                logger.info(f"Cleaned up {deleted_count} excessive failures older than {max_age_days} days")
                return deleted_count
                
        except Exception as e:
            logger.error(f"Error cleaning up excessive failures: {e}")
            return 0
    
    def run_retry_cycle(self) -> Dict:
        """Run a complete retry cycle."""
        logger.info("Starting retry cycle")
        
        cycle_results = {
            "timestamp": datetime.now().isoformat(),
            "retries_attempted": 0,
            "retries_successful": 0,
            "failures_cleaned": 0,
            "errors": []
        }
        
        try:
            # Get retry candidates
            candidates = self.get_retry_candidates()
            
            for download, delay in candidates:
                try:
                    if self.retry_download(download.id):
                        cycle_results["retries_successful"] += 1
                        
                        # Update retry metadata
                        failure_reason = self.categorize_failure(download.error_message or "")
                        next_retry = datetime.now() + timedelta(seconds=delay)
                        self.update_retry_metadata(download.id, failure_reason, next_retry)
                    
                    cycle_results["retries_attempted"] += 1
                    
                    # Small delay between retries to avoid overwhelming the system
                    time.sleep(2)
                    
                except Exception as e:
                    error_msg = f"Error retrying download {download.id}: {e}"
                    logger.error(error_msg)
                    cycle_results["errors"].append(error_msg)
            
            # Clean up excessive failures
            cycle_results["failures_cleaned"] = self.cleanup_excessive_failures()
            
            logger.info(
                f"Retry cycle completed. Attempted: {cycle_results['retries_attempted']}, "
                f"Successful: {cycle_results['retries_successful']}, "
                f"Cleaned: {cycle_results['failures_cleaned']}"
            )
            
        except Exception as e:
            error_msg = f"Error in retry cycle: {e}"
            logger.error(error_msg)
            cycle_results["errors"].append(error_msg)
        
        return cycle_results
    
    def _row_to_failed_download(self, row: sqlite3.Row) -> FailedDownload:
        """Convert database row to FailedDownload object."""
        return FailedDownload(
            id=row['id'],
            user_id=row['user_id'],
            indexer_id=row['indexer_id'],
            title=row['title'],
            author_name=row['author_name'],
            download_url=row['download_url'],
            file_format=row['file_format'],
            retry_count=row['retry_count'],
            max_retries=row['max_retries'],
            error_message=row['error_message'],
            last_attempt=datetime.fromisoformat(row['updated_at']),
            created_at=datetime.fromisoformat(row['created_at']),
            priority=row['priority']
        )
    
    def _archive_failed_download(self, conn: sqlite3.Connection, download_id: int):
        """Archive a failed download to history before cleanup."""
        try:
            cursor = conn.cursor()
            
            # Get download details
            cursor.execute("SELECT * FROM download_queue WHERE id = ?", (download_id,))
            download = cursor.fetchone()
            
            if download:
                # Insert into history
                cursor.execute("""
                    INSERT OR IGNORE INTO download_history 
                    (queue_id, user_id, book_id, indexer_id, title, author_name, 
                     file_format, file_size_bytes, final_status, error_message, 
                     download_path, completed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed_cleanup', ?, ?, ?)
                """, (
                    download['id'], download['user_id'], download.get('book_id'),
                    download['indexer_id'], download['title'], download['author_name'],
                    download['file_format'], download.get('file_size_bytes'),
                    download['error_message'], download.get('download_path'),
                    datetime.now().isoformat()
                ))
        except Exception as e:
            logger.error(f"Error archiving failed download {download_id}: {e}")

def main():
    parser = argparse.ArgumentParser(description='FolioFox Download Retry Manager')
    parser.add_argument('--config', default='./config/config.yaml', help='Configuration file path')
    parser.add_argument('--mode', choices=['retry', 'analyze', 'cleanup'], default='retry',
                       help='Operation mode')
    parser.add_argument('--max-retries', type=int, help='Override max retries')
    parser.add_argument('--cleanup-age', type=int, default=7, 
                       help='Age in days for cleaning up excessive failures')
    
    args = parser.parse_args()
    
    manager = RetryManager(args.config)
    
    if args.max_retries:
        manager.retry_config.max_retries = args.max_retries
    
    if args.mode == 'analyze':
        # Analyze failure patterns
        analysis = manager.analyze_failure_patterns()
        print(json.dumps(analysis, indent=2))
    elif args.mode == 'cleanup':
        # Clean up excessive failures
        cleaned = manager.cleanup_excessive_failures(args.cleanup_age)
        print(f"Cleaned up {cleaned} excessive failures")
    else:
        # Run retry cycle
        results = manager.run_retry_cycle()
        print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()