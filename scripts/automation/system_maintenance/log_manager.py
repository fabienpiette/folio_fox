#!/usr/bin/env python3
"""
FolioFox Log Manager
Comprehensive log management, rotation, analysis, and monitoring with automated cleanup.
"""

import argparse
import asyncio
import json
import logging
import os
import re
import shutil
import gzip
import glob
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Pattern
from dataclasses import dataclass, asdict
from enum import Enum
import yaml
import sqlite3
from collections import defaultdict, Counter

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/foliofox/log_manager.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('foliofox.log_manager')

class LogLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

class RotationStrategy(Enum):
    SIZE_BASED = "size_based"
    TIME_BASED = "time_based"
    HYBRID = "hybrid"

@dataclass
class LogFile:
    path: Path
    component: str
    size_bytes: int
    created_at: datetime
    modified_at: datetime
    line_count: int
    log_levels: Dict[str, int]
    is_compressed: bool
    is_archived: bool

@dataclass
class LogAnalysis:
    total_entries: int
    level_distribution: Dict[str, int]
    time_range: Tuple[datetime, datetime]
    top_components: List[Tuple[str, int]]
    error_patterns: List[Tuple[str, int]]
    warning_patterns: List[Tuple[str, int]]
    performance_issues: List[str]
    security_events: List[str]
    recommendations: List[str]

@dataclass
class RotationResult:
    rotated_files: List[str]
    compressed_files: List[str]
    archived_files: List[str]
    deleted_files: List[str]
    total_space_freed: int
    total_space_saved: int
    errors: List[str]

