#!/usr/bin/env python3
"""
FolioFox Deployment Monitoring Dashboard

Real-time monitoring dashboard for deployment automation system. Provides web-based
interface for monitoring deployments, CI/CD pipelines, system health, and operational
metrics. Includes alerting, notifications, and administrative controls.

Usage:
    python monitoring_dashboard.py --config config.yaml --port 8090
    python monitoring_dashboard.py --export-metrics --format prometheus
"""

import asyncio
import logging
import sys
import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field, asdict
from enum import Enum
import yaml
import sqlite3
from contextlib import asynccontextmanager
import aiohttp
from aiohttp import web, web_runner, web_ws
import aiofiles
import jinja2
import weakref

# Import our modules
sys.path.append(str(Path(__file__).parent))
from deployment_manager import DeploymentManager, Environment, DeploymentStatus
from cicd_pipeline import CICDPipeline, PipelineStatus
from orchestrator import DeploymentOrchestrator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/folio_fox/monitoring_dashboard.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class MetricType(Enum):
    """Metric types for monitoring"""
    COUNTER = "counter"
    GAUGE = "gauge"  
    HISTOGRAM = "histogram"
    SUMMARY = "summary"

@dataclass
class Metric:
    """Individual metric data point"""
    name: str
    metric_type: MetricType
    value: Union[int, float]
    labels: Dict[str, str] = field(default_factory=dict)
    help_text: str = ""
    timestamp: datetime = field(default_factory=datetime.now)

@dataclass
class DashboardData:
    """Dashboard display data"""
    timestamp: datetime
    system_health: str
    environments: Dict[str, Dict[str, Any]]
    active_deployments: List[Dict[str, Any]]
    recent_pipelines: List[Dict[str, Any]]
    active_promotions: List[Dict[str, Any]]
    system_metrics: Dict[str, Any]
    alerts: List[Dict[str, Any]]

