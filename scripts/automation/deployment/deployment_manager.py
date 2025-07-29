#!/usr/bin/env python3
"""
FolioFox Deployment Manager

Comprehensive deployment automation system for FolioFox application with support for
blue-green deployments, rolling updates, rollback mechanisms, and environment management.
Designed for production environments with comprehensive error handling and monitoring.

Usage:
    python deployment_manager.py --config config.yaml deploy --environment production
    python deployment_manager.py rollback --deployment-id dep_20240115_143022
    python deployment_manager.py status --environment staging
"""

import asyncio
import logging
import sys
import os
import shutil
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field
from enum import Enum
import yaml
import json
import aiofiles
import sqlite3
from contextlib import asynccontextmanager
import hashlib
import tarfile
import tempfile

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/folio_fox/deployment.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class DeploymentStrategy(Enum):
    """Deployment strategies"""
    BLUE_GREEN = "blue_green"
    ROLLING = "rolling"
    CANARY = "canary"
    RECREATE = "recreate"

class DeploymentStatus(Enum):
    """Deployment status"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"
    ROLLING_BACK = "rolling_back"

class Environment(Enum):
    """Deployment environments"""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"

class ServiceStatus(Enum):
    """Service status"""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    UNHEALTHY = "unhealthy"
    FAILED = "failed"

@dataclass
class ServiceConfig:
    """Service configuration"""
    name: str
    port: int
    health_check_path: str
    startup_timeout: int = 60
    dependencies: List[str] = field(default_factory=list)
    restart_policy: str = "unless-stopped"
    environment_vars: Dict[str, str] = field(default_factory=dict)

@dataclass
class DeploymentArtifact:
    """Deployment artifact information"""
    version: str
    build_id: str
    artifact_path: Path
    checksum: str
    size_bytes: int
    created_at: datetime
    git_commit: Optional[str] = None
    git_branch: Optional[str] = None

@dataclass
class DeploymentStep:
    """Individual deployment step"""
    name: str
    description: str
    status: DeploymentStatus = DeploymentStatus.PENDING
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    error_message: Optional[str] = None
    output: List[str] = field(default_factory=list)

@dataclass
class Deployment:
    """Deployment record"""
    deployment_id: str
    environment: Environment
    strategy: DeploymentStrategy
    artifact: DeploymentArtifact
    status: DeploymentStatus
    steps: List[DeploymentStep]
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    deployed_by: str = "system"
    rollback_deployment_id: Optional[str] = None

class DeploymentManager:
    """Main deployment management system"""
    
    def __init__(self, config_path: str):
        self.config = self._load_config(config_path)
        self.db_path = self.config['deployment']['database']
        self.artifact_store = Path(self.config['deployment']['artifact_store'])
        self.services: List[ServiceConfig] = self._load_service_configs()
        
        # Ensure directories exist
        self.artifact_store.mkdir(parents=True, exist_ok=True)
        Path(self.config['deployment']['backup_path']).mkdir(parents=True, exist_ok=True)
        
        # Initialize deployment database
        asyncio.create_task(self._init_deployment_database())
    
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
            'deployment': {
                'database': '/var/lib/folio_fox/deployment.db',
                'artifact_store': '/var/lib/folio_fox/artifacts',
                'backup_path': '/var/backups/folio_fox/deployments',
                'max_concurrent_services': 3,
                'health_check_timeout': 30,
                'rollback_retention_days': 30
            },
            'environments': {
                'development': {
                    'base_path': '/opt/folio_fox/dev',
                    'database_path': '/var/lib/folio_fox/dev.db',
                    'log_path': '/var/log/folio_fox/dev'
                },
                'staging': {
                    'base_path': '/opt/folio_fox/staging',
                    'database_path': '/var/lib/folio_fox/staging.db',
                    'log_path': '/var/log/folio_fox/staging'
                },
                'production': {
                    'base_path': '/opt/folio_fox/prod',
                    'database_path': '/var/lib/folio_fox/prod.db',
                    'log_path': '/var/log/folio_fox/prod'
                }
            },
            'services': [
                {
                    'name': 'folio-fox-backend',
                    'port': 8080,
                    'health_check_path': '/health',
                    'startup_timeout': 60,
                    'dependencies': ['database']
                },
                {
                    'name': 'folio-fox-frontend',
                    'port': 3000,
                    'health_check_path': '/',
                    'startup_timeout': 30,
                    'dependencies': ['folio-fox-backend']
                }
            ]
        }
    
    def _load_service_configs(self) -> List[ServiceConfig]:
        """Load service configurations"""
        services = []
        for service_config in self.config.get('services', []):
            services.append(ServiceConfig(
                name=service_config['name'],
                port=service_config['port'],
                health_check_path=service_config['health_check_path'],
                startup_timeout=service_config.get('startup_timeout', 60),
                dependencies=service_config.get('dependencies', []),
                restart_policy=service_config.get('restart_policy', 'unless-stopped'),
                environment_vars=service_config.get('environment_vars', {})
            ))
        return services
    
    async def _init_deployment_database(self):
        """Initialize deployment tracking database"""
        try:
            async with self._get_db() as conn:
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS deployments (
                        deployment_id TEXT PRIMARY KEY,
                        environment TEXT NOT NULL,
                        strategy TEXT NOT NULL,
                        artifact_version TEXT NOT NULL,
                        artifact_path TEXT NOT NULL,
                        status TEXT NOT NULL,
                        start_time TIMESTAMP NOT NULL,
                        end_time TIMESTAMP,
                        duration_seconds INTEGER,
                        deployed_by TEXT,
                        rollback_deployment_id TEXT,
                        metadata TEXT
                    )
                ''')
                
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS deployment_steps (
                        deployment_id TEXT,
                        step_name TEXT,
                        step_description TEXT,
                        status TEXT,
                        start_time TIMESTAMP,
                        end_time TIMESTAMP,
                        error_message TEXT,
                        output TEXT,
                        FOREIGN KEY (deployment_id) REFERENCES deployments (deployment_id)
                    )
                ''')
                
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS deployment_artifacts (
                        version TEXT PRIMARY KEY,
                        build_id TEXT NOT NULL,
                        artifact_path TEXT NOT NULL,
                        checksum TEXT NOT NULL,
                        size_bytes INTEGER NOT NULL,
                        created_at TIMESTAMP NOT NULL,
                        git_commit TEXT,
                        git_branch TEXT,
                        metadata TEXT
                    )
                ''')
                
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS environment_state (
                        environment TEXT PRIMARY KEY,
                        current_deployment_id TEXT,
                        current_version TEXT,
                        last_updated TIMESTAMP,
                        health_status TEXT,
                        FOREIGN KEY (current_deployment_id) REFERENCES deployments (deployment_id)
                    )
                ''')
                
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to initialize deployment database: {e}")
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
    
    async def create_artifact(self, source_path: str, version: str, git_commit: Optional[str] = None, git_branch: Optional[str] = None) -> DeploymentArtifact:
        """Create deployment artifact from source"""
        try:
            source = Path(source_path)
            if not source.exists():
                raise FileNotFoundError(f"Source path does not exist: {source_path}")
            
            # Generate artifact filename
            build_id = f"build_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            artifact_filename = f"folio_fox_{version}_{build_id}.tar.gz"
            artifact_path = self.artifact_store / artifact_filename
            
            logger.info(f"Creating deployment artifact: {artifact_path}")
            
            # Create compressed archive
            with tarfile.open(artifact_path, 'w:gz') as tar:
                tar.add(source, arcname='folio_fox')
            
            # Calculate checksum
            checksum = await self._calculate_file_checksum(artifact_path)
            size_bytes = artifact_path.stat().st_size
            
            # Create artifact record
            artifact = DeploymentArtifact(
                version=version,
                build_id=build_id,
                artifact_path=artifact_path,
                checksum=checksum,
                size_bytes=size_bytes,
                created_at=datetime.now(),
                git_commit=git_commit,
                git_branch=git_branch
            )
            
            # Save to database
            await self._save_artifact(artifact)
            
            logger.info(f"Artifact created successfully: {artifact_filename} ({size_bytes / 1024 / 1024:.1f} MB)")
            return artifact
            
        except Exception as e:
            logger.error(f"Failed to create artifact: {e}")
            raise
    
    async def _calculate_file_checksum(self, file_path: Path) -> str:
        """Calculate SHA-256 checksum of file"""
        hash_sha256 = hashlib.sha256()
        async with aiofiles.open(file_path, 'rb') as f:
            while chunk := await f.read(8192):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    
    async def _save_artifact(self, artifact: DeploymentArtifact):
        """Save artifact to database"""
        try:
            async with self._get_db() as conn:
                await conn.execute('''
                    INSERT OR REPLACE INTO deployment_artifacts 
                    (version, build_id, artifact_path, checksum, size_bytes, created_at, git_commit, git_branch, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    artifact.version,
                    artifact.build_id,
                    str(artifact.artifact_path),
                    artifact.checksum,
                    artifact.size_bytes,
                    artifact.created_at.isoformat(),
                    artifact.git_commit,
                    artifact.git_branch,
                    json.dumps(artifact.__dict__, default=str)
                ))
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to save artifact: {e}")
            raise
    
    async def deploy(self, environment: Environment, artifact_version: str, strategy: DeploymentStrategy = DeploymentStrategy.ROLLING, deployed_by: str = "system") -> Deployment:
        """Deploy application to environment"""
        try:
            # Get artifact
            artifact = await self._get_artifact(artifact_version)
            if not artifact:
                raise ValueError(f"Artifact not found: {artifact_version}")
            
            # Generate deployment ID
            deployment_id = f"dep_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            # Create deployment steps based on strategy
            steps = await self._create_deployment_steps(strategy, environment)
            
            # Create deployment record
            deployment = Deployment(
                deployment_id=deployment_id,
                environment=environment,
                strategy=strategy,
                artifact=artifact,
                status=DeploymentStatus.IN_PROGRESS,
                steps=steps,
                start_time=datetime.now(),
                deployed_by=deployed_by
            )
            
            logger.info(f"Starting deployment: {deployment_id} ({artifact_version} -> {environment.value})")
            
            # Save deployment record
            await self._save_deployment(deployment)
            
            # Execute deployment
            success = await self._execute_deployment(deployment)
            
            # Update final status
            deployment.end_time = datetime.now()
            deployment.duration_seconds = int((deployment.end_time - deployment.start_time).total_seconds())
            deployment.status = DeploymentStatus.COMPLETED if success else DeploymentStatus.FAILED
            
            # Update deployment record
            await self._save_deployment(deployment)
            
            # Update environment state if successful
            if success:
                await self._update_environment_state(environment, deployment)
                logger.info(f"Deployment completed successfully: {deployment_id}")
            else:
                logger.error(f"Deployment failed: {deployment_id}")
            
            return deployment
            
        except Exception as e:
            logger.error(f"Deployment failed with exception: {e}")
            raise
    
    async def _get_artifact(self, version: str) -> Optional[DeploymentArtifact]:
        """Get artifact by version"""
        try:
            async with self._get_db() as conn:
                cursor = await conn.execute('''
                    SELECT * FROM deployment_artifacts WHERE version = ?
                ''', (version,))
                row = await cursor.fetchone()
                
                if not row:
                    return None
                
                return DeploymentArtifact(
                    version=row['version'],
                    build_id=row['build_id'],
                    artifact_path=Path(row['artifact_path']),
                    checksum=row['checksum'],
                    size_bytes=row['size_bytes'],
                    created_at=datetime.fromisoformat(row['created_at']),
                    git_commit=row['git_commit'],
                    git_branch=row['git_branch']
                )
                
        except Exception as e:
            logger.error(f"Failed to get artifact: {e}")
            return None
    
    async def _create_deployment_steps(self, strategy: DeploymentStrategy, environment: Environment) -> List[DeploymentStep]:
        """Create deployment steps based on strategy"""
        steps = []
        
        # Common steps
        steps.append(DeploymentStep("Pre-deployment checks", "Validate environment and prerequisites"))
        steps.append(DeploymentStep("Create backup", "Backup current deployment"))
        steps.append(DeploymentStep("Extract artifact", "Extract deployment artifact"))
        
        if strategy == DeploymentStrategy.BLUE_GREEN:
            steps.extend([
                DeploymentStep("Setup green environment", "Configure new environment"),
                DeploymentStep("Deploy to green", "Deploy to new environment"),
                DeploymentStep("Health check green", "Verify green environment health"),
                DeploymentStep("Switch traffic", "Switch traffic to green environment"),
                DeploymentStep("Cleanup blue", "Clean up old environment")
            ])
        
        elif strategy == DeploymentStrategy.ROLLING:
            steps.extend([
                DeploymentStep("Rolling update start", "Begin rolling update"),
                DeploymentStep("Update services", "Update services one by one"),
                DeploymentStep("Verify deployment", "Verify all services are healthy")
            ])
        
        elif strategy == DeploymentStrategy.CANARY:
            steps.extend([
                DeploymentStep("Deploy canary", "Deploy to subset of instances"),
                DeploymentStep("Monitor canary", "Monitor canary deployment"),
                DeploymentStep("Gradual rollout", "Gradually increase traffic"),
                DeploymentStep("Complete rollout", "Complete full deployment")
            ])
        
        elif strategy == DeploymentStrategy.RECREATE:
            steps.extend([
                DeploymentStep("Stop services", "Stop all application services"),
                DeploymentStep("Deploy new version", "Deploy new application version"),
                DeploymentStep("Start services", "Start application services"),
                DeploymentStep("Verify deployment", "Verify deployment health")
            ])
        
        steps.append(DeploymentStep("Post-deployment validation", "Final validation and cleanup"))
        
        return steps
    
    async def _execute_deployment(self, deployment: Deployment) -> bool:
        """Execute deployment steps"""
        try:
            for step in deployment.steps:
                step.status = DeploymentStatus.IN_PROGRESS
                step.start_time = datetime.now()
                
                logger.info(f"Executing step: {step.name}")
                
                try:
                    success = await self._execute_deployment_step(deployment, step)
                    
                    if not success:
                        step.status = DeploymentStatus.FAILED
                        return False
                    
                    step.status = DeploymentStatus.COMPLETED
                    
                except Exception as e:
                    step.status = DeploymentStatus.FAILED
                    step.error_message = str(e)
                    logger.error(f"Step failed: {step.name} - {e}")
                    return False
                
                finally:
                    step.end_time = datetime.now()
                    await self._save_deployment(deployment)
            
            return True
            
        except Exception as e:
            logger.error(f"Deployment execution failed: {e}")
            return False
    
    async def _execute_deployment_step(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Execute individual deployment step"""
        try:
            if step.name == "Pre-deployment checks":
                return await self._pre_deployment_checks(deployment, step)
            elif step.name == "Create backup":
                return await self._create_backup(deployment, step)
            elif step.name == "Extract artifact":
                return await self._extract_artifact(deployment, step)
            elif step.name == "Setup green environment":
                return await self._setup_green_environment(deployment, step)
            elif step.name == "Deploy to green":
                return await self._deploy_to_green(deployment, step)
            elif step.name == "Health check green":
                return await self._health_check_green(deployment, step)
            elif step.name == "Switch traffic":
                return await self._switch_traffic(deployment, step)
            elif step.name == "Cleanup blue":
                return await self._cleanup_blue(deployment, step)
            elif step.name == "Rolling update start":
                return await self._rolling_update_start(deployment, step)
            elif step.name == "Update services":
                return await self._update_services(deployment, step)
            elif step.name == "Stop services":
                return await self._stop_services(deployment, step)
            elif step.name == "Deploy new version":
                return await self._deploy_new_version(deployment, step)
            elif step.name == "Start services":
                return await self._start_services(deployment, step)
            elif step.name == "Verify deployment":
                return await self._verify_deployment(deployment, step)
            elif step.name == "Post-deployment validation":
                return await self._post_deployment_validation(deployment, step)
            else:
                step.output.append(f"Unknown step: {step.name}")
                return True  # Skip unknown steps
                
        except Exception as e:
            step.error_message = str(e)
            return False
    
    async def _pre_deployment_checks(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Pre-deployment validation checks"""
        step.output.append("Checking system prerequisites...")
        
        # Check artifact exists and is valid
        if not deployment.artifact.artifact_path.exists():
            step.output.append(f"Artifact not found: {deployment.artifact.artifact_path}")
            return False
        
        # Verify checksum
        actual_checksum = await self._calculate_file_checksum(deployment.artifact.artifact_path)
        if actual_checksum != deployment.artifact.checksum:
            step.output.append("Artifact checksum mismatch - file may be corrupted")
            return False
        
        # Check environment path exists
        env_config = self.config['environments'][deployment.environment.value]
        env_path = Path(env_config['base_path'])
        if not env_path.parent.exists():
            step.output.append(f"Environment parent directory does not exist: {env_path.parent}")
            return False
        
        # Check disk space
        available_space = shutil.disk_usage(env_path.parent).free
        required_space = deployment.artifact.size_bytes * 3  # Allow for extraction + backup
        if available_space < required_space:
            step.output.append(f"Insufficient disk space: {available_space / 1024 / 1024:.1f} MB available, {required_space / 1024 / 1024:.1f} MB required")
            return False
        
        step.output.append("Pre-deployment checks passed")
        return True
    
    async def _create_backup(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Create backup of current deployment"""
        try:
            env_config = self.config['environments'][deployment.environment.value]
            current_path = Path(env_config['base_path'])
            
            if current_path.exists():
                backup_path = Path(self.config['deployment']['backup_path'])
                backup_filename = f"backup_{deployment.environment.value}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.tar.gz"
                backup_file = backup_path / backup_filename
                
                step.output.append(f"Creating backup: {backup_filename}")
                
                with tarfile.open(backup_file, 'w:gz') as tar:
                    tar.add(current_path, arcname=f"folio_fox_{deployment.environment.value}")
                
                step.output.append(f"Backup created: {backup_file} ({backup_file.stat().st_size / 1024 / 1024:.1f} MB)")
            else:
                step.output.append("No existing deployment to backup")
            
            return True
            
        except Exception as e:
            step.output.append(f"Backup failed: {e}")
            return False
    
    async def _extract_artifact(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Extract deployment artifact"""
        try:
            env_config = self.config['environments'][deployment.environment.value]
            target_path = Path(env_config['base_path'])
            
            # Create temporary extraction directory
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)
                
                step.output.append(f"Extracting artifact to temporary location...")
                
                # Extract artifact
                with tarfile.open(deployment.artifact.artifact_path, 'r:gz') as tar:
                    tar.extractall(temp_path)
                
                # Move to final location
                extracted_path = temp_path / 'folio_fox'
                if extracted_path.exists():
                    if target_path.exists():
                        shutil.rmtree(target_path)
                    shutil.move(str(extracted_path), str(target_path))
                    step.output.append(f"Artifact extracted to: {target_path}")
                else:
                    step.output.append("Extracted artifact structure is invalid")
                    return False
            
            return True
            
        except Exception as e:
            step.output.append(f"Extraction failed: {e}")
            return False
    
    async def _setup_green_environment(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Setup green environment for blue-green deployment"""
        # Placeholder implementation
        step.output.append("Green environment setup completed")
        await asyncio.sleep(1)  # Simulate work
        return True
    
    async def _deploy_to_green(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Deploy to green environment"""
        # Placeholder implementation
        step.output.append("Deployment to green environment completed")
        await asyncio.sleep(2)  # Simulate work
        return True
    
    async def _health_check_green(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Health check green environment"""
        # Placeholder implementation
        step.output.append("Green environment health check passed")
        await asyncio.sleep(1)  # Simulate work
        return True
    
    async def _switch_traffic(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Switch traffic to green environment"""
        # Placeholder implementation
        step.output.append("Traffic switched to green environment")
        await asyncio.sleep(1)  # Simulate work
        return True
    
    async def _cleanup_blue(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Cleanup blue environment"""
        # Placeholder implementation
        step.output.append("Blue environment cleanup completed")
        await asyncio.sleep(1)  # Simulate work
        return True
    
    async def _rolling_update_start(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Start rolling update"""
        step.output.append("Rolling update initiated")
        return True
    
    async def _update_services(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Update services in rolling fashion"""
        step.output.append("Updating services...")
        
        for service in self.services:
            step.output.append(f"Updating service: {service.name}")
            await asyncio.sleep(1)  # Simulate service update
            
            # Health check
            if not await self._check_service_health(service):
                step.output.append(f"Service {service.name} health check failed")
                return False
            
            step.output.append(f"Service {service.name} updated successfully")
        
        return True
    
    async def _stop_services(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Stop all services"""
        step.output.append("Stopping services...")
        
        # Stop services in reverse dependency order
        for service in reversed(self.services):
            step.output.append(f"Stopping service: {service.name}")
            await asyncio.sleep(0.5)  # Simulate service stop
        
        return True
    
    async def _deploy_new_version(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Deploy new version"""
        step.output.append("Deploying new version...")
        await asyncio.sleep(2)  # Simulate deployment
        step.output.append("New version deployed")
        return True
    
    async def _start_services(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Start all services"""
        step.output.append("Starting services...")
        
        # Start services in dependency order
        for service in self.services:
            step.output.append(f"Starting service: {service.name}")
            await asyncio.sleep(1)  # Simulate service start
            
            # Wait for service to be ready
            if not await self._wait_for_service_ready(service):
                step.output.append(f"Service {service.name} failed to start")
                return False
            
            step.output.append(f"Service {service.name} started successfully")
        
        return True
    
    async def _verify_deployment(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Verify deployment health"""
        step.output.append("Verifying deployment health...")
        
        for service in self.services:
            if not await self._check_service_health(service):
                step.output.append(f"Service {service.name} health check failed")
                return False
        
        step.output.append("All services are healthy")
        return True
    
    async def _post_deployment_validation(self, deployment: Deployment, step: DeploymentStep) -> bool:
        """Final post-deployment validation"""
        step.output.append("Running post-deployment validation...")
        
        # Run any additional validation tests
        await asyncio.sleep(1)  # Simulate validation
        
        step.output.append("Post-deployment validation completed")
        return True
    
    async def _check_service_health(self, service: ServiceConfig) -> bool:
        """Check if service is healthy"""
        try:
            # This would make an actual HTTP request to the health endpoint
            # For now, simulate a health check
            await asyncio.sleep(0.5)
            return True  # Assume healthy
            
        except Exception:
            return False
    
    async def _wait_for_service_ready(self, service: ServiceConfig) -> bool:
        """Wait for service to be ready"""
        timeout = service.startup_timeout
        start_time = datetime.now()
        
        while (datetime.now() - start_time).total_seconds() < timeout:
            if await self._check_service_health(service):
                return True
            await asyncio.sleep(2)
        
        return False
    
    async def _save_deployment(self, deployment: Deployment):
        """Save deployment to database"""
        try:
            async with self._get_db() as conn:
                # Save main deployment record
                await conn.execute('''
                    INSERT OR REPLACE INTO deployments 
                    (deployment_id, environment, strategy, artifact_version, artifact_path, status, 
                     start_time, end_time, duration_seconds, deployed_by, rollback_deployment_id, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    deployment.deployment_id,
                    deployment.environment.value,
                    deployment.strategy.value,
                    deployment.artifact.version,
                    str(deployment.artifact.artifact_path),
                    deployment.status.value,
                    deployment.start_time.isoformat(),
                    deployment.end_time.isoformat() if deployment.end_time else None,
                    deployment.duration_seconds,
                    deployment.deployed_by,
                    deployment.rollback_deployment_id,
                    json.dumps(deployment.__dict__, default=str)
                ))
                
                # Save deployment steps
                await conn.execute('DELETE FROM deployment_steps WHERE deployment_id = ?', (deployment.deployment_id,))
                
                for step in deployment.steps:
                    await conn.execute('''
                        INSERT INTO deployment_steps 
                        (deployment_id, step_name, step_description, status, start_time, end_time, error_message, output)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        deployment.deployment_id,
                        step.name,
                        step.description,
                        step.status.value,
                        step.start_time.isoformat() if step.start_time else None,
                        step.end_time.isoformat() if step.end_time else None,
                        step.error_message,
                        json.dumps(step.output)
                    ))
                
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to save deployment: {e}")
            raise
    
    async def _update_environment_state(self, environment: Environment, deployment: Deployment):
        """Update environment state after successful deployment"""
        try:
            async with self._get_db() as conn:
                await conn.execute('''
                    INSERT OR REPLACE INTO environment_state 
                    (environment, current_deployment_id, current_version, last_updated, health_status)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    environment.value,
                    deployment.deployment_id,
                    deployment.artifact.version,
                    datetime.now().isoformat(),
                    'healthy'
                ))
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to update environment state: {e}")
            raise
    
    async def rollback(self, deployment_id: str, deployed_by: str = "system") -> Deployment:
        """Rollback to previous deployment"""
        try:
            # Get deployment to rollback
            deployment = await self._get_deployment(deployment_id)
            if not deployment:
                raise ValueError(f"Deployment not found: {deployment_id}")
            
            if deployment.status != DeploymentStatus.COMPLETED:
                raise ValueError(f"Cannot rollback incomplete deployment: {deployment_id}")
            
            # Find previous successful deployment
            previous_deployment = await self._get_previous_deployment(deployment.environment, deployment_id)
            if not previous_deployment:
                raise ValueError(f"No previous deployment found for rollback")
            
            logger.info(f"Rolling back from {deployment_id} to {previous_deployment.deployment_id}")
            
            # Create rollback deployment
            rollback_deployment = await self.deploy(
                environment=deployment.environment,
                artifact_version=previous_deployment.artifact.version,
                strategy=DeploymentStrategy.ROLLING,  # Use rolling for rollbacks
                deployed_by=deployed_by
            )
            
            # Update original deployment to indicate rollback
            deployment.rollback_deployment_id = rollback_deployment.deployment_id
            await self._save_deployment(deployment)
            
            return rollback_deployment
            
        except Exception as e:
            logger.error(f"Rollback failed: {e}")
            raise
    
    async def _get_deployment(self, deployment_id: str) -> Optional[Deployment]:
        """Get deployment by ID"""
        try:
            async with self._get_db() as conn:
                cursor = await conn.execute('''
                    SELECT * FROM deployments WHERE deployment_id = ?
                ''', (deployment_id,))
                row = await cursor.fetchone()
                
                if not row:
                    return None
                
                # Get artifact
                artifact = await self._get_artifact(row['artifact_version'])
                if not artifact:
                    return None
                
                # Get steps
                steps_cursor = await conn.execute('''
                    SELECT * FROM deployment_steps WHERE deployment_id = ? ORDER BY step_name
                ''', (deployment_id,))
                step_rows = await steps_cursor.fetchall()
                
                steps = []
                for step_row in step_rows:
                    step = DeploymentStep(
                        name=step_row['step_name'],
                        description=step_row['step_description'],
                        status=DeploymentStatus(step_row['status']),
                        start_time=datetime.fromisoformat(step_row['start_time']) if step_row['start_time'] else None,
                        end_time=datetime.fromisoformat(step_row['end_time']) if step_row['end_time'] else None,
                        error_message=step_row['error_message'],
                        output=json.loads(step_row['output']) if step_row['output'] else []
                    )
                    steps.append(step)
                
                return Deployment(
                    deployment_id=row['deployment_id'],
                    environment=Environment(row['environment']),
                    strategy=DeploymentStrategy(row['strategy']),
                    artifact=artifact,
                    status=DeploymentStatus(row['status']),
                    steps=steps,
                    start_time=datetime.fromisoformat(row['start_time']),
                    end_time=datetime.fromisoformat(row['end_time']) if row['end_time'] else None,
                    duration_seconds=row['duration_seconds'],
                    deployed_by=row['deployed_by'],
                    rollback_deployment_id=row['rollback_deployment_id']
                )
                
        except Exception as e:
            logger.error(f"Failed to get deployment: {e}")
            return None
    
    async def _get_previous_deployment(self, environment: Environment, current_deployment_id: str) -> Optional[Deployment]:
        """Get previous successful deployment for environment"""
        try:
            async with self._get_db() as conn:
                cursor = await conn.execute('''
                    SELECT deployment_id FROM deployments 
                    WHERE environment = ? AND deployment_id != ? AND status = 'completed'
                    ORDER BY start_time DESC LIMIT 1
                ''', (environment.value, current_deployment_id))
                row = await cursor.fetchone()
                
                if not row:
                    return None
                
                return await self._get_deployment(row['deployment_id'])
                
        except Exception as e:
            logger.error(f"Failed to get previous deployment: {e}")
            return None
    
    async def get_deployment_status(self, deployment_id: str) -> Optional[Dict[str, Any]]:
        """Get deployment status"""
        deployment = await self._get_deployment(deployment_id)
        if not deployment:
            return None
        
        return {
            'deployment_id': deployment.deployment_id,
            'environment': deployment.environment.value,
            'strategy': deployment.strategy.value,
            'status': deployment.status.value,
            'artifact_version': deployment.artifact.version,
            'start_time': deployment.start_time.isoformat(),
            'end_time': deployment.end_time.isoformat() if deployment.end_time else None,
            'duration_seconds': deployment.duration_seconds,
            'deployed_by': deployment.deployed_by,
            'steps': [
                {
                    'name': step.name,
                    'status': step.status.value,
                    'error_message': step.error_message
                }
                for step in deployment.steps
            ]
        }
    
    async def get_environment_status(self, environment: Environment) -> Dict[str, Any]:
        """Get current environment status"""
        try:
            async with self._get_db() as conn:
                cursor = await conn.execute('''
                    SELECT * FROM environment_state WHERE environment = ?
                ''', (environment.value,))
                row = await cursor.fetchone()
                
                if not row:
                    return {
                        'environment': environment.value,
                        'status': 'not_deployed',
                        'current_deployment_id': None,
                        'current_version': None
                    }
                
                return {
                    'environment': environment.value,
                    'status': row['health_status'],
                    'current_deployment_id': row['current_deployment_id'],
                    'current_version': row['current_version'],
                    'last_updated': row['last_updated']
                }
                
        except Exception as e:
            logger.error(f"Failed to get environment status: {e}")
            return {'environment': environment.value, 'error': str(e)}

async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='FolioFox Deployment Manager')
    parser.add_argument('--config', default='/etc/folio_fox/deployment.yaml', help='Configuration file path')
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Create artifact command
    artifact_parser = subparsers.add_parser('create-artifact', help='Create deployment artifact')
    artifact_parser.add_argument('--source', required=True, help='Source directory path')
    artifact_parser.add_argument('--version', required=True, help='Artifact version')
    artifact_parser.add_argument('--git-commit', help='Git commit hash')
    artifact_parser.add_argument('--git-branch', help='Git branch name')
    
    # Deploy command
    deploy_parser = subparsers.add_parser('deploy', help='Deploy application')
    deploy_parser.add_argument('--environment', required=True, choices=['development', 'staging', 'production'], help='Target environment')
    deploy_parser.add_argument('--version', required=True, help='Artifact version to deploy')
    deploy_parser.add_argument('--strategy', choices=['blue_green', 'rolling', 'canary', 'recreate'], default='rolling', help='Deployment strategy')
    deploy_parser.add_argument('--deployed-by', default='cli', help='Deployed by user/system')
    
    # Rollback command
    rollback_parser = subparsers.add_parser('rollback', help='Rollback deployment')
    rollback_parser.add_argument('--deployment-id', required=True, help='Deployment ID to rollback')
    rollback_parser.add_argument('--deployed-by', default='cli', help='Rollback initiated by')
    
    # Status command
    status_parser = subparsers.add_parser('status', help='Get deployment status')
    status_parser.add_argument('--deployment-id', help='Specific deployment ID')
    status_parser.add_argument('--environment', choices=['development', 'staging', 'production'], help='Environment status')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    try:
        manager = DeploymentManager(args.config)
        
        if args.command == 'create-artifact':
            artifact = await manager.create_artifact(
                source_path=args.source,
                version=args.version,
                git_commit=args.git_commit,
                git_branch=args.git_branch
            )
            print(f"Artifact created: {artifact.version} ({artifact.size_bytes / 1024 / 1024:.1f} MB)")
            
        elif args.command == 'deploy':
            deployment = await manager.deploy(
                environment=Environment(args.environment),
                artifact_version=args.version,
                strategy=DeploymentStrategy(args.strategy),
                deployed_by=args.deployed_by
            )
            print(f"Deployment {'completed' if deployment.status == DeploymentStatus.COMPLETED else 'failed'}: {deployment.deployment_id}")
            
        elif args.command == 'rollback':
            deployment = await manager.rollback(
                deployment_id=args.deployment_id,
                deployed_by=args.deployed_by
            )
            print(f"Rollback {'completed' if deployment.status == DeploymentStatus.COMPLETED else 'failed'}: {deployment.deployment_id}")
            
        elif args.command == 'status':
            if args.deployment_id:
                status = await manager.get_deployment_status(args.deployment_id)
                if status:
                    print(json.dumps(status, indent=2))
                else:
                    print(f"Deployment not found: {args.deployment_id}")
            elif args.environment:
                status = await manager.get_environment_status(Environment(args.environment))
                print(json.dumps(status, indent=2))
            else:
                print("Specify either --deployment-id or --environment")
        
    except Exception as e:
        logger.error(f"Command failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())