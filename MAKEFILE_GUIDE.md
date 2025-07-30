# FolioFox Makefile and Automation Guide

This comprehensive guide covers the complete automation ecosystem for FolioFox, including the main Makefile and supporting scripts that streamline development, testing, and deployment workflows.

## Quick Start

```bash
# First-time setup
make setup                      # Complete project setup
make install                    # Install development tools
make run                        # Start the application

# Daily development
make dev                        # Development environment with hot reload  
make test                       # Run all tests
make lint                       # Code quality checks
make ci                         # Simulate CI pipeline locally
```

## Core Concepts

### 1. **Cross-Platform Compatibility**
All commands work on Linux, macOS, and Windows (with WSL/Git Bash).

### 2. **Color-Coded Output**
- 🔵 **Blue**: Status messages and progress
- ✅ **Green**: Success messages
- ⚠️ **Yellow**: Warnings and suggestions
- ❌ **Red**: Errors and failures
- ℹ️ **Cyan**: Information and tips

### 3. **Smart Dependency Checking**
Commands automatically verify prerequisites and provide installation guidance.

### 4. **Environment-Aware**
Supports configuration through environment variables, .env files, and command-line arguments.

### 5. **Parallel Execution**
Long-running tasks execute in parallel where possible for optimal performance.

## Application Management

### Starting Services

| Command | Description | Use Case |
|---------|-------------|----------|
| `make run` | Full application stack | Production-like environment |
| `make run-backend` | Backend service only | API development |
| `make run-frontend` | Frontend development server | UI development |
| `make dev` | Development environment | Active development with hot reload |

### Service Control

```bash
make stop                       # Stop all services
make restart                    # Restart all services  
make status                     # Show service status and health
make logs                       # View application logs
make logs-follow                # Follow logs in real-time
```

### Advanced Service Management

```bash
make services-up                # Start supporting services only
make services-down              # Stop supporting services
make monitor                    # Start monitoring stack (Grafana/Prometheus)
```

## Development Workflow

### Building Applications

```bash
make build                      # Build backend + frontend
make build-backend              # Build Go binary only
make build-frontend             # Build React production bundle
make build-docs                 # Generate API documentation
```

### Testing Strategies

#### Unit Testing
```bash
make test-unit                  # Quick unit tests
make test-watch                 # Continuous testing during development
make test-coverage              # Generate coverage reports
```

#### Integration Testing
```bash
make test-integration           # Integration tests with Docker services
make test-e2e                   # End-to-end tests with full stack
```

#### Performance Testing
```bash
make test-benchmark             # Go benchmark tests
make perf-test                  # Comprehensive performance testing
make load-test                  # Load testing (requires k6)
```

#### Complete Test Suite
```bash
make test                       # All tests (unit + integration + e2e)
```

### Code Quality

#### Linting and Formatting
```bash
make lint                       # Run all linters
make lint-go                    # Go-specific linting  
make lint-frontend              # Frontend linting (ESLint/TypeScript)
make format                     # Format all code
make format-go                  # Format Go code only
make format-frontend            # Format frontend code only
```

#### Security and Analysis
```bash
make vet                        # Go vet analysis
make security                   # Security analysis (gosec)
```

## CI/CD Simulation

### Local CI Pipeline

```bash
make ci                         # Complete CI pipeline simulation
make ci-test                    # Test pipeline only
make ci-build                   # Build pipeline only  
make ci-security                # Security pipeline only
```

### What CI Pipeline Includes

1. **Dependency Installation**: `deps`
2. **Code Quality**: `lint`, `format`, `vet`
3. **Security Scanning**: `security`
4. **Unit Testing**: `test-unit`
5. **Integration Testing**: `test-integration`
6. **Build Verification**: `build`
7. **Docker Image Building**: `docker-build`

## Database Management

### Database Operations

```bash
make db-setup                   # Initialize database with migrations
make db-migrate                 # Run database migrations
make db-reset                   # Reset database (⚠️ destructive)
```

### Database Types

