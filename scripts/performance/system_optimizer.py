#!/usr/bin/env python3
"""
FolioFox System Performance Optimizer

Comprehensive system optimization script that analyzes and optimizes:
- Database performance and configuration
- System resource allocation
- Memory management
- CPU optimization
- Disk I/O optimization
- Network optimization
"""

import os
import sys
import json
import time
import psutil
import sqlite3
import subprocess
import logging
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from pathlib import Path
import tempfile
import shutil

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('foliofox_optimizer.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class SystemOptimizer:
    """Main system optimizer class"""
    
    def __init__(self, config_path: str = None):
        self.config = self.load_config(config_path)
        self.database_path = self.config.get('database_path', './foliofox.db')
        self.redis_config = self.config.get('redis', {})
        self.system_config = self.config.get('system', {})
        self.optimization_results = {}
        
    def load_config(self, config_path: str) -> Dict:
        """Load optimization configuration"""
        default_config = {
            'database_path': './foliofox.db',
            'redis': {
                'host': 'localhost',
                'port': 6379,
                'max_memory': '512mb'
            },
            'system': {
                'enable_swap_optimization': True,
                'enable_cpu_governor': True,
                'enable_io_scheduler': True,
                'target_memory_usage': 0.8
            },
            'performance_thresholds': {
                'cpu_usage_max': 80.0,
                'memory_usage_max': 85.0,
                'disk_usage_max': 90.0,
                'response_time_max': 2.0
            }
        }
        
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    user_config = json.load(f)
                default_config.update(user_config)
            except Exception as e:
                logger.warning(f"Failed to load config from {config_path}: {e}")
        
        return default_config
    
    def run_optimization(self, components: List[str] = None) -> Dict:
        """Run complete system optimization"""
        logger.info("Starting FolioFox system optimization")
        
        # Available optimization components
        available_components = {
            'system': self.optimize_system_resources,
            'database': self.optimize_database,
            'memory': self.optimize_memory,
            'cpu': self.optimize_cpu,
            'disk': self.optimize_disk_io,
            'network': self.optimize_network,
            'redis': self.optimize_redis,
        }
        
        # Run all components if none specified
        if not components:
            components = list(available_components.keys())
        
        # Run optimizations
        for component in components:
            if component in available_components:
                logger.info(f"Optimizing {component}...")
                try:
                    result = available_components[component]()
                    self.optimization_results[component] = result
                    logger.info(f"✓ {component} optimization completed")
                except Exception as e:
                    logger.error(f"✗ {component} optimization failed: {e}")
                    self.optimization_results[component] = {'error': str(e)}
            else:
                logger.warning(f"Unknown optimization component: {component}")
        
        # Generate optimization report
        report = self.generate_optimization_report()
        logger.info("System optimization completed")
        
        return report
    
    def optimize_system_resources(self) -> Dict:
        """Optimize system-level resources"""
        results = {}
        
        # Get current system stats
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        results['current_stats'] = {
            'cpu_usage': cpu_percent,
            'memory_usage': memory.percent,
            'disk_usage': (disk.used / disk.total) * 100,
            'available_memory_gb': memory.available / (1024**3),
            'free_disk_gb': disk.free / (1024**3)
        }
        
        optimizations = []
        
        # Optimize swap usage
        if self.system_config.get('enable_swap_optimization', True):
            swap_optimization = self.optimize_swap()
            optimizations.append(swap_optimization)
        
        # Optimize virtual memory settings
        vm_optimization = self.optimize_virtual_memory()
        optimizations.append(vm_optimization)
        
        # Check and optimize file descriptor limits
        fd_optimization = self.optimize_file_descriptors()
        optimizations.append(fd_optimization)
        
        results['optimizations'] = optimizations
        return results
    
    def optimize_swap(self) -> Dict:
        """Optimize swap settings for better performance"""
        result = {'name': 'swap_optimization', 'changes': []}
        
        try:
            # Check current swappiness
            with open('/proc/sys/vm/swappiness', 'r') as f:
                current_swappiness = int(f.read().strip())
            
            # For database-heavy applications, lower swappiness is better
            target_swappiness = 10
            
            if current_swappiness > target_swappiness:
                # This would require sudo privileges
                result['changes'].append({
                    'setting': 'vm.swappiness',
                    'current': current_swappiness,
                    'recommended': target_swappiness,
                    'command': f'echo {target_swappiness} | sudo tee /proc/sys/vm/swappiness'
                })
            
            # Check swap usage
            swap = psutil.swap_memory()
            result['current_swap'] = {
                'total_gb': swap.total / (1024**3),
                'used_gb': swap.used / (1024**3),
                'percent': swap.percent
            }
            
        except Exception as e:
            result['error'] = str(e)
        
        return result
    
    def optimize_virtual_memory(self) -> Dict:
        """Optimize virtual memory settings"""
        result = {'name': 'virtual_memory_optimization', 'changes': []}
        
        try:
            # Check dirty ratio settings
            vm_settings = {
                'dirty_ratio': (30, 15),  # (current_max, recommended)
                'dirty_background_ratio': (10, 5),
                'vfs_cache_pressure': (100, 50)
            }
            
            for setting, (current_max, recommended) in vm_settings.items():
                try:
                    with open(f'/proc/sys/vm/{setting}', 'r') as f:
                        current_value = int(f.read().strip())
                    
                    if current_value > recommended:
                        result['changes'].append({
                            'setting': f'vm.{setting}',
                            'current': current_value,
                            'recommended': recommended,
                            'command': f'echo {recommended} | sudo tee /proc/sys/vm/{setting}'
                        })
                except Exception as e:
                    logger.debug(f"Could not read {setting}: {e}")
        
        except Exception as e:
            result['error'] = str(e)
        
        return result
    
    def optimize_file_descriptors(self) -> Dict:
        """Optimize file descriptor limits"""
        result = {'name': 'file_descriptor_optimization', 'changes': []}
        
        try:
            # Get current limits
            import resource
            soft_limit, hard_limit = resource.getrlimit(resource.RLIMIT_NOFILE)
            
            # Recommended limits for high-concurrency applications
            recommended_soft = 65536
            recommended_hard = 65536
            
            result['current_limits'] = {
                'soft_limit': soft_limit,
                'hard_limit': hard_limit
            }
            
            if soft_limit < recommended_soft:
                result['changes'].append({
                    'setting': 'file_descriptor_soft_limit',
                    'current': soft_limit,
                    'recommended': recommended_soft,
                    'note': 'Add "* soft nofile 65536" to /etc/security/limits.conf'
                })
            
            if hard_limit < recommended_hard:
                result['changes'].append({
                    'setting': 'file_descriptor_hard_limit',
                    'current': hard_limit,
                    'recommended': recommended_hard,
                    'note': 'Add "* hard nofile 65536" to /etc/security/limits.conf'
                })
        
        except Exception as e:
            result['error'] = str(e)
        
        return result
    
    def optimize_database(self) -> Dict:
        """Optimize SQLite database performance"""
        results = {}
        
        if not os.path.exists(self.database_path):
            return {'error': f'Database not found at {self.database_path}'}
        
        try:
            # Analyze database
            db_analysis = self.analyze_database()
            results['analysis'] = db_analysis
            
            # Optimize database structure
            optimization_results = self.optimize_database_structure()
            results['optimizations'] = optimization_results
            
            # Update database configuration
            config_results = self.optimize_database_config()
            results['configuration'] = config_results
            
        except Exception as e:
            results['error'] = str(e)
        
        return results
    
    def analyze_database(self) -> Dict:
        """Analyze database structure and performance"""
        analysis = {}
        
        with sqlite3.connect(self.database_path) as conn:
            cursor = conn.cursor()
            
            # Get database size
            cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
            db_size = cursor.fetchone()[0]
            analysis['database_size_mb'] = db_size / (1024 * 1024)
            
            # Get table sizes
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            
            table_stats = {}
            for (table_name,) in tables:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                    row_count = cursor.fetchone()[0]
                    table_stats[table_name] = {'row_count': row_count}
                except sqlite3.Error as e:
                    table_stats[table_name] = {'error': str(e)}
            
            analysis['table_statistics'] = table_stats
            
            # Check for missing indexes
            missing_indexes = self.find_missing_indexes(cursor)
            analysis['missing_indexes'] = missing_indexes
            
            # Check fragmentation
            cursor.execute("SELECT freelist_count FROM pragma_freelist_count()")
            freelist_count = cursor.fetchone()[0]
            analysis['fragmentation'] = {
                'freelist_pages': freelist_count,
                'fragmentation_percent': (freelist_count / (db_size / 4096)) * 100 if db_size > 0 else 0
            }
            
            # Check cache efficiency
            cursor.execute("PRAGMA cache_size")
            cache_size = cursor.fetchone()[0]
            analysis['cache_settings'] = {
                'cache_size_pages': cache_size,
                'cache_size_mb': abs(cache_size) / 256 if cache_size < 0 else cache_size * 4 / 1024
            }
        
        return analysis
    
    def find_missing_indexes(self, cursor) -> List[Dict]:
        """Find potentially missing indexes"""
        missing_indexes = []
        
        # Common patterns that should have indexes
        index_patterns = [
            {
                'table': 'books',
                'columns': ['title', 'rating_average'],
                'reason': 'Common search and sorting pattern'
            },
            {
                'table': 'books',
                'columns': ['publication_date', 'rating_average'],
                'reason': 'Date-based filtering with rating sort'
            },
            {
                'table': 'download_queue',
                'columns': ['status', 'priority', 'created_at'],
                'reason': 'Queue processing optimization'
            },
            {
                'table': 'search_cache',
                'columns': ['query_hash', 'expires_at'],
                'reason': 'Cache lookup optimization'
            }
        ]
        
        for pattern in index_patterns:
            # Check if index exists
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='index' AND tbl_name=? 
                AND sql LIKE ?
            """, (pattern['table'], f"%{pattern['columns'][0]}%"))
            
            existing_indexes = cursor.fetchall()
            
            # Simple heuristic - if no index contains the first column, suggest one
            if not existing_indexes:
                missing_indexes.append({
                    'table': pattern['table'],
                    'suggested_columns': pattern['columns'],
                    'reason': pattern['reason'],
                    'suggested_sql': f"CREATE INDEX idx_{pattern['table']}_{'_'.join(pattern['columns'])} ON {pattern['table']}({', '.join(pattern['columns'])})"
                })
        
        return missing_indexes
    
    def optimize_database_structure(self) -> Dict:
        """Optimize database structure"""
        optimizations = []
        
        with sqlite3.connect(self.database_path) as conn:
            cursor = conn.cursor()
            
            # Run ANALYZE to update query planner statistics
            cursor.execute("ANALYZE")
            optimizations.append({
                'operation': 'analyze',
                'description': 'Updated query planner statistics',
                'status': 'completed'
            })
            
            # Check if VACUUM is needed
            cursor.execute("SELECT freelist_count FROM pragma_freelist_count()")
            freelist_count = cursor.fetchone()[0]
            
            if freelist_count > 1000:  # Significant fragmentation
                # VACUUM can be slow, so we'll just recommend it
                optimizations.append({
                    'operation': 'vacuum_needed',
                    'description': f'Database has {freelist_count} free pages, VACUUM recommended',
                    'status': 'recommended',
                    'command': 'VACUUM'
                })
            
            # Optimize specific tables if they're very large
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            
            for (table_name,) in tables:
                cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                row_count = cursor.fetchone()[0]
                
                if row_count > 100000:  # Large table
                    optimizations.append({
                        'operation': 'large_table_optimization',
                        'table': table_name,
                        'row_count': row_count,
                        'description': f'Large table {table_name} with {row_count} rows may benefit from partitioning or archiving',
                        'status': 'recommended'
                    })
        
        return {'optimizations': optimizations}
    
    def optimize_database_config(self) -> Dict:
        """Optimize database configuration settings"""
        config_changes = []
        
        # Recommended SQLite PRAGMA settings for FolioFox
        recommended_settings = {
            'journal_mode': 'WAL',
            'synchronous': 'NORMAL',
            'cache_size': -131072,  # 128MB negative value means bytes
            'temp_store': 'MEMORY',
            'mmap_size': 536870912,  # 512MB
            'page_size': 4096,
            'auto_vacuum': 'INCREMENTAL'
        }
        
        try:
            with sqlite3.connect(self.database_path) as conn:
                cursor = conn.cursor()
                
                for setting, recommended_value in recommended_settings.items():
                    try:
                        cursor.execute(f"PRAGMA {setting}")
                        current_value = cursor.fetchone()
                        current_value = current_value[0] if current_value else None
                        
                        # Convert values for comparison
                        if setting == 'journal_mode':
                            should_change = current_value.upper() != str(recommended_value).upper()
                        elif setting == 'synchronous':
                            should_change = current_value != 1  # NORMAL = 1
                        else:
                            should_change = current_value != recommended_value
                        
                        if should_change:
                            config_changes.append({
                                'setting': setting,
                                'current_value': current_value,
                                'recommended_value': recommended_value,
                                'sql': f"PRAGMA {setting}={recommended_value}"
                            })
                    
                    except sqlite3.Error as e:
                        logger.debug(f"Could not check {setting}: {e}")
        
        except Exception as e:
            return {'error': str(e)}
        
        return {'config_changes': config_changes}
    
    def optimize_memory(self) -> Dict:
        """Optimize memory usage"""
        results = {}
        
        # Get current memory stats
        memory = psutil.virtual_memory()
        results['current_memory'] = {
            'total_gb': memory.total / (1024**3),
            'available_gb': memory.available / (1024**3),
            'used_percent': memory.percent,
            'cached_gb': getattr(memory, 'cached', 0) / (1024**3),
            'buffers_gb': getattr(memory, 'buffers', 0) / (1024**3)
        }
        
        recommendations = []
        
        # Memory pressure recommendations
        if memory.percent > 85:
            recommendations.append({
                'type': 'memory_pressure',
                'severity': 'critical',
                'message': 'High memory usage detected, consider adding more RAM or reducing application memory usage',
                'current_usage': f"{memory.percent:.1f}%"
            })
        
        # Cache optimization recommendations
        target_cache_size = int(memory.available * 0.5)  # Use 50% of available memory for caches
        recommendations.append({
            'type': 'cache_optimization',
            'message': f'Consider allocating {target_cache_size // (1024**2)}MB for application caches',
            'sqlite_cache_setting': f"PRAGMA cache_size = -{target_cache_size}"
        })
        
        # Check for memory leaks in processes
        foliofox_processes = []
        for proc in psutil.process_iter(['pid', 'name', 'memory_info', 'create_time']):
            try:
                if 'foliofox' in proc.info['name'].lower():
                    foliofox_processes.append({
                        'pid': proc.info['pid'],
                        'name': proc.info['name'],
                        'memory_mb': proc.info['memory_info'].rss / (1024**2),
                        'age_hours': (time.time() - proc.info['create_time']) / 3600
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        results['foliofox_processes'] = foliofox_processes
        results['recommendations'] = recommendations
        
        return results
    
    def optimize_cpu(self) -> Dict:
        """Optimize CPU performance"""
        results = {}
        
        # Get CPU information
        cpu_info = {
            'physical_cores': psutil.cpu_count(logical=False),
            'logical_cores': psutil.cpu_count(logical=True),
            'cpu_percent_per_core': psutil.cpu_percent(percpu=True, interval=1),
            'cpu_freq': psutil.cpu_freq()._asdict() if psutil.cpu_freq() else None,
            'load_average': os.getloadavg() if hasattr(os, 'getloadavg') else None
        }
        
        results['cpu_info'] = cpu_info
        
        optimizations = []
        
        # CPU governor optimization
        if self.system_config.get('enable_cpu_governor', True):
            governor_opt = self.optimize_cpu_governor()
            optimizations.append(governor_opt)
        
        # CPU affinity recommendations
        if cpu_info['physical_cores'] >= 4:
            optimizations.append({
                'type': 'cpu_affinity',
                'message': 'Consider using CPU affinity to bind FolioFox processes to specific cores',
                'recommendation': f'Use taskset to bind processes to cores 0-{cpu_info["physical_cores"]-2}, leaving core {cpu_info["physical_cores"]-1} for system tasks'
            })
        
        # Load average analysis
        if cpu_info['load_average']:
            avg_1m, avg_5m, avg_15m = cpu_info['load_average']
            if avg_1m > cpu_info['logical_cores'] * 0.8:
                optimizations.append({
                    'type': 'high_load',
                    'severity': 'warning',
                    'message': f'High CPU load detected: {avg_1m:.2f} (threshold: {cpu_info["logical_cores"] * 0.8:.1f})',
                    'recommendation': 'Consider scaling horizontally or optimizing CPU-intensive operations'
                })
        
        results['optimizations'] = optimizations
        return results
    
    def optimize_cpu_governor(self) -> Dict:
        """Optimize CPU governor settings"""
        result = {'type': 'cpu_governor', 'changes': []}
        
        try:
            # Check current CPU governor
            governors_path = '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor'
            if os.path.exists(governors_path):
                with open(governors_path, 'r') as f:
                    current_governor = f.read().strip()
                
                # For database/server applications, 'performance' is usually better
                recommended_governor = 'performance'
                
                if current_governor != recommended_governor:
                    result['changes'].append({
                        'setting': 'cpu_governor',
                        'current': current_governor,
                        'recommended': recommended_governor,
                        'command': f'echo {recommended_governor} | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor'
                    })
                
                # Check available governors
                available_path = '/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors'
                if os.path.exists(available_path):
                    with open(available_path, 'r') as f:
                        available_governors = f.read().strip().split()
                    result['available_governors'] = available_governors
        
        except Exception as e:
            result['error'] = str(e)
        
        return result
    
    def optimize_disk_io(self) -> Dict:
        """Optimize disk I/O performance"""
        results = {}
        
        # Get disk usage statistics
        disk_usage = psutil.disk_usage('/')
        disk_io = psutil.disk_io_counters()
        
        results['disk_stats'] = {
            'total_gb': disk_usage.total / (1024**3),
            'used_gb': disk_usage.used / (1024**3),
            'free_gb': disk_usage.free / (1024**3),
            'usage_percent': (disk_usage.used / disk_usage.total) * 100,
            'read_mb': disk_io.read_bytes / (1024**2) if disk_io else 0,
            'write_mb': disk_io.write_bytes / (1024**2) if disk_io else 0
        }
        
        optimizations = []
        
        # I/O scheduler optimization
        if self.system_config.get('enable_io_scheduler', True):
            io_scheduler_opt = self.optimize_io_scheduler()
            optimizations.append(io_scheduler_opt)
        
        # Disk space warnings
        if results['disk_stats']['usage_percent'] > 90:
            optimizations.append({
                'type': 'disk_space',
                'severity': 'critical',
                'message': f"Disk usage is {results['disk_stats']['usage_percent']:.1f}%, cleanup required",
                'recommendations': [
                    'Clean up old log files',
                    'Archive old download history',
                    'Run database VACUUM to reclaim space',
                    'Consider adding more storage'
                ]
            })
        
        # Check for SSD vs HDD and recommend accordingly
        disk_type = self.detect_disk_type()
        if disk_type:
            optimizations.append({
                'type': 'disk_type_optimization',
                'disk_type': disk_type,
                'recommendations': self.get_disk_type_recommendations(disk_type)
            })
        
        results['optimizations'] = optimizations
        return results
    
    def optimize_io_scheduler(self) -> Dict:
        """Optimize I/O scheduler"""
        result = {'type': 'io_scheduler', 'changes': []}
        
        try:
            # Find block devices
            block_devices = []
            sys_block_path = '/sys/block'
            
            if os.path.exists(sys_block_path):
                for device in os.listdir(sys_block_path):
                    scheduler_path = f'{sys_block_path}/{device}/queue/scheduler'
                    if os.path.exists(scheduler_path):
                        with open(scheduler_path, 'r') as f:
                            scheduler_info = f.read().strip()
                        
                        # Extract current scheduler (marked with [])
                        import re
                        current_match = re.search(r'\[([^\]]+)\]', scheduler_info)
                        current_scheduler = current_match.group(1) if current_match else 'unknown'
                        
                        # For database workloads, deadline or noop is often better than cfq
                        recommended_scheduler = 'deadline' if 'deadline' in scheduler_info else 'noop'
                        
                        if current_scheduler not in ['deadline', 'noop', 'none']:
                            block_devices.append({
                                'device': device,
                                'current_scheduler': current_scheduler,
                                'recommended_scheduler': recommended_scheduler,
                                'available_schedulers': scheduler_info.replace('[', '').replace(']', '').split(),
                                'command': f'echo {recommended_scheduler} | sudo tee {scheduler_path}'
                            })
            
            result['block_devices'] = block_devices
        
        except Exception as e:
            result['error'] = str(e)
        
        return result
    
    def detect_disk_type(self) -> Optional[str]:
        """Detect if disk is SSD or HDD"""
        try:
            # Simple heuristic: check if any block device is rotational
            sys_block_path = '/sys/block'
            if os.path.exists(sys_block_path):
                for device in os.listdir(sys_block_path):
                    rotational_path = f'{sys_block_path}/{device}/queue/rotational'
                    if os.path.exists(rotational_path):
                        with open(rotational_path, 'r') as f:
                            is_rotational = f.read().strip() == '1'
                        return 'HDD' if is_rotational else 'SSD'
        except Exception:
            pass
        
        return None
    
    def get_disk_type_recommendations(self, disk_type: str) -> List[str]:
        """Get disk-type specific recommendations"""
        if disk_type == 'SSD':
            return [
                'Enable TRIM support for better SSD longevity',
                'Consider using WAL mode for SQLite (already recommended)',
                'Disable access time updates with noatime mount option',
                'Use deadline or noop I/O scheduler'
            ]
        elif disk_type == 'HDD':
            return [
                'Use deadline I/O scheduler for better sequential access',
                'Consider increasing read-ahead buffer size',
                'Optimize database page size for HDD (4KB is usually good)',
                'Consider using separate disk for database and downloads'
            ]
        else:
            return []
    
    def optimize_network(self) -> Dict:
        """Optimize network performance"""
        results = {}
        
        # Get network statistics
        net_io = psutil.net_io_counters()
        net_connections = len(psutil.net_connections())
        
        results['network_stats'] = {
            'bytes_sent_mb': net_io.bytes_sent / (1024**2),
            'bytes_recv_mb': net_io.bytes_recv / (1024**2),
            'packets_sent': net_io.packets_sent,
            'packets_recv': net_io.packets_recv,
            'errors_in': net_io.errin,
            'errors_out': net_io.errout,
            'drops_in': net_io.dropin,
            'drops_out': net_io.dropout,
            'active_connections': net_connections
        }
        
        optimizations = []
        
        # TCP buffer optimization
        tcp_optimization = self.optimize_tcp_buffers()
        optimizations.append(tcp_optimization)
        
        # Connection limits optimization
        if net_connections > 1000:
            optimizations.append({
                'type': 'connection_optimization',
                'message': f'{net_connections} active connections detected',
                'recommendations': [
                    'Consider implementing connection pooling',
                    'Review keep-alive settings',
                    'Monitor for connection leaks'
                ]
            })
        
        # Network error analysis
        if net_io.errin > 100 or net_io.errout > 100:
            optimizations.append({
                'type': 'network_errors',
                'severity': 'warning',
                'message': f'Network errors detected: {net_io.errin} in, {net_io.errout} out',
                'recommendations': [
                    'Check network hardware',
                    'Review network configuration',
                    'Monitor network utilization'
                ]
            })
        
        results['optimizations'] = optimizations
        return results
    
    def optimize_tcp_buffers(self) -> Dict:
        """Optimize TCP buffer sizes"""
        result = {'type': 'tcp_buffers', 'recommendations': []}
        
        try:
            # Check current TCP buffer settings
            tcp_settings = {
                'tcp_rmem': '/proc/sys/net/core/rmem_default',
                'tcp_wmem': '/proc/sys/net/core/wmem_default',
                'tcp_max_rmem': '/proc/sys/net/core/rmem_max',
                'tcp_max_wmem': '/proc/sys/net/core/wmem_max'
            }
            
            current_settings = {}
            for name, path in tcp_settings.items():
                try:
                    with open(path, 'r') as f:
                        current_settings[name] = int(f.read().strip())
                except Exception:
                    current_settings[name] = 'unknown'
            
            # Recommendations for high-throughput applications
            recommendations = {
                'tcp_rmem': 65536,      # 64KB
                'tcp_wmem': 65536,      # 64KB  
                'tcp_max_rmem': 16777216,  # 16MB
                'tcp_max_wmem': 16777216   # 16MB
            }
            
            for setting, recommended in recommendations.items():
                current = current_settings.get(setting)
                if current != 'unknown' and current < recommended:
                    result['recommendations'].append({
                        'setting': setting,
                        'current': current,
                        'recommended': recommended,
                        'command': f'echo {recommended} | sudo tee {tcp_settings[setting]}'
                    })
        
        except Exception as e:
            result['error'] = str(e)
        
        return result
    
    def optimize_redis(self) -> Dict:
        """Optimize Redis configuration if available"""
        results = {}
        
        try:
            import redis
            
            # Try to connect to Redis
            redis_client = redis.Redis(
                host=self.redis_config.get('host', 'localhost'),
                port=self.redis_config.get('port', 6379),
                decode_responses=True
            )
            
            # Get Redis info
            redis_info = redis_client.info()
            results['redis_info'] = {
                'version': redis_info.get('redis_version'),
                'memory_used_mb': redis_info.get('used_memory', 0) / (1024**2),
                'memory_peak_mb': redis_info.get('used_memory_peak', 0) / (1024**2),
                'connected_clients': redis_info.get('connected_clients', 0),
                'keyspace_hits': redis_info.get('keyspace_hits', 0),
                'keyspace_misses': redis_info.get('keyspace_misses', 0)
            }
            
            # Calculate hit ratio
            hits = redis_info.get('keyspace_hits', 0)
            misses = redis_info.get('keyspace_misses', 0)
            hit_ratio = hits / (hits + misses) * 100 if (hits + misses) > 0 else 0
            results['redis_info']['hit_ratio_percent'] = hit_ratio
            
            # Redis optimization recommendations
            optimizations = []
            
            # Memory optimization
            if results['redis_info']['memory_used_mb'] > 400:  # Close to 512MB limit
                optimizations.append({
                    'type': 'memory_usage',
                    'severity': 'warning',
                    'message': f"Redis using {results['redis_info']['memory_used_mb']:.1f}MB of memory",
                    'recommendations': [
                        'Consider increasing Redis memory limit',
                        'Review cache expiration policies',
                        'Use memory-efficient data structures'
                    ]
                })
            
            # Hit ratio optimization
            if hit_ratio < 90:
                optimizations.append({
                    'type': 'hit_ratio',
                    'message': f'Redis hit ratio is {hit_ratio:.1f}%, consider optimizing cache strategy',
                    'recommendations': [
                        'Increase cache TTL for frequently accessed data',
                        'Review cache key patterns',
                        'Consider pre-warming cache'
                    ]
                })
            
            # Configuration recommendations
            config_recommendations = {
                'maxmemory': '512mb',
                'maxmemory-policy': 'allkeys-lru',
                'save': '""',  # Disable persistence for cache-only usage
                'appendonly': 'no'
            }
            
            for setting, recommended in config_recommendations.items():
                try:
                    current_value = redis_client.config_get(setting)
                    if setting not in current_value or current_value[setting] != recommended:
                        optimizations.append({
                            'type': 'configuration',
                            'setting': setting,
                            'current': current_value.get(setting, 'not set'),
                            'recommended': recommended,
                            'command': f'redis-cli CONFIG SET {setting} {recommended}'
                        })
                except Exception as e:
                    logger.debug(f"Could not check Redis config {setting}: {e}")
            
            results['optimizations'] = optimizations
        
        except ImportError:
            results['error'] = 'Redis Python client not available'
        except Exception as e:
            results['error'] = f'Could not connect to Redis: {e}'
        
        return results
    
    def generate_optimization_report(self) -> Dict:
        """Generate comprehensive optimization report"""
        report = {
            'timestamp': datetime.now().isoformat(),
            'system_info': {
                'hostname': os.uname().nodename,
                'os': f"{os.uname().sysname} {os.uname().release}",
                'python_version': sys.version.split()[0],
                'cpu_cores': psutil.cpu_count(),
                'total_memory_gb': psutil.virtual_memory().total / (1024**3)
            },
            'optimization_results': self.optimization_results,
            'summary': self.generate_summary(),
            'action_items': self.generate_action_items()
        }
        
        return report
    
    def generate_summary(self) -> Dict:
        """Generate optimization summary"""
        summary = {
            'total_components_optimized': len(self.optimization_results),
            'errors': 0,
            'warnings': 0,
            'recommendations': 0
        }
        
        for component, results in self.optimization_results.items():
            if 'error' in results:
                summary['errors'] += 1
            
            # Count warnings and recommendations
            if 'optimizations' in results:
                for opt in results['optimizations']:
                    if isinstance(opt, dict):
                        severity = opt.get('severity', 'info')
                        if severity == 'warning':
                            summary['warnings'] += 1
                        elif 'recommendation' in opt or 'recommendations' in opt:
                            summary['recommendations'] += 1
        
        return summary
    
    def generate_action_items(self) -> List[Dict]:
        """Generate prioritized action items"""
        action_items = []
        
        for component, results in self.optimization_results.items():
            if 'optimizations' in results:
                for opt in results['optimizations']:
                    if isinstance(opt, dict):
                        severity = opt.get('severity', 'info')
                        priority = 'high' if severity == 'critical' else 'medium' if severity == 'warning' else 'low'
                        
                        action_items.append({
                            'component': component,
                            'priority': priority,
                            'description': opt.get('message', opt.get('description', 'Optimization available')),
                            'type': opt.get('type', 'optimization'),
                            'commands': [opt.get('command')] if 'command' in opt else [],
                            'recommendations': opt.get('recommendations', [])
                        })
        
        # Sort by priority
        priority_order = {'high': 0, 'medium': 1, 'low': 2}
        action_items.sort(key=lambda x: priority_order.get(x['priority'], 3))
        
        return action_items
    
    def save_report(self, report: Dict, filename: str = None) -> str:
        """Save optimization report to file"""
        if not filename:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f'foliofox_optimization_report_{timestamp}.json'
        
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        
        logger.info(f"Optimization report saved to {filename}")
        return filename

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='FolioFox System Performance Optimizer')
    parser.add_argument('--config', help='Configuration file path')
    parser.add_argument('--components', nargs='+', 
                       choices=['system', 'database', 'memory', 'cpu', 'disk', 'network', 'redis'],
                       help='Specific components to optimize')
    parser.add_argument('--output', help='Output report filename')
    parser.add_argument('--apply', action='store_true', 
                       help='Apply safe optimizations automatically (NOT IMPLEMENTED - manual review required)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Create optimizer
    optimizer = SystemOptimizer(args.config)
    
    # Run optimization
    report = optimizer.run_optimization(args.components)
    
    # Save report
    report_filename = optimizer.save_report(report, args.output)
    
    # Print summary
    print("\n" + "="*60)
    print("FOLIOFOX OPTIMIZATION SUMMARY")
    print("="*60)
    
    summary = report['summary']
    print(f"Components analyzed: {summary['total_components_optimized']}")
    print(f"Errors: {summary['errors']}")
    print(f"Warnings: {summary['warnings']}")
    print(f"Recommendations: {summary['recommendations']}")
    
    print(f"\nDetailed report saved to: {report_filename}")
    
    # Show high-priority action items
    high_priority_items = [item for item in report['action_items'] if item['priority'] == 'high']
    if high_priority_items:
        print(f"\nHIGH PRIORITY ACTION ITEMS:")
        for i, item in enumerate(high_priority_items[:5], 1):
            print(f"{i}. [{item['component']}] {item['description']}")
    
    print("\nReview the detailed report for complete optimization recommendations.")
    print("IMPORTANT: Manual review is required before applying system-level changes.")

if __name__ == '__main__':
    main()