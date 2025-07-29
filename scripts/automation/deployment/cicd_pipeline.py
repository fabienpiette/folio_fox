#!/usr/bin/env python3
"""
FolioFox CI/CD Pipeline Automation

Comprehensive CI/CD pipeline system that automates the entire software delivery process
from code commit to production deployment. Supports multiple environments, automated
testing, security scanning, and deployment strategies.

Usage:
    python cicd_pipeline.py --config config.yaml run --trigger git-push --branch main
    python cicd_pipeline.py status --pipeline-id pipe_20240115_143022
    python cicd_pipeline.py cancel --pipeline-id pipe_20240115_143022
"""

import asyncio
import logging
import sys
import os
import subprocess
import shlex
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
import tempfile
import uuid

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/folio_fox/cicd_pipeline.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class PipelineStatus(Enum):
    """Pipeline execution status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"

class StageType(Enum):
    """Pipeline stage types"""
    SOURCE = "source"
    BUILD = "build"
    TEST = "test"
    SECURITY = "security"
    PACKAGE = "package"
    DEPLOY = "deploy"
    VALIDATE = "validate"
    PROMOTE = "promote"

class TriggerType(Enum):
    """Pipeline trigger types"""
    MANUAL = "manual"
    GIT_PUSH = "git_push"
    GIT_TAG = "git_tag"
    PULL_REQUEST = "pull_request"
    SCHEDULED = "scheduled"
    API = "api"

class Environment(Enum):
    """Target environments"""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"

@dataclass
class PipelineStage:
    """Individual pipeline stage"""
    name: str
    stage_type: StageType
    commands: List[str]
    environment_vars: Dict[str, str] = field(default_factory=dict)
    working_directory: Optional[str] = None
    timeout_minutes: int = 30
    retry_count: int = 0
    depends_on: List[str] = field(default_factory=list)
    parallel: bool = False
    status: PipelineStatus = PipelineStatus.PENDING
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    output: List[str] = field(default_factory=list)
    error_message: Optional[str] = None
    artifacts: List[str] = field(default_factory=list)

@dataclass
class PipelineConfig:
    """Pipeline configuration"""
    name: str
    triggers: List[TriggerType]
    stages: List[PipelineStage]
    environments: List[Environment] = field(default_factory=list)
    branches: List[str] = field(default_factory=lambda: ["main", "develop"])
    notifications: Dict[str, Any] = field(default_factory=dict)
    concurrent_builds: int = 1

@dataclass
class PipelineRun:
    """Pipeline execution run"""
    pipeline_id: str
    config: PipelineConfig
    trigger: TriggerType
    branch: str
    commit_hash: str
    status: PipelineStatus
    stages: List[PipelineStage]
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    triggered_by: str = "system"
    build_number: int = 1
    artifacts: Dict[str, str] = field(default_factory=dict)

class CICDPipeline:
    """Main CI/CD pipeline orchestrator"""
    
    def __init__(self, config_path: str):
        self.config = self._load_config(config_path)
        self.db_path = self.config['pipeline']['database']
        self.workspace_path = Path(self.config['pipeline']['workspace'])
        self.artifact_store = Path(self.config['pipeline']['artifact_store'])
        self.pipeline_configs = self._load_pipeline_configs()
        
        # Ensure directories exist
        self.workspace_path.mkdir(parents=True, exist_ok=True)
        self.artifact_store.mkdir(parents=True, exist_ok=True)
        
        # Initialize pipeline database
        asyncio.create_task(self._init_pipeline_database())
    
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
            'pipeline': {
                'database': '/var/lib/folio_fox/pipeline.db',
                'workspace': '/var/lib/folio_fox/workspace',
                'artifact_store': '/var/lib/folio_fox/artifacts',
                'max_concurrent_pipelines': 3,
                'retention_days': 30
            },
            'git': {
                'repository_url': 'https://github.com/user/folio_fox.git',
                'default_branch': 'main',
                'clone_depth': 1
            },
            'build': {
                'go_version': '1.21',
                'node_version': '18',
                'timeout_minutes': 30
            },
            'test': {
                'timeout_minutes': 15,
                'coverage_threshold': 80.0
            },
            'security': {
                'enable_sast': True,
                'enable_dependency_scan': True,
                'fail_on_high': True
            },
            'deployment': {
                'config_path': '/etc/folio_fox/deployment.yaml'
            },
            'notifications': {
                'webhook_url': None,
                'email_recipients': []
            }
        }
    
    def _load_pipeline_configs(self) -> Dict[str, PipelineConfig]:
        """Load pipeline configurations"""
        configs = {}
        
        # Main application pipeline
        main_pipeline = PipelineConfig(
            name="folio_fox_main",
            triggers=[TriggerType.GIT_PUSH, TriggerType.PULL_REQUEST],
            stages=self._create_main_pipeline_stages(),
            environments=[Environment.DEVELOPMENT, Environment.STAGING, Environment.PRODUCTION],
            branches=["main", "develop", "release/*"],
            concurrent_builds=1
        )
        configs["main"] = main_pipeline
        
        return configs
    
    def _create_main_pipeline_stages(self) -> List[PipelineStage]:
        """Create stages for main application pipeline"""
        stages = []
        
        # Source stage
        stages.append(PipelineStage(
            name="checkout",
            stage_type=StageType.SOURCE,
            commands=["git clone --depth 1 $GIT_REPOSITORY_URL .", "git checkout $GIT_COMMIT_HASH"],
            timeout_minutes=5
        ))
        
        # Build backend
        stages.append(PipelineStage(
            name="build_backend",
            stage_type=StageType.BUILD,
            commands=[
                "cd backend",
                "go mod download",
                "go build -o ../build/folio_fox_backend ./cmd/server"
            ],
            depends_on=["checkout"],
            timeout_minutes=10
        ))
        
        # Build frontend
        stages.append(PipelineStage(
            name="build_frontend",
            stage_type=StageType.BUILD,
            commands=[
                "cd frontend",
                "npm ci",
                "npm run build",
                "cp -r dist ../build/frontend"
            ],
            depends_on=["checkout"],
            timeout_minutes=15,
            parallel=True
        ))
        
        # Unit tests backend
        stages.append(PipelineStage(
            name="test_backend",
            stage_type=StageType.TEST,
            commands=[
                "cd backend",
                "go test -v -race -coverprofile=coverage.out ./...",
                "go tool cover -html=coverage.out -o ../build/backend_coverage.html"
            ],
            depends_on=["build_backend"],
            timeout_minutes=10
        ))
        
        # Unit tests frontend
        stages.append(PipelineStage(
            name="test_frontend",
            stage_type=StageType.TEST,
            commands=[
                "cd frontend",
                "npm run test:unit -- --coverage",
                "cp -r coverage ../build/frontend_coverage"
            ],
            depends_on=["build_frontend"],
            timeout_minutes=10,
            parallel=True
        ))
        
        # Integration tests
        stages.append(PipelineStage(
            name="test_integration",
            stage_type=StageType.TEST,
            commands=[
                "docker-compose -f docker-compose.test.yml up -d",
                "sleep 30",  # Wait for services to be ready
                "cd tests",
                "go test -v ./integration/...",
                "docker-compose -f docker-compose.test.yml down"
            ],
            depends_on=["test_backend", "test_frontend"],
            timeout_minutes=20
        ))
        
        # Security scanning
        stages.append(PipelineStage(
            name="security_scan",
            stage_type=StageType.SECURITY,
            commands=[
                "# Go security scan",
                "cd backend && govulncheck ./...",
                "# Dependency scan",
                "cd frontend && npm audit --audit-level high",
                "# SAST scan (placeholder)",
                "echo 'SAST scan completed'"
            ],
            depends_on=["test_integration"],
            timeout_minutes=10
        ))
        
        # Package application
        stages.append(PipelineStage(
            name="package",
            stage_type=StageType.PACKAGE,
            commands=[
                "mkdir -p package/folio_fox",
                "cp -r build/* package/folio_fox/",
                "cp scripts/deployment/* package/folio_fox/",
                "cd package && tar -czf folio_fox_$BUILD_VERSION.tar.gz folio_fox/",
                "mv package/folio_fox_$BUILD_VERSION.tar.gz $ARTIFACT_STORE/"
            ],
            depends_on=["security_scan"],
            timeout_minutes=5
        ))
        
        # Deploy to development
        stages.append(PipelineStage(
            name="deploy_development",
            stage_type=StageType.DEPLOY,
            commands=[
                "python3 scripts/automation/deployment/deployment_manager.py create-artifact --source package/folio_fox --version $BUILD_VERSION",
                "python3 scripts/automation/deployment/deployment_manager.py deploy --environment development --version $BUILD_VERSION --strategy rolling"
            ],
            depends_on=["package"],
            timeout_minutes=10
        ))
        
        # Validate development deployment
        stages.append(PipelineStage(
            name="validate_development",
            stage_type=StageType.VALIDATE,
            commands=[
                "sleep 30",  # Wait for deployment to stabilize
                "curl -f http://dev.folio-fox.local:8080/health || exit 1",
                "curl -f http://dev.folio-fox.local:3000/ || exit 1",
                "echo 'Development validation passed'"
            ],
            depends_on=["deploy_development"],
            timeout_minutes=5
        ))
        
        return stages
    
    async def _init_pipeline_database(self):
        """Initialize pipeline tracking database"""
        try:
            async with self._get_db() as conn:
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS pipeline_runs (
                        pipeline_id TEXT PRIMARY KEY,
                        config_name TEXT NOT NULL,
                        trigger_type TEXT NOT NULL,
                        branch TEXT NOT NULL,
                        commit_hash TEXT NOT NULL,
                        status TEXT NOT NULL,
                        start_time TIMESTAMP NOT NULL,
                        end_time TIMESTAMP,
                        duration_seconds INTEGER,
                        triggered_by TEXT,
                        build_number INTEGER,
                        artifacts TEXT,
                        metadata TEXT
                    )
                ''')
                
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS pipeline_stages (
                        pipeline_id TEXT,
                        stage_name TEXT,
                        stage_type TEXT,
                        status TEXT,
                        start_time TIMESTAMP,
                        end_time TIMESTAMP,
                        duration_seconds INTEGER,
                        error_message TEXT,
                        output TEXT,
                        artifacts TEXT,
                        FOREIGN KEY (pipeline_id) REFERENCES pipeline_runs (pipeline_id)
                    )
                ''')
                
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS build_numbers (
                        config_name TEXT PRIMARY KEY,
                        last_build_number INTEGER DEFAULT 0
                    )
                ''')
                
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to initialize pipeline database: {e}")
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
    
    async def trigger_pipeline(self, config_name: str, trigger: TriggerType, branch: str = "main", commit_hash: Optional[str] = None, triggered_by: str = "system") -> PipelineRun:
        """Trigger pipeline execution"""
        try:
            # Get pipeline config
            if config_name not in self.pipeline_configs:
                raise ValueError(f"Pipeline config not found: {config_name}")
            
            config = self.pipeline_configs[config_name]
            
            # Check if trigger is allowed
            if trigger not in config.triggers:
                raise ValueError(f"Trigger {trigger.value} not allowed for pipeline {config_name}")
            
            # Get/resolve commit hash
            if not commit_hash:
                commit_hash = await self._get_latest_commit_hash(branch)
            
            # Generate pipeline ID and get build number
            pipeline_id = f"pipe_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
            build_number = await self._get_next_build_number(config_name)
            
            # Create pipeline run
            pipeline_run = PipelineRun(
                pipeline_id=pipeline_id,
                config=config,
                trigger=trigger,
                branch=branch,
                commit_hash=commit_hash,
                status=PipelineStatus.RUNNING,
                stages=[stage for stage in config.stages],  # Copy stages
                start_time=datetime.now(),
                triggered_by=triggered_by,
                build_number=build_number
            )
            
            logger.info(f"Starting pipeline: {pipeline_id} (build #{build_number})")
            
            # Save pipeline run
            await self._save_pipeline_run(pipeline_run)
            
            # Execute pipeline
            success = await self._execute_pipeline(pipeline_run)
            
            # Update final status
            pipeline_run.end_time = datetime.now()
            pipeline_run.duration_seconds = int((pipeline_run.end_time - pipeline_run.start_time).total_seconds())
            pipeline_run.status = PipelineStatus.COMPLETED if success else PipelineStatus.FAILED
            
            # Save final state
            await self._save_pipeline_run(pipeline_run)
            
            logger.info(f"Pipeline {'completed' if success else 'failed'}: {pipeline_id}")
            
            # Send notifications
            await self._send_notifications(pipeline_run)
            
            return pipeline_run
            
        except Exception as e:
            logger.error(f"Pipeline trigger failed: {e}")
            raise
    
    async def _get_latest_commit_hash(self, branch: str) -> str:
        """Get latest commit hash for branch"""
        try:
            # This is a simplified implementation
            # In a real scenario, you'd query the Git repository
            result = await self._run_command(f"git ls-remote {self.config['git']['repository_url']} {branch}")
            if result['returncode'] == 0 and result['stdout']:
                return result['stdout'].split('\t')[0].strip()
            
            # Fallback to a placeholder
            return f"commit_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
        except Exception as e:
            logger.warning(f"Could not get commit hash: {e}")
            return f"commit_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    async def _get_next_build_number(self, config_name: str) -> int:
        """Get next build number for config"""
        try:
            async with self._get_db() as conn:
                cursor = await conn.execute('''
                    SELECT last_build_number FROM build_numbers WHERE config_name = ?
                ''', (config_name,))
                row = await cursor.fetchone()
                
                if row:
                    next_build = row['last_build_number'] + 1
                else:
                    next_build = 1
                
                await conn.execute('''
                    INSERT OR REPLACE INTO build_numbers (config_name, last_build_number)
                    VALUES (?, ?)
                ''', (config_name, next_build))
                await conn.commit()
                
                return next_build
                
        except Exception as e:
            logger.error(f"Failed to get build number: {e}")
            return 1
    
    async def _execute_pipeline(self, pipeline_run: PipelineRun) -> bool:
        """Execute pipeline stages"""
        try:
            # Create workspace for this pipeline
            workspace = self.workspace_path / pipeline_run.pipeline_id
            workspace.mkdir(exist_ok=True)
            
            # Set up environment variables
            env_vars = {
                'PIPELINE_ID': pipeline_run.pipeline_id,
                'BUILD_NUMBER': str(pipeline_run.build_number),
                'BUILD_VERSION': f"{pipeline_run.build_number}.{pipeline_run.commit_hash[:8]}",
                'GIT_BRANCH': pipeline_run.branch,
                'GIT_COMMIT_HASH': pipeline_run.commit_hash,
                'GIT_REPOSITORY_URL': self.config['git']['repository_url'],
                'WORKSPACE': str(workspace),
                'ARTIFACT_STORE': str(self.artifact_store),
                **os.environ
            }
            
            # Execute stages
            return await self._execute_stages(pipeline_run, workspace, env_vars)
            
        except Exception as e:
            logger.error(f"Pipeline execution failed: {e}")
            return False
        finally:
            # Cleanup workspace (optional)
            # shutil.rmtree(workspace, ignore_errors=True)
            pass
    
    async def _execute_stages(self, pipeline_run: PipelineRun, workspace: Path, env_vars: Dict[str, str]) -> bool:
        """Execute pipeline stages with dependency resolution"""
        try:
            # Create dependency graph
            stages_by_name = {stage.name: stage for stage in pipeline_run.stages}
            completed_stages = set()
            failed_stages = set()
            
            while len(completed_stages) + len(failed_stages) < len(pipeline_run.stages):
                # Find stages ready to execute
                ready_stages = []
                for stage in pipeline_run.stages:
                    if (stage.name not in completed_stages and 
                        stage.name not in failed_stages and
                        stage.status == PipelineStatus.PENDING and
                        all(dep in completed_stages for dep in stage.depends_on)):
                        ready_stages.append(stage)
                
                if not ready_stages:
                    # Check if we have any stages that can't be executed due to failed dependencies
                    blocked_stages = [stage for stage in pipeline_run.stages 
                                    if (stage.name not in completed_stages and 
                                        stage.name not in failed_stages and
                                        any(dep in failed_stages for dep in stage.depends_on))]
                    
                    for stage in blocked_stages:
                        stage.status = PipelineStatus.SKIPPED
                        stage.error_message = "Skipped due to failed dependencies"
                        failed_stages.add(stage.name)
                    
                    # If no ready stages and we have remaining stages, something is wrong
                    remaining_stages = [stage for stage in pipeline_run.stages 
                                      if stage.name not in completed_stages and stage.name not in failed_stages]
                    if remaining_stages:
                        logger.error("Pipeline deadlock detected")
                        return False
                    break
                
                # Execute ready stages (parallel if marked)
                parallel_stages = [stage for stage in ready_stages if stage.parallel]
                sequential_stages = [stage for stage in ready_stages if not stage.parallel]
                
                # Execute parallel stages
                if parallel_stages:
                    tasks = []
                    for stage in parallel_stages:
                        task = asyncio.create_task(self._execute_stage(stage, workspace, env_vars))
                        tasks.append((stage, task))
                    
                    # Wait for parallel stages to complete
                    for stage, task in tasks:
                        success = await task
                        if success:
                            completed_stages.add(stage.name)
                        else:
                            failed_stages.add(stage.name)
                            # If this is a critical failure, stop pipeline
                            if not self._is_stage_optional(stage):
                                return False
                
                # Execute sequential stages
                for stage in sequential_stages:
                    success = await self._execute_stage(stage, workspace, env_vars)
                    if success:
                        completed_stages.add(stage.name)
                    else:
                        failed_stages.add(stage.name)
                        # If this is a critical failure, stop pipeline
                        if not self._is_stage_optional(stage):
                            return False
                
                # Save progress
                await self._save_pipeline_run(pipeline_run)
            
            # Pipeline succeeded if all critical stages completed
            return len(failed_stages) == 0 or all(self._is_stage_optional(stages_by_name[name]) for name in failed_stages)
            
        except Exception as e:
            logger.error(f"Stage execution failed: {e}")
            return False
    
    def _is_stage_optional(self, stage: PipelineStage) -> bool:
        """Check if stage is optional (failure doesn't stop pipeline)"""
        # For now, all stages are critical
        # Could be extended with stage configuration
        return False
    
    async def _execute_stage(self, stage: PipelineStage, workspace: Path, env_vars: Dict[str, str]) -> bool:
        """Execute individual pipeline stage"""
        stage.status = PipelineStatus.RUNNING
        stage.start_time = datetime.now()
        
        logger.info(f"Executing stage: {stage.name}")
        
        try:
            # Set working directory
            work_dir = workspace
            if stage.working_directory:
                work_dir = workspace / stage.working_directory
                work_dir.mkdir(parents=True, exist_ok=True)
            
            # Merge environment variables
            stage_env = {**env_vars, **stage.environment_vars}
            
            # Execute commands
            for command in stage.commands:
                if command.strip().startswith('#'):
                    # Skip comments
                    stage.output.append(command)
                    continue
                
                logger.debug(f"Running command: {command}")
                
                result = await self._run_command(
                    command, 
                    cwd=work_dir, 
                    env=stage_env, 
                    timeout=stage.timeout_minutes * 60
                )
                
                stage.output.extend(result['stdout'].splitlines() if result['stdout'] else [])
                if result['stderr']:
                    stage.output.extend([f"STDERR: {line}" for line in result['stderr'].splitlines()])
                
                if result['returncode'] != 0:
                    stage.error_message = f"Command failed with exit code {result['returncode']}: {command}"
                    stage.status = PipelineStatus.FAILED
                    return False
            
            stage.status = PipelineStatus.COMPLETED
            logger.info(f"Stage completed successfully: {stage.name}")
            return True
            
        except asyncio.TimeoutError:
            stage.error_message = f"Stage timed out after {stage.timeout_minutes} minutes"
            stage.status = PipelineStatus.FAILED
            logger.error(f"Stage timed out: {stage.name}")
            return False
            
        except Exception as e:
            stage.error_message = str(e)
            stage.status = PipelineStatus.FAILED
            logger.error(f"Stage failed: {stage.name} - {e}")
            return False
            
        finally:
            stage.end_time = datetime.now()
            if stage.start_time:
                stage.duration_seconds = int((stage.end_time - stage.start_time).total_seconds())
    
    async def _run_command(self, command: str, cwd: Path = None, env: Dict[str, str] = None, timeout: int = 300) -> Dict[str, Any]:
        """Run shell command asynchronously"""
        try:
            # Split command safely
            if isinstance(command, str):
                cmd_parts = shlex.split(command)
            else:
                cmd_parts = command
            
            # Create subprocess
            process = await asyncio.create_subprocess_exec(
                *cmd_parts,
                cwd=cwd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Wait for completion with timeout
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
            
            return {
                'returncode': process.returncode,
                'stdout': stdout.decode('utf-8') if stdout else '',
                'stderr': stderr.decode('utf-8') if stderr else ''
            }
            
        except asyncio.TimeoutError:
            # Kill the process
            try:
                process.kill()
                await process.wait()
            except:
                pass
            raise
            
        except Exception as e:
            return {
                'returncode': -1,
                'stdout': '',
                'stderr': str(e)
            }
    
    async def _save_pipeline_run(self, pipeline_run: PipelineRun):
        """Save pipeline run to database"""
        try:
            async with self._get_db() as conn:
                # Save main pipeline record
                await conn.execute('''
                    INSERT OR REPLACE INTO pipeline_runs 
                    (pipeline_id, config_name, trigger_type, branch, commit_hash, status, 
                     start_time, end_time, duration_seconds, triggered_by, build_number, artifacts, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    pipeline_run.pipeline_id,
                    pipeline_run.config.name,
                    pipeline_run.trigger.value,
                    pipeline_run.branch,
                    pipeline_run.commit_hash,
                    pipeline_run.status.value,
                    pipeline_run.start_time.isoformat(),
                    pipeline_run.end_time.isoformat() if pipeline_run.end_time else None,
                    pipeline_run.duration_seconds,
                    pipeline_run.triggered_by,
                    pipeline_run.build_number,
                    json.dumps(pipeline_run.artifacts),
                    json.dumps(pipeline_run.__dict__, default=str)
                ))
                
                # Save pipeline stages
                await conn.execute('DELETE FROM pipeline_stages WHERE pipeline_id = ?', (pipeline_run.pipeline_id,))
                
                for stage in pipeline_run.stages:
                    await conn.execute('''
                        INSERT INTO pipeline_stages 
                        (pipeline_id, stage_name, stage_type, status, start_time, end_time, 
                         duration_seconds, error_message, output, artifacts)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        pipeline_run.pipeline_id,
                        stage.name,
                        stage.stage_type.value,
                        stage.status.value,
                        stage.start_time.isoformat() if stage.start_time else None,
                        stage.end_time.isoformat() if stage.end_time else None,
                        stage.duration_seconds,
                        stage.error_message,
                        json.dumps(stage.output),
                        json.dumps(stage.artifacts)
                    ))
                
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to save pipeline run: {e}")
            raise
    
    async def _send_notifications(self, pipeline_run: PipelineRun):
        """Send pipeline completion notifications"""
        try:
            webhook_url = self.config.get('notifications', {}).get('webhook_url')
            if webhook_url:
                # Send webhook notification
                import aiohttp
                
                payload = {
                    'pipeline_id': pipeline_run.pipeline_id,
                    'status': pipeline_run.status.value,
                    'build_number': pipeline_run.build_number,
                    'branch': pipeline_run.branch,
                    'duration_seconds': pipeline_run.duration_seconds,
                    'triggered_by': pipeline_run.triggered_by
                }
                
                async with aiohttp.ClientSession() as session:
                    async with session.post(webhook_url, json=payload) as response:
                        if response.status == 200:
                            logger.info("Webhook notification sent successfully")
                        else:
                            logger.warning(f"Webhook notification failed: {response.status}")
            
        except Exception as e:
            logger.warning(f"Failed to send notifications: {e}")
    
    async def get_pipeline_status(self, pipeline_id: str) -> Optional[Dict[str, Any]]:
        """Get pipeline status"""
        try:
            async with self._get_db() as conn:
                cursor = await conn.execute('''
                    SELECT * FROM pipeline_runs WHERE pipeline_id = ?
                ''', (pipeline_id,))
                run_row = await cursor.fetchone()
                
                if not run_row:
                    return None
                
                # Get stages
                stages_cursor = await conn.execute('''
                    SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY stage_name
                ''', (pipeline_id,))
                stage_rows = await stages_cursor.fetchall()
                
                stages = []
                for stage_row in stage_rows:
                    stages.append({
                        'name': stage_row['stage_name'],
                        'type': stage_row['stage_type'],
                        'status': stage_row['status'],
                        'start_time': stage_row['start_time'],
                        'end_time': stage_row['end_time'],
                        'duration_seconds': stage_row['duration_seconds'],
                        'error_message': stage_row['error_message']
                    })
                
                return {
                    'pipeline_id': run_row['pipeline_id'],
                    'config_name': run_row['config_name'],
                    'trigger': run_row['trigger_type'],
                    'branch': run_row['branch'],
                    'commit_hash': run_row['commit_hash'],
                    'status': run_row['status'],
                    'build_number': run_row['build_number'],
                    'start_time': run_row['start_time'],
                    'end_time': run_row['end_time'],
                    'duration_seconds': run_row['duration_seconds'],
                    'triggered_by': run_row['triggered_by'],
                    'stages': stages
                }
                
        except Exception as e:
            logger.error(f"Failed to get pipeline status: {e}")
            return None
    
    async def cancel_pipeline(self, pipeline_id: str) -> bool:
        """Cancel running pipeline"""
        try:
            async with self._get_db() as conn:
                # Update pipeline status
                await conn.execute('''
                    UPDATE pipeline_runs SET status = ?, end_time = ?
                    WHERE pipeline_id = ? AND status = 'running'
                ''', (PipelineStatus.CANCELLED.value, datetime.now().isoformat(), pipeline_id))
                
                # Update running stages
                await conn.execute('''
                    UPDATE pipeline_stages SET status = ?, end_time = ?
                    WHERE pipeline_id = ? AND status = 'running'
                ''', (PipelineStatus.CANCELLED.value, datetime.now().isoformat(), pipeline_id))
                
                await conn.commit()
                
                logger.info(f"Pipeline cancelled: {pipeline_id}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to cancel pipeline: {e}")
            return False
    
    async def get_recent_pipelines(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent pipeline runs"""
        try:
            async with self._get_db() as conn:
                cursor = await conn.execute('''
                    SELECT pipeline_id, config_name, trigger_type, branch, status, 
                           build_number, start_time, end_time, duration_seconds, triggered_by
                    FROM pipeline_runs 
                    ORDER BY start_time DESC 
                    LIMIT ?
                ''', (limit,))
                
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Failed to get recent pipelines: {e}")
            return []

async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='FolioFox CI/CD Pipeline')
    parser.add_argument('--config', default='/etc/folio_fox/cicd.yaml', help='Configuration file path')
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Run pipeline command
    run_parser = subparsers.add_parser('run', help='Trigger pipeline run')
    run_parser.add_argument('--config-name', default='main', help='Pipeline configuration name')
    run_parser.add_argument('--trigger', required=True, choices=['manual', 'git_push', 'git_tag', 'pull_request', 'scheduled', 'api'], help='Trigger type')
    run_parser.add_argument('--branch', default='main', help='Git branch')
    run_parser.add_argument('--commit', help='Git commit hash')
    run_parser.add_argument('--triggered-by', default='cli', help='User/system triggering pipeline')
    
    # Status command
    status_parser = subparsers.add_parser('status', help='Get pipeline status')
    status_parser.add_argument('--pipeline-id', help='Specific pipeline ID')
    status_parser.add_argument('--recent', type=int, default=10, help='Number of recent pipelines')
    
    # Cancel command
    cancel_parser = subparsers.add_parser('cancel', help='Cancel running pipeline')
    cancel_parser.add_argument('--pipeline-id', required=True, help='Pipeline ID to cancel')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    try:
        pipeline = CICDPipeline(args.config)
        
        if args.command == 'run':
            pipeline_run = await pipeline.trigger_pipeline(
                config_name=args.config_name,
                trigger=TriggerType(args.trigger),
                branch=args.branch,
                commit_hash=args.commit,
                triggered_by=args.triggered_by
            )
            print(f"Pipeline started: {pipeline_run.pipeline_id} (build #{pipeline_run.build_number})")
            
        elif args.command == 'status':
            if args.pipeline_id:
                status = await pipeline.get_pipeline_status(args.pipeline_id)
                if status:
                    print(json.dumps(status, indent=2))
                else:
                    print(f"Pipeline not found: {args.pipeline_id}")
            else:
                recent = await pipeline.get_recent_pipelines(args.recent)
                print(json.dumps(recent, indent=2))
                
        elif args.command == 'cancel':
            success = await pipeline.cancel_pipeline(args.pipeline_id)
            if success:
                print(f"Pipeline cancelled: {args.pipeline_id}")
            else:
                print(f"Failed to cancel pipeline: {args.pipeline_id}")
        
    except Exception as e:
        logger.error(f"Command failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())