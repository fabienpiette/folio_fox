#!/usr/bin/env python3
"""
FolioFox Indexer Failover Manager
Advanced failover and load balancing for indexer high availability.
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
from typing import Dict, List, Optional, Tuple, Set, Any
from dataclasses import dataclass, asdict
from enum import Enum
import aiohttp
import yaml
from collections import defaultdict, deque
import statistics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/foliofox/failover_manager.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('foliofox.failover_manager')

class IndexerStatus(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    MAINTENANCE = "maintenance"
    RECOVERING = "recovering"

class FailoverStrategy(Enum):
    ROUND_ROBIN = "round_robin"
    PRIORITY_BASED = "priority_based"
    RESPONSE_TIME_BASED = "response_time_based"
    LOAD_BALANCED = "load_balanced"
    INTELLIGENT = "intelligent"

@dataclass
class IndexerNode:
    id: int
    name: str
    indexer_type: str
    base_url: str
    api_key: str
    priority: int
    is_active: bool
    timeout_seconds: int
    rate_limit_requests: int
    rate_limit_window: int
    
@dataclass
class HealthMetrics:
    indexer_id: int
    status: IndexerStatus
    response_time_ms: Optional[int]
    success_rate: float
    consecutive_failures: int
    last_success: Optional[datetime]
    last_failure: Optional[datetime]
    requests_per_minute: float
    error_rate: float
    availability_percentage: float

@dataclass
class FailoverEvent:
    timestamp: datetime
    from_indexer_id: int
    to_indexer_id: int
    reason: str
    success: bool
    recovery_time_seconds: Optional[float]

class CircuitBreaker:
    """Circuit breaker pattern implementation for indexer reliability."""
    
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
    
    def call_allowed(self) -> bool:
        """Check if calls are allowed through the circuit breaker."""
        if self.state == "CLOSED":
            return True
        elif self.state == "OPEN":
            if self.last_failure_time and \
               (datetime.now() - self.last_failure_time).total_seconds() > self.recovery_timeout:
                self.state = "HALF_OPEN"
                return True
            return False
        elif self.state == "HALF_OPEN":
            return True
        return False
    
    def record_success(self):
        """Record a successful call."""
        self.failure_count = 0
        self.state = "CLOSED"
    
    def record_failure(self):
        """Record a failed call."""
        self.failure_count += 1
        self.last_failure_time = datetime.now()
        
        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"

class LoadBalancer:
    """Intelligent load balancer for distributing requests across indexers."""
    
    def __init__(self, strategy: FailoverStrategy = FailoverStrategy.INTELLIGENT):
        self.strategy = strategy
        self.request_counts = defaultdict(int)
        self.response_times = defaultdict(deque)
        self.last_used_index = 0
    
    def select_indexer(self, available_indexers: List[IndexerNode], 
                      health_metrics: Dict[int, HealthMetrics]) -> Optional[IndexerNode]:
        """Select the best indexer based on the configured strategy."""
        if not available_indexers:
            return None
        
        if self.strategy == FailoverStrategy.ROUND_ROBIN:
            return self._round_robin_selection(available_indexers)
        elif self.strategy == FailoverStrategy.PRIORITY_BASED:
            return self._priority_based_selection(available_indexers)
        elif self.strategy == FailoverStrategy.RESPONSE_TIME_BASED:
            return self._response_time_based_selection(available_indexers, health_metrics)
        elif self.strategy == FailoverStrategy.LOAD_BALANCED:
            return self._load_balanced_selection(available_indexers)
        elif self.strategy == FailoverStrategy.INTELLIGENT:
            return self._intelligent_selection(available_indexers, health_metrics)
        else:
            return available_indexers[0]
    
    def _round_robin_selection(self, indexers: List[IndexerNode]) -> IndexerNode:
        """Simple round-robin selection."""
        indexer = indexers[self.last_used_index % len(indexers)]
        self.last_used_index += 1
        return indexer
    
    def _priority_based_selection(self, indexers: List[IndexerNode]) -> IndexerNode:
        """Select based on priority (lower number = higher priority)."""
        return min(indexers, key=lambda x: x.priority)
    
    def _response_time_based_selection(self, indexers: List[IndexerNode], 
                                      health_metrics: Dict[int, HealthMetrics]) -> IndexerNode:
        """Select based on lowest average response time."""
        def get_avg_response_time(indexer):
            metrics = health_metrics.get(indexer.id)
            return metrics.response_time_ms if metrics and metrics.response_time_ms else float('inf')
        
        return min(indexers, key=get_avg_response_time)
    
    def _load_balanced_selection(self, indexers: List[IndexerNode]) -> IndexerNode:
        """Select based on current request load."""
        return min(indexers, key=lambda x: self.request_counts[x.id])
    
    def _intelligent_selection(self, indexers: List[IndexerNode], 
                              health_metrics: Dict[int, HealthMetrics]) -> IndexerNode:
        """Intelligent selection based on multiple factors."""
        def calculate_score(indexer):
            metrics = health_metrics.get(indexer.id)
            if not metrics:
                return float('inf')
            
            # Factors: response time, success rate, load, priority
            response_time_score = metrics.response_time_ms or 1000
            success_rate_score = (100 - metrics.success_rate) * 10  # Lower is better
            load_score = self.request_counts[indexer.id] * 10
            priority_score = indexer.priority * 50
            
            # Penalties for degraded/failing indexers
            if metrics.status == IndexerStatus.DEGRADED:
                response_time_score += 500
            elif metrics.status == IndexerStatus.DOWN:
                return float('inf')
            
            if metrics.consecutive_failures > 0:
                response_time_score += metrics.consecutive_failures * 100
            
            return response_time_score + success_rate_score + load_score + priority_score
        
        return min(indexers, key=calculate_score)
    
    def record_request(self, indexer_id: int, response_time_ms: int):
        """Record a request for load balancing calculations."""
        self.request_counts[indexer_id] += 1
        
        # Keep response time history (last 100 requests)
        if len(self.response_times[indexer_id]) >= 100:
            self.response_times[indexer_id].popleft()
        self.response_times[indexer_id].append(response_time_ms)

class FailoverManager:
    """Advanced failover manager for indexer high availability."""
    
    def __init__(self, config_path: str = "./config/config.yaml"):
        self.config = self._load_config(config_path)
        self.db_path = self.config.get('database', {}).get('path', './data/foliofox.db')
        
        # Failover configuration
        self.health_check_interval = self.config.get('failover', {}).get('health_check_interval', 30)
        self.failure_threshold = self.config.get('failover', {}).get('failure_threshold', 3)
        self.recovery_threshold = self.config.get('failover', {}).get('recovery_threshold', 2)
        self.circuit_breaker_timeout = self.config.get('failover', {}).get('circuit_breaker_timeout', 300)
        
        # Strategy configuration
        strategy_name = self.config.get('failover', {}).get('strategy', 'intelligent')
        self.failover_strategy = FailoverStrategy(strategy_name)
        
        # State management
        self.indexer_nodes: Dict[int, IndexerNode] = {}
        self.health_metrics: Dict[int, HealthMetrics] = {}
        self.circuit_breakers: Dict[int, CircuitBreaker] = {}
        self.load_balancer = LoadBalancer(self.failover_strategy)
        self.failover_history: List[FailoverEvent] = []
        
        # Recovery tracking
        self.recovery_attempts: Dict[int, List[datetime]] = defaultdict(list)
        self.maintenance_windows: Dict[int, Tuple[datetime, datetime]] = {}
        
        # Performance tracking
        self.request_metrics: Dict[int, Dict] = defaultdict(lambda: {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'avg_response_time': 0.0,
            'last_request_time': None
        })
        
        self.running = False
        
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration with failover-specific defaults."""
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
        """Return default failover configuration."""
        return {
            'database': {'path': './data/foliofox.db'},
            'failover': {
                'health_check_interval': 30,
                'failure_threshold': 3,
                'recovery_threshold': 2,
                'circuit_breaker_timeout': 300,
                'strategy': 'intelligent',
                'enable_predictive_failover': True,
                'enable_automatic_recovery': True,
                'max_recovery_attempts': 5
            },
            'monitoring': {
                'enable_alerts': True,
                'alert_on_failover': True,
                'alert_on_recovery': True
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
    
    def load_indexer_configurations(self):
        """Load active indexer configurations from database."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT i.id, i.name, i.indexer_type, i.base_url, 
                           uic.api_key, i.priority, i.is_active, i.timeout_seconds,
                           i.rate_limit_requests, i.rate_limit_window
                    FROM indexers i
                    LEFT JOIN user_indexer_config uic ON i.id = uic.indexer_id
                    WHERE i.is_active = 1
                    ORDER BY i.priority ASC
                """)
                
                rows = cursor.fetchall()
                self.indexer_nodes = {}
                
                for row in rows:
                    node = IndexerNode(
                        id=row['id'],
                        name=row['name'],
                        indexer_type=row['indexer_type'],
                        base_url=row['base_url'],
                        api_key=row['api_key'] or '',
                        priority=row['priority'] or 5,
                        is_active=bool(row['is_active']),
                        timeout_seconds=row['timeout_seconds'] or 30,
                        rate_limit_requests=row['rate_limit_requests'] or 60,
                        rate_limit_window=row['rate_limit_window'] or 60
                    )
                    self.indexer_nodes[node.id] = node
                    
                    # Initialize circuit breaker if not exists
                    if node.id not in self.circuit_breakers:
                        self.circuit_breakers[node.id] = CircuitBreaker(
                            failure_threshold=self.failure_threshold,
                            recovery_timeout=self.circuit_breaker_timeout
                        )
                
                logger.info(f"Loaded {len(self.indexer_nodes)} indexer configurations")
                
        except Exception as e:
            logger.error(f"Error loading indexer configurations: {e}")
            self.indexer_nodes = {}
    
    async def perform_health_check(self, indexer_node: IndexerNode) -> HealthMetrics:
        """Perform comprehensive health check on an indexer."""
        start_time = time.time()
        
        try:
            timeout = aiohttp.ClientTimeout(total=indexer_node.timeout_seconds)
            
            # Test basic connectivity and API response
            async with aiohttp.ClientSession(timeout=timeout) as session:
                if indexer_node.indexer_type == 'prowlarr':
                    health_check = await self._check_prowlarr_health(session, indexer_node)
                elif indexer_node.indexer_type == 'jackett':
                    health_check = await self._check_jackett_health(session, indexer_node)
                else:
                    health_check = await self._check_generic_health(session, indexer_node)
                
                response_time = int((time.time() - start_time) * 1000)
                
                # Get historical metrics
                historical_metrics = await self._get_historical_metrics(indexer_node.id)
                
                # Determine status based on health check and history
                status = self._determine_indexer_status(health_check, historical_metrics)
                
                return HealthMetrics(
                    indexer_id=indexer_node.id,
                    status=status,
                    response_time_ms=response_time if health_check else None,
                    success_rate=historical_metrics.get('success_rate', 0.0),
                    consecutive_failures=historical_metrics.get('consecutive_failures', 0),
                    last_success=historical_metrics.get('last_success'),
                    last_failure=historical_metrics.get('last_failure'),
                    requests_per_minute=historical_metrics.get('requests_per_minute', 0.0),
                    error_rate=historical_metrics.get('error_rate', 0.0),
                    availability_percentage=historical_metrics.get('availability_percentage', 0.0)
                )
                
        except asyncio.TimeoutError:
            return self._create_failed_health_metrics(
                indexer_node.id, "Health check timeout", start_time
            )
        except Exception as e:
            return self._create_failed_health_metrics(
                indexer_node.id, str(e), start_time
            )
    
    async def _check_prowlarr_health(self, session: aiohttp.ClientSession, 
                                    node: IndexerNode) -> bool:
        """Check Prowlarr indexer health."""
        try:
            headers = {"X-Api-Key": node.api_key}
            
            # Check system status
            async with session.get(f"{node.base_url}/api/v1/system/status", headers=headers) as response:
                if response.status != 200:
                    return False
                
                data = await response.json()
                if not data.get('version'):
                    return False
            
            # Check if indexer is responding
            async with session.get(f"{node.base_url}/api/v1/indexer", headers=headers) as response:
                return response.status == 200
                
        except Exception:
            return False
    
    async def _check_jackett_health(self, session: aiohttp.ClientSession, 
                                   node: IndexerNode) -> bool:
        """Check Jackett indexer health."""
        try:
            params = {"apikey": node.api_key}
            
            # Check server config
            async with session.get(f"{node.base_url}/api/v2.0/server/config", params=params) as response:
                if response.status != 200:
                    return False
                
                data = await response.json()
                if not data.get('server_version'):
                    return False
            
            # Check indexers endpoint
            async with session.get(f"{node.base_url}/api/v2.0/indexers", params=params) as response:
                return response.status == 200
                
        except Exception:
            return False
    
    async def _check_generic_health(self, session: aiohttp.ClientSession, 
                                   node: IndexerNode) -> bool:
        """Generic health check for unknown indexer types."""
        try:
            async with session.get(node.base_url) as response:
                return response.status in [200, 301, 302]
        except Exception:
            return False
    
    async def _get_historical_metrics(self, indexer_id: int) -> Dict:
        """Get historical performance metrics for an indexer."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Success rate (last 24 hours)
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total_checks,
                        SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy_checks,
                        MAX(CASE WHEN status = 'healthy' THEN checked_at END) as last_success,
                        MAX(CASE WHEN status != 'healthy' THEN checked_at END) as last_failure,
                        AVG(response_time_ms) as avg_response_time
                    FROM indexer_health 
                    WHERE indexer_id = ? 
                    AND checked_at > datetime('now', '-24 hours')
                """, (indexer_id,))
                
                row = cursor.fetchone()
                if not row or row['total_checks'] == 0:
                    return {'success_rate': 0.0, 'consecutive_failures': 0}
                
                success_rate = (row['healthy_checks'] / row['total_checks']) * 100
                
                # Consecutive failures
                cursor.execute("""
                    SELECT COUNT(*) as consecutive_failures
                    FROM (
                        SELECT status
                        FROM indexer_health 
                        WHERE indexer_id = ?
                        ORDER BY checked_at DESC
                        LIMIT 10
                    ) recent
                    WHERE status != 'healthy'
                """, (indexer_id,))
                
                consecutive_failures = cursor.fetchone()[0]
                
                # Request rate (if available)
                request_metrics = self.request_metrics.get(indexer_id, {})
                
                return {
                    'success_rate': success_rate,
                    'consecutive_failures': consecutive_failures,
                    'last_success': datetime.fromisoformat(row['last_success']) if row['last_success'] else None,
                    'last_failure': datetime.fromisoformat(row['last_failure']) if row['last_failure'] else None,
                    'avg_response_time': row['avg_response_time'] or 0,
                    'requests_per_minute': request_metrics.get('requests_per_minute', 0.0),
                    'error_rate': request_metrics.get('error_rate', 0.0),
                    'availability_percentage': success_rate
                }
                
        except Exception as e:
            logger.error(f"Error getting historical metrics for indexer {indexer_id}: {e}")
            return {'success_rate': 0.0, 'consecutive_failures': 0}
    
    def _determine_indexer_status(self, health_check_passed: bool, 
                                 historical_metrics: Dict) -> IndexerStatus:
        """Determine indexer status based on current and historical data."""
        consecutive_failures = historical_metrics.get('consecutive_failures', 0)
        success_rate = historical_metrics.get('success_rate', 0.0)
        
        if not health_check_passed:
            if consecutive_failures >= self.failure_threshold:
                return IndexerStatus.DOWN
            else:
                return IndexerStatus.DEGRADED
        
        # Health check passed
        if consecutive_failures > 0:
            return IndexerStatus.RECOVERING
        elif success_rate >= 95:
            return IndexerStatus.HEALTHY
        elif success_rate >= 80:
            return IndexerStatus.DEGRADED
        else:
            return IndexerStatus.DOWN
    
    def _create_failed_health_metrics(self, indexer_id: int, error_msg: str, 
                                     start_time: float) -> HealthMetrics:
        """Create health metrics for a failed health check."""
        response_time = int((time.time() - start_time) * 1000)
        
        return HealthMetrics(
            indexer_id=indexer_id,
            status=IndexerStatus.DOWN,
            response_time_ms=response_time,
            success_rate=0.0,
            consecutive_failures=1,
            last_success=None,
            last_failure=datetime.now(),
            requests_per_minute=0.0,
            error_rate=100.0,
            availability_percentage=0.0
        )
    
    async def run_health_checks(self):
        """Run health checks on all indexers."""
        if not self.indexer_nodes:
            logger.warning("No indexer nodes configured")
            return
        
        logger.info(f"Running health checks for {len(self.indexer_nodes)} indexers")
        
        # Run health checks concurrently
        tasks = []
        for node in self.indexer_nodes.values():
            task = asyncio.create_task(self.perform_health_check(node))
            tasks.append((node.id, task))
        
        # Process results
        for indexer_id, task in tasks:
            try:
                health_metrics = await task
                self.health_metrics[indexer_id] = health_metrics
                
                # Update circuit breaker
                circuit_breaker = self.circuit_breakers[indexer_id]
                if health_metrics.status == IndexerStatus.HEALTHY:
                    circuit_breaker.record_success()
                else:
                    circuit_breaker.record_failure()
                
                # Store health check result
                await self._store_health_check_result(health_metrics)
                
                # Check for failover conditions
                await self._check_failover_conditions(indexer_id, health_metrics)
                
                # Log health status
                status_emoji = "✅" if health_metrics.status == IndexerStatus.HEALTHY else "❌"
                logger.info(f"{status_emoji} {self.indexer_nodes[indexer_id].name}: "
                          f"{health_metrics.status.value} "
                          f"({health_metrics.response_time_ms}ms)")
                
            except Exception as e:
                logger.error(f"Error processing health check for indexer {indexer_id}: {e}")
    
    async def _store_health_check_result(self, health_metrics: HealthMetrics):
        """Store health check result in database."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO indexer_health 
                    (indexer_id, status, response_time_ms, error_message, checked_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    health_metrics.indexer_id,
                    health_metrics.status.value,
                    health_metrics.response_time_ms,
                    None,  # error_message would come from the health check
                    datetime.now().isoformat()
                ))
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error storing health check result: {e}")
    
    async def _check_failover_conditions(self, indexer_id: int, health_metrics: HealthMetrics):
        """Check if failover conditions are met and trigger if necessary."""
        if health_metrics.status in [IndexerStatus.DOWN, IndexerStatus.DEGRADED]:
            if health_metrics.consecutive_failures >= self.failure_threshold:
                logger.warning(f"Failover condition met for indexer {indexer_id}: "
                             f"{health_metrics.consecutive_failures} consecutive failures")
                
                await self._trigger_failover(indexer_id, 
                                           f"Consecutive failures: {health_metrics.consecutive_failures}")
        
        # Check for recovery
        elif health_metrics.status == IndexerStatus.HEALTHY:
            if indexer_id in [event.from_indexer_id for event in self.failover_history 
                             if not event.success]:
                logger.info(f"Potential recovery detected for indexer {indexer_id}")
                await self._attempt_recovery(indexer_id)
    
    async def _trigger_failover(self, failed_indexer_id: int, reason: str):
        """Trigger failover from a failed indexer to healthy alternatives."""
        logger.warning(f"Triggering failover for indexer {failed_indexer_id}: {reason}")
        
        # Find healthy alternatives
        healthy_indexers = [
            node for node_id, node in self.indexer_nodes.items()
            if node_id != failed_indexer_id and 
            self.health_metrics.get(node_id, {}).status == IndexerStatus.HEALTHY and
            self.circuit_breakers[node_id].call_allowed()
        ]
        
        if not healthy_indexers:
            logger.error("No healthy indexers available for failover!")
            return
        
        # Select best alternative using load balancer
        target_indexer = self.load_balancer.select_indexer(healthy_indexers, self.health_metrics)
        
        if target_indexer:
            # Record failover event
            failover_event = FailoverEvent(
                timestamp=datetime.now(),
                from_indexer_id=failed_indexer_id,
                to_indexer_id=target_indexer.id,
                reason=reason,
                success=True,  # We'll update this based on actual outcome
                recovery_time_seconds=None
            )
            
            self.failover_history.append(failover_event)
            
            # Update database to mark indexer as failed over
            await self._update_indexer_status(failed_indexer_id, 'failover', reason)
            
            logger.info(f"Failover completed: {self.indexer_nodes[failed_indexer_id].name} -> "
                       f"{target_indexer.name}")
            
            # Send alert if configured
            await self._send_failover_alert(failover_event)
    
    async def _attempt_recovery(self, indexer_id: int):
        """Attempt to recover a previously failed indexer."""
        now = datetime.now()
        
        # Check recovery attempt limits
        recent_attempts = [
            attempt for attempt in self.recovery_attempts[indexer_id]
            if (now - attempt).total_seconds() < 3600  # Last hour
        ]
        
        max_attempts = self.config.get('failover', {}).get('max_recovery_attempts', 5)
        if len(recent_attempts) >= max_attempts:
            logger.info(f"Recovery attempt limit reached for indexer {indexer_id}")
            return
        
        logger.info(f"Attempting recovery for indexer {indexer_id}")
        
        # Record recovery attempt
        self.recovery_attempts[indexer_id].append(now)
        
        # Perform extended health check
        node = self.indexer_nodes[indexer_id]
        health_metrics = await self.perform_health_check(node)
        
        if health_metrics.status == IndexerStatus.HEALTHY:
            # Reset circuit breaker
            self.circuit_breakers[indexer_id].record_success()
            
            # Update status
            await self._update_indexer_status(indexer_id, 'recovered', 'Automatic recovery')
            
            logger.info(f"Successfully recovered indexer {indexer_id}")
            
            # Send recovery alert
            await self._send_recovery_alert(indexer_id)
        else:
            logger.warning(f"Recovery attempt failed for indexer {indexer_id}: "
                          f"{health_metrics.status.value}")
    
    async def _update_indexer_status(self, indexer_id: int, status: str, message: str):
        """Update indexer status in database."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO system_logs 
                    (level, component, message, details, created_at)
                    VALUES ('INFO', 'failover_manager', ?, ?, ?)
                """, (
                    message,
                    json.dumps({'indexer_id': indexer_id, 'status': status}),
                    datetime.now().isoformat()
                ))
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error updating indexer status: {e}")
    
    async def _send_failover_alert(self, failover_event: FailoverEvent):
        """Send failover alert if configured."""
        if not self.config.get('monitoring', {}).get('alert_on_failover', True):
            return
        
        try:
            from_name = self.indexer_nodes[failover_event.from_indexer_id].name
            to_name = self.indexer_nodes[failover_event.to_indexer_id].name
            
            alert_message = (f"🚨 Indexer Failover Alert\n\n"
                           f"Failed: {from_name}\n"
                           f"Failover to: {to_name}\n"
                           f"Reason: {failover_event.reason}\n"
                           f"Time: {failover_event.timestamp}\n")
            
            logger.warning(alert_message)
            # Here you would integrate with your alerting system (email, Slack, etc.)
            
        except Exception as e:
            logger.error(f"Error sending failover alert: {e}")
    
    async def _send_recovery_alert(self, indexer_id: int):
        """Send recovery alert if configured."""
        if not self.config.get('monitoring', {}).get('alert_on_recovery', True):
            return
        
        try:
            indexer_name = self.indexer_nodes[indexer_id].name
            
            alert_message = (f"✅ Indexer Recovery Alert\n\n"
                           f"Recovered: {indexer_name}\n"
                           f"Time: {datetime.now()}\n")
            
            logger.info(alert_message)
            # Here you would integrate with your alerting system
            
        except Exception as e:
            logger.error(f"Error sending recovery alert: {e}")
    
    def get_available_indexers(self, exclude_failed: bool = True) -> List[IndexerNode]:
        """Get list of available indexers for routing requests."""
        available = []
        
        for node_id, node in self.indexer_nodes.items():
            if not node.is_active:
                continue
            
            # Check circuit breaker
            if not self.circuit_breakers[node_id].call_allowed():
                continue
            
            # Check health status
            if exclude_failed:
                health = self.health_metrics.get(node_id)
                if health and health.status == IndexerStatus.DOWN:
                    continue
            
            available.append(node)
        
        return available
    
    def route_request(self, exclude_indexers: Set[int] = None) -> Optional[IndexerNode]:
        """Route a request to the best available indexer."""
        available_indexers = self.get_available_indexers()
        
        # Exclude specific indexers if requested
        if exclude_indexers:
            available_indexers = [
                node for node in available_indexers 
                if node.id not in exclude_indexers
            ]
        
        if not available_indexers:
            logger.warning("No available indexers for routing request")
            return None
        
        # Use load balancer to select best indexer
        selected = self.load_balancer.select_indexer(available_indexers, self.health_metrics)
        
        if selected:
            # Record the routing decision
            self.load_balancer.record_request(selected.id, 0)  # Response time will be recorded later
            logger.debug(f"Routed request to indexer: {selected.name}")
        
        return selected
    
    def record_request_result(self, indexer_id: int, success: bool, response_time_ms: int):
        """Record the result of a request for metrics and load balancing."""
        # Update load balancer
        self.load_balancer.record_request(indexer_id, response_time_ms)
        
        # Update circuit breaker
        if success:
            self.circuit_breakers[indexer_id].record_success()
        else:
            self.circuit_breakers[indexer_id].record_failure()
        
        # Update request metrics
        metrics = self.request_metrics[indexer_id]
        metrics['total_requests'] += 1
        metrics['last_request_time'] = datetime.now()
        
        if success:
            metrics['successful_requests'] += 1
        else:
            metrics['failed_requests'] += 1
        
        # Update average response time
        total_successful = metrics['successful_requests']
        if total_successful > 0:
            current_avg = metrics['avg_response_time']
            metrics['avg_response_time'] = (
                (current_avg * (total_successful - 1) + response_time_ms) / total_successful
            )
    
    def generate_failover_report(self) -> Dict:
        """Generate comprehensive failover status report."""
        try:
            # Current status summary
            status_summary = defaultdict(int)
            for health in self.health_metrics.values():
                status_summary[health.status.value] += 1
            
            # Circuit breaker status
            circuit_breaker_status = {}
            for indexer_id, cb in self.circuit_breakers.items():
                circuit_breaker_status[indexer_id] = {
                    'state': cb.state,
                    'failure_count': cb.failure_count,
                    'last_failure': cb.last_failure.isoformat() if cb.last_failure else None
                }
            
            # Recent failover events
            recent_events = [
                {
                    'timestamp': event.timestamp.isoformat(),
                    'from_indexer': self.indexer_nodes[event.from_indexer_id].name,
                    'to_indexer': self.indexer_nodes[event.to_indexer_id].name,
                    'reason': event.reason,
                    'success': event.success
                }
                for event in self.failover_history[-10:]  # Last 10 events
            ]
            
            # Performance metrics
            performance_metrics = {}
            for indexer_id, metrics in self.request_metrics.items():
                if indexer_id in self.indexer_nodes:
                    performance_metrics[self.indexer_nodes[indexer_id].name] = {
                        'total_requests': metrics['total_requests'],
                        'success_rate': (
                            metrics['successful_requests'] / max(1, metrics['total_requests']) * 100
                        ),
                        'avg_response_time_ms': metrics['avg_response_time'],
                        'last_request': metrics['last_request_time'].isoformat() 
                                      if metrics['last_request_time'] else None
                    }
            
            return {
                'timestamp': datetime.now().isoformat(),
                'summary': {
                    'total_indexers': len(self.indexer_nodes),
                    'status_breakdown': dict(status_summary),
                    'available_indexers': len(self.get_available_indexers()),
                    'active_circuit_breakers': sum(
                        1 for cb in self.circuit_breakers.values() 
                        if cb.state != 'CLOSED'
                    )
                },
                'indexer_details': [
                    {
                        'id': node.id,
                        'name': node.name,
                        'status': self.health_metrics.get(node.id, {}).status.value 
                                if self.health_metrics.get(node.id) else 'unknown',
                        'response_time_ms': self.health_metrics.get(node.id, {}).response_time_ms,
                        'success_rate': self.health_metrics.get(node.id, {}).success_rate,
                        'circuit_breaker_state': self.circuit_breakers[node.id].state,
                        'consecutive_failures': self.health_metrics.get(node.id, {}).consecutive_failures
                    }
                    for node in self.indexer_nodes.values()
                ],
                'recent_failover_events': recent_events,
                'performance_metrics': performance_metrics,
                'configuration': {
                    'strategy': self.failover_strategy.value,
                    'failure_threshold': self.failure_threshold,
                    'recovery_threshold': self.recovery_threshold,
                    'circuit_breaker_timeout': self.circuit_breaker_timeout
                }
            }
            
        except Exception as e:
            logger.error(f"Error generating failover report: {e}")
            return {'error': str(e), 'timestamp': datetime.now().isoformat()}
    
    async def run_monitoring_loop(self):
        """Main monitoring loop for continuous health checking and failover management."""
        logger.info("Starting failover monitoring loop")
        self.running = True
        
        while self.running:
            try:
                # Reload indexer configurations periodically
                self.load_indexer_configurations()
                
                # Run health checks
                await self.run_health_checks()
                
                # Clean up old failover history
                cutoff_time = datetime.now() - timedelta(hours=24)
                self.failover_history = [
                    event for event in self.failover_history
                    if event.timestamp > cutoff_time
                ]
                
                # Clean up old recovery attempts
                for indexer_id in list(self.recovery_attempts.keys()):
                    self.recovery_attempts[indexer_id] = [
                        attempt for attempt in self.recovery_attempts[indexer_id]
                        if (datetime.now() - attempt).total_seconds() < 3600
                    ]
                
                # Generate and save report
                report = self.generate_failover_report()
                report_path = Path(f"/var/log/foliofox/failover_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
                report_path.parent.mkdir(parents=True, exist_ok=True)
                
                with open(report_path, 'w') as f:
                    json.dump(report, f, indent=2, default=str)
                
                # Log summary
                summary = report['summary']
                logger.info(
                    f"Failover Status - Total: {summary['total_indexers']}, "
                    f"Available: {summary['available_indexers']}, "
                    f"Healthy: {summary['status_breakdown'].get('healthy', 0)}, "
                    f"Down: {summary['status_breakdown'].get('down', 0)}"
                )
                
                # Wait for next check
                await asyncio.sleep(self.health_check_interval)
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(30)  # Wait before retrying
    
    def stop(self):
        """Stop the failover manager."""
        logger.info("Stopping failover manager")
        self.running = False


def main():
    parser = argparse.ArgumentParser(description='FolioFox Indexer Failover Manager')
    parser.add_argument('--config', default='./config/config.yaml', help='Configuration file path')
    parser.add_argument('--mode', choices=['monitor', 'report', 'test-failover'], default='monitor',
                       help='Operation mode')
    parser.add_argument('--indexer-id', type=int, help='Specific indexer ID for testing')
    
    args = parser.parse_args()
    
    manager = FailoverManager(args.config)
    
    if args.mode == 'report':
        # Generate and print failover report
        manager.load_indexer_configurations()
        asyncio.run(manager.run_health_checks())
        report = manager.generate_failover_report()
        print(json.dumps(report, indent=2, default=str))
        
    elif args.mode == 'test-failover':
        # Test failover for specific indexer
        if not args.indexer_id:
            print("--indexer-id required for test-failover mode")
            sys.exit(1)
        
        manager.load_indexer_configurations()
        asyncio.run(manager._trigger_failover(args.indexer_id, "Manual test"))
        
    else:
        # Run monitoring loop
        try:
            asyncio.run(manager.run_monitoring_loop())
        except KeyboardInterrupt:
            logger.info("Failover manager stopped by user")
            manager.stop()
            sys.exit(0)


if __name__ == "__main__":
    main()