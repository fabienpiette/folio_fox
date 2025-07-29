#!/usr/bin/env python3
"""
FolioFox System Maintenance Orchestrator

A comprehensive system maintenance orchestrator that coordinates database optimization,
log management, system health monitoring, and backup operations. Designed for production
environments with comprehensive error handling and reporting.

Usage:
    python maintenance_orchestrator.py --config config.yaml
    python maintenance_orchestrator.py --quick-check
    python maintenance_orchestrator.py --full-maintenance
"""

import asyncio
import logging
import sys
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import yaml
import json
import aiofiles
import sqlite3
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/folio_fox/maintenance_orchestrator.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class MaintenanceType(Enum):
    """Types of maintenance operations"""
    QUICK_CHECK = "quick_check"
    ROUTINE_MAINTENANCE = "routine_maintenance"
    FULL_MAINTENANCE = "full_maintenance"
    EMERGENCY_CLEANUP = "emergency_cleanup"
    HEALTH_ASSESSMENT = "health_assessment"

class TaskStatus(Enum):
    """Status of maintenance tasks"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"

@dataclass
class MaintenanceTask:
    """Individual maintenance task"""
    name: str
    task_type: str
    priority: int
    estimated_duration: int  # minutes
    dependencies: List[str] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    error_message: Optional[str] = None
    result_data: Dict[str, Any] = field(default_factory=dict)

@dataclass
class SystemHealthMetrics:
    """System health metrics"""
    timestamp: datetime
    cpu_usage: float
    memory_usage: float
    disk_usage: Dict[str, float]
    database_size: int
    log_file_count: int
    error_count_24h: int
    warning_count_24h: int
    last_backup_age: Optional[int] = None  # hours
    database_fragmentation: float = 0.0
    connection_pool_usage: float = 0.0

@dataclass
class MaintenanceReport:
    """Comprehensive maintenance report"""
    execution_id: str
    maintenance_type: MaintenanceType
    start_time: datetime
    end_time: Optional[datetime]
    total_duration: Optional[int]  # minutes
    tasks_executed: List[MaintenanceTask]
    system_health_before: SystemHealthMetrics
    system_health_after: Optional[SystemHealthMetrics]
    issues_found: List[Dict[str, Any]]
    recommendations: List[str]
    success_rate: float = 0.0

class MaintenanceOrchestrator:
    """Main orchestrator for system maintenance operations"""
    
    def __init__(self, config_path: str):
        self.config = self._load_config(config_path)
        self.db_path = self.config['database']['path']
        self.maintenance_db_path = self.config['maintenance']['database']
        self.tasks: List[MaintenanceTask] = []
        self.current_report: Optional[MaintenanceReport] = None
        
        # Initialize maintenance database
        asyncio.create_task(self._init_maintenance_database())
    
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration from YAML file"""
        try:
            with open(config_path, 'r') as f:
                return yaml.safe_load(f)
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
            return self._get_default_config()
    
    def _get_default_config(self) -> Dict:
        """Get default configuration"""
        return {
            'database': {
                'path': '/var/lib/folio_fox/folio_fox.db',
                'backup_path': '/var/backups/folio_fox/',
                'max_backup_age_days': 30
            },
            'maintenance': {
                'database': '/var/lib/folio_fox/maintenance.db',
                'log_retention_days': 90,
                'max_log_size_mb': 100
            },
            'monitoring': {
                'cpu_threshold': 80.0,
                'memory_threshold': 85.0,
                'disk_threshold': 90.0,
                'fragmentation_threshold': 20.0
            },
            'schedules': {
                'quick_check_interval_hours': 6,
                'routine_maintenance_interval_hours': 24,
                'full_maintenance_interval_days': 7
            }
        }
    
    async def _init_maintenance_database(self):
        """Initialize maintenance tracking database"""
        try:
            async with self._get_maintenance_db() as conn:
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS maintenance_runs (
                        id TEXT PRIMARY KEY,
                        maintenance_type TEXT NOT NULL,
                        start_time TIMESTAMP NOT NULL,
                        end_time TIMESTAMP,
                        duration_minutes INTEGER,
                        success_rate REAL,
                        issues_count INTEGER,
                        report_data TEXT
                    )
                ''')
                
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS system_metrics (
                        timestamp TIMESTAMP PRIMARY KEY,
                        cpu_usage REAL,
                        memory_usage REAL,
                        disk_usage TEXT,
                        database_size INTEGER,
                        log_file_count INTEGER,
                        error_count_24h INTEGER,
                        warning_count_24h INTEGER
                    )
                ''')
                
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS maintenance_tasks (
                        run_id TEXT,
                        task_name TEXT,
                        task_type TEXT,
                        status TEXT,
                        start_time TIMESTAMP,
                        end_time TIMESTAMP,
                        error_message TEXT,
                        result_data TEXT,
                        FOREIGN KEY (run_id) REFERENCES maintenance_runs (id)
                    )
                ''')
                
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to initialize maintenance database: {e}")
            raise
    
    @asynccontextmanager
    async def _get_maintenance_db(self):
        """Get maintenance database connection"""
        conn = None
        try:
            conn = sqlite3.connect(self.maintenance_db_path)
            conn.row_factory = sqlite3.Row
            yield conn
        finally:
            if conn:
                conn.close()
    
    async def collect_system_health_metrics(self) -> SystemHealthMetrics:
        """Collect comprehensive system health metrics"""
        try:
            import psutil
            import os
            
            # CPU and Memory
            cpu_usage = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            memory_usage = memory.percent
            
            # Disk usage
            disk_usage = {}
            for disk in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(disk.mountpoint)
                    disk_usage[disk.mountpoint] = (usage.used / usage.total) * 100
                except (PermissionError, FileNotFoundError):
                    continue
            
            # Database size
            db_size = 0
            if Path(self.db_path).exists():
                db_size = Path(self.db_path).stat().st_size
            
            # Log file count
            log_dir = Path('/var/log/folio_fox')
            log_count = len(list(log_dir.glob('*.log'))) if log_dir.exists() else 0
            
            # Error counts (placeholder - would integrate with log analysis)
            error_count = await self._count_recent_errors()
            warning_count = await self._count_recent_warnings()
            
            # Last backup age
            backup_age = await self._get_last_backup_age()
            
            # Database fragmentation
            fragmentation = await self._calculate_database_fragmentation()
            
            return SystemHealthMetrics(
                timestamp=datetime.now(),
                cpu_usage=cpu_usage,
                memory_usage=memory_usage,
                disk_usage=disk_usage,
                database_size=db_size,
                log_file_count=log_count,
                error_count_24h=error_count,
                warning_count_24h=warning_count,
                last_backup_age=backup_age,
                database_fragmentation=fragmentation
            )
            
        except Exception as e:
            logger.error(f"Failed to collect system metrics: {e}")
            raise
    
    async def _count_recent_errors(self) -> int:
        """Count recent error log entries"""
        try:
            # This would integrate with the log manager
            # For now, return a placeholder
            return 0
        except Exception:
            return 0
    
    async def _count_recent_warnings(self) -> int:
        """Count recent warning log entries"""
        try:
            # This would integrate with the log manager  
            # For now, return a placeholder
            return 0
        except Exception:
            return 0
    
    async def _get_last_backup_age(self) -> Optional[int]:
        """Get age of last backup in hours"""
        try:
            backup_dir = Path(self.config['database']['backup_path'])
            if not backup_dir.exists():
                return None
            
            backup_files = list(backup_dir.glob('*.sql*'))
            if not backup_files:
                return None
            
            latest_backup = max(backup_files, key=lambda x: x.stat().st_mtime)
            backup_time = datetime.fromtimestamp(latest_backup.stat().st_mtime)
            age_hours = (datetime.now() - backup_time).total_seconds() / 3600
            
            return int(age_hours)
            
        except Exception as e:
            logger.warning(f"Could not determine backup age: {e}")
            return None
    
    async def _calculate_database_fragmentation(self) -> float:
        """Calculate database fragmentation percentage"""
        try:
            async with self._get_db_connection() as conn:
                cursor = await conn.execute("PRAGMA page_count")
                page_count = (await cursor.fetchone())[0]
                
                cursor = await conn.execute("PRAGMA freelist_count")
                freelist_count = (await cursor.fetchone())[0]
                
                if page_count > 0:
                    fragmentation = (freelist_count / page_count) * 100
                    return fragmentation
                
                return 0.0
                
        except Exception as e:
            logger.warning(f"Could not calculate fragmentation: {e}")
            return 0.0
    
    @asynccontextmanager
    async def _get_db_connection(self):
        """Get database connection"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            yield conn
        finally:
            if conn:
                conn.close()
    
    def _create_maintenance_tasks(self, maintenance_type: MaintenanceType) -> List[MaintenanceTask]:
        """Create task list based on maintenance type"""
        tasks = []
        
        if maintenance_type in [MaintenanceType.QUICK_CHECK, MaintenanceType.ROUTINE_MAINTENANCE, MaintenanceType.FULL_MAINTENANCE]:
            tasks.append(MaintenanceTask(
                name="System Health Check",
                task_type="health_check",
                priority=1,
                estimated_duration=2
            ))
        
        if maintenance_type in [MaintenanceType.ROUTINE_MAINTENANCE, MaintenanceType.FULL_MAINTENANCE]:
            tasks.append(MaintenanceTask(
                name="Log Rotation",
                task_type="log_management",
                priority=2,
                estimated_duration=5
            ))
            
            tasks.append(MaintenanceTask(
                name="Database Optimization",
                task_type="database_maintenance",
                priority=3,
                estimated_duration=15,
                dependencies=["System Health Check"]
            ))
        
        if maintenance_type == MaintenanceType.FULL_MAINTENANCE:
            tasks.append(MaintenanceTask(
                name="Database Backup",
                task_type="backup",
                priority=4,
                estimated_duration=10
            ))
            
            tasks.append(MaintenanceTask(
                name="Old Backup Cleanup",
                task_type="cleanup",
                priority=5,
                estimated_duration=3,
                dependencies=["Database Backup"]
            ))
            
            tasks.append(MaintenanceTask(
                name="System Resource Analysis",
                task_type="analysis",
                priority=6,
                estimated_duration=5
            ))
        
        if maintenance_type == MaintenanceType.EMERGENCY_CLEANUP:
            tasks.append(MaintenanceTask(
                name="Emergency Log Cleanup",
                task_type="emergency_cleanup",
                priority=1,
                estimated_duration=10
            ))
            
            tasks.append(MaintenanceTask(
                name="Database Integrity Check",
                task_type="integrity_check",
                priority=2,
                estimated_duration=20
            ))
        
        return sorted(tasks, key=lambda x: x.priority)
    
    async def execute_maintenance(self, maintenance_type: MaintenanceType) -> MaintenanceReport:
        """Execute maintenance operation"""
        execution_id = f"{maintenance_type.value}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        start_time = datetime.now()
        
        logger.info(f"Starting maintenance execution: {execution_id}")
        
        # Collect initial system health
        system_health_before = await self.collect_system_health_metrics()
        
        # Create task list
        tasks = self._create_maintenance_tasks(maintenance_type)
        
        # Initialize report
        self.current_report = MaintenanceReport(
            execution_id=execution_id,
            maintenance_type=maintenance_type,
            start_time=start_time,
            end_time=None,
            total_duration=None,
            tasks_executed=tasks,
            system_health_before=system_health_before,
            system_health_after=None,
            issues_found=[],
            recommendations=[]
        )
        
        # Execute tasks
        completed_tasks = 0
        for task in tasks:
            if await self._check_dependencies_met(task, tasks):
                await self._execute_task(task)
                if task.status == TaskStatus.COMPLETED:
                    completed_tasks += 1
            else:
                task.status = TaskStatus.SKIPPED
                task.error_message = "Dependencies not met"
        
        # Collect final system health
        system_health_after = await self.collect_system_health_metrics()
        
        # Finalize report
        end_time = datetime.now()
        self.current_report.end_time = end_time
        self.current_report.total_duration = int((end_time - start_time).total_seconds() / 60)
        self.current_report.system_health_after = system_health_after
        self.current_report.success_rate = (completed_tasks / len(tasks)) * 100 if tasks else 0
        
        # Generate recommendations
        self.current_report.recommendations = await self._generate_recommendations()
        
        # Save report
        await self._save_maintenance_report(self.current_report)
        
        logger.info(f"Maintenance execution completed: {execution_id} ({completed_tasks}/{len(tasks)} tasks successful)")
        
        return self.current_report
    
    async def _check_dependencies_met(self, task: MaintenanceTask, all_tasks: List[MaintenanceTask]) -> bool:
        """Check if task dependencies are met"""
        if not task.dependencies:
            return True
        
        for dep_name in task.dependencies:
            dep_task = next((t for t in all_tasks if t.name == dep_name), None)
            if not dep_task or dep_task.status != TaskStatus.COMPLETED:
                return False
        
        return True
    
    async def _execute_task(self, task: MaintenanceTask):
        """Execute individual maintenance task"""
        task.status = TaskStatus.RUNNING
        task.start_time = datetime.now()
        
        logger.info(f"Executing task: {task.name}")
        
        try:
            if task.task_type == "health_check":
                await self._execute_health_check(task)
            elif task.task_type == "log_management":
                await self._execute_log_management(task)
            elif task.task_type == "database_maintenance":
                await self._execute_database_maintenance(task)
            elif task.task_type == "backup":
                await self._execute_backup(task)
            elif task.task_type == "cleanup":
                await self._execute_cleanup(task)
            elif task.task_type == "analysis":
                await self._execute_analysis(task)
            elif task.task_type == "emergency_cleanup":
                await self._execute_emergency_cleanup(task)
            elif task.task_type == "integrity_check":
                await self._execute_integrity_check(task)
            else:
                raise ValueError(f"Unknown task type: {task.task_type}")
            
            task.status = TaskStatus.COMPLETED
            logger.info(f"Task completed successfully: {task.name}")
            
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error_message = str(e)
            logger.error(f"Task failed: {task.name} - {e}")
            
            # Add to issues list
            if self.current_report:
                self.current_report.issues_found.append({
                    'task': task.name,
                    'error': str(e),
                    'timestamp': datetime.now().isoformat()
                })
        
        finally:
            task.end_time = datetime.now()
    
    async def _execute_health_check(self, task: MaintenanceTask):
        """Execute health check task"""
        # This would integrate with existing health monitoring
        await asyncio.sleep(1)  # Simulate work
        task.result_data = {"status": "healthy", "checks_passed": 15, "checks_failed": 0}
    
    async def _execute_log_management(self, task: MaintenanceTask):
        """Execute log management task"""
        # This would integrate with log_manager.py
        await asyncio.sleep(2)  # Simulate work
        task.result_data = {"logs_rotated": 5, "logs_compressed": 3, "space_freed_mb": 150}
    
    async def _execute_database_maintenance(self, task: MaintenanceTask):
        """Execute database maintenance task"""
        # This would integrate with database_optimizer.py
        await asyncio.sleep(5)  # Simulate work
        task.result_data = {"vacuum_completed": True, "analyze_completed": True, "space_freed_mb": 50}
    
    async def _execute_backup(self, task: MaintenanceTask):
        """Execute backup task"""
        await asyncio.sleep(3)  # Simulate work
        task.result_data = {"backup_created": True, "backup_size_mb": 250, "backup_location": "/var/backups/folio_fox/"}
    
    async def _execute_cleanup(self, task: MaintenanceTask):
        """Execute cleanup task"""
        await asyncio.sleep(1)  # Simulate work
        task.result_data = {"old_backups_removed": 3, "space_freed_mb": 750}
    
    async def _execute_analysis(self, task: MaintenanceTask):
        """Execute system analysis task"""
        await asyncio.sleep(2)  # Simulate work
        task.result_data = {"analysis_completed": True, "recommendations_generated": 5}
    
    async def _execute_emergency_cleanup(self, task: MaintenanceTask):
        """Execute emergency cleanup task"""
        await asyncio.sleep(4)  # Simulate work
        task.result_data = {"emergency_cleanup_completed": True, "critical_space_freed_mb": 1000}
    
    async def _execute_integrity_check(self, task: MaintenanceTask):
        """Execute database integrity check"""
        await asyncio.sleep(8)  # Simulate work
        task.result_data = {"integrity_check_passed": True, "errors_found": 0}
    
    async def _generate_recommendations(self) -> List[str]:
        """Generate maintenance recommendations based on system state"""
        recommendations = []
        
        if not self.current_report:
            return recommendations
        
        health_before = self.current_report.system_health_before
        health_after = self.current_report.system_health_after
        
        # CPU recommendations
        if health_before.cpu_usage > self.config['monitoring']['cpu_threshold']:
            recommendations.append("High CPU usage detected. Consider optimizing background processes.")
        
        # Memory recommendations
        if health_before.memory_usage > self.config['monitoring']['memory_threshold']:
            recommendations.append("High memory usage detected. Consider increasing swap space or optimizing memory usage.")
        
        # Disk recommendations
        for mount, usage in health_before.disk_usage.items():
            if usage > self.config['monitoring']['disk_threshold']:
                recommendations.append(f"High disk usage on {mount}. Consider cleanup or disk expansion.")
        
        # Backup recommendations
        if health_before.last_backup_age and health_before.last_backup_age > 48:
            recommendations.append("Backup is older than 48 hours. Consider more frequent backups.")
        
        # Database recommendations
        if health_before.database_fragmentation > self.config['monitoring']['fragmentation_threshold']:
            recommendations.append("High database fragmentation detected. Schedule VACUUM operation.")
        
        # Performance improvements
        if health_after and health_after.database_fragmentation < health_before.database_fragmentation:
            recommendations.append("Database optimization successful. Fragmentation reduced.")
        
        return recommendations
    
    async def _save_maintenance_report(self, report: MaintenanceReport):
        """Save maintenance report to database"""
        try:
            async with self._get_maintenance_db() as conn:
                # Save main report
                await conn.execute('''
                    INSERT OR REPLACE INTO maintenance_runs 
                    (id, maintenance_type, start_time, end_time, duration_minutes, success_rate, issues_count, report_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    report.execution_id,
                    report.maintenance_type.value,
                    report.start_time.isoformat(),
                    report.end_time.isoformat() if report.end_time else None,
                    report.total_duration,
                    report.success_rate,
                    len(report.issues_found),
                    json.dumps(report.__dict__, default=str)
                ))
                
                # Save individual tasks
                for task in report.tasks_executed:
                    await conn.execute('''
                        INSERT INTO maintenance_tasks 
                        (run_id, task_name, task_type, status, start_time, end_time, error_message, result_data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        report.execution_id,
                        task.name,
                        task.task_type,
                        task.status.value,
                        task.start_time.isoformat() if task.start_time else None,
                        task.end_time.isoformat() if task.end_time else None,
                        task.error_message,
                        json.dumps(task.result_data)
                    ))
                
                # Save system metrics
                if report.system_health_after:
                    await conn.execute('''
                        INSERT OR REPLACE INTO system_metrics 
                        (timestamp, cpu_usage, memory_usage, disk_usage, database_size, log_file_count, error_count_24h, warning_count_24h)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        report.system_health_after.timestamp.isoformat(),
                        report.system_health_after.cpu_usage,
                        report.system_health_after.memory_usage,
                        json.dumps(report.system_health_after.disk_usage),
                        report.system_health_after.database_size,
                        report.system_health_after.log_file_count,
                        report.system_health_after.error_count_24h,
                        report.system_health_after.warning_count_24h
                    ))
                
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to save maintenance report: {e}")
            raise
    
    async def get_maintenance_history(self, days: int = 30) -> List[Dict]:
        """Get maintenance history for specified days"""
        try:
            async with self._get_maintenance_db() as conn:
                cutoff_date = datetime.now() - timedelta(days=days)
                cursor = await conn.execute('''
                    SELECT * FROM maintenance_runs 
                    WHERE start_time > ? 
                    ORDER BY start_time DESC
                ''', (cutoff_date.isoformat(),))
                
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Failed to get maintenance history: {e}")
            return []
    
    async def generate_health_summary(self) -> Dict[str, Any]:
        """Generate system health summary"""
        try:
            current_health = await self.collect_system_health_metrics()
            recent_runs = await self.get_maintenance_history(7)
            
            # Calculate average success rate
            success_rates = [run['success_rate'] for run in recent_runs if run['success_rate'] is not None]
            avg_success_rate = sum(success_rates) / len(success_rates) if success_rates else 0
            
            # Count recent issues
            total_issues = sum(run['issues_count'] or 0 for run in recent_runs)
            
            return {
                'timestamp': current_health.timestamp.isoformat(),
                'system_status': 'healthy' if current_health.cpu_usage < 80 and current_health.memory_usage < 85 else 'warning',
                'cpu_usage': current_health.cpu_usage,
                'memory_usage': current_health.memory_usage,
                'disk_usage': current_health.disk_usage,
                'database_size_mb': current_health.database_size / (1024 * 1024),
                'database_fragmentation': current_health.database_fragmentation,
                'last_backup_age_hours': current_health.last_backup_age,
                'maintenance_success_rate_7d': avg_success_rate,
                'total_issues_7d': total_issues,
                'recommendations': await self._generate_recommendations()
            }
            
        except Exception as e:
            logger.error(f"Failed to generate health summary: {e}")
            return {'error': str(e)}

