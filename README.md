# FolioFox - Self-Hosted eBook Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue.svg)](https://docker.com)
[![CI/CD](https://github.com/fabienpiette/folio_fox/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/fabienpiette/folio_fox/actions)

FolioFox is a comprehensive, self-hosted eBook management system designed for book enthusiasts who want complete control over their digital library. Built with modern technologies and a focus on performance, security, and ease of use.

## 🚀 Quick Start

Get FolioFox running in under 5 minutes:

```bash
# Clone the repository
git clone https://github.com/fabienpiette/folio_fox.git
cd foliofox

# Run the setup script (interactive)
./scripts/setup.sh

# Or use the quick one-liner
curl -fsSL https://raw.githubusercontent.com/foliofox/foliofox/main/scripts/setup.sh | bash
```

Access FolioFox at `http://localhost:3000`

## ✨ Features

### 📚 Library Management
- **Smart Organization**: Automatic metadata extraction and organization
- **Multi-format Support**: EPUB, PDF, MOBI, AZW3, and more
- **Advanced Search**: Full-text search with filters and faceted browsing
- **Reading Progress**: Track your reading progress across devices
- **Collections**: Create custom collections and reading lists

### 🔍 Book Discovery
- **Indexer Integration**: Prowlarr, Jackett support for book discovery
- **Automated Downloads**: Queue-based downloading with retry logic
- **Duplicate Detection**: Intelligent duplicate detection and management
- **Metadata Enrichment**: Automatic metadata enhancement from multiple sources

### 🖥️ Modern Interface
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Dark/Light Modes**: Choose your preferred viewing experience
- **Real-time Updates**: WebSocket-powered real-time notifications
- **Accessibility**: WCAG 2.1 AA compliant interface

### 🔧 Self-Hosted & Secure
- **Complete Privacy**: Your data stays on your server
- **Docker-based**: Easy deployment with Docker and Docker Compose
- **Multi-database Support**: SQLite for simplicity, PostgreSQL for scale
- **Backup & Recovery**: Comprehensive backup and restore functionality

### 📊 Monitoring & Observability
- **Performance Metrics**: Built-in Prometheus metrics collection
- **Visual Dashboards**: Pre-configured Grafana dashboards
- **Health Monitoring**: Comprehensive health checks and alerting
- **Log Aggregation**: Centralized logging with Loki and Promtail

## 🏗️ Architecture

FolioFox is built with a modern, scalable architecture:

- **Backend**: Go with Gin web framework, optimized for performance
- **Frontend**: React with TypeScript, Tailwind CSS, and modern tooling
- **Database**: SQLite (default) or PostgreSQL for production
- **Cache**: Redis for session management and query caching
- **Search**: Integrated full-text search with optimization
- **Containerization**: Docker with multi-stage builds and security hardening

## 📋 System Requirements

### Minimum Requirements
- **CPU**: 2 cores (x86_64 or ARM64)
- **RAM**: 4GB
- **Storage**: 20GB free space
- **Docker**: Version 20.10+

### Recommended for Production
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 100GB+ SSD
- **Network**: Stable internet connection

## 🚀 Deployment Options

### 1. Quick Setup (Recommended)
```bash
./scripts/setup.sh
```

### 2. Manual Setup
```bash
# Copy and configure environment
cp .env.example .env
nano .env

# Create directories and start services
mkdir -p data logs downloads config backups
docker-compose up -d
```

### 3. Production Deployment with Monitoring
```bash
# Deploy with full monitoring stack
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### 4. Portainer Template
Use the included Portainer templates for one-click deployment in your Portainer instance.

## 🔧 Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Core Settings
FRONTEND_PORT=3000
BACKEND_PORT=8080
DATABASE_TYPE=sqlite  # or postgres

# Security
JWT_SECRET=your-secure-secret-key
POSTGRES_PASSWORD=secure-password
REDIS_PASSWORD=secure-password

# Features
MAX_CONCURRENT_DOWNLOADS=5
SEARCH_CACHE_TTL=300
```

### Database Options

**SQLite (Default)**
- Zero configuration
- Perfect for personal use
- Automatic backups included

**PostgreSQL (Production)**
- Better concurrency
- Recommended for multi-user setups
- Advanced query optimization

## 📊 Monitoring

Access your monitoring dashboard:

- **Application**: `http://localhost:3000`
- **API**: `http://localhost:8080`
- **Grafana**: `http://localhost:3001`
- **Prometheus**: `http://localhost:9090`  
- **Portainer**: `http://localhost:9000`

## 💾 Backup & Recovery

### Automated Backups
```bash
# Create backup
./scripts/backup/backup.sh backup

# List backups
./scripts/backup/backup.sh list

# Restore from backup
./scripts/backup/backup.sh restore backup.tar.gz
```

### Scheduled Backups
Add to crontab for daily backups:
```bash
0 2 * * * /path/to/foliofox/scripts/backup/backup.sh backup
```

## 🛡️ Security Features

### Container Security
- ✅ Non-root container execution
- ✅ Read-only root filesystems where possible
- ✅ Security options: `no-new-privileges`
- ✅ Resource limits and quotas
- ✅ Network isolation

### Application Security
- ✅ JWT-based authentication
- ✅ Rate limiting and CORS protection
- ✅ SQL injection prevention
- ✅ XSS protection headers
- ✅ Secure password hashing

### Network Security
- ✅ Internal Docker network isolation
- ✅ Configurable reverse proxy support
- ✅ Let's Encrypt SSL/TLS automation
- ✅ Security headers enforcement

## 🔄 Updates & Maintenance

### Regular Updates
```bash
# Pull latest changes
git pull origin main

# Update containers
docker-compose pull
docker-compose up -d
```

### Health Monitoring
```bash
# Check service health
docker-compose ps
curl http://localhost:8080/api/v1/health

# View logs
docker-compose logs -f
```

## 📚 Documentation

### User Guides
- [Installation & Setup](./DEPLOYMENT.md) - Comprehensive deployment guide
- [Configuration](./docs/configuration.md) - Detailed configuration options
- [API Documentation](./api/docs/) - RESTful API reference
- [WebSocket API](./api/websocket/) - Real-time API documentation

### Developer Resources
- [Contributing Guidelines](./CONTRIBUTING.md) - How to contribute
- [Development Setup](./docs/development.md) - Local development environment
- [Architecture Overview](./docs/architecture.md) - System architecture details
- [Database Schema](./database/) - Database design and migrations

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details.

### Development Setup
```bash
# Clone repository
git clone https://github.com/fabienpiette/folio_fox.git
cd foliofox

# Start development environment
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Run tests
./scripts/test.sh
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🆘 Support

### Community Support
- **GitHub Issues**: [Report bugs and request features](https://github.com/fabienpiette/folio_fox/issues)
- **Discussions**: [Community support and questions](https://github.com/fabienpiette/folio_fox/discussions)
- **Wiki**: [Additional documentation](https://github.com/fabienpiette/folio_fox/wiki)

### Professional Support
For enterprise deployments and professional support:
- Custom installation and configuration
- Performance optimization and scaling
- Security hardening and compliance
- 24/7 support and maintenance

## 🙏 Acknowledgments

FolioFox is built with and inspired by:
- [Go](https://golang.org/) - Backend programming language
- [React](https://reactjs.org/) - Frontend framework
- [Docker](https://docker.com/) - Containerization platform
- [Prometheus](https://prometheus.io/) - Monitoring and alerting
- [Grafana](https://grafana.com/) - Observability and dashboards

## 🔮 Roadmap

### Upcoming Features
- [ ] Mobile applications (iOS/Android)
- [ ] Advanced reading analytics
- [ ] Social features (reviews, recommendations)
- [ ] Plugin system for extensibility
- [ ] Multi-language support
- [ ] Cloud storage integration (S3, Google Drive, etc.)

### Version History
- **v1.0.0** - Initial release with core features
- **v1.1.0** - Enhanced monitoring and observability
- **v1.2.0** - Advanced search and filtering
- **v2.0.0** - Complete UI redesign and mobile support (planned)

---

<div align="center">

**[Website](https://foliofox.dev)** • **[Documentation](./DEPLOYMENT.md)** • **[API Docs](./api/docs/)** • **[Discord](https://discord.gg/foliofox)**

Made with ❤️ by the FolioFox team

</div>