Set `DATABASE_TYPE` environment variable:
- `sqlite` (default): Lightweight, single-file database
- `postgres`: Production-ready PostgreSQL

## Docker Operations

### Image Management

```bash
make docker-build               # Build all Docker images
make docker-push                # Push images to registry
make docker-clean               # Clean Docker resources
make docker-security-scan       # Scan images for vulnerabilities
```

### Container Debugging

```bash
make shell-backend              # Open shell in backend container
make shell-frontend             # Open shell in frontend container
make shell-redis                # Open Redis CLI
```

## Environment Management

### Setup and Configuration

```bash
make check-env                  # Verify prerequisites
make create-env                 # Generate .env file
make setup                      # Complete project setup
```

### Environment Variables

Key configuration variables:

```bash
# Service Ports
FRONTEND_PORT=3000
BACKEND_PORT=8080
REDIS_PORT=6379
POSTGRES_PORT=5432

# Database Configuration  
DATABASE_TYPE=sqlite            # or postgres

# Docker Registry
DOCKER_REGISTRY=ghcr.io/fabienpiette/folio_fox

# Build Information
BUILD_VERSION=latest
BUILD_COMMIT=auto-detected
BUILD_DATE=auto-generated
```

## Maintenance and Cleanup

### Cleanup Operations

```bash
make clean                      # Complete cleanup (containers + build artifacts)
make clean-build               # Build artifacts only
```

### Backup and Restore

```bash
make backup                     # Create application data backup
make restore BACKUP_FILE=path  # Restore from backup file
```

## Release Management

### Preparing Releases

```bash
make release-prepare            # Run all quality checks
make release-tag VERSION=v1.0.0 # Create and push release tag
```

## Supporting Scripts

The Makefile integrates with powerful supporting scripts in the `scripts/` directory:

### Health Monitoring
- `scripts/health-check.sh`: Comprehensive service health monitoring
- Integrated via `make status` command

### Environment Validation  
- `scripts/validate-env.sh`: Prerequisites and configuration validation
- Integrated via `make check-env` command

### Git Workflow
- `scripts/setup-git-hooks.sh`: Automated code quality hooks
- Integrated via `make install` command

### Performance Testing
- `scripts/performance-test.sh`: Load testing and benchmarking
- Integrated via `make perf-test` and `make load-test` commands

### CI/CD Validation
- `scripts/ci-check.sh`: GitHub Actions configuration validation
- Integrated via `make ci` command

## Development Best Practices

### Daily Development Workflow

1. **Start Development Environment**
   ```bash
   make dev                     # Start with hot reload
   ```

2. **Make Changes** - Edit code with automatic reloading

3. **Quick Validation**
   ```bash
   make lint                    # Code quality
   make test-unit               # Quick tests
   ```

4. **Commit Changes** - Git hooks automatically run quality checks

5. **Before Pushing**
   ```bash
   make ci                      # Full CI simulation
   ```

### Feature Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/new-feature
   ```

2. **Development with Testing**
   ```bash
   make dev                     # Development environment
   make test-watch              # Continuous testing
   ```

3. **Quality Assurance**
   ```bash
   make lint                    # Code quality
   make test                    # All tests
   make ci                      # CI simulation
   ```

4. **Performance Validation**
   ```bash
   make perf-test               # Performance testing
   ```

5. **Push and Create PR** - CI automatically validates

### Release Workflow

1. **Pre-release Validation**
   ```bash
   make release-prepare         # Comprehensive checks
   ```

2. **Create Release**
   ```bash
   make release-tag VERSION=v1.0.0
   ```

3. **Deploy** - Automated via CI/CD pipeline

## Troubleshooting

### Common Issues

#### Prerequisites Missing
```bash
make check-env                  # Identify missing dependencies
```

#### Services Not Starting
```bash
make status                     # Check service health
make logs                       # View error logs
```

#### Docker Issues
```bash
make docker-clean               # Clean Docker resources
docker system prune -f          # Clean system-wide Docker resources
```

#### Port Conflicts
```bash
# Configure different ports
export FRONTEND_PORT=3001
export BACKEND_PORT=8081
make run
```

#### Database Issues
```bash
make db-reset                   # Reset database (⚠️ destructive)
make db-setup                   # Reinitialize
```

### Debug Mode

Enable verbose output for any command:
```bash
MAKEFLAGS="--debug" make command
```

### Getting Help

```bash
make help                       # Show all available commands
make version                    # Show version information
./scripts/script-name.sh --help # Script-specific help
```

## Advanced Usage

### Custom Configuration

Create `.env` file with custom settings:
```bash
# Custom ports
FRONTEND_PORT=3001
BACKEND_PORT=8081

