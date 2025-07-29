# FolioFox Self-Hosted Deployment Guide

This comprehensive guide will help you deploy FolioFox on your own infrastructure using Docker and Docker Compose.

## Quick Start

For the impatient, here's the minimal setup:

```bash
# Clone the repository
git clone https://github.com/fabienpiette/folio_fox.git
cd foliofox

# Copy and configure environment
cp .env.example .env
nano .env  # Edit configuration

# Create required directories
mkdir -p data logs downloads config backups

# Start the application
docker-compose up -d

# Access FolioFox at http://localhost:3000
```

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Pre-Installation Setup](#pre-installation-setup)
3. [Installation Methods](#installation-methods)
4. [Configuration](#configuration)
5. [Deployment Options](#deployment-options)
6. [Monitoring and Observability](#monitoring-and-observability)
7. [Backup and Recovery](#backup-and-recovery)
8. [Security Considerations](#security-considerations)
9. [Troubleshooting](#troubleshooting)
10. [Maintenance](#maintenance)
11. [Scaling](#scaling)

## System Requirements

### Minimum Requirements

- **CPU**: 2 cores (x86_64 or ARM64)
- **RAM**: 4GB (2GB for core services + 2GB for data processing)
- **Storage**: 20GB free space (more for eBook storage)
- **Docker**: Version 20.10+ with Docker Compose V2
- **OS**: Linux (Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+)

### Recommended Requirements

- **CPU**: 4+ cores
- **RAM**: 8GB+ (better performance for large libraries)
- **Storage**: 100GB+ SSD (faster database operations)
- **Network**: Stable internet connection for indexer integration

### Supported Platforms

- **x86_64**: Intel/AMD 64-bit processors
- **ARM64**: Apple Silicon M1/M2, Raspberry Pi 4+
- **Cloud**: AWS, Google Cloud, Azure, DigitalOcean, Linode

## Pre-Installation Setup

### 1. Install Docker and Docker Compose

#### Ubuntu/Debian
```bash
# Update package index
sudo apt update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, then verify
docker --version
docker compose version
```

#### CentOS/RHEL/Fedora
```bash
# Install Docker
sudo dnf install docker docker-compose-plugin

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
```

### 2. System Preparation

```bash
# Create dedicated user (optional but recommended)
sudo useradd -m -s /bin/bash foliofox
sudo usermod -aG docker foliofox

# Switch to foliofox user
sudo su - foliofox

# Verify system resources
free -h
df -h
```

### 3. Network Configuration

```bash
# Check if required ports are available
ss -tulpn | grep -E ':(3000|8080|9000|9090|3001)'

# Configure firewall (if needed)
sudo ufw allow 3000/tcp  # Frontend
sudo ufw allow 8080/tcp  # Backend API
sudo ufw allow 9000/tcp  # Portainer (optional)
```

## Installation Methods

### Method 1: Standard Installation

```bash
# Clone repository
git clone https://github.com/fabienpiette/folio_fox.git
cd foliofox

# Copy and configure environment
cp .env.example .env

# Edit configuration (see Configuration section)
nano .env

# Create required directories
mkdir -p data/{postgres,redis,app,prometheus,grafana,letsencrypt}
mkdir -p logs/app
mkdir -p downloads
mkdir -p config
mkdir -p backups

# Set proper permissions
sudo chown -R 1001:1001 data logs downloads
chmod 755 scripts/backup/backup.sh

# Start services
docker-compose up -d

# Verify deployment
docker-compose ps
```

### Method 2: Portainer Template Installation

1. Install Portainer:
```bash
docker volume create portainer_data
docker run -d -p 9000:9000 --name portainer --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

2. Access Portainer at `http://your-server:9000`
3. Navigate to "App Templates"
4. Find "FolioFox" templates and deploy

### Method 3: Production Installation with Monitoring

```bash
# Clone repository
git clone https://github.com/fabienpiette/folio_fox.git
cd foliofox

# Configure environment for production
cp .env.example .env
# Edit .env with production settings

# Start with monitoring stack
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Verify all services
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml ps
```

## Configuration

### Environment Variables

Edit the `.env` file to configure your deployment:

#### Core Application Settings
```bash
# Application
BUILD_VERSION=latest
FRONTEND_PORT=3000
BACKEND_PORT=8080

# Database (choose one)
DATABASE_TYPE=sqlite  # or postgres for production
POSTGRES_PASSWORD=your-secure-password-here

# Cache
REDIS_PASSWORD=your-redis-password-here

# Security
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
```

#### Storage Configuration
```bash
# Local storage paths
DATA_DIR=./data
LOGS_DIR=./logs
DOWNLOADS_DIR=./downloads
CONFIG_DIR=./config
BACKUP_DIR=./backups
```

#### Optional Services
```bash
# Monitoring (if using monitoring stack)
GRAFANA_PASSWORD=your-grafana-password
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001

# Reverse Proxy (if using Traefik)
ACME_EMAIL=your-email@domain.com
TRAEFIK_DOMAIN=foliofox.yourdomain.com
```

### Database Selection

#### SQLite (Default - Recommended for small deployments)
```bash
DATABASE_TYPE=sqlite
DATABASE_PATH=/app/data/foliofox.db
```

Pros:
- Zero configuration
- Perfect for single-user or small deployments
- Automatic backups included

Cons:
- Limited concurrent access
- Not suitable for high-traffic deployments

#### PostgreSQL (Recommended for production)
```bash
DATABASE_TYPE=postgres
POSTGRES_HOST=postgres
POSTGRES_DB=foliofox
POSTGRES_USER=foliofox
POSTGRES_PASSWORD=secure-password-here
```

Pros:
- Better concurrent access
- More robust for production workloads
- Better performance for large libraries

Cons:
- Requires additional configuration
- More complex backup procedures

## Deployment Options

### 1. Core Services Only

Deploy just the essential FolioFox components:

```bash
# Start core services (backend, frontend, cache, database)
docker-compose up -d backend frontend redis

# For PostgreSQL users, also start:
docker-compose --profile postgres up -d
```

### 2. Full Stack with Management

Include Portainer for container management:

```bash
docker-compose --profile management up -d
```

### 3. Complete Stack with Monitoring

Deploy everything including monitoring and observability:

```bash
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  up -d
```

### 4. Reverse Proxy Setup

For production deployments with SSL/TLS:

```bash
# Update .env with your domain settings
ACME_EMAIL=admin@yourdomain.com
TRAEFIK_DOMAIN=foliofox.yourdomain.com

# Deploy with reverse proxy
docker-compose --profile proxy up -d
```

## Monitoring and Observability

### Accessing Monitoring Services

Once deployed with monitoring, access these services:

- **Grafana**: `http://your-server:3001` (admin/password from .env)
- **Prometheus**: `http://your-server:9090`
- **Portainer**: `http://your-server:9000`
- **Alertmanager**: `http://your-server:9093`

### Default Dashboards

FolioFox includes pre-configured Grafana dashboards for:

- Application performance metrics
- Database performance (PostgreSQL/SQLite)
- Redis cache metrics
- System resource usage
- Container health and status
- Download queue monitoring

### Setting Up Alerts

Configure alerts in `docker/alertmanager/config.yml`:

```yaml
route:
  receiver: 'slack-notifications'
  
receivers:
- name: 'slack-notifications'
  slack_configs:
  - api_url: 'YOUR_SLACK_WEBHOOK_URL'
    channel: '#foliofox-alerts'
    title: 'FolioFox Alert'
    text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

## Backup and Recovery

### Automated Backups

FolioFox includes a comprehensive backup script:

```bash
# Create a backup
./scripts/backup/backup.sh backup

# List available backups
./scripts/backup/backup.sh list

# Verify backup integrity
./scripts/backup/backup.sh verify /path/to/backup.tar.gz

# Restore from backup
./scripts/backup/backup.sh restore /path/to/backup.tar.gz

# Clean old backups
./scripts/backup/backup.sh cleanup
```

### Automated Backup Schedule

Set up automated backups with cron:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/foliofox/scripts/backup/backup.sh backup
```

### S3 Backup Configuration

For remote backups to AWS S3:

```bash
# Add to .env
BACKUP_S3_BUCKET=your-backup-bucket
BACKUP_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Backups will automatically upload to S3
./scripts/backup/backup.sh backup
```

## Security Considerations

### Container Security

1. **Non-root execution**: All containers run as non-root users
2. **Read-only filesystems**: Where possible, containers use read-only root filesystems
3. **Security options**: `no-new-privileges` is set for all containers
4. **Resource limits**: Memory and CPU limits prevent resource exhaustion

### Network Security

```bash
# Configure firewall
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow only required ports
sudo ufw allow 3000/tcp  # Frontend
sudo ufw allow 8080/tcp  # Backend API
sudo ufw allow 22/tcp    # SSH

# For production with reverse proxy
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
```

### SSL/TLS Configuration

#### With Traefik (Automatic Let's Encrypt)

```bash
# Configure in .env
ACME_EMAIL=admin@yourdomain.com
TRAEFIK_DOMAIN=foliofox.yourdomain.com

# Deploy with proxy profile
docker-compose --profile proxy up -d
```

#### Manual SSL Certificate

```bash
# Place certificates in data/certs/
mkdir -p data/certs
# Copy your cert.pem and key.pem to data/certs/

# Configure in .env
HTTPS_ENABLED=true
SSL_CERT_PATH=/certs/cert.pem
SSL_KEY_PATH=/certs/key.pem
```

### Authentication Security

```bash
# Generate strong JWT secret (minimum 32 characters)
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET=$JWT_SECRET" >> .env

# Configure strong database passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
```

## Troubleshooting

### Common Issues

#### 1. Services won't start
```bash
# Check logs
docker-compose logs

# Check specific service
docker-compose logs backend

# Check resource usage
docker stats
```

#### 2. Database connection issues
```bash
# For PostgreSQL
docker-compose exec postgres pg_isready -U foliofox

# For Redis
docker-compose exec redis redis-cli ping

# Check network connectivity
docker-compose exec backend ping postgres
```

#### 3. Permission issues
```bash
# Fix data directory permissions
sudo chown -R 1001:1001 data logs downloads
chmod -R 755 data logs downloads

# Check volume mounts
docker-compose exec backend ls -la /app/data
```

#### 4. Port conflicts
```bash
# Check for port conflicts
ss -tulpn | grep -E ':(3000|8080|9000)'

# Use different ports in .env
FRONTEND_PORT=3001
BACKEND_PORT=8081
```

### Performance Issues

#### 1. High memory usage
```bash
# Check container memory usage
docker stats

# Adjust resource limits in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 512M
```

#### 2. Slow database queries
```bash
# For PostgreSQL, check slow queries
docker-compose exec postgres psql -U foliofox -c "SELECT * FROM pg_stat_activity;"

# Enable query logging
echo "log_statement = 'all'" >> docker/postgres/postgresql.conf
```

#### 3. Network performance
```bash
# Test internal network
docker-compose exec frontend ping backend

# Check DNS resolution
docker-compose exec backend nslookup postgres
```

## Maintenance

### Regular Maintenance Tasks

#### Daily
- Check service health: `docker-compose ps`
- Monitor disk space: `df -h`
- Review application logs: `docker-compose logs --tail=100`

#### Weekly
- Update containers: `docker-compose pull && docker-compose up -d`
- Clean up unused images: `docker system prune -f`
- Backup verification: `./scripts/backup/backup.sh verify latest_backup.tar.gz`

#### Monthly
- Security updates: Update base images and rebuild
- Performance review: Check Grafana dashboards
- Storage cleanup: Remove old downloads and logs

### Updates and Upgrades

#### Application Updates
```bash
# Pull latest code
git pull origin main

# Update containers
docker-compose pull
docker-compose up -d

# Verify update
docker-compose ps
```

#### Database Migrations
```bash
# Backup before migration
./scripts/backup/backup.sh backup

# Run migrations (automatic on container start)
docker-compose restart backend

# Verify migration
docker-compose logs backend | grep migration
```

### Health Monitoring

#### Automated Health Checks
```bash
# Check all service health
docker-compose exec backend curl -f http://localhost:8080/api/v1/health
docker-compose exec frontend curl -f http://localhost:3000/health

# Full system health script
cat > health_check.sh << 'EOF'
#!/bin/bash
echo "=== FolioFox Health Check ==="
docker-compose ps
echo "=== Disk Usage ==="
df -h
echo "=== Memory Usage ==="
free -h
echo "=== Service Health ==="
curl -s http://localhost:3000/health && echo "Frontend: OK"
curl -s http://localhost:8080/api/v1/health && echo "Backend: OK"
EOF

chmod +x health_check.sh
```

## Scaling

### Horizontal Scaling

#### Load Balancer Setup
```bash
# Use Traefik for load balancing
# Configure in docker-compose.yml
services:
  backend:
    deploy:
      replicas: 3
    labels:
      - "traefik.enable=true"
      - "traefik.http.services.backend.loadbalancer.server.port=8080"
```

#### Database Scaling
```bash
# PostgreSQL with read replicas
# Add to docker-compose.yml
postgres-replica:
  image: postgres:15-alpine
  environment:
    POSTGRES_MASTER_SERVICE: postgres
    POSTGRES_REPLICA_USER: replica
  command: postgres -c 'recovery_target_timeline=latest'
```

### Vertical Scaling

#### Resource Optimization
```bash
# Monitor resource usage
docker stats

# Adjust limits in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 2G
      cpus: '1.0'
    reservations:
      memory: 1G
      cpus: '0.5'
```

### Multi-Node Setup

For large deployments, consider:

#### Docker Swarm
```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml foliofox
```

#### Kubernetes
```bash
# Convert compose to Kubernetes
kompose convert -f docker-compose.yml

# Deploy to Kubernetes
kubectl apply -f foliofox-deployment.yaml
```

## Support and Resources

### Documentation
- [API Documentation](./api/docs/)
- [WebSocket Specification](./api/websocket/)
- [Database Schema](./database/)

### Community
- GitHub Issues: Report bugs and feature requests
- Discussions: Community support and questions
- Wiki: Additional documentation and guides

### Professional Support
For enterprise deployments, consider:
- Professional installation and configuration
- Custom monitoring and alerting setup
- Performance optimization and scaling
- Security hardening and compliance
- 24/7 support and maintenance

---

## Conclusion

This deployment guide provides comprehensive instructions for self-hosting FolioFox. Start with the Quick Start section for immediate deployment, then refer to specific sections as needed for your use case.

For additional help, consult the troubleshooting section or reach out to the community through GitHub Discussions.

Happy reading! 📚