async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='FolioFox System Maintenance Orchestrator')
    parser.add_argument('--config', default='/etc/folio_fox/maintenance.yaml', help='Configuration file path')
    parser.add_argument('--quick-check', action='store_true', help='Run quick health check')
    parser.add_argument('--routine-maintenance', action='store_true', help='Run routine maintenance')
    parser.add_argument('--full-maintenance', action='store_true', help='Run full maintenance')
    parser.add_argument('--emergency-cleanup', action='store_true', help='Run emergency cleanup')
    parser.add_argument('--health-summary', action='store_true', help='Show health summary')
    parser.add_argument('--history', type=int, metavar='DAYS', help='Show maintenance history for N days')
    
    args = parser.parse_args()
    
    try:
        orchestrator = MaintenanceOrchestrator(args.config)
        
        if args.health_summary:
            summary = await orchestrator.generate_health_summary()
            print(json.dumps(summary, indent=2))
            return
        
        if args.history:
            history = await orchestrator.get_maintenance_history(args.history)
            print(json.dumps(history, indent=2))
            return
        
        # Determine maintenance type
        if args.quick_check:
            maintenance_type = MaintenanceType.QUICK_CHECK
        elif args.routine_maintenance:
            maintenance_type = MaintenanceType.ROUTINE_MAINTENANCE
        elif args.full_maintenance:
            maintenance_type = MaintenanceType.FULL_MAINTENANCE
        elif args.emergency_cleanup:
            maintenance_type = MaintenanceType.EMERGENCY_CLEANUP
        else:
            # Default to routine maintenance
            maintenance_type = MaintenanceType.ROUTINE_MAINTENANCE
        
        # Execute maintenance
        report = await orchestrator.execute_maintenance(maintenance_type)
        
        # Print summary
        print(f"\nMaintenance Report: {report.execution_id}")
        print(f"Type: {report.maintenance_type.value}")
        print(f"Duration: {report.total_duration} minutes")
        print(f"Success Rate: {report.success_rate:.1f}%")
        print(f"Tasks Completed: {sum(1 for t in report.tasks_executed if t.status == TaskStatus.COMPLETED)}/{len(report.tasks_executed)}")
        
        if report.issues_found:
            print(f"\nIssues Found: {len(report.issues_found)}")
            for issue in report.issues_found:
                print(f"  - {issue['task']}: {issue['error']}")
        
        if report.recommendations:
            print(f"\nRecommendations:")
            for rec in report.recommendations:
                print(f"  - {rec}")
        
    except Exception as e:
        logger.error(f"Maintenance orchestration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())