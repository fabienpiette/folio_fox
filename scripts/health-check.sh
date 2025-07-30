#!/bin/bash

# ==================================================================================
# FolioFox Health Check Script
# ==================================================================================
# Comprehensive health checking for all FolioFox services
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
FRONTEND_PORT=${FRONTEND_PORT:-3000}
BACKEND_PORT=${BACKEND_PORT:-8080}
REDIS_PORT=${REDIS_PORT:-6379}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
TIMEOUT=${HEALTH_CHECK_TIMEOUT:-10}

# Health check endpoints
BACKEND_HEALTH_URL="http://localhost:${BACKEND_PORT}/api/v1/health"
FRONTEND_HEALTH_URL="http://localhost:${FRONTEND_PORT}/health"

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

# Check if port is open
check_port() {
    local host=${1:-localhost}
    local port=$2
    local service_name=${3:-"Service"}
    
    if timeout $TIMEOUT bash -c "cat < /dev/null > /dev/tcp/$host/$port" 2>/dev/null; then
        success "$service_name port $port is open"
        return 0
    else
        error "$service_name port $port is not accessible"
        return 1
    fi
}

# Check HTTP endpoint
check_http() {
    local url=$1
    local service_name=${2:-"Service"}
    local expected_status=${3:-200}
    
    local response
    local status_code
    
    if response=$(curl -s -w "%{http_code}" --max-time $TIMEOUT "$url" 2>/dev/null); then
        status_code=${response: -3}
        
        if [[ "$status_code" == "$expected_status" ]]; then
            success "$service_name HTTP endpoint is healthy (Status: $status_code)"
            return 0
        else
            error "$service_name HTTP endpoint returned status $status_code (expected $expected_status)"
            return 1
        fi
    else
        error "$service_name HTTP endpoint is not accessible"
        return 1
    fi
}

# Check Docker service
check_docker_service() {
    local service_name=$1
    
    if docker compose ps --services --filter "status=running" | grep -q "^$service_name$"; then
        if [[ $(docker compose ps $service_name --format "table {{.State}}" | tail -n +2) == "running" ]]; then
            success "Docker service '$service_name' is running"
            return 0
        else
            error "Docker service '$service_name' is not running"
            return 1
        fi
    else
        error "Docker service '$service_name' is not found or not running"
        return 1
    fi
}

# Check Redis connectivity
check_redis() {
    local redis_host=${1:-localhost}
    local redis_port=${2:-6379}
    
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h $redis_host -p $redis_port ping | grep -q "PONG"; then
            success "Redis is responding to ping"
            return 0
        else
            error "Redis is not responding to ping"
            return 1
        fi
    else
        # Fallback: check if we can connect to Redis via Docker
        if docker compose exec redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
            success "Redis is responding to ping (via Docker)"
            return 0
        else
            error "Redis is not responding to ping"
            return 1
        fi
    fi
}

# Check PostgreSQL connectivity (if using PostgreSQL)
check_postgres() {
    local postgres_host=${1:-localhost}
    local postgres_port=${2:-5432}
    local postgres_db=${POSTGRES_DB:-foliofox}
    local postgres_user=${POSTGRES_USER:-foliofox}
    
    if docker compose exec postgres pg_isready -h $postgres_host -p $postgres_port -U $postgres_user -d $postgres_db 2>/dev/null; then
        success "PostgreSQL is ready"
        return 0
    else
        error "PostgreSQL is not ready"
        return 1
    fi
}