# PostgreSQL database
DATABASE_TYPE=postgres
POSTGRES_PASSWORD=custom-password

# Custom Docker registry
DOCKER_REGISTRY=my-registry.com/foliofox
```

### Parallel Development

Run multiple instances for team development:
```bash
# Developer 1
FRONTEND_PORT=3000 BACKEND_PORT=8080 make dev

# Developer 2  
FRONTEND_PORT=3001 BACKEND_PORT=8081 make dev
```

### Production-like Testing

```bash
# Use production database
DATABASE_TYPE=postgres make run

# Test with monitoring
make monitor
make run
```

### CI/CD Integration

#### GitHub Actions Integration
The Makefile commands are designed to work seamlessly with the existing GitHub Actions workflows:

```yaml
# Example GitHub Actions step
- name: Run CI Pipeline
  run: make ci
```

#### Local CI Simulation
Exactly match the CI environment locally:
```bash
make ci                         # Runs same checks as GitHub Actions
```

## Performance Optimization

### Build Performance
- Uses Go module caching
- Frontend dependency caching  
- Docker layer caching
- Parallel execution where possible

### Development Performance
- Hot reload for frontend changes
- Incremental compilation for Go
- Smart dependency checking
- Selective test execution

### Testing Performance
- Parallel test execution
- Docker container reuse
- Selective test running based on changed files

## Security Features

### Code Security
- Automated security scanning with gosec
- Dependency vulnerability checking
- Secret detection in commits
- Container image security scanning

### Development Security  
- Non-root Docker containers
- Secure default configurations
- Environment variable validation
- Git hooks prevent sensitive data commits

## Monitoring and Observability

### Application Monitoring
```bash
make monitor                    # Start Grafana/Prometheus stack
```

### Health Checking
```bash
make status                     # Service health overview
./scripts/health-check.sh monitor # Continuous monitoring
```

### Performance Monitoring
```bash
make perf-test                  # Performance baseline testing
./scripts/performance-test.sh monitor # Continuous performance monitoring
```

## Contributing to the Automation

### Adding New Commands

1. **Add to Makefile**:
   ```makefile
   .PHONY: new-command
   new-command: ## Description of new command
   	$(call print_status, "Running new command...")
   	@./scripts/new-script.sh
   	$(call print_success, "New command completed")
   ```

2. **Create Supporting Script** (if needed):
   ```bash
   ./scripts/new-script.sh
   ```

3. **Update Documentation**:
   - Add to help text
   - Update this guide
   - Update scripts/README.md

### Best Practices for Extensions

- Follow established patterns
- Include comprehensive error handling
- Add progress indicators for long operations
- Support both interactive and automated usage
- Include help documentation
- Test on multiple platforms

## Conclusion

This automation ecosystem provides a comprehensive development experience for FolioFox, from initial setup through production deployment. The combination of the main Makefile and supporting scripts creates a powerful, user-friendly development environment that:

- **Reduces cognitive load** - Simple commands for complex operations
- **Ensures consistency** - Same commands work everywhere
- **Prevents errors** - Automated quality checks and validations
- **Saves time** - Automated repetitive tasks
- **Improves quality** - Built-in testing and security checks
- **Scales well** - From individual development to team collaboration

Whether you're a new developer getting started or an experienced team member managing releases, these tools provide the automation you need to focus on building great software rather than managing development infrastructure.

For additional help or to contribute improvements, see the individual script documentation in `scripts/README.md` or run `make help` for a quick reference.