class MonitoringDashboard:
    """Main monitoring dashboard application"""
    
    def __init__(self, config_path: str):
        self.config = self._load_config(config_path)
        self.app = web.Application()
        self.websocket_connections = weakref.WeakSet()
        
        # Initialize component managers
        self.deployment_manager = DeploymentManager(self.config['deployment']['config_path'])
        self.cicd_pipeline = CICDPipeline(self.config['cicd']['config_path'])
        self.orchestrator = DeploymentOrchestrator(self.config['orchestrator']['config_path'])
        
        # Metrics storage
        self.metrics: Dict[str, Metric] = {}
        self.metric_history: Dict[str, List[Metric]] = {}
        
        # Dashboard state
        self.dashboard_data: Optional[DashboardData] = None
        self.last_update: Optional[datetime] = None
        
        # Setup routes
        self._setup_routes()
        
        # Start background tasks
        self.background_tasks = []
        
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
            'dashboard': {
                'port': 8090,
                'host': '0.0.0.0',
                'update_interval_seconds': 30,
                'metric_retention_hours': 24,
                'enable_websockets': True
            },
            'deployment': {
                'config_path': '/etc/folio_fox/deployment.yaml'
            },
            'cicd': {
                'config_path': '/etc/folio_fox/cicd.yaml'
            },
            'orchestrator': {
                'config_path': '/etc/folio_fox/orchestrator.yaml'
            },
            'alerts': {
                'enable_email': False,
                'enable_slack': False,
                'enable_webhook': False,
                'email_smtp_server': None,
                'slack_webhook_url': None,
                'alert_webhook_url': None
            },
            'monitoring': {
                'health_check_interval_seconds': 60,
                'performance_metrics_enabled': True,
                'detailed_logging': False
            }
        }
    
    def _setup_routes(self):
        """Setup HTTP routes"""
        # Static files
        self.app.router.add_static('/', path='static/', name='static')
        
        # API routes
        self.app.router.add_get('/', self.dashboard_page)
        self.app.router.add_get('/api/dashboard', self.api_dashboard_data)
        self.app.router.add_get('/api/metrics', self.api_metrics)
        self.app.router.add_get('/api/metrics/prometheus', self.api_prometheus_metrics)
        self.app.router.add_get('/api/health', self.api_health_check)
        
        # Environment specific routes
        self.app.router.add_get('/api/environments/{environment}', self.api_environment_detail)
        self.app.router.add_get('/api/deployments/{deployment_id}', self.api_deployment_detail)
        self.app.router.add_get('/api/pipelines/{pipeline_id}', self.api_pipeline_detail)
        
        # Control routes (admin actions)
        self.app.router.add_post('/api/deployments/{deployment_id}/rollback', self.api_trigger_rollback)
        self.app.router.add_post('/api/pipelines/{pipeline_id}/cancel', self.api_cancel_pipeline)
        self.app.router.add_post('/api/promotions/{promotion_id}/approve', self.api_approve_promotion)
        
        # WebSocket route
        if self.config['dashboard']['enable_websockets']:
            self.app.router.add_get('/ws', self.websocket_handler)
    
    async def dashboard_page(self, request):
        """Serve main dashboard page"""
        html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FolioFox Deployment Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .header h1 { margin: 0; }
        .header .subtitle { opacity: 0.8; margin-top: 5px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card h2 { margin: 0 0 15px 0; color: #2c3e50; }
        .status-healthy { color: #27ae60; }
        .status-warning { color: #f39c12; }
        .status-critical { color: #e74c3c; }
        .env-card { border-left: 4px solid #3498db; }
        .deployment-card { border-left: 4px solid #9b59b6; }
        .pipeline-card { border-left: 4px solid #e67e22; }
        .metrics-card { border-left: 4px solid #1abc9c; }
        .status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
        .status-running { background-color: #3498db; }
        .status-completed { background-color: #27ae60; }
        .status-failed { background-color: #e74c3c; }
        .status-pending { background-color: #95a5a6; }
        .refresh-info { text-align: center; margin-top: 20px; color: #7f8c8d; }
        .action-buttons { margin-top: 10px; }
        .btn { padding: 5px 10px; margin-right: 5px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .btn-danger { background-color: #e74c3c; color: white; }
        .btn-warning { background-color: #f39c12; color: white; }
        .btn-success { background-color: #27ae60; color: white; }
        .loading { text-align: center; padding: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>FolioFox Deployment Dashboard</h1>
            <div class="subtitle">Real-time monitoring and control for deployment automation</div>
        </div>
        
        <div id="loading" class="loading">Loading dashboard data...</div>
        <div id="dashboard" style="display: none;">
            <div class="grid">
                <!-- System Overview Card -->
                <div class="card">
                    <h2>System Overview</h2>
                    <div id="system-overview">
                        <p>Overall Health: <span id="system-health" class="status-healthy">Loading...</span></p>
                        <p>Last Updated: <span id="last-updated">-</span></p>
                    </div>
                </div>
                
                <!-- Environments Card -->
                <div class="card env-card">
                    <h2>Environments</h2>
                    <div id="environments-list">Loading environments...</div>
                </div>
                
                <!-- Active Deployments Card -->
                <div class="card deployment-card">
                    <h2>Active Deployments</h2>
                    <div id="deployments-list">Loading deployments...</div>
                </div>
                
                <!-- Recent Pipelines Card -->
                <div class="card pipeline-card">
                    <h2>Recent Pipelines</h2>
                    <div id="pipelines-list">Loading pipelines...</div>
                </div>
                
                <!-- System Metrics Card -->
                <div class="card metrics-card">
                    <h2>System Metrics</h2>
                    <div id="metrics-list">Loading metrics...</div>
                </div>
                
                <!-- Alerts Card -->
                <div class="card">
                    <h2>Active Alerts</h2>
                    <div id="alerts-list">No active alerts</div>
                </div>
            </div>
        </div>
        
        <div class="refresh-info">
            Dashboard refreshes every 30 seconds. <button onclick="refreshDashboard()">Refresh Now</button>
        </div>
    </div>

    <script>
        let socket = null;
        
        // Initialize WebSocket connection
        function initWebSocket() {
            if (window.location.protocol === 'https:') {
                socket = new WebSocket('wss://' + window.location.host + '/ws');
            } else {
                socket = new WebSocket('ws://' + window.location.host + '/ws');
            }
            
            socket.onmessage = function(event) {
                const data = JSON.parse(event.data);
                updateDashboard(data);
            };
            
            socket.onclose = function() {
                console.log('WebSocket closed, reconnecting in 5 seconds...');
                setTimeout(initWebSocket, 5000);
            };
        }
        
        // Refresh dashboard data
        async function refreshDashboard() {
            try {
                const response = await fetch('/api/dashboard');
                const data = await response.json();
                updateDashboard(data);
            } catch (error) {
                console.error('Failed to refresh dashboard:', error);
            }
        }
        
        // Update dashboard with new data
        function updateDashboard(data) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            
            // System health
            const healthElement = document.getElementById('system-health');
            healthElement.textContent = data.system_health;
            healthElement.className = 'status-' + data.system_health;
            
            // Last updated
            document.getElementById('last-updated').textContent = new Date(data.timestamp).toLocaleString();
            
            // Environments
            const envList = document.getElementById('environments-list');
            envList.innerHTML = '';
            for (const [envName, envData] of Object.entries(data.environments)) {
                const envDiv = document.createElement('div');
                envDiv.innerHTML = `
                    <p><strong>${envName}</strong>: 
                    <span class="status-indicator status-${envData.health}"></span>
                    ${envData.health} (${envData.current_version || 'No deployment'})</p>
                `;
                envList.appendChild(envDiv);
            }
            
            // Active deployments
            const deploymentsList = document.getElementById('deployments-list');
            deploymentsList.innerHTML = '';
            if (data.active_deployments.length === 0) {
                deploymentsList.innerHTML = '<p>No active deployments</p>';
            } else {
                data.active_deployments.forEach(deployment => {
                    const deployDiv = document.createElement('div');
                    deployDiv.innerHTML = `
                        <p><strong>${deployment.deployment_id}</strong> (${deployment.environment}): 
                        <span class="status-indicator status-${deployment.status}"></span>
                        ${deployment.status}</p>
                        <div class="action-buttons">
                            ${deployment.status === 'completed' ? 
                                `<button class="btn btn-danger" onclick="triggerRollback('${deployment.deployment_id}')">Rollback</button>` : 
                                ''
                            }
                        </div>
                    `;
                    deploymentsList.appendChild(deployDiv);
                });
            }
            
            // Recent pipelines
            const pipelinesList = document.getElementById('pipelines-list');
            pipelinesList.innerHTML = '';
            if (data.recent_pipelines.length === 0) {
                pipelinesList.innerHTML = '<p>No recent pipelines</p>';
            } else {
                data.recent_pipelines.slice(0, 5).forEach(pipeline => {
                    const pipelineDiv = document.createElement('div');
                    pipelineDiv.innerHTML = `
                        <p><strong>Build #${pipeline.build_number}</strong> (${pipeline.branch}): 
                        <span class="status-indicator status-${pipeline.status}"></span>
                        ${pipeline.status}</p>
                    `;
                    pipelinesList.appendChild(pipelineDiv);
                });
            }
            
            // System metrics
            const metricsList = document.getElementById('metrics-list');
            metricsList.innerHTML = '';
            if (data.system_metrics) {
                for (const [metricName, metricValue] of Object.entries(data.system_metrics)) {
                    const metricDiv = document.createElement('div');
                    metricDiv.innerHTML = `<p><strong>${metricName}</strong>: ${metricValue}</p>`;
                    metricsList.appendChild(metricDiv);
                }
            }
            
            // Alerts
            const alertsList = document.getElementById('alerts-list');
            alertsList.innerHTML = '';
            if (data.alerts.length === 0) {
                alertsList.innerHTML = '<p>No active alerts</p>';
            } else {
                data.alerts.forEach(alert => {
                    const alertDiv = document.createElement('div');
                    alertDiv.innerHTML = `
                        <p class="status-${alert.severity}"><strong>${alert.title}</strong>: ${alert.message}</p>
                    `;
                    alertsList.appendChild(alertDiv);
                });
            }
        }
        
        // Action functions
        async function triggerRollback(deploymentId) {
            if (confirm('Are you sure you want to rollback deployment ' + deploymentId + '?')) {
                try {
                    const response = await fetch(`/api/deployments/${deploymentId}/rollback`, {
                        method: 'POST'
                    });
                    const result = await response.json();
                    alert(result.success ? 'Rollback initiated' : 'Rollback failed: ' + result.error);
                    refreshDashboard();
                } catch (error) {
                    alert('Failed to trigger rollback: ' + error.message);
                }
            }
        }
        
        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            refreshDashboard();
            initWebSocket();
            
            // Refresh every 30 seconds as fallback
            setInterval(refreshDashboard, 30000);
        });
    </script>
</body>
</html>
        """
        return web.Response(text=html_content, content_type='text/html')
    
    async def api_dashboard_data(self, request):
        """Get dashboard data API endpoint"""
        try:
            await self._update_dashboard_data()
            return web.json_response(asdict(self.dashboard_data))
        except Exception as e:
            logger.error(f"Failed to get dashboard data: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def api_metrics(self, request):
        """Get metrics API endpoint"""
        try:
            metrics_data = {}
            for name, metric in self.metrics.items():
                metrics_data[name] = {
                    'value': metric.value,
                    'type': metric.metric_type.value,
                    'labels': metric.labels,
                    'timestamp': metric.timestamp.isoformat()
                }
            return web.json_response(metrics_data)
        except Exception as e:
            logger.error(f"Failed to get metrics: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def api_prometheus_metrics(self, request):
        """Export metrics in Prometheus format"""
        try:
            prometheus_output = []
            
            for name, metric in self.metrics.items():
                # Add help text
                if metric.help_text:
                    prometheus_output.append(f"# HELP {name} {metric.help_text}")
                
                # Add type
                prometheus_output.append(f"# TYPE {name} {metric.metric_type.value}")
                
                # Add metric with labels
                if metric.labels:
                    labels_str = ','.join([f'{k}="{v}"' for k, v in metric.labels.items()])
                    prometheus_output.append(f"{name}{{{labels_str}}} {metric.value}")
                else:
                    prometheus_output.append(f"{name} {metric.value}")
            
            return web.Response(text='\n'.join(prometheus_output), content_type='text/plain')
            
        except Exception as e:
            logger.error(f"Failed to export Prometheus metrics: {e}")
            return web.Response(text=f"# Error: {e}", content_type='text/plain', status=500)
    
    async def api_health_check(self, request):
        """Health check endpoint"""
        try:
            health_status = {
                'status': 'healthy',
                'timestamp': datetime.now().isoformat(),
                'components': {
                    'deployment_manager': 'healthy',
                    'cicd_pipeline': 'healthy',
                    'orchestrator': 'healthy'
                }
            }
            
            # Basic component health checks
            try:
                await self.deployment_manager.get_environment_status(Environment.DEVELOPMENT)
                health_status['components']['deployment_manager'] = 'healthy'
            except Exception:
                health_status['components']['deployment_manager'] = 'unhealthy'
                health_status['status'] = 'degraded'
            
            return web.json_response(health_status)
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return web.json_response({
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }, status=500)
    
    async def api_environment_detail(self, request):
        """Get detailed environment information"""
        try:
            environment = Environment(request.match_info['environment'])
            status = await self.deployment_manager.get_environment_status(environment)
            return web.json_response(status)
        except Exception as e:
            logger.error(f"Failed to get environment detail: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def api_deployment_detail(self, request):
        """Get detailed deployment information"""
        try:
            deployment_id = request.match_info['deployment_id']
            status = await self.deployment_manager.get_deployment_status(deployment_id)
            if status:
                return web.json_response(status)
            else:
                return web.json_response({'error': 'Deployment not found'}, status=404)
        except Exception as e:
            logger.error(f"Failed to get deployment detail: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def api_pipeline_detail(self, request):
        """Get detailed pipeline information"""
        try:
            pipeline_id = request.match_info['pipeline_id']
            status = await self.cicd_pipeline.get_pipeline_status(pipeline_id)
            if status:
                return web.json_response(status)
            else:
                return web.json_response({'error': 'Pipeline not found'}, status=404)
        except Exception as e:
            logger.error(f"Failed to get pipeline detail: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def api_trigger_rollback(self, request):
        """Trigger deployment rollback"""
        try:
            deployment_id = request.match_info['deployment_id']
            rollback_deployment = await self.deployment_manager.rollback(
                deployment_id=deployment_id,
                deployed_by="dashboard:admin"
            )
            
            return web.json_response({
                'success': True,
                'rollback_deployment_id': rollback_deployment.deployment_id,
                'status': rollback_deployment.status.value
            })
            
        except Exception as e:
            logger.error(f"Failed to trigger rollback: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)
    
    async def api_cancel_pipeline(self, request):
        """Cancel running pipeline"""
        try:
            pipeline_id = request.match_info['pipeline_id']
            success = await self.cicd_pipeline.cancel_pipeline(pipeline_id)
            
            return web.json_response({
                'success': success,
                'message': 'Pipeline cancelled' if success else 'Failed to cancel pipeline'
            })
            
        except Exception as e:
            logger.error(f"Failed to cancel pipeline: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)
    
    async def api_approve_promotion(self, request):
        """Approve promotion request"""
        try:
            promotion_id = request.match_info['promotion_id']
            data = await request.json()
            approver = data.get('approver', 'dashboard:admin')
            
            success = await self.orchestrator.approve_promotion(promotion_id, approver)
            
            return web.json_response({
                'success': success,
                'message': 'Promotion approved' if success else 'Failed to approve promotion'
            })
            
        except Exception as e:
            logger.error(f"Failed to approve promotion: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)
    
    async def websocket_handler(self, request):
        """WebSocket handler for real-time updates"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        
        self.websocket_connections.add(ws)
        logger.info("WebSocket client connected")
        
        try:
            # Send initial data
            await self._update_dashboard_data()
            await ws.send_str(json.dumps(asdict(self.dashboard_data)))
            
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        # Handle client requests (ping, etc.)
                        if data.get('type') == 'ping':
                            await ws.send_str(json.dumps({'type': 'pong'}))
                    except json.JSONDecodeError:
                        logger.warning("Received invalid JSON from WebSocket client")
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    logger.error(f"WebSocket error: {ws.exception()}")
                    break
                    
        except Exception as e:
            logger.error(f"WebSocket handler error: {e}")
        finally:
            logger.info("WebSocket client disconnected")
            
        return ws
    
    async def _update_dashboard_data(self):
        """Update dashboard data"""
        try:
            # Get overview from orchestrator
            overview = await self.orchestrator.get_deployment_overview()
            
            # Get recent pipelines
            recent_pipelines = await self.cicd_pipeline.get_recent_pipelines(10)
            
            # Collect system metrics
            await self._collect_system_metrics()
            
            # Generate alerts
            alerts = await self._generate_alerts()
            
            # Create dashboard data
            self.dashboard_data = DashboardData(
                timestamp=datetime.now(),
                system_health=overview.get('system_health', 'unknown'),
                environments=overview.get('environments', {}),
                active_deployments=overview.get('recent_deployments', []),
                recent_pipelines=recent_pipelines,
                active_promotions=overview.get('active_promotions', []),
                system_metrics=self._get_metrics_summary(),
                alerts=alerts
            )
            
            self.last_update = datetime.now()
            
            # Broadcast to WebSocket clients
            await self._broadcast_update()
            
        except Exception as e:
            logger.error(f"Failed to update dashboard data: {e}")
    
    async def _collect_system_metrics(self):
        """Collect system performance metrics"""
        try:
            # Deployment metrics
            total_deployments = 0  # Would query from database
            successful_deployments = 0
            
            deployment_success_rate = (successful_deployments / total_deployments * 100) if total_deployments > 0 else 0
            
            self._record_metric(
                name="folio_fox_deployment_success_rate",
                metric_type=MetricType.GAUGE,
                value=deployment_success_rate,
                help_text="Deployment success rate percentage"
            )
            
            # Pipeline metrics
            total_pipelines = 0  # Would query from database
            successful_pipelines = 0
            
            pipeline_success_rate = (successful_pipelines / total_pipelines * 100) if total_pipelines > 0 else 0
            
            self._record_metric(
                name="folio_fox_pipeline_success_rate",
                metric_type=MetricType.GAUGE,
                value=pipeline_success_rate,
                help_text="CI/CD pipeline success rate percentage"
            )
            
            # Environment health metrics
            for env in [Environment.DEVELOPMENT, Environment.STAGING, Environment.PRODUCTION]:
                health = await self.orchestrator._check_environment_health(env)
                health_score = 1 if health.value == 'healthy' else 0.5 if health.value == 'warning' else 0
                
                self._record_metric(
                    name="folio_fox_environment_health",
                    metric_type=MetricType.GAUGE,
                    value=health_score,
                    labels={'environment': env.value},
                    help_text="Environment health status (1=healthy, 0.5=warning, 0=critical)"
                )
            
            # System resource metrics (would integrate with actual monitoring)
            self._record_metric(
                name="folio_fox_cpu_usage_percent",
                metric_type=MetricType.GAUGE,
                value=45.0,  # Placeholder
                help_text="CPU usage percentage"
            )
            
            self._record_metric(
                name="folio_fox_memory_usage_percent", 
                metric_type=MetricType.GAUGE,
                value=67.0,  # Placeholder
                help_text="Memory usage percentage"
            )
            
        except Exception as e:
            logger.error(f"Failed to collect system metrics: {e}")
    
    def _record_metric(self, name: str, metric_type: MetricType, value: Union[int, float], labels: Dict[str, str] = None, help_text: str = ""):
        """Record a metric value"""
        metric = Metric(
            name=name,
            metric_type=metric_type,
            value=value,
            labels=labels or {},
            help_text=help_text
        )
        
        self.metrics[name] = metric
        
        # Store in history
        if name not in self.metric_history:
            self.metric_history[name] = []
        
        self.metric_history[name].append(metric)
        
        # Trim history to retention period
        retention_cutoff = datetime.now() - timedelta(hours=self.config['dashboard']['metric_retention_hours'])
        self.metric_history[name] = [
            m for m in self.metric_history[name] 
            if m.timestamp > retention_cutoff
        ]
    
    def _get_metrics_summary(self) -> Dict[str, Any]:
        """Get summary of current metrics for dashboard"""
        summary = {}
        
        for name, metric in self.metrics.items():
            # Simplify metric names for display
            display_name = name.replace('folio_fox_', '').replace('_', ' ').title()
            
            if metric.metric_type == MetricType.GAUGE:
                if 'percent' in name:
                    summary[display_name] = f"{metric.value:.1f}%"
                else:
                    summary[display_name] = f"{metric.value:.2f}"
            else:
                summary[display_name] = str(metric.value)
        
        return summary
    
    async def _generate_alerts(self) -> List[Dict[str, Any]]:
        """Generate active alerts"""
        alerts = []
        
        try:
            # Check for failed deployments in last 24 hours
            # This would query the actual deployment database
            
            # Check for high failure rates
            deployment_success_rate = self.metrics.get('folio_fox_deployment_success_rate')
            if deployment_success_rate and deployment_success_rate.value < 80:
                alerts.append({
                    'title': 'Low Deployment Success Rate',
                    'message': f'Deployment success rate is {deployment_success_rate.value:.1f}%',
                    'severity': 'warning',
                    'timestamp': datetime.now().isoformat()
                })
            
            # Check environment health issues
            for env in [Environment.DEVELOPMENT, Environment.STAGING, Environment.PRODUCTION]:
                health = await self.orchestrator._check_environment_health(env)
                if health.value == 'critical':
                    alerts.append({
                        'title': f'{env.value.title()} Environment Critical',
                        'message': f'{env.value} environment is in critical state',
                        'severity': 'critical',
                        'timestamp': datetime.now().isoformat()
                    })
                elif health.value == 'warning':
                    alerts.append({
                        'title': f'{env.value.title()} Environment Warning',
                        'message': f'{env.value} environment needs attention',
                        'severity': 'warning',
                        'timestamp': datetime.now().isoformat()
                    })
            
            # Check for stuck deployments
            # This would check for deployments running too long
            
        except Exception as e:
            logger.error(f"Failed to generate alerts: {e}")
        
        return alerts
    
    async def _broadcast_update(self):
        """Broadcast update to all WebSocket clients"""
        if not self.websocket_connections or not self.dashboard_data:
            return
        
        message = json.dumps(asdict(self.dashboard_data))
        
        # Send to all connected clients
        disconnected = []
        for ws in self.websocket_connections:
            try:
                await ws.send_str(message)
            except Exception as e:
                logger.warning(f"Failed to send WebSocket update: {e}")
                disconnected.append(ws)
        
        # Remove disconnected clients
        for ws in disconnected:
            self.websocket_connections.discard(ws)
    
    async def start_background_tasks(self):
        """Start background monitoring tasks"""
        # Dashboard data update task
        async def update_task():
            while True:
                try:
                    await self._update_dashboard_data()
                    await asyncio.sleep(self.config['dashboard']['update_interval_seconds'])
                except Exception as e:
                    logger.error(f"Dashboard update task error: {e}")
                    await asyncio.sleep(60)  # Wait longer on error
        
        # Health monitoring task
        async def health_monitoring_task():
            while True:
                try:
                    await self._collect_system_metrics()
                    await asyncio.sleep(self.config['monitoring']['health_check_interval_seconds'])
                except Exception as e:
                    logger.error(f"Health monitoring task error: {e}")
                    await asyncio.sleep(60)
        
        # Start tasks
        self.background_tasks.append(asyncio.create_task(update_task()))
        self.background_tasks.append(asyncio.create_task(health_monitoring_task()))
        
        logger.info("Background monitoring tasks started")
    
    async def stop_background_tasks(self):
        """Stop background monitoring tasks"""
        for task in self.background_tasks:
            task.cancel()
        
        if self.background_tasks:
            await asyncio.gather(*self.background_tasks, return_exceptions=True)
        
        logger.info("Background monitoring tasks stopped")
    
    async def run(self):
        """Run the monitoring dashboard"""
        try:
            # Start background tasks
            await self.start_background_tasks()
            
            # Setup and start web server
            runner = web_runner.AppRunner(self.app)
            await runner.setup()
            
            site = web_runner.TCPSite(
                runner,
                host=self.config['dashboard']['host'],
                port=self.config['dashboard']['port']
            )
            
            await site.start()
            
            logger.info(f"Monitoring dashboard started on http://{self.config['dashboard']['host']}:{self.config['dashboard']['port']}")
            
            # Run until interrupted
            try:
                while True:
                    await asyncio.sleep(3600)  # Check every hour
            except KeyboardInterrupt:
                logger.info("Received interrupt signal")
            
        except Exception as e:
            logger.error(f"Failed to run monitoring dashboard: {e}")
            raise
        finally:
            # Cleanup
            await self.stop_background_tasks()
            if 'runner' in locals():
                await runner.cleanup()

async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='FolioFox Deployment Monitoring Dashboard')
    parser.add_argument('--config', default='/etc/folio_fox/monitoring.yaml', help='Configuration file path')
    parser.add_argument('--port', type=int, help='Override port number')
    parser.add_argument('--host', help='Override host address')
    parser.add_argument('--export-metrics', action='store_true', help='Export metrics and exit')
    parser.add_argument('--format', choices=['json', 'prometheus'], default='json', help='Metrics export format')
    
    args = parser.parse_args()
    
    try:
        dashboard = MonitoringDashboard(args.config)
        
        # Override config with command line args
        if args.port:
            dashboard.config['dashboard']['port'] = args.port
        if args.host:
            dashboard.config['dashboard']['host'] = args.host
        
        if args.export_metrics:
            # Export metrics and exit
            await dashboard._update_dashboard_data()
            
            if args.format == 'prometheus':
                # Output Prometheus format
                for name, metric in dashboard.metrics.items():
                    if metric.help_text:
                        print(f"# HELP {name} {metric.help_text}")
                    print(f"# TYPE {name} {metric.metric_type.value}")
                    
                    if metric.labels:
                        labels_str = ','.join([f'{k}="{v}"' for k, v in metric.labels.items()])
                        print(f"{name}{{{labels_str}}} {metric.value}")
                    else:
                        print(f"{name} {metric.value}")
            else:
                # Output JSON format
                metrics_data = {}
                for name, metric in dashboard.metrics.items():
                    metrics_data[name] = {
                        'value': metric.value,
                        'type': metric.metric_type.value,
                        'labels': metric.labels,
                        'timestamp': metric.timestamp.isoformat()
                    }
                print(json.dumps(metrics_data, indent=2))
        else:
            # Run dashboard server
            await dashboard.run()
    
    except Exception as e:
        logger.error(f"Dashboard startup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())