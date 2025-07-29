#!/usr/bin/env python3
"""
FolioFox Deployment Orchestrator

High-level orchestrator that coordinates CI/CD pipelines, deployments, and environment
management. Provides a unified interface for the entire deployment lifecycle with
support for promotion workflows, environment synchronization, and rollback coordination.

Usage:
    python orchestrator.py --config config.yaml promote --from staging --to production
    python orchestrator.py sync-environments --source production --target staging
    python orchestrator.py emergency-rollback --environment production --reason "critical bug"
"""

import asyncio
import logging
import sys
import os
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field
from enum import Enum
import yaml
import json
import sqlite3
from contextlib import asynccontextmanager

# Import our other modules
sys.path.append(str(Path(__file__).parent))
from deployment_manager import DeploymentManager, Environment, DeploymentStrategy, DeploymentStatus
from cicd_pipeline import CICDPipeline, TriggerType, PipelineStatus

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/folio_fox/orchestrator.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class PromotionStatus(Enum):
    """Promotion workflow status"""
    PENDING = "pending"
    VALIDATING = "validating"
    DEPLOYING = "deploying"
    TESTING = "testing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class EnvironmentHealth(Enum):
    """Environment health status"""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    UNKNOWN = "unknown"

@dataclass
class PromotionRequest:
    """Environment promotion request"""
    promotion_id: str
    source_environment: Environment
    target_environment: Environment
    version: str
    status: PromotionStatus
    requested_by: str
    created_at: datetime
    approvals: List[str] = field(default_factory=list)
    validation_results: Dict[str, Any] = field(default_factory=dict)
    deployment_id: Optional[str] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None

@dataclass
class EnvironmentStatus:
    """Environment status information"""
    environment: Environment
    health: EnvironmentHealth
    current_version: Optional[str]
    last_deployment_id: Optional[str]
    last_updated: datetime
    service_statuses: Dict[str, str] = field(default_factory=dict)
    metrics: Dict[str, float] = field(default_factory=dict)
    issues: List[str] = field(default_factory=list)

@dataclass
class DeploymentPlan:
    """Deployment execution plan"""
    plan_id: str
    target_environment: Environment
    version: str
    strategy: DeploymentStrategy
    validation_steps: List[str]
    rollback_plan: List[str]
    estimated_duration_minutes: int
    risk_level: str  # low, medium, high
    approvals_required: List[str] = field(default_factory=list)

