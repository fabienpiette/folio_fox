#!/usr/bin/env python3
"""
FolioFox Indexer Health Monitor
Comprehensive health monitoring for Prowlarr/Jackett indexers with alerting and failover.
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
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from enum import Enum
import aiohttp
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/foliofox/indexer_health.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('foliofox.indexer_health')

class IndexerType(Enum):
    PROWLARR = "prowlarr"
    JACKETT = "jackett"

class HealthStatus(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    MAINTENANCE = "maintenance"
    UNKNOWN = "unknown"

@dataclass
class IndexerConfig:
    id: int
    name: str
    type: IndexerType
    base_url: str
    api_key: str
    timeout_seconds: int
    enabled: bool
    priority: int

@dataclass
class HealthCheck:
    indexer_id: int
    status: HealthStatus
    response_time_ms: Optional[int]
    error_message: Optional[str]
    timestamp: datetime
    details: Optional[Dict[str, Any]] = None

@dataclass
class IndexerMetrics:
    indexer_id: int
    total_requests: int
    successful_requests: int
    failed_requests: int
    avg_response_time: float
    uptime_percentage: float
    last_successful_check: Optional[datetime]
    consecutive_failures: int

@dataclass
class AlertConfig:
    enabled: bool = True
    email_recipients: List[str] = None
    webhook_url: Optional[str] = None
    failure_threshold: int = 3
    recovery_notification: bool = True
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None

class HealthMonitor:
    """Comprehensive health monitoring for indexers."""
    
    def __init__(self, config_path: str = "./config/config.yaml"):
        self.config = self._load_config(config_path)
        self.db_path = self.config.get('database', {}).get('path', './data/foliofox.db')
        
        # Health check configuration
        self.check_interval = 300  # 5 minutes
        self.timeout_default = 30
        self.rate_limit_window = 60  # seconds
        self.max_concurrent_checks = 5
        
        # Alert configuration
        self.alert_config = AlertConfig()
        self._load_alert_config()
        
        # Internal state
        self.indexer_configs: Dict[int, IndexerConfig] = {}
        self.health_cache: Dict[int, HealthCheck] = {}
        self.metrics_cache: Dict[int, IndexerMetrics] = {}
        self.alert_cooldowns: Dict[int, datetime] = {}
        
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
    
    def _load_alert_config(self):
        """Load alerting configuration."""
        alert_config = self.config.get('alerts', {})
        
        self.alert_config.enabled = alert_config.get('enabled', True)
        self.alert_config.email_recipients = alert_config.get('email_recipients', [])
        self.alert_config.webhook_url = alert_config.get('webhook_url')
        self.alert_config.failure_threshold = alert_config.get('failure_threshold', 3)
        self.alert_config.recovery_notification = alert_config.get('recovery_notification', True)
        
        # SMTP settings
        smtp_config = alert_config.get('smtp', {})
        self.alert_config.smtp_host = smtp_config.get('host', 'localhost')
        self.alert_config.smtp_port = smtp_config.get('port', 587)
        self.alert_config.smtp_username = smtp_config.get('username')
        self.alert_config.smtp_password = smtp_config.get('password')
    
    def get_database_connection(self) -> sqlite3.Connection:
        """Get database connection with proper error handling."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            return conn
        except sqlite3.Error as e:
            logger.error(f"Database connection error: {e}")
            raise
    
    def initialize_database(self):
        """Initialize health monitoring tables."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Create indexer health table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS indexer_health (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        indexer_id INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        response_time_ms INTEGER,
                        error_message TEXT,
                        check_details TEXT,
                        checked_at TEXT NOT NULL,
                        FOREIGN KEY (indexer_id) REFERENCES indexers (id)
                    )
                """)
                
                # Create indexer metrics table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS indexer_metrics (
                        indexer_id INTEGER PRIMARY KEY,
                        total_requests INTEGER DEFAULT 0,
                        successful_requests INTEGER DEFAULT 0,
                        failed_requests INTEGER DEFAULT 0,
                        avg_response_time REAL DEFAULT 0,
                        uptime_percentage REAL DEFAULT 100,
                        last_successful_check TEXT,
                        consecutive_failures INTEGER DEFAULT 0,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (indexer_id) REFERENCES indexers (id)
                    )
                """)
                
                # Create alerts log table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS indexer_alerts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        indexer_id INTEGER NOT NULL,
                        alert_type TEXT NOT NULL,
                        message TEXT NOT NULL,
                        resolved BOOLEAN DEFAULT FALSE,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        resolved_at TEXT,
                        FOREIGN KEY (indexer_id) REFERENCES indexers (id)
                    )
                """)
                
                conn.commit()
                logger.info("Health monitoring database initialized")
                
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            raise
    
    def load_indexer_configs(self):
        """Load indexer configurations from database."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT id, name, type, base_url, api_key, timeout_seconds, 
                           enabled, priority
                    FROM indexers 
                    WHERE enabled = 1
                """)
                
                rows = cursor.fetchall()
                self.indexer_configs = {}
                
                for row in rows:
                    config = IndexerConfig(
                        id=row['id'],
                        name=row['name'],
                        type=IndexerType(row['type']),
                        base_url=row['base_url'],
                        api_key=row['api_key'],
                        timeout_seconds=row['timeout_seconds'] or self.timeout_default,
                        enabled=row['enabled'],
                        priority=row['priority'] or 5
                    )
                    self.indexer_configs[config.id] = config
                
                logger.info(f"Loaded {len(self.indexer_configs)} indexer configurations")
                
        except Exception as e:
            logger.error(f"Error loading indexer configurations: {e}")
            self.indexer_configs = {}
    
    async def check_prowlarr_health(self, config: IndexerConfig) -> HealthCheck:
        """Perform health check on Prowlarr indexer."""
        start_time = time.time()
        
        try:
            timeout = aiohttp.ClientTimeout(total=config.timeout_seconds)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                # Check system status
                status_url = f"{config.base_url}/api/v1/system/status"
                headers = {"X-Api-Key": config.api_key}
                
                async with session.get(status_url, headers=headers) as response:
                    response_time = int((time.time() - start_time) * 1000)
                    
                    if response.status == 200:
                        system_data = await response.json()
                        
                        # Check indexer-specific endpoint
                        indexer_url = f"{config.base_url}/api/v1/indexer/{config.id}"
                        async with session.get(indexer_url, headers=headers) as idx_response:
                            if idx_response.status == 200:
                                indexer_data = await idx_response.json()
                                
                                # Determine health status based on response
                                if indexer_data.get('enable', False):
                                    status = HealthStatus.HEALTHY
                                else:
                                    status = HealthStatus.MAINTENANCE
                                
                                details = {
                                    "system_version": system_data.get('version'),
                                    "indexer_enabled": indexer_data.get('enable'),
                                    "indexer_categories": len(indexer_data.get('categories', [])),
                                    "api_response": "success"
                                }
                                
                                return HealthCheck(
                                    indexer_id=config.id,
                                    status=status,
                                    response_time_ms=response_time,
                                    error_message=None,
                                    timestamp=datetime.now(),
                                    details=details
                                )
                            else:
                                return HealthCheck(
                                    indexer_id=config.id,
                                    status=HealthStatus.DEGRADED,
                                    response_time_ms=response_time,
                                    error_message=f"Indexer endpoint returned {idx_response.status}",
                                    timestamp=datetime.now()
                                )
                    else:
                        return HealthCheck(
                            indexer_id=config.id,
                            status=HealthStatus.DOWN,
                            response_time_ms=response_time,
                            error_message=f"System status returned {response.status}",
                            timestamp=datetime.now()
                        )
                        
        except asyncio.TimeoutError:
            return HealthCheck(
                indexer_id=config.id,
                status=HealthStatus.DOWN,
                response_time_ms=None,
                error_message="Health check timeout",
                timestamp=datetime.now()
            )
        except Exception as e:
            return HealthCheck(
                indexer_id=config.id,
                status=HealthStatus.DOWN,
                response_time_ms=None,
                error_message=str(e),
                timestamp=datetime.now()
            )
    
    async def check_jackett_health(self, config: IndexerConfig) -> HealthCheck:
        """Perform health check on Jackett indexer."""
        start_time = time.time()
        
        try:
            timeout = aiohttp.ClientTimeout(total=config.timeout_seconds)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                # Check server info
                server_url = f"{config.base_url}/api/v2.0/server/config"
                params = {"apikey": config.api_key}
                
                async with session.get(server_url, params=params) as response:
                    response_time = int((time.time() - start_time) * 1000)
                    
                    if response.status == 200:
                        server_data = await response.json()
                        
                        # Check specific indexer
                        indexer_url = f"{config.base_url}/api/v2.0/indexers/{config.name}"
                        async with session.get(indexer_url, params=params) as idx_response:
                            if idx_response.status == 200:
                                indexer_data = await idx_response.json()
                                
                                # Test search capability
                                search_url = f"{config.base_url}/api/v2.0/indexers/{config.name}/results"
                                search_params = {
                                    "apikey": config.api_key,
                                    "Query": "test",
                                    "Category": "8000"  # Books category
                                }
                                
                                async with session.get(search_url, params=search_params) as search_response:
                                    search_working = search_response.status == 200
                                    
                                    details = {
                                        "server_version": server_data.get('server_version'),
                                        "indexer_configured": indexer_data.get('configured', False),
                                        "search_capability": search_working,
                                        "last_error": indexer_data.get('last_error')
                                    }
                                    
                                    if search_working and indexer_data.get('configured'):
                                        status = HealthStatus.HEALTHY
                                    elif indexer_data.get('configured'):
                                        status = HealthStatus.DEGRADED
                                    else:
                                        status = HealthStatus.DOWN
                                    
                                    return HealthCheck(
                                        indexer_id=config.id,
                                        status=status,
                                        response_time_ms=response_time,
                                        error_message=indexer_data.get('last_error'),
                                        timestamp=datetime.now(),
                                        details=details
                                    )
                            else:
                                return HealthCheck(
                                    indexer_id=config.id,
                                    status=HealthStatus.DOWN,
                                    response_time_ms=response_time,
                                    error_message=f"Indexer not found or misconfigured",
                                    timestamp=datetime.now()
                                )
                    else:
                        return HealthCheck(
                            indexer_id=config.id,
                            status=HealthStatus.DOWN,
                            response_time_ms=response_time,
                            error_message=f"Server config returned {response.status}",
                            timestamp=datetime.now()
                        )
                        
        except asyncio.TimeoutError:
            return HealthCheck(
                indexer_id=config.id,
                status=HealthStatus.DOWN,
                response_time_ms=None,
                error_message="Health check timeout",
                timestamp=datetime.now()
            )
        except Exception as e:
            return HealthCheck(
                indexer_id=config.id,
                status=HealthStatus.DOWN,
                response_time_ms=None,
                error_message=str(e),
                timestamp=datetime.now()
            )
    
    async def perform_health_check(self, config: IndexerConfig) -> HealthCheck:
        """Perform health check based on indexer type."""
        logger.debug(f"Checking health for {config.name} ({config.type.value})")
        
        if config.type == IndexerType.PROWLARR:
            return await self.check_prowlarr_health(config)
        elif config.type == IndexerType.JACKETT:
            return await self.check_jackett_health(config)
        else:
            return HealthCheck(
                indexer_id=config.id,
                status=HealthStatus.UNKNOWN,
                response_time_ms=None,
                error_message=f"Unknown indexer type: {config.type}",
                timestamp=datetime.now()
            )
    
    def store_health_check(self, health_check: HealthCheck):
        """Store health check result in database."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Store health check result
                cursor.execute("""
                    INSERT INTO indexer_health 
                    (indexer_id, status, response_time_ms, error_message, 
                     check_details, checked_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    health_check.indexer_id,
                    health_check.status.value,
                    health_check.response_time_ms,
                    health_check.error_message,
                    json.dumps(health_check.details) if health_check.details else None,
                    health_check.timestamp.isoformat()
                ))
                
                # Update metrics
                self.update_metrics(health_check)
                
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error storing health check: {e}")
    
    def update_metrics(self, health_check: HealthCheck):
        """Update indexer metrics based on health check result."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Get current metrics
                cursor.execute("""
                    SELECT * FROM indexer_metrics WHERE indexer_id = ?
                """, (health_check.indexer_id,))
                
                current = cursor.fetchone()
                
                if current:
                    # Update existing metrics
                    total_requests = current['total_requests'] + 1
                    successful_requests = current['successful_requests']
                    failed_requests = current['failed_requests'] 
                    consecutive_failures = current['consecutive_failures']
                    
                    if health_check.status == HealthStatus.HEALTHY:
                        successful_requests += 1
                        consecutive_failures = 0
                        last_successful_check = health_check.timestamp.isoformat()
                    else:
                        failed_requests += 1
                        consecutive_failures += 1
                        last_successful_check = current['last_successful_check']
                    
                    # Calculate running average response time
                    if health_check.response_time_ms:
                        avg_response_time = (
                            (current['avg_response_time'] * (total_requests - 1) + 
                             health_check.response_time_ms) / total_requests
                        )
                    else:
                        avg_response_time = current['avg_response_time']
                    
                    # Calculate uptime percentage
                    uptime_percentage = (successful_requests / total_requests) * 100
                    
                    cursor.execute("""
                        UPDATE indexer_metrics 
                        SET total_requests = ?, successful_requests = ?, 
                            failed_requests = ?, avg_response_time = ?,
                            uptime_percentage = ?, last_successful_check = ?,
                            consecutive_failures = ?, updated_at = ?
                        WHERE indexer_id = ?
                    """, (
                        total_requests, successful_requests, failed_requests,
                        avg_response_time, uptime_percentage, last_successful_check,
                        consecutive_failures, datetime.now().isoformat(),
                        health_check.indexer_id
                    ))
                else:
                    # Create new metrics entry
                    successful_requests = 1 if health_check.status == HealthStatus.HEALTHY else 0
                    failed_requests = 0 if health_check.status == HealthStatus.HEALTHY else 1
                    consecutive_failures = 0 if health_check.status == HealthStatus.HEALTHY else 1
                    last_successful_check = (health_check.timestamp.isoformat() 
                                           if health_check.status == HealthStatus.HEALTHY else None)
                    
                    cursor.execute("""
                        INSERT INTO indexer_metrics 
                        (indexer_id, total_requests, successful_requests, failed_requests,
                         avg_response_time, uptime_percentage, last_successful_check,
                         consecutive_failures, updated_at)
                        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        health_check.indexer_id, successful_requests, failed_requests,
                        health_check.response_time_ms or 0,
                        successful_requests * 100,  # 100% or 0%
                        last_successful_check, consecutive_failures,
                        datetime.now().isoformat()
                    ))
                
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error updating metrics: {e}")
    
    async def send_alert(self, indexer_config: IndexerConfig, health_check: HealthCheck, 
                        alert_type: str):
        """Send alert notification."""
        if not self.alert_config.enabled:
            return
        
        # Check cooldown
        cooldown_key = f"{indexer_config.id}_{alert_type}"
        if cooldown_key in self.alert_cooldowns:
            if datetime.now() - self.alert_cooldowns[cooldown_key] < timedelta(hours=1):
                return  # Still in cooldown
        
        self.alert_cooldowns[cooldown_key] = datetime.now()
        
        # Prepare alert message
        if alert_type == "failure":
            subject = f"🚨 Indexer Alert: {indexer_config.name} is DOWN"
            message = f"""
Indexer Health Alert

Indexer: {indexer_config.name}
Type: {indexer_config.type.value}
Status: {health_check.status.value}
Error: {health_check.error_message or 'No specific error message'}
Response Time: {health_check.response_time_ms}ms
Timestamp: {health_check.timestamp}

This indexer has been marked as unhealthy and may affect download availability.
Please check the indexer configuration and network connectivity.
"""
        elif alert_type == "recovery":
            subject = f"✅ Indexer Recovery: {indexer_config.name} is back online"
            message = f"""
Indexer Recovery Notification

Indexer: {indexer_config.name}
Type: {indexer_config.type.value}
Status: {health_check.status.value}
Response Time: {health_check.response_time_ms}ms
Timestamp: {health_check.timestamp}

The indexer has recovered and is now healthy.
"""
        else:
            return
        
        # Send email alerts
        if self.alert_config.email_recipients:
            await self._send_email_alert(subject, message)
        
        # Send webhook alerts
        if self.alert_config.webhook_url:
            await self._send_webhook_alert(indexer_config, health_check, alert_type)
        
        # Log alert
        self._log_alert(indexer_config.id, alert_type, message)
    
    async def _send_email_alert(self, subject: str, message: str):
        """Send email alert."""
        try:
            msg = MIMEMultipart()
            msg['From'] = self.alert_config.smtp_username or "foliofox@localhost"
            msg['To'] = ", ".join(self.alert_config.email_recipients)
            msg['Subject'] = subject
            
            msg.attach(MIMEText(message, 'plain'))
            
            server = smtplib.SMTP(self.alert_config.smtp_host, self.alert_config.smtp_port)
            
            if self.alert_config.smtp_username and self.alert_config.smtp_password:
                server.starttls()
                server.login(self.alert_config.smtp_username, self.alert_config.smtp_password)
            
            server.send_message(msg)
            server.quit()
            
            logger.info(f"Email alert sent: {subject}")
            
        except Exception as e:
            logger.error(f"Error sending email alert: {e}")
    
    async def _send_webhook_alert(self, indexer_config: IndexerConfig, 
                                 health_check: HealthCheck, alert_type: str):
        """Send webhook alert."""
        try:
            payload = {
                "type": alert_type,
                "indexer": {
                    "id": indexer_config.id,
                    "name": indexer_config.name,
                    "type": indexer_config.type.value
                },
                "health": {
                    "status": health_check.status.value,
                    "response_time_ms": health_check.response_time_ms,
                    "error_message": health_check.error_message,
                    "timestamp": health_check.timestamp.isoformat()
                }
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.alert_config.webhook_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        logger.info(f"Webhook alert sent for {indexer_config.name}")
                    else:
                        logger.warning(f"Webhook alert failed: {response.status}")
                        
        except Exception as e:
            logger.error(f"Error sending webhook alert: {e}")
    
    def _log_alert(self, indexer_id: int, alert_type: str, message: str):
        """Log alert to database."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO indexer_alerts 
                    (indexer_id, alert_type, message, created_at)
                    VALUES (?, ?, ?, ?)
                """, (indexer_id, alert_type, message, datetime.now().isoformat()))
                
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error logging alert: {e}")
    
    async def run_health_checks(self):
        """Run health checks for all configured indexers."""
        if not self.indexer_configs:
            logger.warning("No indexer configurations loaded")
            return
        
        logger.info(f"Running health checks for {len(self.indexer_configs)} indexers")
        
        # Create semaphore for concurrent checks
        semaphore = asyncio.Semaphore(self.max_concurrent_checks)
        
        async def check_with_semaphore(config):
            async with semaphore:
                return await self.perform_health_check(config)
        
        # Run health checks concurrently
        tasks = [check_with_semaphore(config) for config in self.indexer_configs.values()]
        health_checks = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for i, result in enumerate(health_checks):
            if isinstance(result, Exception):
                logger.error(f"Health check failed with exception: {result}")
                continue
            
            health_check = result
            config = list(self.indexer_configs.values())[i]
            
            # Store health check result
            self.store_health_check(health_check)
            
            # Update cache
            self.health_cache[health_check.indexer_id] = health_check
            
            # Check for alerts
            await self._check_alerts(config, health_check)
            
            # Log result
            if health_check.status == HealthStatus.HEALTHY:
                logger.info(f"✅ {config.name}: {health_check.status.value} "
                          f"({health_check.response_time_ms}ms)")
            else:
                logger.warning(f"❌ {config.name}: {health_check.status.value} "
                             f"- {health_check.error_message}")
    
    async def _check_alerts(self, config: IndexerConfig, health_check: HealthCheck):
        """Check if alerts should be sent based on health check result."""
        try:
            # Get current metrics to check consecutive failures
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT consecutive_failures FROM indexer_metrics 
                    WHERE indexer_id = ?
                """, (config.id,))
                
                result = cursor.fetchone()
                consecutive_failures = result['consecutive_failures'] if result else 0
            
            # Check for failure alert
            if (health_check.status in [HealthStatus.DOWN, HealthStatus.DEGRADED] and
                consecutive_failures >= self.alert_config.failure_threshold):
                await self.send_alert(config, health_check, "failure")
            
            # Check for recovery alert
            elif (health_check.status == HealthStatus.HEALTHY and
                  consecutive_failures > 0 and
                  self.alert_config.recovery_notification):
                await self.send_alert(config, health_check, "recovery")
                
        except Exception as e:
            logger.error(f"Error checking alerts for {config.name}: {e}")
    
    def generate_health_report(self) -> Dict:
        """Generate comprehensive health report."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Get current health status for all indexers
                cursor.execute("""
                    SELECT i.id, i.name, i.type, i.enabled,
                           h.status, h.response_time_ms, h.error_message, h.checked_at
                    FROM indexers i
                    LEFT JOIN (
                        SELECT indexer_id, status, response_time_ms, error_message, checked_at,
                               ROW_NUMBER() OVER (PARTITION BY indexer_id ORDER BY checked_at DESC) as rn
                        FROM indexer_health
                    ) h ON i.id = h.indexer_id AND h.rn = 1
                    ORDER BY i.name
                """)
                
                indexer_status = cursor.fetchall()
                
                # Get metrics summary
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total_indexers,
                        SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy,
                        SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) as degraded,
                        SUM(CASE WHEN status = 'down' THEN 1 ELSE 0 END) as down,
                        AVG(response_time_ms) as avg_response_time
                    FROM (
                        SELECT indexer_id, status, response_time_ms,
                               ROW_NUMBER() OVER (PARTITION BY indexer_id ORDER BY checked_at DESC) as rn
                        FROM indexer_health
                    ) WHERE rn = 1
                """)
                
                summary = cursor.fetchone()
                
                # Get recent alerts (last 24 hours)
                cursor.execute("""
                    SELECT indexer_id, alert_type, message, created_at
                    FROM indexer_alerts
                    WHERE created_at > datetime('now', '-1 day')
                    ORDER BY created_at DESC
                    LIMIT 10
                """)
                
                recent_alerts = cursor.fetchall()
                
                report = {
                    "timestamp": datetime.now().isoformat(),
                    "summary": {
                        "total_indexers": summary['total_indexers'] or 0,
                        "healthy": summary['healthy'] or 0,
                        "degraded": summary['degraded'] or 0,
                        "down": summary['down'] or 0,
                        "avg_response_time_ms": round(summary['avg_response_time'] or 0, 2)
                    },
                    "indexers": [],
                    "recent_alerts": []
                }
                
                # Add indexer details
                for row in indexer_status:
                    indexer_info = {
                        "id": row['id'],
                        "name": row['name'],
                        "type": row['type'],
                        "enabled": bool(row['enabled']),
                        "status": row['status'] or 'unknown',
                        "response_time_ms": row['response_time_ms'],
                        "error_message": row['error_message'],
                        "last_checked": row['checked_at']
                    }
                    report["indexers"].append(indexer_info)
                
                # Add recent alerts
                for alert in recent_alerts:
                    alert_info = {
                        "indexer_id": alert['indexer_id'],
                        "type": alert['alert_type'],
                        "message": alert['message'][:100] + "..." if len(alert['message']) > 100 else alert['message'],
                        "created_at": alert['created_at']
                    }
                    report["recent_alerts"].append(alert_info)
                
                return report
                
        except Exception as e:
            logger.error(f"Error generating health report: {e}")
            return {"error": str(e)}
    
    async def monitor_loop(self):
        """Main monitoring loop."""
        logger.info("Starting indexer health monitoring loop")
        
        # Initialize database and load configurations
        self.initialize_database()
        
        while True:
            try:
                # Reload configurations periodically
                self.load_indexer_configs()
                
                if self.indexer_configs:
                    # Run health checks
                    await self.run_health_checks()
                    
                    # Generate and save report
                    report = self.generate_health_report()
                    report_path = Path(f"/var/log/foliofox/health_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
                    report_path.parent.mkdir(parents=True, exist_ok=True)
                    
                    with open(report_path, 'w') as f:
                        json.dump(report, f, indent=2)
                    
                    # Log summary
                    summary = report["summary"]
                    logger.info(
                        f"Health Check Summary - "
                        f"Healthy: {summary['healthy']}, "
                        f"Degraded: {summary['degraded']}, "
                        f"Down: {summary['down']}, "
                        f"Avg Response: {summary['avg_response_time_ms']}ms"
                    )
                else:
                    logger.warning("No indexers configured for monitoring")
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
            
            # Wait for next check
            await asyncio.sleep(self.check_interval)

def main():
    parser = argparse.ArgumentParser(description='FolioFox Indexer Health Monitor')
    parser.add_argument('--config', default='./config/config.yaml', help='Configuration file path')
    parser.add_argument('--mode', choices=['monitor', 'check', 'report'], default='monitor',
                       help='Operation mode')
    parser.add_argument('--interval', type=int, default=300, help='Check interval in seconds')
    parser.add_argument('--indexer-id', type=int, help='Check specific indexer ID')
    
    args = parser.parse_args()
    
    monitor = HealthMonitor(args.config)
    monitor.check_interval = args.interval
    
    if args.mode == 'check':
        # Run single health check
        monitor.initialize_database()
        monitor.load_indexer_configs()
        
        if args.indexer_id and args.indexer_id in monitor.indexer_configs:
            config = monitor.indexer_configs[args.indexer_id]
            result = asyncio.run(monitor.perform_health_check(config))
            print(json.dumps(asdict(result), default=str, indent=2))
        else:
            asyncio.run(monitor.run_health_checks())
    elif args.mode == 'report':
        # Generate health report
        monitor.initialize_database()
        report = monitor.generate_health_report()
        print(json.dumps(report, indent=2))
    else:
        # Run monitoring loop
        try:
            asyncio.run(monitor.monitor_loop())
        except KeyboardInterrupt:
            logger.info("Health monitoring stopped by user")
            sys.exit(0)

if __name__ == "__main__":
    main()