class LogManager:
    """Comprehensive log management and analysis system."""
    
    def __init__(self, config_path: str = "./config/config.yaml"):
        self.config = self._load_config(config_path)
        self.db_path = self.config.get('database', {}).get('path', './data/foliofox.db')
        
        # Log directory configuration
        self.log_dir = Path(self.config.get('logging', {}).get('log_dir', '/var/log/foliofox'))
        self.archive_dir = Path(self.config.get('logging', {}).get('archive_dir', '/var/log/foliofox/archive'))
        
        # Rotation configuration
        self.max_file_size = self.config.get('log_rotation', {}).get('max_file_size_mb', 100) * 1024 * 1024
        self.max_files_per_component = self.config.get('log_rotation', {}).get('max_files_per_component', 10)
        self.retention_days = self.config.get('log_rotation', {}).get('retention_days', 30)
        self.compression_age_days = self.config.get('log_rotation', {}).get('compression_age_days', 7)
        self.rotation_strategy = RotationStrategy(
            self.config.get('log_rotation', {}).get('strategy', 'hybrid')
        )
        
        # Analysis configuration
        self.enable_analysis = self.config.get('log_analysis', {}).get('enable_analysis', True)
        self.error_pattern_threshold = self.config.get('log_analysis', {}).get('error_pattern_threshold', 5)
        self.performance_threshold_ms = self.config.get('log_analysis', {}).get('performance_threshold_ms', 1000)
        
        # Create directories
        self.log_dir.mkdir(exist_ok=True, parents=True)
        self.archive_dir.mkdir(exist_ok=True, parents=True)
        
        # Common log patterns
        self.log_patterns = {
            'timestamp': r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}',
            'level': r'(DEBUG|INFO|WARNING|ERROR|CRITICAL)',
            'component': r'foliofox\.([a-zA-Z_][a-zA-Z0-9_]*)',
            'error': r'(error|exception|failed|failure|traceback)',
            'warning': r'(warning|warn|deprecated|timeout)',
            'performance': r'(\d+\.?\d*)\s*(ms|seconds?|s)\b',
            'security': r'(authentication|authorization|login|permission|access denied|unauthorized)',
            'database': r'(database|sql|query|connection|transaction)',
            'network': r'(http|https|connection|timeout|socket|network)'
        }
        
        # Compile patterns for better performance
        self.compiled_patterns = {
            name: re.compile(pattern, re.IGNORECASE)
            for name, pattern in self.log_patterns.items()
        }
        
        # Statistics tracking
        self.rotation_stats = {
            'files_rotated': 0,
            'files_compressed': 0,
            'files_archived': 0,
            'files_deleted': 0,
            'space_freed_bytes': 0,
            'space_saved_bytes': 0
        }
        
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration with log management defaults."""
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
        """Return default log management configuration."""
        return {
            'database': {'path': './data/foliofox.db'},
            'logging': {
                'log_dir': '/var/log/foliofox',
                'archive_dir': '/var/log/foliofox/archive'
            },
            'log_rotation': {
                'max_file_size_mb': 100,
                'max_files_per_component': 10,
                'retention_days': 30,
                'compression_age_days': 7,
                'strategy': 'hybrid'
            },
            'log_analysis': {
                'enable_analysis': True,
                'error_pattern_threshold': 5,
                'performance_threshold_ms': 1000
            }
        }
    
    def get_database_connection(self) -> sqlite3.Connection:
        """Get database connection for log storage."""
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
    
    def discover_log_files(self) -> List[LogFile]:
        """Discover all log files in the log directory."""
        log_files = []
        
        try:
            # Search for log files with common patterns
            patterns = [
                '*.log',
                '*.log.*',
                '*.log.gz',
                '*.out',
                '*.err'
            ]
            
            for pattern in patterns:
                for file_path in self.log_dir.glob(pattern):
                    try:
                        log_file = self._analyze_log_file(file_path)
                        if log_file:
                            log_files.append(log_file)
                    except Exception as e:
                        logger.warning(f"Error analyzing log file {file_path}: {e}")
                        continue
            
            # Also check archive directory
            for pattern in patterns:
                for file_path in self.archive_dir.glob(pattern):
                    try:
                        log_file = self._analyze_log_file(file_path)
                        if log_file:
                            log_file.is_archived = True
                            log_files.append(log_file)
                    except Exception as e:
                        logger.warning(f"Error analyzing archived log file {file_path}: {e}")
                        continue
            
            logger.info(f"Discovered {len(log_files)} log files")
            return log_files
            
        except Exception as e:
            logger.error(f"Error discovering log files: {e}")
            return []
    
    def _analyze_log_file(self, file_path: Path) -> Optional[LogFile]:
        """Analyze a single log file."""
        try:
            if not file_path.exists():
                return None
            
            stat = file_path.stat()
            is_compressed = file_path.suffix == '.gz'
            
            # Extract component name from filename
            component = self._extract_component_name(file_path)
            
            # Count lines and analyze log levels
            line_count = 0
            log_levels = defaultdict(int)
            
            try:
                if is_compressed:
                    with gzip.open(file_path, 'rt', encoding='utf-8', errors='ignore') as f:
                        for line in f:
                            line_count += 1
                            level = self._extract_log_level(line)
                            if level:
                                log_levels[level] += 1
                            
                            # Limit analysis to avoid processing huge files
                            if line_count > 10000:
                                # Estimate total lines based on sample
                                break
                else:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        for line in f:
                            line_count += 1
                            level = self._extract_log_level(line)
                            if level:
                                log_levels[level] += 1
                            
                            # Limit analysis to avoid processing huge files
                            if line_count > 10000:
                                break
                        
                        # If we didn't reach the end, estimate total lines
                        if line_count == 10000:
                            f.seek(0, 2)  # Go to end
                            file_size = f.tell()
                            f.seek(0)
                            sample_size = f.tell() + len(f.read(8192))
                            if sample_size > 0:
                                estimated_total = int((file_size / sample_size) * line_count)
                                line_count = estimated_total
                                
                                # Scale log levels proportionally
                                scale_factor = estimated_total / 10000
                                for level in log_levels:
                                    log_levels[level] = int(log_levels[level] * scale_factor)
                            
            except Exception as e:
                logger.warning(f"Error reading log file {file_path}: {e}")
                line_count = 0
                log_levels = {}
            
            return LogFile(
                path=file_path,
                component=component,
                size_bytes=stat.st_size,
                created_at=datetime.fromtimestamp(stat.st_ctime),
                modified_at=datetime.fromtimestamp(stat.st_mtime),
                line_count=line_count,
                log_levels=dict(log_levels),
                is_compressed=is_compressed,
                is_archived=file_path.parent == self.archive_dir
            )
            
        except Exception as e:
            logger.error(f"Error analyzing log file {file_path}: {e}")
            return None
    
    def _extract_component_name(self, file_path: Path) -> str:
        """Extract component name from log file path."""
        name = file_path.stem
        
        # Remove common suffixes
        for suffix in ['.log', '.out', '.err']:
            if name.endswith(suffix):
                name = name[:-len(suffix)]
                break
        
        # Handle numbered log files (e.g., app.log.1)
        if re.match(r'.*\.\d+$', name):
            name = re.sub(r'\.\d+$', '', name)
        
        return name or 'unknown'
    
    def _extract_log_level(self, line: str) -> Optional[str]:
        """Extract log level from a log line."""
        match = self.compiled_patterns['level'].search(line)
        return match.group(1) if match else None
    
    async def rotate_logs(self) -> RotationResult:
        """Perform log rotation based on configured strategy."""
        logger.info("Starting log rotation")
        
        result = RotationResult(
            rotated_files=[],
            compressed_files=[],
            archived_files=[],
            deleted_files=[],
            total_space_freed=0,
            total_space_saved=0,
            errors=[]
        )
        
        try:
            log_files = self.discover_log_files()
            
            # Group files by component
            files_by_component = defaultdict(list)
            for log_file in log_files:
                if not log_file.is_archived:  # Only rotate active log files
                    files_by_component[log_file.component].append(log_file)
            
            for component, files in files_by_component.items():
                try:
                    await self._rotate_component_logs(component, files, result)
                except Exception as e:
                    error_msg = f"Error rotating logs for component {component}: {e}"
                    logger.error(error_msg)
                    result.errors.append(error_msg)
            
            # Clean up old archives
            await self._cleanup_old_archives(result)
            
            # Update statistics
            self.rotation_stats['files_rotated'] += len(result.rotated_files)
            self.rotation_stats['files_compressed'] += len(result.compressed_files) 
            self.rotation_stats['files_archived'] += len(result.archived_files)
            self.rotation_stats['files_deleted'] += len(result.deleted_files)
            self.rotation_stats['space_freed_bytes'] += result.total_space_freed
            self.rotation_stats['space_saved_bytes'] += result.total_space_saved
            
            logger.info(f"Log rotation completed. Rotated: {len(result.rotated_files)}, "
                       f"Compressed: {len(result.compressed_files)}, "
                       f"Space freed: {result.total_space_freed / 1024 / 1024:.2f} MB")
            
            return result
            
        except Exception as e:
            error_msg = f"Log rotation failed: {e}"
            logger.error(error_msg)
            result.errors.append(error_msg)
            return result
    
    async def _rotate_component_logs(self, component: str, files: List[LogFile], 
                                   result: RotationResult):
        """Rotate logs for a specific component."""
        # Sort files by modification time (newest first)
        files.sort(key=lambda f: f.modified_at, reverse=True)
        
        for i, log_file in enumerate(files):
            try:
                should_rotate = False
                
                # Check rotation conditions based on strategy
                if self.rotation_strategy in [RotationStrategy.SIZE_BASED, RotationStrategy.HYBRID]:
                    if log_file.size_bytes > self.max_file_size:
                        should_rotate = True
                        logger.debug(f"File {log_file.path} exceeds size limit")
                
                if self.rotation_strategy in [RotationStrategy.TIME_BASED, RotationStrategy.HYBRID]:
                    age_days = (datetime.now() - log_file.modified_at).days
                    if age_days > 1:  # Rotate files older than 1 day
                        should_rotate = True
                        logger.debug(f"File {log_file.path} is {age_days} days old")
                
                # Keep recent files even if they meet rotation criteria
                if i >= self.max_files_per_component:
                    should_rotate = True
                    logger.debug(f"Too many files for component {component}")
                
                if should_rotate:
                    await self._rotate_single_file(log_file, result)
                    
            except Exception as e:
                error_msg = f"Error rotating file {log_file.path}: {e}"
                logger.error(error_msg)
                result.errors.append(error_msg)
    
    async def _rotate_single_file(self, log_file: LogFile, result: RotationResult):
        """Rotate a single log file."""
        try:
            original_size = log_file.size_bytes
            
            # Determine if file should be compressed
            age_days = (datetime.now() - log_file.modified_at).days
            should_compress = age_days >= self.compression_age_days and not log_file.is_compressed
            
            # Generate rotated filename
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            base_name = log_file.path.stem
            
            if should_compress:
                rotated_name = f"{base_name}_{timestamp}.log.gz"
                rotated_path = self.archive_dir / rotated_name
                
                # Compress and move to archive
                with open(log_file.path, 'rb') as f_in:
                    with gzip.open(rotated_path, 'wb') as f_out:
                        shutil.copyfileobj(f_in, f_out)
                
                # Remove original file
                log_file.path.unlink()
                
                compressed_size = rotated_path.stat().st_size
                compression_ratio = (original_size - compressed_size) / original_size * 100
                
                result.compressed_files.append(str(rotated_path))
                result.total_space_saved += (original_size - compressed_size)
                
                logger.info(f"Compressed {log_file.path} to {rotated_path} "
                           f"({compression_ratio:.1f}% compression)")
                
            else:
                # Just move to archive without compression
                rotated_name = f"{base_name}_{timestamp}.log"
                rotated_path = self.archive_dir / rotated_name
                
                shutil.move(str(log_file.path), str(rotated_path))
                result.archived_files.append(str(rotated_path))
                
                logger.info(f"Archived {log_file.path} to {rotated_path}")
            
            result.rotated_files.append(str(log_file.path))
            
        except Exception as e:
            logger.error(f"Error rotating file {log_file.path}: {e}")
            raise
    
    async def _cleanup_old_archives(self, result: RotationResult):
        """Clean up old archived log files."""
        try:
            cutoff_date = datetime.now() - timedelta(days=self.retention_days)
            
            for archive_file in self.archive_dir.glob("*"):
                try:
                    if archive_file.is_file():
                        stat = archive_file.stat()
                        file_date = datetime.fromtimestamp(stat.st_mtime)
                        
                        if file_date < cutoff_date:
                            file_size = stat.st_size
                            archive_file.unlink()
                            
                            result.deleted_files.append(str(archive_file))
                            result.total_space_freed += file_size
                            
                            logger.info(f"Deleted old archive: {archive_file}")
                            
                except Exception as e:
                    error_msg = f"Error deleting archive {archive_file}: {e}"
                    logger.warning(error_msg)
                    result.errors.append(error_msg)
                    
        except Exception as e:
            logger.error(f"Error cleaning up old archives: {e}")
    
    async def analyze_logs(self, files: List[LogFile] = None, 
                          time_range: Optional[Tuple[datetime, datetime]] = None) -> LogAnalysis:
        """Perform comprehensive log analysis."""
        if files is None:
            files = self.discover_log_files()
        
        logger.info(f"Analyzing {len(files)} log files")
        
        # Initialize analysis counters
        total_entries = 0
        level_distribution = defaultdict(int)
        components = defaultdict(int)
        error_patterns = defaultdict(int)
        warning_patterns = defaultdict(int)
        performance_issues = []
        security_events = []
        
        earliest_time = None
        latest_time = None
        
        # Analyze each log file
        for log_file in files:
            try:
                file_analysis = await self._analyze_single_log_file(log_file, time_range)
                
                total_entries += file_analysis['entries']
                
                for level, count in file_analysis['levels'].items():
                    level_distribution[level] += count
                
                components[log_file.component] += file_analysis['entries']
                
                for pattern, count in file_analysis['error_patterns'].items():
                    error_patterns[pattern] += count
                
                for pattern, count in file_analysis['warning_patterns'].items():
                    warning_patterns[pattern] += count
                
                performance_issues.extend(file_analysis['performance_issues'])
                security_events.extend(file_analysis['security_events'])
                
                # Update time range
                if file_analysis['time_range']:
                    file_earliest, file_latest = file_analysis['time_range']
                    if earliest_time is None or file_earliest < earliest_time:
                        earliest_time = file_earliest
                    if latest_time is None or file_latest > latest_time:
                        latest_time = file_latest
                        
            except Exception as e:
                logger.warning(f"Error analyzing log file {log_file.path}: {e}")
                continue
        
        # Generate recommendations
        recommendations = self._generate_analysis_recommendations(
            level_distribution, error_patterns, warning_patterns, 
            performance_issues, security_events
        )
        
        return LogAnalysis(
            total_entries=total_entries,
            level_distribution=dict(level_distribution),
            time_range=(earliest_time, latest_time) if earliest_time and latest_time else None,
            top_components=sorted(components.items(), key=lambda x: x[1], reverse=True)[:10],
            error_patterns=sorted(error_patterns.items(), key=lambda x: x[1], reverse=True)[:20],
            warning_patterns=sorted(warning_patterns.items(), key=lambda x: x[1], reverse=True)[:20],
            performance_issues=performance_issues[:50],  # Limit to top 50
            security_events=security_events[:50],
            recommendations=recommendations
        )
    
    async def _analyze_single_log_file(self, log_file: LogFile, 
                                     time_range: Optional[Tuple[datetime, datetime]] = None) -> Dict:
        """Analyze a single log file in detail."""
        result = {
            'entries': 0,
            'levels': defaultdict(int),
            'error_patterns': defaultdict(int),
            'warning_patterns': defaultdict(int),
            'performance_issues': [],
            'security_events': [],
            'time_range': None
        }
        
        try:
            earliest_time = None
            latest_time = None
            
            # Open file (compressed or not)
            if log_file.is_compressed:
                file_handle = gzip.open(log_file.path, 'rt', encoding='utf-8', errors='ignore')
            else:
                file_handle = open(log_file.path, 'r', encoding='utf-8', errors='ignore')
            
            try:
                with file_handle as f:
                    for line_num, line in enumerate(f, 1):
                        try:
                            # Extract timestamp if possible
                            timestamp_match = self.compiled_patterns['timestamp'].search(line)
                            if timestamp_match:
                                try:
                                    line_time = datetime.strptime(
                                        timestamp_match.group(), '%Y-%m-%d %H:%M:%S'
                                    )
                                    
                                    # Check time range filter
                                    if time_range:
                                        start_time, end_time = time_range
                                        if line_time < start_time or line_time > end_time:
                                            continue
                                    
                                    # Update time range
                                    if earliest_time is None or line_time < earliest_time:
                                        earliest_time = line_time
                                    if latest_time is None or line_time > latest_time:
                                        latest_time = line_time
                                        
                                except ValueError:
                                    pass  # Skip invalid timestamps
                            
                            result['entries'] += 1
                            
                            # Extract log level
                            level = self._extract_log_level(line)
                            if level:
                                result['levels'][level] += 1
                            
                            # Analyze error patterns
                            if level in ['ERROR', 'CRITICAL'] or \
                               self.compiled_patterns['error'].search(line):
                                pattern = self._extract_error_pattern(line)
                                if pattern:
                                    result['error_patterns'][pattern] += 1
                            
                            # Analyze warning patterns
                            if level == 'WARNING' or self.compiled_patterns['warning'].search(line):
                                pattern = self._extract_warning_pattern(line)
                                if pattern:
                                    result['warning_patterns'][pattern] += 1
                            
                            # Detect performance issues
                            perf_match = self._detect_performance_issue(line)
                            if perf_match:
                                result['performance_issues'].append({
                                    'line_number': line_num,
                                    'message': line.strip(),
                                    'performance_data': perf_match
                                })
                            
                            # Detect security events
                            if self.compiled_patterns['security'].search(line):
                                result['security_events'].append({
                                    'line_number': line_num,
                                    'message': line.strip(),
                                    'timestamp': timestamp_match.group() if timestamp_match else None
                                })
                            
                            # Limit analysis to avoid memory issues
                            if result['entries'] > 50000:
                                logger.info(f"Limiting analysis of {log_file.path} to 50000 entries")
                                break
                                
                        except Exception as e:
                            logger.debug(f"Error processing line {line_num} in {log_file.path}: {e}")
                            continue
                            
            finally:
                file_handle.close()
            
            result['time_range'] = (earliest_time, latest_time) if earliest_time and latest_time else None
            
        except Exception as e:
            logger.error(f"Error analyzing log file {log_file.path}: {e}")
        
        return result
    
    def _extract_error_pattern(self, line: str) -> Optional[str]:
        """Extract meaningful error pattern from log line."""
        # Remove timestamps and log levels for pattern matching
        cleaned_line = re.sub(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}', '', line)
        cleaned_line = re.sub(r'(DEBUG|INFO|WARNING|ERROR|CRITICAL)', '', cleaned_line)
        
        # Common error patterns
        patterns = [
            r'FileNotFoundError.*?([a-zA-Z0-9_/\\.]+)',
            r'ConnectionError.*?(connection|timeout|refused)',
            r'PermissionError.*?(permission|access)',
            r'ValueError.*?(invalid|value|format)',
            r'KeyError.*?[\'"]([a-zA-Z0-9_]+)[\'"]',
            r'AttributeError.*?[\'"]([a-zA-Z0-9_]+)[\'"]',
            r'ImportError.*?[\'"]([a-zA-Z0-9_.]+)[\'"]',
            r'SQLite.*?(database|locked|corrupt)',
            r'HTTP.*?(\d{3})',
            r'Timeout.*?(timeout|expired)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, cleaned_line, re.IGNORECASE)
            if match:
                return f"{pattern.split('.*?')[0].rstrip('.*?')}: {match.group(1) if match.lastindex else 'generic'}"
        
        # Generic error classification
        if 'error' in cleaned_line.lower():
            words = cleaned_line.lower().split()
            error_idx = next((i for i, word in enumerate(words) if 'error' in word), -1)
            if error_idx >= 0 and error_idx < len(words) - 1:
                return f"Error: {words[error_idx + 1]}"
        
        return "Generic Error"
    
    def _extract_warning_pattern(self, line: str) -> Optional[str]:
        """Extract meaningful warning pattern from log line."""
        # Remove timestamps and log levels
        cleaned_line = re.sub(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}', '', line)
        cleaned_line = re.sub(r'(DEBUG|INFO|WARNING|ERROR|CRITICAL)', '', cleaned_line)
        
        # Common warning patterns
        patterns = [
            r'deprecated.*?([a-zA-Z0-9_]+)',
            r'timeout.*?(\d+)',
            r'retry.*?(\d+)',
            r'slow.*?(query|operation|request)',
            r'memory.*?(usage|limit|warning)',
            r'disk.*?(space|usage|full)',
            r'rate.*?(limit|exceeded)',
            r'connection.*?(pool|limit|timeout)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, cleaned_line, re.IGNORECASE)
            if match:
                return f"{pattern.split('.*?')[0].rstrip('.*?').title()}: {match.group(1) if match.lastindex else 'generic'}"
        
        return "Generic Warning"
    
    def _detect_performance_issue(self, line: str) -> Optional[Dict]:
        """Detect performance issues in log lines."""
        # Look for timing information
        perf_match = self.compiled_patterns['performance'].search(line)
        if perf_match:
            time_value = float(perf_match.group(1))
            time_unit = perf_match.group(2).lower()
            
            # Convert to milliseconds
            if time_unit in ['s', 'seconds', 'second']:
                time_ms = time_value * 1000
            else:
                time_ms = time_value
            
            if time_ms > self.performance_threshold_ms:
                return {
                    'duration_ms': time_ms,
                    'original_value': perf_match.group(),
                    'type': 'slow_operation'
                }
        
        # Look for specific performance indicators
        perf_indicators = [
            'slow query',
            'timeout',
            'connection pool exhausted',
            'memory usage high',
            'cpu usage high'
        ]
        
        for indicator in perf_indicators:
            if indicator in line.lower():
                return {
                    'type': indicator.replace(' ', '_'),
                    'indicator': indicator
                }
        
        return None
    
    def _generate_analysis_recommendations(self, level_distribution: Dict, 
                                         error_patterns: Dict, warning_patterns: Dict,
                                         performance_issues: List, security_events: List) -> List[str]:
        """Generate recommendations based on log analysis."""
        recommendations = []
        
        total_entries = sum(level_distribution.values())
        
        if total_entries == 0:
            return ["No log entries found to analyze"]
        
        # Error rate analysis
        error_count = level_distribution.get('ERROR', 0) + level_distribution.get('CRITICAL', 0)
        error_rate = (error_count / total_entries) * 100
        
        if error_rate > 5:
            recommendations.append(f"High error rate detected: {error_rate:.1f}%. Investigate error patterns.")
        elif error_rate > 1:
            recommendations.append(f"Elevated error rate: {error_rate:.1f}%. Monitor closely.")
        
        # Warning analysis
        warning_count = level_distribution.get('WARNING', 0)
        warning_rate = (warning_count / total_entries) * 100
        
        if warning_rate > 10:
            recommendations.append(f"High warning rate: {warning_rate:.1f}%. Review warning patterns.")
        
        # Top error patterns
        if error_patterns:
            top_error = max(error_patterns.items(), key=lambda x: x[1])
            if top_error[1] > self.error_pattern_threshold:
                recommendations.append(f"Frequent error pattern: '{top_error[0]}' ({top_error[1]} occurrences)")
        
        # Performance issues
        if len(performance_issues) > 10:
            recommendations.append(f"Multiple performance issues detected ({len(performance_issues)}). "
                                 "Consider performance optimization.")
        
        # Security events
        if len(security_events) > 5:
            recommendations.append(f"Security events detected ({len(security_events)}). Review security logs.")
        
        # Log volume analysis
        if total_entries > 100000:
            recommendations.append("High log volume detected. Consider increasing log rotation frequency.")
        
        # Log level distribution analysis
        debug_rate = (level_distribution.get('DEBUG', 0) / total_entries) * 100
        if debug_rate > 50:
            recommendations.append(f"High debug log rate ({debug_rate:.1f}%). "
                                 "Consider reducing debug logging in production.")
        
        return recommendations
    
    def generate_log_report(self) -> Dict:
        """Generate comprehensive log management report."""
        try:
            log_files = self.discover_log_files()
            
            # Analyze current state
            total_size = sum(f.size_bytes for f in log_files)
            active_files = [f for f in log_files if not f.is_archived]
            archived_files = [f for f in log_files if f.is_archived]
            compressed_files = [f for f in log_files if f.is_compressed]
            
            # Component breakdown
            components = defaultdict(lambda: {'count': 0, 'size': 0})
            for log_file in log_files:
                components[log_file.component]['count'] += 1
                components[log_file.component]['size'] += log_file.size_bytes
            
            # Age analysis
            now = datetime.now()
            age_ranges = {
                'today': 0,
                'week': 0,
                'month': 0,
                'older': 0
            }
            
            for log_file in log_files:
                age_days = (now - log_file.modified_at).days
                if age_days == 0:
                    age_ranges['today'] += 1
                elif age_days <= 7:
                    age_ranges['week'] += 1
                elif age_days <= 30:
                    age_ranges['month'] += 1
                else:
                    age_ranges['older'] += 1
            
            # System resource analysis
            try:
                import psutil
                disk_usage = psutil.disk_usage(str(self.log_dir))
                system_resources = {
                    'log_dir_disk_usage_percent': (total_size / disk_usage.total) * 100,
                    'available_disk_gb': disk_usage.free / 1024 / 1024 / 1024
                }
            except ImportError:
                system_resources = {}
            
            return {
                'timestamp': datetime.now().isoformat(),
                'summary': {
                    'total_files': len(log_files),
                    'active_files': len(active_files),
                    'archived_files': len(archived_files),
                    'compressed_files': len(compressed_files),
                    'total_size_mb': round(total_size / 1024 / 1024, 2),
                    'total_size_gb': round(total_size / 1024 / 1024 / 1024, 2)
                },
                'components': [
                    {
                        'name': name,
                        'file_count': stats['count'],
                        'total_size_mb': round(stats['size'] / 1024 / 1024, 2)
                    }
                    for name, stats in sorted(components.items(), 
                                            key=lambda x: x[1]['size'], reverse=True)
                ],
                'age_distribution': age_ranges,
                'rotation_statistics': self.rotation_stats,
                'system_resources': system_resources,
                'largest_files': [
                    {
                        'path': str(f.path),
                        'component': f.component,
                        'size_mb': round(f.size_bytes / 1024 / 1024, 2),
                        'age_days': (now - f.modified_at).days,
                        'is_compressed': f.is_compressed,
                        'is_archived': f.is_archived
                    }
                    for f in sorted(log_files, key=lambda x: x.size_bytes, reverse=True)[:10]
                ],
                'configuration': {
                    'max_file_size_mb': self.max_file_size / 1024 / 1024,
                    'max_files_per_component': self.max_files_per_component,
                    'retention_days': self.retention_days,
                    'compression_age_days': self.compression_age_days,
                    'rotation_strategy': self.rotation_strategy.value
                }
            }
            
        except Exception as e:
            logger.error(f"Error generating log report: {e}")
            return {'error': str(e), 'timestamp': datetime.now().isoformat()}
    
    async def monitor_log_health(self) -> Dict:
        """Monitor log health and detect issues."""
        try:
            log_files = self.discover_log_files()
            issues = []
            warnings = []
            
            # Check for large files
            for log_file in log_files:
                if log_file.size_bytes > self.max_file_size * 2:  # Double the rotation size
                    issues.append(f"File {log_file.path} is very large ({log_file.size_bytes / 1024 / 1024:.1f} MB)")
                elif log_file.size_bytes > self.max_file_size:
                    warnings.append(f"File {log_file.path} exceeds rotation size")
            
            # Check for old files
            old_cutoff = datetime.now() - timedelta(days=self.retention_days)
            for log_file in log_files:
                if not log_file.is_archived and log_file.modified_at < old_cutoff:
                    warnings.append(f"File {log_file.path} is older than retention policy")
            
            # Check disk space
            try:
                import psutil
                disk_usage = psutil.disk_usage(str(self.log_dir))
                if disk_usage.percent > 90:
                    issues.append(f"Log directory disk usage is critical: {disk_usage.percent:.1f}%")
                elif disk_usage.percent > 80:
                    warnings.append(f"Log directory disk usage is high: {disk_usage.percent:.1f}%")
            except ImportError:
                pass
            
            # Check for missing log files (components that should be logging)
            expected_components = ['queue_monitor', 'health_monitor', 'advanced_queue_manager']
            active_components = set(f.component for f in log_files if not f.is_archived)
            
            for component in expected_components:
                if component not in active_components:
                    warnings.append(f"No recent log files found for component: {component}")
            
            # Overall health status
            if issues:
                health_status = "CRITICAL"
            elif warnings:
                health_status = "WARNING"
            else:
                health_status = "HEALTHY"
            
            return {
                'timestamp': datetime.now().isoformat(),
                'health_status': health_status,
                'total_files': len(log_files),
                'total_size_mb': sum(f.size_bytes for f in log_files) / 1024 / 1024,
                'issues': issues,
                'warnings': warnings,
                'recommendations': self._generate_health_recommendations(issues, warnings)
            }
            
        except Exception as e:
            logger.error(f"Error monitoring log health: {e}")
            return {
                'timestamp': datetime.now().isoformat(),
                'health_status': 'ERROR',
                'error': str(e)
            }
    
    def _generate_health_recommendations(self, issues: List[str], warnings: List[str]) -> List[str]:
        """Generate health recommendations based on issues and warnings."""
        recommendations = []
        
        if issues:
            recommendations.append("Immediate attention required for critical log issues")
            if any("large" in issue.lower() for issue in issues):
                recommendations.append("Run log rotation immediately to manage large files")
            if any("disk" in issue.lower() for issue in issues):
                recommendations.append("Free up disk space or increase log cleanup frequency")
        
        if warnings:
            if any("retention" in warning.lower() for warning in warnings):
                recommendations.append("Run log cleanup to enforce retention policies")
            if any("missing" in warning.lower() for warning in warnings):
                recommendations.append("Check if all expected services are running and logging properly")
        
        if not issues and not warnings:
            recommendations.append("Log system is healthy - continue regular maintenance")
        
        return recommendations


def main():
    parser = argparse.ArgumentParser(description='FolioFox Log Manager')
    parser.add_argument('--config', default='./config/config.yaml', help='Configuration file path')
    parser.add_argument('--mode', 
                       choices=['discover', 'rotate', 'analyze', 'report', 'health'], 
                       default='report', help='Operation mode')
    parser.add_argument('--component', help='Filter by specific component')
    parser.add_argument('--days', type=int, help='Number of days to analyze')
    
    args = parser.parse_args()
    
    log_manager = LogManager(args.config)
    
    async def run_operation():
        if args.mode == 'discover':
            files = log_manager.discover_log_files()
            result = [
                {
                    'path': str(f.path),
                    'component': f.component,
                    'size_mb': round(f.size_bytes / 1024 / 1024, 2),
                    'lines': f.line_count,
                    'levels': f.log_levels,
                    'compressed': f.is_compressed,
                    'archived': f.is_archived
                }
                for f in files
            ]
            print(json.dumps(result, indent=2, default=str))
            
        elif args.mode == 'rotate':
            result = await log_manager.rotate_logs()
            print(json.dumps(asdict(result), indent=2, default=str))
            
        elif args.mode == 'analyze':
            files = log_manager.discover_log_files()
            if args.component:
                files = [f for f in files if f.component == args.component]
            
            time_range = None
            if args.days:
                end_time = datetime.now()
                start_time = end_time - timedelta(days=args.days)
                time_range = (start_time, end_time)
            
            analysis = await log_manager.analyze_logs(files, time_range)
            print(json.dumps(asdict(analysis), indent=2, default=str))
            
        elif args.mode == 'health':
            health = await log_manager.monitor_log_health()
            print(json.dumps(health, indent=2, default=str))
            
        else:  # report
            report = log_manager.generate_log_report()
            print(json.dumps(report, indent=2, default=str))
    
    try:
        asyncio.run(run_operation())
    except KeyboardInterrupt:
        logger.info("Log manager stopped by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Log manager failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()