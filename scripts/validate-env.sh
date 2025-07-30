#!/bin/bash

# ==================================================================================
# FolioFox Environment Validation Script
# ==================================================================================
# Validates development environment prerequisites and configuration
# ==================================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Version requirements
MIN_GO_VERSION="1.21"
MIN_NODE_VERSION="18.0.0"
MIN_DOCKER_VERSION="20.10.0"
MIN_DOCKER_COMPOSE_VERSION="2.0.0"

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1" >&2
}

info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

# Version comparison function
version_ge() {
    local version1=$1
    local version2=$2
    
    # Remove 'v' prefix if present
    version1=${version1#v}
    version2=${version2#v}
    
    printf '%s\n%s\n' "$version2" "$version1" | sort -V | head -n1 | grep -q "^$version2$"
}

# Check if command exists
check_command() {
    local cmd=$1
    local description=${2:-$cmd}
    
    if command -v "$cmd" &> /dev/null; then
        success "$description is installed"
        return 0
    else
        error "$description is not installed"
        return 1
    fi
}

# Check Go installation and version
check_go() {
    log "Checking Go installation..."
    
    if ! check_command go "Go"; then
        error "Go is required but not installed"
        info "Install Go from: https://golang.org/dl/"
        return 1
    fi
    
    local go_version
    go_version=$(go version | awk '{print $3}' | sed 's/go//')
    
    if version_ge "$go_version" "$MIN_GO_VERSION"; then
        success "Go version $go_version (minimum: $MIN_GO_VERSION)"
    else
        error "Go version $go_version is below minimum required version $MIN_GO_VERSION"
        return 1
    fi
    
    # Check Go environment
    local gopath
    local goroot
    gopath=$(go env GOPATH)
    goroot=$(go env GOROOT)
    
    info "GOPATH: $gopath"
    info "GOROOT: $goroot"
    
    # Check if Go modules are enabled
    if go env GO111MODULE | grep -q "on\|auto"; then
        success "Go modules are enabled"
    else
        warning "Go modules should be enabled for this project"
    fi
    
    return 0
}

# Check Node.js and npm
check_node() {
    log "Checking Node.js installation..."
    
    if ! check_command node "Node.js"; then
        error "Node.js is required but not installed"
        info "Install Node.js from: https://nodejs.org/"
        return 1
    fi
    
    local node_version
    node_version=$(node --version | sed 's/v//')
    
    if version_ge "$node_version" "$MIN_NODE_VERSION"; then
        success "Node.js version v$node_version (minimum: v$MIN_NODE_VERSION)"
    else
        error "Node.js version v$node_version is below minimum required version v$MIN_NODE_VERSION"
        return 1
    fi
    
    if ! check_command npm "npm"; then
        error "npm is required but not installed"
        return 1
    fi
    
    local npm_version
    npm_version=$(npm --version)
    success "npm version $npm_version"
    
    return 0
}

# Check Docker installation and version
check_docker() {
    log "Checking Docker installation..."
    
    if ! check_command docker "Docker"; then
        error "Docker is required but not installed"
        info "Install Docker from: https://docs.docker.com/get-docker/"
        return 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        info "Start Docker daemon: sudo systemctl start docker"
        return 1
    fi
    
    local docker_version
    docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')
    
    if version_ge "$docker_version" "$MIN_DOCKER_VERSION"; then
        success "Docker version $docker_version (minimum: $MIN_DOCKER_VERSION)"
    else
        error "Docker version $docker_version is below minimum required version $MIN_DOCKER_VERSION"
        return 1
    fi
    
    # Check Docker Compose
    if docker compose version &> /dev/null; then
        local compose_version
        compose_version=$(docker compose version --short)
        
        if version_ge "$compose_version" "$MIN_DOCKER_COMPOSE_VERSION"; then
            success "Docker Compose version $compose_version (minimum: $MIN_DOCKER_COMPOSE_VERSION)"
        else
            error "Docker Compose version $compose_version is below minimum required version $MIN_DOCKER_COMPOSE_VERSION"
            return 1
        fi
    else
        error "Docker Compose is not available"
        info "Docker Compose v2 is required (should be included with Docker)"
        return 1
    fi
    
    # Check if user is in docker group (Linux only)
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if groups "$USER" | grep -q docker; then
            success "User $USER is in docker group"
        else
            warning "User $USER is not in docker group"
            info "Add user to docker group: sudo usermod -aG docker $USER"
            info "Then log out and back in"
        fi
    fi
    
    return 0
}

# Check development tools
check_dev_tools() {
    log "Checking development tools..."
    
    local exit_code=0
    
    # Check Git
    if check_command git "Git"; then
        local git_version
        git_version=$(git --version | awk '{print $3}')
        info "Git version $git_version"
    else
        error "Git is required for version control"
        exit_code=1
    fi
    
    # Check Make
    if check_command make "Make"; then
        local make_version
        make_version=$(make --version | head -n1 | awk '{print $3}')
        info "Make version $make_version"
    else
        warning "Make is recommended for using the Makefile"
    fi
    
    # Check curl
    if ! check_command curl "curl"; then
        warning "curl is recommended for health checks and API testing"
    fi
    
    # Check jq (optional but useful)
    if check_command jq "jq"; then
        local jq_version
        jq_version=$(jq --version | sed 's/jq-//')
        info "jq version $jq_version"
    else
        info "jq is optional but recommended for JSON processing"
    fi
    
    return $exit_code
}

# Check optional tools
check_optional_tools() {
    log "Checking optional development tools..."
    
    # Go tools
    if command -v golangci-lint &> /dev/null; then
        success "golangci-lint is installed"
    else
        info "golangci-lint is recommended for Go linting"
        info "Install: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest"
    fi
    
    if command -v staticcheck &> /dev/null; then
        success "staticcheck is installed"
    else
        info "staticcheck is recommended for Go static analysis"
        info "Install: go install honnef.co/go/tools/cmd/staticcheck@latest"
    fi
    
    if command -v gosec &> /dev/null; then
        success "gosec is installed"
    else
        info "gosec is recommended for Go security scanning"
        info "Install: go install github.com/securecodewarrior/gosec/v2/cmd/gosec@latest"
    fi
    
    # Security tools
    if command -v trivy &> /dev/null; then
        success "Trivy is installed for container scanning"
    else
        info "Trivy is recommended for container security scanning"
        info "Install: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
    fi
    
    # Performance tools
    if command -v k6 &> /dev/null; then
        success "k6 is installed for load testing"
    else
        info "k6 is recommended for load testing"
        info "Install: https://k6.io/docs/getting-started/installation/"
    fi
}

# Check system resources
check_system_resources() {
    log "Checking system resources..."
    
    # Check available memory
    if command -v free &> /dev/null; then
        local total_mem
        local available_mem
        total_mem=$(free -h | grep Mem | awk '{print $2}')
        available_mem=$(free -h | grep Mem | awk '{print $7}')
        
        info "Total memory: $total_mem"
        info "Available memory: $available_mem"
        
        # Check if we have at least 4GB total memory
        local total_mem_gb
        total_mem_gb=$(free -g | grep Mem | awk '{print $2}')
        
        if [[ $total_mem_gb -ge 4 ]]; then
            success "Memory: ${total_mem_gb}GB (recommended: 4GB+)"
        else
            warning "Memory: ${total_mem_gb}GB (recommended: 4GB+)"
        fi
    fi
    
    # Check available disk space
    local available_space
    available_space=$(df -h . | tail -1 | awk '{print $4}')
    local used_percentage
    used_percentage=$(df . | tail -1 | awk '{print $5}' | sed 's/%//')
    
    info "Available disk space: $available_space"
    
    if [[ $used_percentage -lt 85 ]]; then
        success "Disk usage: ${used_percentage}% (recommended: <85%)"
    else
        warning "Disk usage: ${used_percentage}% (recommended: <85%)"
    fi
    
    # Check CPU
    if command -v nproc &> /dev/null; then
        local cpu_cores
        cpu_cores=$(nproc)
        info "CPU cores: $cpu_cores"
        
        if [[ $cpu_cores -ge 2 ]]; then
            success "CPU cores: $cpu_cores (recommended: 2+)"
        else
            warning "CPU cores: $cpu_cores (recommended: 2+)"
        fi
    fi
}

# Check port availability
check_ports() {
    log "Checking port availability..."
    
    local ports=(3000 8080 6379 5432 9000 9090 3001)
    local used_ports=()
    
    for port in "${ports[@]}"; do
        if ss -tulpn 2>/dev/null | grep -q ":$port "; then
            used_ports+=("$port")
        fi
    done
    
    if [[ ${#used_ports[@]} -eq 0 ]]; then
        success "All required ports are available"
    else
        warning "The following ports are in use: ${used_ports[*]}"
        info "You may need to configure different ports in the .env file"
    fi
}

# Check project structure
check_project_structure() {
    log "Checking project structure..."
    
    local required_dirs=(
        "cmd/foliofox"
        "internal"
        "frontend"
        "database"
        "scripts"
    )
    
    local required_files=(
        "go.mod"
        "go.sum"
        "docker-compose.yml"
        "Dockerfile.backend"
        "Dockerfile.frontend"
        "frontend/package.json"
        "Makefile"
    )
    
    local missing_dirs=()
    local missing_files=()
    
    # Check directories
    for dir in "${required_dirs[@]}"; do
        if [[ ! -d "$PROJECT_ROOT/$dir" ]]; then
            missing_dirs+=("$dir")
        fi
    done
    
    # Check files
    for file in "${required_files[@]}"; do
        if [[ ! -f "$PROJECT_ROOT/$file" ]]; then
            missing_files+=("$file")
        fi
    done
    
    if [[ ${#missing_dirs[@]} -eq 0 && ${#missing_files[@]} -eq 0 ]]; then
        success "Project structure is complete"
    else
        if [[ ${#missing_dirs[@]} -gt 0 ]]; then
            error "Missing directories: ${missing_dirs[*]}"
        fi
        if [[ ${#missing_files[@]} -gt 0 ]]; then
            error "Missing files: ${missing_files[*]}"
        fi
        return 1
    fi
    
    return 0
}

# Check Go dependencies
check_go_dependencies() {
    log "Checking Go dependencies..."
    
    if [[ ! -f "$PROJECT_ROOT/go.mod" ]]; then
        error "go.mod file not found"
        return 1
    fi
    
    cd "$PROJECT_ROOT"
    
    if go mod verify &> /dev/null; then
        success "Go modules are valid"
    else
        error "Go modules verification failed"
        info "Run 'go mod tidy' to fix dependency issues"
        return 1
    fi
    
    return 0
}

# Check Node dependencies
check_node_dependencies() {
    log "Checking Node.js dependencies..."
    
    if [[ ! -f "$PROJECT_ROOT/frontend/package.json" ]]; then
        error "frontend/package.json file not found"
        return 1
    fi
    
    if [[ -f "$PROJECT_ROOT/frontend/package-lock.json" ]]; then
        success "package-lock.json exists"
    else
        warning "package-lock.json not found (run 'npm install' in frontend directory)"
    fi
    
    if [[ -d "$PROJECT_ROOT/frontend/node_modules" ]]; then
        success "node_modules directory exists"
    else
        warning "node_modules directory not found (run 'npm install' in frontend directory)"
    fi
    
    return 0
}

# Check environment file
check_env_file() {
    log "Checking environment configuration..."
    
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        success ".env file exists"
        
        # Check for required environment variables
        local required_vars=(
            "FRONTEND_PORT"
            "BACKEND_PORT"
            "JWT_SECRET"
            "REDIS_PASSWORD"
        )
        
        local missing_vars=()
        
        for var in "${required_vars[@]}"; do
            if ! grep -q "^$var=" "$PROJECT_ROOT/.env" 2>/dev/null; then
                missing_vars+=("$var")
            fi
        done
        
        if [[ ${#missing_vars[@]} -eq 0 ]]; then
            success "Required environment variables are set"
        else
            warning "Missing environment variables: ${missing_vars[*]}"
            info "Run 'make create-env' to generate a complete .env file"
        fi
    else
        warning ".env file not found"
        info "Run 'make create-env' to create the environment file"
    fi
}

# Main validation function
perform_validation() {
    local exit_code=0
    
    echo -e "${WHITE}FolioFox Environment Validation${NC}"
    echo -e "${CYAN}$(date)${NC}"
    echo ""
    
    # Core requirements
    check_go || exit_code=1
    echo ""
    
    check_node || exit_code=1
    echo ""
    
    check_docker || exit_code=1
    echo ""
    
    check_dev_tools || exit_code=1
    echo ""
    
    # System checks
    check_system_resources
    echo ""
    
    check_ports
    echo ""
    
    # Project checks
    check_project_structure || exit_code=1
    echo ""
    
    check_go_dependencies || exit_code=1
    echo ""
    
    check_node_dependencies
    echo ""
    
    check_env_file
    echo ""
    
    # Optional tools
    check_optional_tools
    echo ""
    
    # Summary
    if [[ $exit_code -eq 0 ]]; then
        echo -e "${GREEN}🎉 Environment validation passed!${NC}"
        echo -e "${CYAN}Your development environment is ready for FolioFox development.${NC}"
    else
        echo -e "${RED}⚠️  Environment validation failed!${NC}"
        echo -e "${YELLOW}Please fix the issues above before continuing.${NC}"
    fi
    
    return $exit_code
}

# Show help
show_help() {
    cat << EOF
FolioFox Environment Validation Script

Usage: $0 [OPTIONS]

Options:
    --fix           Attempt to automatically fix issues
    --quiet         Suppress non-error output
    --verbose       Show detailed output
    --help          Show this help message

This script validates:
- Go installation and version (>= $MIN_GO_VERSION)
- Node.js installation and version (>= $MIN_NODE_VERSION)
- Docker installation and version (>= $MIN_DOCKER_VERSION)
- Docker Compose version (>= $MIN_DOCKER_COMPOSE_VERSION)
- Development tools (git, make, curl)
- System resources (memory, disk, CPU)
- Port availability
- Project structure
- Dependencies (Go modules, npm packages)
- Environment configuration

EOF
}

# Parse command line arguments
FIX_ISSUES=false
QUIET=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --fix)
            FIX_ISSUES=true
            shift
            ;;
        --quiet)
            QUIET=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Set logging based on quiet/verbose flags
if [[ "$QUIET" == "true" ]]; then
    # Redirect info and log to /dev/null in quiet mode
    log() { :; }
    info() { :; }
fi

# Main execution
perform_validation