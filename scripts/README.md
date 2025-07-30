# FolioFox Scripts Directory

This directory contains automation scripts that complement the main Makefile and provide additional development workflow tools for the FolioFox project.

## Script Overview

### Core Development Scripts

#### `health-check.sh`
Comprehensive health checking for all FolioFox services.

```bash
# Basic health check
./scripts/health-check.sh

# Show detailed service information
./scripts/health-check.sh info

# Continuous monitoring
./scripts/health-check.sh monitor

# Custom configuration
./scripts/health-check.sh --timeout 30 --backend-port 8080
```

**Features:**
- System resource monitoring (disk, memory, CPU)
- Docker service status verification
- Network connectivity testing
- HTTP endpoint health checks
- Redis and PostgreSQL connectivity tests
- Continuous monitoring mode

#### `validate-env.sh`
Validates development environment prerequisites and configuration.

```bash
# Full environment validation
./scripts/validate-env.sh

# Quiet mode (errors only)
./scripts/validate-env.sh --quiet

# Verbose output
./scripts/validate-env.sh --verbose
```

**Validates:**
- Go installation and version (>= 1.21)
- Node.js installation and version (>= 18.0.0)
- Docker installation and version (>= 20.10.0)
- Docker Compose version (>= 2.0.0)
- Development tools (git, make, curl)
- System resources and port availability
- Project structure and dependencies
- Environment configuration files

### Git Workflow Scripts

#### `setup-git-hooks.sh`
Installs and configures Git hooks for automated code quality checks.

```bash
# Install all Git hooks
./scripts/setup-git-hooks.sh install

# Remove Git hooks
./scripts/setup-git-hooks.sh uninstall

# Test hook installation
./scripts/setup-git-hooks.sh test

# Show hook status
./scripts/setup-git-hooks.sh status
```

**Git Hooks Installed:**
- **pre-commit**: Runs linting, formatting, and unit tests
- **pre-push**: Runs comprehensive tests before push
- **commit-msg**: Validates commit message format
- **post-commit**: Provides post-commit feedback and suggestions

**Pre-commit Checks:**
- Go formatting (gofmt)
- Go vet analysis
- Static analysis (staticcheck)
- Security scanning (gosec)
- Go unit tests for affected packages
- TypeScript type checking
- ESLint for frontend files
- Frontend unit tests
- TODO/FIXME comment detection
- Commit message format validation

**Pre-push Checks:**
- Comprehensive test suite for main/master branch
- Basic tests for feature branches
- Build verification
- Large file detection
- Sensitive data pattern matching

### Performance Testing

#### `performance-test.sh`
Comprehensive performance testing including load testing, benchmarks, and profiling.

```bash
# Run all performance tests
./scripts/performance-test.sh all

# Run specific test types
./scripts/performance-test.sh benchmark
./scripts/performance-test.sh frontend
./scripts/performance-test.sh load
./scripts/performance-test.sh profile
./scripts/performance-test.sh container

# Custom configuration
./scripts/performance-test.sh load --duration 60s --connections 20
```

**Test Types:**
- **Go Benchmarks**: CPU and memory benchmarking
- **Frontend Performance**: Vitest performance tests
- **Load Testing**: k6 or curl-based stress testing
- **Profiling**: CPU and memory profiling with pprof
- **Container Analysis**: Docker resource usage monitoring

**Outputs:**
- Detailed performance reports in Markdown format
- JSON and HTML load test results
- Go benchmark results and profiles
- Container resource usage statistics

### CI/CD Validation

#### `ci-check.sh`
Validates CI/CD configuration and simulates GitHub Actions locally.

```bash
# Full CI configuration check
./scripts/ci-check.sh check

# Check specific components
./scripts/ci-check.sh workflows
./scripts/ci-check.sh yaml
./scripts/ci-check.sh backend
./scripts/ci-check.sh frontend
./scripts/ci-check.sh build
./scripts/ci-check.sh docker

# Generate CI status report
./scripts/ci-check.sh report
```

**Validation Checks:**
- GitHub Actions workflow files existence and syntax
- YAML syntax validation
- Docker and docker-compose configuration
- Environment configuration files
- Required dependencies and tools
- Simulates complete CI pipeline locally

**Test Simulations:**
- Backend testing pipeline (Go vet, staticcheck, gosec, tests)
- Frontend testing pipeline (type check, lint, unit/integration tests)
- Build process verification
- Docker image building

## Integration with Makefile

These scripts are integrated with the main Makefile and can be accessed through make targets:

```bash
# Environment validation
make check-env                 # Uses validate-env.sh

# Health checks
make status                    # Includes health-check.sh functionality

# Performance testing  
make perf-test                 # Uses performance-test.sh
make load-test                 # Uses performance-test.sh load

# CI simulation
make ci                        # Uses ci-check.sh for validation
make ci-test                   # Simulates CI test pipeline
make ci-build                  # Simulates CI build pipeline
make ci-security               # Runs security checks
```

## Setup and Configuration

### Initial Setup

1. **Make scripts executable** (done automatically by Makefile):
   ```bash
   chmod +x scripts/*.sh
   ```

2. **Install Git hooks**:
   ```bash
   make install                    # Installs all development tools
   ./scripts/setup-git-hooks.sh    # Or install hooks separately
   ```

3. **Validate environment**:
   ```bash
   make check-env                  # Quick check
   ./scripts/validate-env.sh       # Detailed validation
   ```

### Configuration Files

Scripts use these configuration sources (in order of precedence):

1. **Command-line arguments**: `--option value`
2. **Environment variables**: `VARIABLE_NAME=value`
3. **Project .env file**: `.env` in project root
4. **Script defaults**: Built-in default values

### Common Environment Variables

```bash
# Service URLs
BACKEND_URL=http://localhost:8080
FRONTEND_URL=http://localhost:3000

# Service Ports
FRONTEND_PORT=3000
BACKEND_PORT=8080
REDIS_PORT=6379
POSTGRES_PORT=5432

# Database Configuration
DATABASE_TYPE=sqlite  # or postgres

# Performance Testing
DURATION=30s
CONNECTIONS=10
RPS=100
WARMUP_TIME=10s

# Health Check Configuration
HEALTH_CHECK_TIMEOUT=10
DISK_SPACE_THRESHOLD=85
MEMORY_THRESHOLD=85
MONITOR_INTERVAL=30
```

## Usage Examples

### Development Workflow

```bash
# Complete project setup for new developers
make setup

# Daily development workflow
make dev                        # Start development environment
./scripts/health-check.sh       # Verify everything is working

# Before committing (if hooks aren't installed)
make lint                       # Code quality checks
make test-unit                  # Quick tests
./scripts/ci-check.sh backend   # Simulate CI checks

# Before pushing to main branch
make ci                         # Full CI simulation
./scripts/performance-test.sh   # Performance verification
```

### CI/CD Pipeline

```bash
# Validate CI configuration
./scripts/ci-check.sh check

# Simulate complete CI pipeline
make ci

# Generate CI status report
./scripts/ci-check.sh report
```

### Performance Monitoring

```bash
# Regular performance testing
./scripts/performance-test.sh all --duration 60s

# Load testing specific endpoints
./scripts/performance-test.sh load --backend-url http://staging:8080

# Continuous monitoring
./scripts/health-check.sh monitor
```

### Troubleshooting

```bash
# Comprehensive environment check
./scripts/validate-env.sh --verbose

# Detailed health check
./scripts/health-check.sh info

# Git hooks debugging
./scripts/setup-git-hooks.sh test
./scripts/setup-git-hooks.sh status
```

## Script Dependencies

### Required Tools
- **bash** (>= 4.0)
- **git** (any recent version)
- **curl** (for HTTP requests)
- **docker** and **docker compose** (for container operations)

### Go Development
- **go** (>= 1.21)
- **gofmt** (included with Go)

### Frontend Development
- **node** (>= 18.0.0)
- **npm** (included with Node.js)

### Optional Tools (Enhanced Features)
- **golangci-lint**: Enhanced Go linting
- **staticcheck**: Go static analysis
- **gosec**: Go security scanning
- **k6**: Advanced load testing
- **trivy**: Container security scanning
- **yamllint**: YAML validation
- **jq**: JSON processing

### Installation Commands

```bash
# Install Go tools
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
go install honnef.co/go/tools/cmd/staticcheck@latest
go install github.com/securecodewarrior/gosec/v2/cmd/gosec@latest

# Install k6 (load testing)
# See: https://k6.io/docs/getting-started/installation/

# Install Trivy (container scanning)
# See: https://aquasecurity.github.io/trivy/latest/getting-started/installation/

# Install yamllint
pip install yamllint
# or
sudo apt-get install yamllint  # Ubuntu/Debian
brew install yamllint          # macOS
```

## Extending the Scripts

### Adding New Scripts

1. Create script in `scripts/` directory
2. Make it executable: `chmod +x scripts/new-script.sh`
3. Follow the established patterns:
   - Use the standard color scheme
   - Include help function
   - Support command-line arguments
   - Add logging functions
   - Include error handling

### Script Template

```bash
#!/bin/bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Logging functions
log() { echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1" >&2; }
info() { echo -e "${CYAN}ℹ${NC} $1"; }

# Main function
main() {
    log "Starting script..."
    # Script logic here
    success "Script completed"
}

# Run main function
main "$@"
```

### Integration with Makefile

Add new script targets to the Makefile:

```makefile
.PHONY: new-command
new-command: ## Description of new command
	$(call print_status, "Running new command...")
	@./scripts/new-script.sh
	$(call print_success, "New command completed")
```

## Troubleshooting

### Common Issues

1. **Permission Denied**: Run `chmod +x scripts/*.sh`
2. **Command Not Found**: Install missing dependencies
3. **Docker Not Running**: Start Docker daemon
4. **Port Already in Use**: Configure different ports
5. **Git Hooks Not Working**: Reinstall with `./scripts/setup-git-hooks.sh install --force`

### Debug Mode

Enable debug mode for any script:

```bash
BASH_DEBUG=1 ./scripts/script-name.sh
```

Or add `-x` to the shebang line temporarily:

```bash
#!/bin/bash -x
```

### Getting Help

Each script includes comprehensive help:

```bash
./scripts/script-name.sh --help
```

For Makefile targets:

```bash
make help
```

## Contributing

When adding new scripts or modifying existing ones:

1. Follow the established coding standards
2. Include comprehensive error handling
3. Add appropriate documentation
4. Test on multiple platforms if possible
5. Update this README with new functionality
6. Consider integration with the main Makefile

For more information, see the main project documentation.