class DeploymentOrchestrator:
    """Main deployment orchestrator"""
    
    def __init__(self, config_path: str):
        self.config = self._load_config(config_path)
        self.db_path = self.config['orchestrator']['database']
        
        # Initialize component managers
        self.deployment_manager = DeploymentManager(self.config['deployment']['config_path'])
        self.cicd_pipeline = CICDPipeline(self.config['cicd']['config_path'])
        
        # Initialize orchestrator database
        asyncio.create_task(self._init_orchestrator_database())
    
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
            'orchestrator': {
                'database': '/var/lib/folio_fox/orchestrator.db',
                'approval_required_environments': ['production'],
                'auto_promotion_enabled': False,
                'health_check_interval_minutes': 5
            },
            'deployment': {
                'config_path': '/etc/folio_fox/deployment.yaml'
            },
            'cicd': {
                'config_path': '/etc/folio_fox/cicd.yaml'
            },
            'validation': {
                'staging_soak_time_minutes': 30,
                'production_soak_time_minutes': 60,
                'health_check_endpoints': ['/health', '/metrics', '/status']
            },
            'rollback': {
                'auto_rollback_enabled': True,
                'failure_threshold_percent': 5.0,
                'monitoring_duration_minutes': 15
            },
            'notifications': {
                'slack_webhook_url': None,
                'email_recipients': [],
                'critical_alert_channels': []
            }
        }
    
    async def _init_orchestrator_database(self):
        """Initialize orchestrator database"""
        try:
            async with self._get_db() as conn:
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS promotion_requests (
                        promotion_id TEXT PRIMARY KEY,
                        source_environment TEXT NOT NULL,
                        target_environment TEXT NOT NULL,
                        version TEXT NOT NULL,
                        status TEXT NOT NULL,
                        requested_by TEXT NOT NULL,
                        created_at TIMESTAMP NOT NULL,
                        approvals TEXT,
                        validation_results TEXT,
                        deployment_id TEXT,
                        completed_at TIMESTAMP,
                        error_message TEXT
                    )
                ''')
                
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS environment_snapshots (
                        snapshot_id TEXT PRIMARY KEY,
                        environment TEXT NOT NULL,
                        version TEXT NOT NULL,
                        deployment_id TEXT NOT NULL,
                        health_status TEXT NOT NULL,
                        snapshot_time TIMESTAMP NOT NULL,
                        service_statuses TEXT,
                        metrics TEXT,
                        configuration TEXT
                    )
                ''')
                
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS deployment_plans (
                        plan_id TEXT PRIMARY KEY,
                        target_environment TEXT NOT NULL,
                        version TEXT NOT NULL,
                        strategy TEXT NOT NULL,
                        validation_steps TEXT NOT NULL,
                        rollback_plan TEXT NOT NULL,
                        estimated_duration_minutes INTEGER,
                        risk_level TEXT,
                        approvals_required TEXT,
                        created_at TIMESTAMP NOT NULL
                    )
                ''')
                
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS orchestrator_events (
                        event_id TEXT PRIMARY KEY,
                        event_type TEXT NOT NULL,
                        environment TEXT,
                        details TEXT,
                        timestamp TIMESTAMP NOT NULL
                    )
                ''')
                
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to initialize orchestrator database: {e}")
            raise
    
    @asynccontextmanager
    async def _get_db(self):
        """Get database connection"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            yield conn
        finally:
            if conn:
                conn.close()
    
    async def create_promotion_request(self, source_env: Environment, target_env: Environment, version: str, requested_by: str) -> PromotionRequest:
        """Create environment promotion request"""
        try:
            # Validate promotion path
            if not self._is_valid_promotion_path(source_env, target_env):
                raise ValueError(f"Invalid promotion path: {source_env.value} -> {target_env.value}")
            
            # Check if version exists in source environment
            source_status = await self.deployment_manager.get_environment_status(source_env)
            if source_status.get('current_version') != version:
                raise ValueError(f"Version {version} not found in {source_env.value}")
            
            # Generate promotion ID
            promotion_id = f"prom_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            # Create promotion request
            promotion = PromotionRequest(
                promotion_id=promotion_id,
                source_environment=source_env,
                target_environment=target_env,
                version=version,
                status=PromotionStatus.PENDING,
                requested_by=requested_by,
                created_at=datetime.now()
            )
            
            # Check if approval is required
            if target_env.value in self.config['orchestrator']['approval_required_environments']:
                promotion.approvals = []  # Will be populated by approvers
                logger.info(f"Promotion requires approval: {promotion_id}")
            else:
                # Auto-approve for non-production environments
                promotion.approvals = ["auto-approved"]
            
            # Save promotion request
            await self._save_promotion_request(promotion)
            
            logger.info(f"Promotion request created: {promotion_id} ({source_env.value} -> {target_env.value})")
            
            # Log event
            await self._log_event("promotion_requested", target_env.value, {
                'promotion_id': promotion_id,
                'source': source_env.value,
                'version': version,
                'requested_by': requested_by
            })
            
            return promotion
            
        except Exception as e:
            logger.error(f"Failed to create promotion request: {e}")
            raise
    
    def _is_valid_promotion_path(self, source: Environment, target: Environment) -> bool:
        """Validate promotion path"""
        valid_paths = {
            (Environment.DEVELOPMENT, Environment.STAGING),
            (Environment.STAGING, Environment.PRODUCTION),
            (Environment.DEVELOPMENT, Environment.PRODUCTION)  # Allow skip staging for hotfixes
        }
        return (source, target) in valid_paths
    
    async def approve_promotion(self, promotion_id: str, approver: str) -> bool:
        """Approve promotion request"""
        try:
            promotion = await self._get_promotion_request(promotion_id)
            if not promotion:
                raise ValueError(f"Promotion not found: {promotion_id}")
            
            if promotion.status != PromotionStatus.PENDING:
                raise ValueError(f"Promotion not in pending state: {promotion.status.value}")
            
            # Add approval
            if approver not in promotion.approvals:
                promotion.approvals.append(approver)
                await self._save_promotion_request(promotion)
                
                logger.info(f"Promotion approved by {approver}: {promotion_id}")
                
                # Check if we have enough approvals to proceed
                if self._has_sufficient_approvals(promotion):
                    await self._execute_promotion(promotion)
                
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to approve promotion: {e}")
            raise
    
    def _has_sufficient_approvals(self, promotion: PromotionRequest) -> bool:
        """Check if promotion has sufficient approvals"""
        required_approvals = 1  # Could be configurable based on environment
        return len(promotion.approvals) >= required_approvals
    
    async def _execute_promotion(self, promotion: PromotionRequest):
        """Execute approved promotion"""
        try:
            promotion.status = PromotionStatus.VALIDATING
            await self._save_promotion_request(promotion)
            
            logger.info(f"Executing promotion: {promotion.promotion_id}")
            
            # Pre-deployment validation
            validation_success = await self._validate_promotion(promotion)
            if not validation_success:
                promotion.status = PromotionStatus.FAILED
                promotion.error_message = "Pre-deployment validation failed"
                await self._save_promotion_request(promotion)
                return
            
            # Execute deployment
            promotion.status = PromotionStatus.DEPLOYING
            await self._save_promotion_request(promotion)
            
            deployment = await self.deployment_manager.deploy(
                environment=promotion.target_environment,
                artifact_version=promotion.version,
                strategy=self._get_deployment_strategy(promotion.target_environment),
                deployed_by=f"orchestrator:{promotion.requested_by}"
            )
            
            promotion.deployment_id = deployment.deployment_id
            
            if deployment.status == DeploymentStatus.COMPLETED:
                # Post-deployment testing
                promotion.status = PromotionStatus.TESTING
                await self._save_promotion_request(promotion)
                
                testing_success = await self._post_deployment_testing(promotion)
                if testing_success:
                    promotion.status = PromotionStatus.COMPLETED
                    promotion.completed_at = datetime.now()
                    logger.info(f"Promotion completed successfully: {promotion.promotion_id}")
                else:
                    promotion.status = PromotionStatus.FAILED
                    promotion.error_message = "Post-deployment testing failed"
                    # Trigger rollback
                    await self._trigger_automatic_rollback(promotion)
            else:
                promotion.status = PromotionStatus.FAILED
                promotion.error_message = f"Deployment failed: {deployment.deployment_id}"
            
            await self._save_promotion_request(promotion)
            
            # Log completion event
            await self._log_event("promotion_completed", promotion.target_environment.value, {
                'promotion_id': promotion.promotion_id,
                'status': promotion.status.value,
                'deployment_id': promotion.deployment_id
            })
            
        except Exception as e:
            promotion.status = PromotionStatus.FAILED
            promotion.error_message = str(e)
            await self._save_promotion_request(promotion)
            logger.error(f"Promotion execution failed: {e}")
            raise
    
    def _get_deployment_strategy(self, environment: Environment) -> DeploymentStrategy:
        """Get appropriate deployment strategy for environment"""
        if environment == Environment.PRODUCTION:
            return DeploymentStrategy.BLUE_GREEN
        elif environment == Environment.STAGING:
            return DeploymentStrategy.ROLLING
        else:
            return DeploymentStrategy.RECREATE
    
    async def _validate_promotion(self, promotion: PromotionRequest) -> bool:
        """Pre-deployment validation"""
        try:
            validation_results = {}
            
            # Check source environment health
            source_health = await self._check_environment_health(promotion.source_environment)
            validation_results['source_health'] = source_health.value
            
            if source_health != EnvironmentHealth.HEALTHY:
                logger.warning(f"Source environment not healthy: {promotion.source_environment.value}")
                # Don't fail validation for warnings, but log it
            
            # Check target environment readiness
            target_health = await self._check_environment_health(promotion.target_environment)
            validation_results['target_health'] = target_health.value
            
            if target_health == EnvironmentHealth.CRITICAL:
                logger.error(f"Target environment critical: {promotion.target_environment.value}")
                return False
            
            # Check resource availability
            resource_check = await self._check_resource_availability(promotion.target_environment)
            validation_results['resource_availability'] = resource_check
            
            if not resource_check:
                logger.error(f"Insufficient resources: {promotion.target_environment.value}")
                return False
            
            # Check for conflicting deployments
            conflicting_deployments = await self._check_conflicting_deployments(promotion.target_environment)
            validation_results['conflicting_deployments'] = conflicting_deployments
            
            if conflicting_deployments:
                logger.error(f"Conflicting deployments detected: {promotion.target_environment.value}")
                return False
            
            promotion.validation_results = validation_results
            return True
            
        except Exception as e:
            logger.error(f"Validation failed: {e}")
            return False
    
    async def _check_environment_health(self, environment: Environment) -> EnvironmentHealth:
        """Check environment health status"""
        try:
            # This would integrate with monitoring systems
            # For now, return a simple health check
            env_status = await self.deployment_manager.get_environment_status(environment)
            
            if env_status.get('status') == 'healthy':
                return EnvironmentHealth.HEALTHY
            elif env_status.get('status') == 'not_deployed':
                return EnvironmentHealth.UNKNOWN
            else:
                return EnvironmentHealth.WARNING
            
        except Exception as e:
            logger.error(f"Health check failed for {environment.value}: {e}")
            return EnvironmentHealth.CRITICAL
    
    async def _check_resource_availability(self, environment: Environment) -> bool:
        """Check if environment has sufficient resources"""
        try:
            # This would check CPU, memory, disk space, etc.
            # For now, assume resources are available
            return True
            
        except Exception as e:
            logger.error(f"Resource check failed for {environment.value}: {e}")
            return False
    
    async def _check_conflicting_deployments(self, environment: Environment) -> bool:
        """Check for conflicting deployments"""
        try:
            # This would check for ongoing deployments to the same environment
            # For now, assume no conflicts
            return False
            
        except Exception as e:
            logger.error(f"Conflict check failed for {environment.value}: {e}")
            return True  # Err on the side of caution
    
    async def _post_deployment_testing(self, promotion: PromotionRequest) -> bool:
        """Post-deployment testing and validation"""
        try:
            # Wait for deployment to stabilize
            soak_time = self.config['validation'].get(f'{promotion.target_environment.value}_soak_time_minutes', 5)
            logger.info(f"Waiting {soak_time} minutes for deployment to stabilize...")
            await asyncio.sleep(soak_time * 60)
            
            # Health check endpoints
            health_endpoints = self.config['validation']['health_check_endpoints']
            for endpoint in health_endpoints:
                if not await self._check_endpoint_health(promotion.target_environment, endpoint):
                    logger.error(f"Health check failed for {endpoint}")
                    return False
            
            # Run smoke tests
            if not await self._run_smoke_tests(promotion.target_environment):
                logger.error("Smoke tests failed")
                return False
            
            logger.info(f"Post-deployment testing passed: {promotion.promotion_id}")
            return True
            
        except Exception as e:
            logger.error(f"Post-deployment testing failed: {e}")
            return False
    
    async def _check_endpoint_health(self, environment: Environment, endpoint: str) -> bool:
        """Check if endpoint is healthy"""
        try:
            # This would make actual HTTP requests to check health
            # For now, assume healthy
            await asyncio.sleep(1)  # Simulate check
            return True
            
        except Exception as e:
            logger.error(f"Endpoint health check failed: {endpoint} - {e}")
            return False
    
    async def _run_smoke_tests(self, environment: Environment) -> bool:
        """Run smoke tests against environment"""
        try:
            # This would run actual smoke tests
            # For now, simulate test execution
            await asyncio.sleep(2)  # Simulate test run
            return True
            
        except Exception as e:
            logger.error(f"Smoke tests failed: {e}")
            return False
    
    async def _trigger_automatic_rollback(self, promotion: PromotionRequest):
        """Trigger automatic rollback on failure"""
        try:
            if not self.config['rollback']['auto_rollback_enabled']:
                logger.info("Automatic rollback disabled")
                return
            
            if promotion.deployment_id:
                logger.info(f"Triggering automatic rollback for deployment: {promotion.deployment_id}")
                
                rollback_deployment = await self.deployment_manager.rollback(
                    deployment_id=promotion.deployment_id,
                    deployed_by=f"auto-rollback:{promotion.promotion_id}"
                )
                
                # Log rollback event
                await self._log_event("automatic_rollback", promotion.target_environment.value, {
                    'original_deployment_id': promotion.deployment_id,
                    'rollback_deployment_id': rollback_deployment.deployment_id,
                    'reason': 'promotion_failure'
                })
                
        except Exception as e:
            logger.error(f"Automatic rollback failed: {e}")
    
    async def emergency_rollback(self, environment: Environment, reason: str, initiated_by: str) -> bool:
        """Emergency rollback of environment"""
        try:
            logger.warning(f"Emergency rollback initiated for {environment.value}: {reason}")
            
            # Get current deployment
            env_status = await self.deployment_manager.get_environment_status(environment)
            current_deployment_id = env_status.get('current_deployment_id')
            
            if not current_deployment_id:
                logger.error(f"No current deployment found for {environment.value}")
                return False
            
            # Execute rollback
            rollback_deployment = await self.deployment_manager.rollback(
                deployment_id=current_deployment_id,
                deployed_by=f"emergency:{initiated_by}"
            )
            
            success = rollback_deployment.status == DeploymentStatus.COMPLETED
            
            # Log emergency rollback
            await self._log_event("emergency_rollback", environment.value, {
                'original_deployment_id': current_deployment_id,
                'rollback_deployment_id': rollback_deployment.deployment_id,
                'reason': reason,
                'initiated_by': initiated_by,
                'success': success
            })
            
            if success:
                logger.info(f"Emergency rollback completed: {rollback_deployment.deployment_id}")
            else:
                logger.error(f"Emergency rollback failed: {rollback_deployment.deployment_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"Emergency rollback failed: {e}")
            return False
    
    async def sync_environments(self, source: Environment, target: Environment) -> bool:
        """Synchronize target environment with source"""
        try:
            logger.info(f"Synchronizing {target.value} with {source.value}")
            
            # Get source environment version
            source_status = await self.deployment_manager.get_environment_status(source)
            source_version = source_status.get('current_version')
            
            if not source_version:
                logger.error(f"No version found in source environment: {source.value}")
                return False
            
            # Create promotion request
            promotion = await self.create_promotion_request(
                source_env=source,
                target_env=target,
                version=source_version,
                requested_by="orchestrator:sync"
            )
            
            # Auto-approve for sync operations
            if target != Environment.PRODUCTION:
                promotion.approvals = ["auto-approved"]
                await self._execute_promotion(promotion)
                return promotion.status == PromotionStatus.COMPLETED
            else:
                logger.info(f"Production sync requires manual approval: {promotion.promotion_id}")
                return True  # Request created successfully
            
        except Exception as e:
            logger.error(f"Environment sync failed: {e}")
            return False
    
    async def get_deployment_overview(self) -> Dict[str, Any]:
        """Get comprehensive deployment overview"""
        try:
            overview = {
                'timestamp': datetime.now().isoformat(),
                'environments': {},
                'active_promotions': [],
                'recent_deployments': [],
                'system_health': 'healthy'
            }
            
            # Get environment statuses
            for env in [Environment.DEVELOPMENT, Environment.STAGING, Environment.PRODUCTION]:
                status = await self.deployment_manager.get_environment_status(env)
                health = await self._check_environment_health(env)
                
                overview['environments'][env.value] = {
                    'status': status.get('status', 'unknown'),
                    'health': health.value,
                    'current_version': status.get('current_version'),
                    'current_deployment_id': status.get('current_deployment_id'),
                    'last_updated': status.get('last_updated')
                }
            
            # Get active promotions
            active_promotions = await self._get_active_promotions()
            overview['active_promotions'] = [
                {
                    'promotion_id': p['promotion_id'],
                    'source': p['source_environment'],
                    'target': p['target_environment'],
                    'version': p['version'],
                    'status': p['status'],
                    'requested_by': p['requested_by']
                }
                for p in active_promotions
            ]
            
            # Get recent deployments
            recent_deployments = await self._get_recent_deployments()
            overview['recent_deployments'] = recent_deployments
            
            # Determine overall system health
            env_healths = [env['health'] for env in overview['environments'].values()]
            if 'critical' in env_healths:
                overview['system_health'] = 'critical'
            elif 'warning' in env_healths:
                overview['system_health'] = 'warning'
            
            return overview
            
        except Exception as e:
            logger.error(f"Failed to get deployment overview: {e}")
            return {'error': str(e)}
    
    async def _get_active_promotions(self) -> List[Dict]:
        """Get active promotion requests"""
        try:
            async with self._get_db() as conn:
                cursor = await conn.execute('''
                    SELECT * FROM promotion_requests 
                    WHERE status IN ('pending', 'validating', 'deploying', 'testing')
                    ORDER BY created_at DESC
                ''')
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Failed to get active promotions: {e}")
            return []
    
    async def _get_recent_deployments(self, limit: int = 10) -> List[Dict]:
        """Get recent deployments across all environments"""
        try:
            # This would query the deployment manager's database
            # For now, return placeholder data
            return []
            
        except Exception as e:
            logger.error(f"Failed to get recent deployments: {e}")
            return []
    
    async def _save_promotion_request(self, promotion: PromotionRequest):
        """Save promotion request to database"""
        try:
            async with self._get_db() as conn:
                await conn.execute('''
                    INSERT OR REPLACE INTO promotion_requests 
                    (promotion_id, source_environment, target_environment, version, status, 
                     requested_by, created_at, approvals, validation_results, deployment_id, 
                     completed_at, error_message)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    promotion.promotion_id,
                    promotion.source_environment.value,
                    promotion.target_environment.value,
                    promotion.version,
                    promotion.status.value,
                    promotion.requested_by,
                    promotion.created_at.isoformat(),
                    json.dumps(promotion.approvals),
                    json.dumps(promotion.validation_results),
                    promotion.deployment_id,
                    promotion.completed_at.isoformat() if promotion.completed_at else None,
                    promotion.error_message
                ))
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to save promotion request: {e}")
            raise
    
    async def _get_promotion_request(self, promotion_id: str) -> Optional[PromotionRequest]:
        """Get promotion request by ID"""
        try:
            async with self._get_db() as conn:
                cursor = await conn.execute('''
                    SELECT * FROM promotion_requests WHERE promotion_id = ?
                ''', (promotion_id,))
                row = await cursor.fetchone()
                
                if not row:
                    return None
                
                return PromotionRequest(
                    promotion_id=row['promotion_id'],
                    source_environment=Environment(row['source_environment']),
                    target_environment=Environment(row['target_environment']),
                    version=row['version'],
                    status=PromotionStatus(row['status']),
                    requested_by=row['requested_by'],
                    created_at=datetime.fromisoformat(row['created_at']),
                    approvals=json.loads(row['approvals']) if row['approvals'] else [],
                    validation_results=json.loads(row['validation_results']) if row['validation_results'] else {},
                    deployment_id=row['deployment_id'],
                    completed_at=datetime.fromisoformat(row['completed_at']) if row['completed_at'] else None,
                    error_message=row['error_message']
                )
                
        except Exception as e:
            logger.error(f"Failed to get promotion request: {e}")
            return None
    
    async def _log_event(self, event_type: str, environment: str, details: Dict[str, Any]):
        """Log orchestrator event"""
        try:
            event_id = f"evt_{datetime.now().strftime('%Y%m%d_%H%M%S%f')}"
            
            async with self._get_db() as conn:
                await conn.execute('''
                    INSERT INTO orchestrator_events 
                    (event_id, event_type, environment, details, timestamp)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    event_id,
                    event_type,
                    environment,
                    json.dumps(details),
                    datetime.now().isoformat()
                ))
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to log event: {e}")

async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='FolioFox Deployment Orchestrator')
    parser.add_argument('--config', default='/etc/folio_fox/orchestrator.yaml', help='Configuration file path')
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Promote command
    promote_parser = subparsers.add_parser('promote', help='Promote between environments')
    promote_parser.add_argument('--from', dest='source', required=True, choices=['development', 'staging'], help='Source environment')
    promote_parser.add_argument('--to', dest='target', required=True, choices=['staging', 'production'], help='Target environment')
    promote_parser.add_argument('--version', help='Specific version to promote (default: current in source)')
    promote_parser.add_argument('--requested-by', default='cli', help='User requesting promotion')
    
    # Approve command
    approve_parser = subparsers.add_parser('approve', help='Approve promotion request')
    approve_parser.add_argument('--promotion-id', required=True, help='Promotion ID to approve')
    approve_parser.add_argument('--approver', required=True, help='Approver name')
    
    # Sync environments command
    sync_parser = subparsers.add_parser('sync-environments', help='Synchronize environments')
    sync_parser.add_argument('--source', required=True, choices=['development', 'staging', 'production'], help='Source environment')
    sync_parser.add_argument('--target', required=True, choices=['development', 'staging', 'production'], help='Target environment')
    
    # Emergency rollback command
    rollback_parser = subparsers.add_parser('emergency-rollback', help='Emergency rollback')
    rollback_parser.add_argument('--environment', required=True, choices=['development', 'staging', 'production'], help='Environment to rollback')
    rollback_parser.add_argument('--reason', required=True, help='Reason for rollback')
    rollback_parser.add_argument('--initiated-by', default='cli', help='User initiating rollback')
    
    # Overview command
    overview_parser = subparsers.add_parser('overview', help='Get deployment overview')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    try:
        orchestrator = DeploymentOrchestrator(args.config)
        
        if args.command == 'promote':
            # Get version from source environment if not specified
            version = args.version
            if not version:
                source_status = await orchestrator.deployment_manager.get_environment_status(Environment(args.source))
                version = source_status.get('current_version')
                if not version:
                    print(f"No version found in source environment: {args.source}")
                    return
            
            promotion = await orchestrator.create_promotion_request(
                source_env=Environment(args.source),
                target_env=Environment(args.target),
                version=version,
                requested_by=args.requested_by
            )
            print(f"Promotion request created: {promotion.promotion_id}")
            
        elif args.command == 'approve':
            success = await orchestrator.approve_promotion(args.promotion_id, args.approver)
            if success:
                print(f"Promotion approved: {args.promotion_id}")
            else:
                print(f"Failed to approve promotion: {args.promotion_id}")
                
        elif args.command == 'sync-environments':
            success = await orchestrator.sync_environments(
                source=Environment(args.source),
                target=Environment(args.target)
            )
            if success:
                print(f"Environment sync initiated: {args.source} -> {args.target}")
            else:
                print(f"Environment sync failed: {args.source} -> {args.target}")
                
        elif args.command == 'emergency-rollback':
            success = await orchestrator.emergency_rollback(
                environment=Environment(args.environment),
                reason=args.reason,
                initiated_by=args.initiated_by
            )
            if success:
                print(f"Emergency rollback completed: {args.environment}")
            else:
                print(f"Emergency rollback failed: {args.environment}")
                
        elif args.command == 'overview':
            overview = await orchestrator.get_deployment_overview()
            print(json.dumps(overview, indent=2))
        
    except Exception as e:
        logger.error(f"Command failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())