# Check disk space
check_disk_space() {
    local threshold=${DISK_SPACE_THRESHOLD:-85}
    local current_usage
    
    current_usage=$(df . | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [[ $current_usage -lt $threshold ]]; then
        success "Disk space usage: ${current_usage}% (threshold: ${threshold}%)"
        return 0
    else
        warning "Disk space usage: ${current_usage}% exceeds threshold of ${threshold}%"
        return 1
    fi
}

# Check memory usage
check_memory() {
    local threshold=${MEMORY_THRESHOLD:-85}
    local current_usage
    
    if command -v free &> /dev/null; then
        current_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
        
        if [[ $current_usage -lt $threshold ]]; then
            success "Memory usage: ${current_usage}% (threshold: ${threshold}%)"
            return 0
        else
            warning "Memory usage: ${current_usage}% exceeds threshold of ${threshold}%"
            return 1
        fi
    else
        info "Memory check skipped (free command not available)"
        return 0
    fi
}

# Check Docker daemon
check_docker() {
    if docker info &> /dev/null; then
        success "Docker daemon is running"
        return 0
    else
        error "Docker daemon is not running"
        return 1
    fi
}

# Main health check function
perform_health_check() {
    local exit_code=0
    
    echo -e "${WHITE}FolioFox Health Check${NC}"
    echo -e "${CYAN}$(date)${NC}"
    echo ""
    
    log "Checking system resources..."
    check_disk_space || exit_code=1
    check_memory || exit_code=1
    echo ""
    
    log "Checking Docker..."
    check_docker || exit_code=1
    echo ""
    
    log "Checking Docker services..."
    if docker compose ps &> /dev/null; then
        check_docker_service "backend" || exit_code=1
        check_docker_service "frontend" || exit_code=1
        check_docker_service "redis" || exit_code=1
        
        # Check PostgreSQL if it's running
        if docker compose ps postgres &> /dev/null && [[ $(docker compose ps postgres --format "table {{.State}}" | tail -n +2) == "running" ]]; then
            check_docker_service "postgres" || exit_code=1
        fi
    else
        warning "Docker Compose services are not running"
        exit_code=1
    fi
    echo ""
    
    log "Checking network connectivity..."
    check_port localhost $BACKEND_PORT "Backend" || exit_code=1
    check_port localhost $FRONTEND_PORT "Frontend" || exit_code=1
    check_port localhost $REDIS_PORT "Redis" || exit_code=1
    echo ""
    
    log "Checking service endpoints..."
    check_http "$BACKEND_HEALTH_URL" "Backend API" || exit_code=1
    check_http "$FRONTEND_HEALTH_URL" "Frontend" || exit_code=1
    echo ""
    
    log "Checking service connectivity..."
    check_redis localhost $REDIS_PORT || exit_code=1
    
    # Check PostgreSQL if it's configured
    if [[ "${DATABASE_TYPE:-sqlite}" == "postgres" ]]; then
        check_postgres localhost $POSTGRES_PORT || exit_code=1
    fi
    echo ""
    
    # Summary
    if [[ $exit_code -eq 0 ]]; then
        echo -e "${GREEN}🎉 All health checks passed!${NC}"
    else
        echo -e "${RED}⚠️  Some health checks failed!${NC}"
    fi
    
    return $exit_code
}

# Show detailed service information
show_service_info() {
    echo -e "${WHITE}Service Information${NC}"
    echo ""
    
    if docker compose ps &> /dev/null; then
        echo -e "${CYAN}Docker Services:${NC}"
        docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        
        echo -e "${CYAN}Service Health:${NC}"
        for service in backend frontend redis postgres; do
            if docker compose ps $service &> /dev/null 2>&1; then
                local health=$(docker compose ps $service --format "table {{.Status}}" | tail -n +2)
                if [[ $health == *"healthy"* ]]; then
                    echo -e "  ${GREEN}✓${NC} $service: $health"
                elif [[ $health == *"running"* ]]; then
                    echo -e "  ${YELLOW}◐${NC} $service: $health"
                else
                    echo -e "  ${RED}✗${NC} $service: $health"
                fi
            fi
        done
        echo ""
        
        echo -e "${CYAN}Resource Usage:${NC}"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" $(docker compose ps -q)
    else
        warning "Docker Compose services are not running"
    fi
}

# Show help
show_help() {
    cat << EOF
FolioFox Health Check Script

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    check       Perform comprehensive health check (default)
    info        Show detailed service information
    monitor     Continuous monitoring mode
    help        Show this help message

Options:
    --timeout SECONDS       Health check timeout (default: 10)
    --frontend-port PORT    Frontend port (default: 3000)
    --backend-port PORT     Backend port (default: 8080)
    --redis-port PORT       Redis port (default: 6379)
    --postgres-port PORT    PostgreSQL port (default: 5432)
    --quiet                 Suppress non-error output
    --verbose               Show detailed output

Environment Variables:
    FRONTEND_PORT           Frontend port
    BACKEND_PORT            Backend port
    REDIS_PORT              Redis port
    POSTGRES_PORT           PostgreSQL port
    HEALTH_CHECK_TIMEOUT    Health check timeout
    DISK_SPACE_THRESHOLD    Disk space warning threshold (%)
    MEMORY_THRESHOLD        Memory usage warning threshold (%)

Examples:
    $0                      # Run health check
    $0 check --timeout 30   # Run with 30s timeout
    $0 info                 # Show service information
    $0 monitor              # Continuous monitoring

EOF
}

# Monitoring mode
monitoring_mode() {
    local interval=${MONITOR_INTERVAL:-30}
    
    echo -e "${WHITE}Starting continuous monitoring (interval: ${interval}s)${NC}"
    echo "Press Ctrl+C to stop"
    echo ""
    
    while true; do
        clear
        perform_health_check
        echo ""
        echo -e "${CYAN}Next check in ${interval} seconds... (Press Ctrl+C to stop)${NC}"
        sleep $interval
    done
}

# Parse command line arguments
COMMAND="check"
QUIET=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        check|info|monitor|help)
            COMMAND=$1
            shift
            ;;
        --timeout)
            TIMEOUT=$2
            shift 2
            ;;
        --frontend-port)
            FRONTEND_PORT=$2
            shift 2
            ;;
        --backend-port)
            BACKEND_PORT=$2
            shift 2
            ;;
        --redis-port)
            REDIS_PORT=$2
            shift 2
            ;;
        --postgres-port)
            POSTGRES_PORT=$2
            shift 2
            ;;
        --quiet)
            QUIET=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Execute command
case $COMMAND in
    check)
        perform_health_check
        ;;
    info)
        show_service_info
        ;;
    monitor)
        monitoring_mode
        ;;
    help)
        show_help
        ;;
    *)
        error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac