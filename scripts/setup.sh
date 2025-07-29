#!/bin/bash

# FolioFox Quick Setup Script
# This script automates the initial setup and deployment of FolioFox

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="${INSTALL_DIR:-$PROJECT_ROOT}"

# Default configuration
DEFAULT_FRONTEND_PORT=3000
DEFAULT_BACKEND_PORT=8080
DEFAULT_DATABASE_TYPE="sqlite"
DEFAULT_DEPLOYMENT_TYPE="core"

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

prompt() {
    echo -e "${PURPLE}?${NC} $1"
}

# Banner
show_banner() {
    echo -e "${PURPLE}"
    cat << "EOF"
  ______    _ _       ______         
 |  ____|  | (_)     |  ____|        
 | |__ ___ | |_  ___ | |__ _____  __ 
 |  __/ _ \| | |/ _ \|  __/ _ \ \/ / 
 | | | (_) | | | (_) | | | (_) >  <  
 |_|  \___/|_|_|\___/|_|  \___/_/\_\ 
                                     
    eBook Management System
    Self-Hosted Setup Script
EOF
    echo -e "${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root for security reasons."
        error "Please run as a regular user with sudo privileges."
        exit 1
    fi
}

# Check system requirements
check_requirements() {
    log "Checking system requirements..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first:"
        echo "  Ubuntu/Debian: curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh"
        echo "  CentOS/RHEL: sudo dnf install docker docker-compose-plugin"
        exit 1
    fi
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        error "Docker Compose is not available. Please update Docker to include Compose V2."
        exit 1
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running. Please start Docker:"
        echo "  sudo systemctl start docker"
        exit 1
    fi
    
    # Check if user is in docker group
    if ! groups "$USER" | grep -q docker; then
        warning "User $USER is not in the docker group."
        warning "You may need to run: sudo usermod -aG docker $USER"
        warning "Then log out and back in."
    fi
    
    # Check available ports
    local ports_to_check=(3000 8080 9000 9090 3001)
    local used_ports=()
    
    for port in "${ports_to_check[@]}"; do
        if ss -tulpn | grep -q ":$port "; then
            used_ports+=("$port")
        fi
    done
    
    if [ ${#used_ports[@]} -gt 0 ]; then
        warning "The following ports are already in use: ${used_ports[*]}"
        warning "You may need to configure different ports in the .env file."
    fi
    
    # Check available disk space
    local available_space
    available_space=$(df "$PROJECT_ROOT" | tail -1 | awk '{print $4}')
    local required_space=5242880  # 5GB in KB
    
    if [ "$available_space" -lt "$required_space" ]; then
        warning "Less than 5GB of free space available. Consider freeing up disk space."
    fi
    
    success "System requirements check completed."
}

# Interactive configuration
configure_deployment() {
    log "Starting interactive configuration..."
    
    # Deployment type
    prompt "Select deployment type:"
    echo "  1) Core (Backend, Frontend, Redis, Database)"
    echo "  2) Full (Core + Portainer management)"
    echo "  3) Complete (Full + Monitoring stack)"
    echo "  4) Custom (Choose individual components)"
    
    local deployment_choice
    read -p "Enter choice [1-4] (default: 1): " deployment_choice
    deployment_choice=${deployment_choice:-1}
    
    case $deployment_choice in
        1) DEPLOYMENT_TYPE="core" ;;
        2) DEPLOYMENT_TYPE="full" ;;
        3) DEPLOYMENT_TYPE="complete" ;;
        4) DEPLOYMENT_TYPE="custom" ;;
        *) 
            warning "Invalid choice, using core deployment."
            DEPLOYMENT_TYPE="core"
            ;;
    esac
    
    # Database type
    prompt "Select database type:"
    echo "  1) SQLite (Recommended for small deployments)"
    echo "  2) PostgreSQL (Recommended for production)"
    
    local db_choice
    read -p "Enter choice [1-2] (default: 1): " db_choice
    db_choice=${db_choice:-1}
    
    case $db_choice in
        1) DATABASE_TYPE="sqlite" ;;
        2) DATABASE_TYPE="postgres" ;;
        *) 
            warning "Invalid choice, using SQLite."
            DATABASE_TYPE="sqlite"
            ;;
    esac
    
    # Ports configuration
    read -p "Frontend port (default: $DEFAULT_FRONTEND_PORT): " FRONTEND_PORT
    FRONTEND_PORT=${FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}
    
    read -p "Backend port (default: $DEFAULT_BACKEND_PORT): " BACKEND_PORT
    BACKEND_PORT=${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}
    
    # Domain configuration (for production)
    if [[ "$DEPLOYMENT_TYPE" == "complete" ]]; then
        read -p "Domain name (leave empty for localhost): " DOMAIN_NAME
        if [[ -n "$DOMAIN_NAME" ]]; then
            read -p "Email for Let's Encrypt certificates: " ACME_EMAIL
        fi
    fi
    
    success "Configuration completed."
}

# Generate secure passwords
generate_passwords() {
    log "Generating secure passwords..."
    
    # Generate JWT secret (64 characters)
    JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
    
    # Generate database passwords
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
    GRAFANA_PASSWORD=$(openssl rand -base64 16 | tr -d '\n')
    
    success "Secure passwords generated."
}

# Create environment file
create_env_file() {
    log "Creating environment configuration..."
    
    local env_file="$PROJECT_ROOT/.env"
    
    cat > "$env_file" << EOF
# FolioFox Configuration - Generated by setup script
# Generated on: $(date)

# ==============================================
# Application Configuration
# ==============================================
COMPOSE_PROJECT_NAME=foliofox
BUILD_VERSION=latest

# ==============================================
# Network Configuration
# ==============================================
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PORT=$BACKEND_PORT

# ==============================================
# Database Configuration
# ==============================================
DATABASE_TYPE=$DATABASE_TYPE
EOF

    if [[ "$DATABASE_TYPE" == "postgres" ]]; then
        cat >> "$env_file" << EOF
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=foliofox
POSTGRES_USER=foliofox
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
EOF
    else
        cat >> "$env_file" << EOF
DATABASE_PATH=/app/data/foliofox.db
EOF
    fi
    
    cat >> "$env_file" << EOF

# ==============================================
# Redis Configuration
# ==============================================
REDIS_ADDR=redis:6379
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_DB=0

# ==============================================
# Security Configuration
# ==============================================
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=24h

# ==============================================
# Application Settings
# ==============================================
GIN_MODE=release
LOG_LEVEL=info
LOG_FORMAT=json

# Download Configuration
MAX_CONCURRENT_DOWNLOADS=5
DOWNLOAD_TIMEOUT=300s

# Search Configuration
SEARCH_CACHE_TTL=300
MAX_SEARCH_RESULTS=1000

# ==============================================
# Volume Paths
# ==============================================
DATA_DIR=./data
LOGS_DIR=./logs
DOWNLOADS_DIR=./downloads
CONFIG_DIR=./config
BACKUP_DIR=./backups

# ==============================================
# Backup Configuration
# ==============================================
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
EOF

    if [[ "$DEPLOYMENT_TYPE" == "complete" ]]; then
        cat >> "$env_file" << EOF

# ==============================================
# Monitoring Configuration
# ==============================================
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
GRAFANA_USER=admin
GRAFANA_PASSWORD=$GRAFANA_PASSWORD
EOF
    fi
    
    if [[ -n "${DOMAIN_NAME:-}" ]]; then
        cat >> "$env_file" << EOF

# ==============================================
# SSL/TLS Configuration
# ==============================================
TRAEFIK_DOMAIN=$DOMAIN_NAME
ACME_EMAIL=${ACME_EMAIL:-admin@$DOMAIN_NAME}
HTTPS_ENABLED=true
EOF
    fi
    
    success "Environment file created at $env_file"
}

# Create directory structure
create_directories() {
    log "Creating directory structure..."
    
    local dirs=(
        "data/postgres"
        "data/redis" 
        "data/app"
        "data/prometheus"
        "data/grafana"
        "data/letsencrypt"
        "logs/app"
        "downloads"
        "config"
        "backups"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$PROJECT_ROOT/$dir"
    done
    
    # Set proper permissions
    # UID 1001 is used by the FolioFox containers
    if command -v sudo &> /dev/null; then
        sudo chown -R 1001:1001 "$PROJECT_ROOT/data" "$PROJECT_ROOT/logs" "$PROJECT_ROOT/downloads" 2>/dev/null || true
    fi
    
    success "Directory structure created."
}

# Create systemd service (optional)
create_systemd_service() {
    if [[ "$1" == "yes" ]]; then
        log "Creating systemd service..."
        
        local service_file="/tmp/foliofox.service"
        
        cat > "$service_file" << EOF
[Unit]
Description=FolioFox eBook Management System
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PROJECT_ROOT
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
        
        if sudo cp "$service_file" /etc/systemd/system/foliofox.service; then
            sudo systemctl daemon-reload
            sudo systemctl enable foliofox.service
            success "Systemd service created and enabled."
            info "Use 'sudo systemctl start foliofox' to start the service."
        else
            warning "Could not create systemd service. You'll need to start FolioFox manually."
        fi
        
        rm -f "$service_file"
    fi
}

# Pull Docker images
pull_images() {
    log "Pulling Docker images..."
    
    cd "$PROJECT_ROOT"
    
    case $DEPLOYMENT_TYPE in
        "core")
            docker compose pull backend frontend redis
            if [[ "$DATABASE_TYPE" == "postgres" ]]; then
                docker compose --profile postgres pull
            fi
            ;;
        "full")
            docker compose --profile management pull
            ;;
        "complete")
            docker compose -f docker-compose.yml -f docker-compose.monitoring.yml pull
            ;;
    esac
    
    success "Docker images pulled successfully."
}

# Start services
start_services() {
    log "Starting FolioFox services..."
    
    cd "$PROJECT_ROOT"
    
    case $DEPLOYMENT_TYPE in
        "core")
            if [[ "$DATABASE_TYPE" == "postgres" ]]; then
                docker compose --profile postgres up -d
            else
                docker compose up -d backend frontend redis
            fi
            ;;
        "full")
            docker compose --profile management up -d
            ;;
        "complete")
            docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
            ;;
    esac
    
    success "Services started successfully."
}

# Wait for services to be ready
wait_for_services() {
    log "Waiting for services to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:$FRONTEND_PORT/health" > /dev/null && \
           curl -s "http://localhost:$BACKEND_PORT/api/v1/health" > /dev/null; then
            success "All services are ready!"
            return 0
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    warning "Services may still be starting. Please check logs if needed:"
    echo "  docker compose logs"
}

# Display final information
show_completion_info() {
    echo
    success "🎉 FolioFox installation completed successfully!"
    echo
    
    info "Access Information:"
    echo "  Frontend:  http://localhost:$FRONTEND_PORT"
    echo "  Backend:   http://localhost:$BACKEND_PORT"
    
    if [[ "$DEPLOYMENT_TYPE" == "full" || "$DEPLOYMENT_TYPE" == "complete" ]]; then
        echo "  Portainer: http://localhost:9000"
    fi
    
    if [[ "$DEPLOYMENT_TYPE" == "complete" ]]; then
        echo "  Grafana:   http://localhost:3001 (admin / $GRAFANA_PASSWORD)"
        echo "  Prometheus: http://localhost:9090"
    fi
    
    echo
    info "Useful Commands:"
    echo "  View logs:     docker compose logs"
    echo "  Stop services: docker compose down"
    echo "  Restart:       docker compose restart"
    echo "  Update:        docker compose pull && docker compose up -d"
    echo
    
    info "Backup and Maintenance:"
    echo "  Create backup: ./scripts/backup/backup.sh backup"
    echo "  List backups:  ./scripts/backup/backup.sh list"
    echo "  Health check:  curl http://localhost:$BACKEND_PORT/api/v1/health"
    echo
    
    info "Configuration:"
    echo "  Environment file: ./.env"
    echo "  Data directory:   ./data"
    echo "  Downloads:        ./downloads"
    echo "  Logs:            ./logs"
    echo
    
    if [[ -n "${DOMAIN_NAME:-}" ]]; then
        info "SSL/TLS Setup:"
        echo "  Your domain: https://$DOMAIN_NAME"
        echo "  Make sure DNS points to this server's IP address"
        echo "  SSL certificates will be automatically obtained from Let's Encrypt"
        echo
    fi
    
    info "For detailed documentation, see: ./DEPLOYMENT.md"
    
    warning "Important Security Notes:"
    echo "  1. Change default passwords in the .env file"
    echo "  2. Configure firewall to restrict access"
    echo "  3. Set up regular backups"
    echo "  4. Keep Docker and images updated"
    echo
    
    success "Happy reading! 📚"
}

# Cleanup on exit
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        error "Setup failed with exit code $exit_code"
        echo
        echo "Troubleshooting tips:"
        echo "  1. Check Docker is running: docker info"
        echo "  2. Check port availability: ss -tulpn | grep -E ':(3000|8080)'"
        echo "  3. Check logs: docker compose logs"
        echo "  4. Try manual setup following DEPLOYMENT.md"
    fi
}

# Help function
show_help() {
    cat << EOF
FolioFox Setup Script

Usage: $0 [OPTIONS]

Options:
    -h, --help              Show this help message
    -d, --dir DIR           Installation directory (default: current directory)
    -t, --type TYPE         Deployment type: core, full, complete (default: core)
    --database TYPE         Database type: sqlite, postgres (default: sqlite)
    --frontend-port PORT    Frontend port (default: 3000)
    --backend-port PORT     Backend port (default: 8080)
    --domain DOMAIN         Domain name for SSL setup
    --email EMAIL           Email for Let's Encrypt certificates
    --service               Create systemd service
    --unattended            Run without interactive prompts
    --skip-pull             Skip pulling Docker images
    --skip-start            Skip starting services

Examples:
    $0                                          # Interactive setup
    $0 --unattended --type complete             # Complete setup without prompts
    $0 --domain foliofox.example.com            # Setup with SSL
    $0 --database postgres --service            # PostgreSQL with systemd service

EOF
}

# Parse command line arguments
parse_args() {
    INTERACTIVE=true
    CREATE_SERVICE=false
    SKIP_PULL=false
    SKIP_START=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -d|--dir)
                INSTALL_DIR="$2"
                shift 2
                ;;
            -t|--type)
                DEPLOYMENT_TYPE="$2"
                shift 2
                ;;
            --database)
                DATABASE_TYPE="$2"
                shift 2
                ;;
            --frontend-port)
                FRONTEND_PORT="$2"
                shift 2
                ;;
            --backend-port)
                BACKEND_PORT="$2"
                shift 2
                ;;
            --domain)
                DOMAIN_NAME="$2"
                shift 2
                ;;
            --email)
                ACME_EMAIL="$2"
                shift 2
                ;;
            --service)
                CREATE_SERVICE=true
                shift
                ;;
            --unattended)
                INTERACTIVE=false
                shift
                ;;
            --skip-pull)
                SKIP_PULL=true
                shift
                ;;
            --skip-start)
                SKIP_START=true
                shift
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Set defaults for unattended mode
    if [[ "$INTERACTIVE" == "false" ]]; then
        FRONTEND_PORT=${FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}
        BACKEND_PORT=${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}
        DATABASE_TYPE=${DATABASE_TYPE:-$DEFAULT_DATABASE_TYPE}
        DEPLOYMENT_TYPE=${DEPLOYMENT_TYPE:-$DEFAULT_DEPLOYMENT_TYPE}
    fi
}

# Main function
main() {
    trap cleanup EXIT
    
    parse_args "$@"
    
    show_banner
    log "Starting FolioFox setup..."
    
    check_root
    check_requirements
    
    if [[ "$INTERACTIVE" == "true" ]]; then
        configure_deployment
    fi
    
    # Ask about systemd service in interactive mode
    if [[ "$INTERACTIVE" == "true" && "$CREATE_SERVICE" == "false" ]]; then
        read -p "Create systemd service for auto-start? [y/N]: " create_service_choice
        if [[ "$create_service_choice" =~ ^[Yy]$ ]]; then
            CREATE_SERVICE=true
        fi
    fi
    
    generate_passwords
    create_env_file
    create_directories
    
    if [[ "$CREATE_SERVICE" == "true" ]]; then
        create_systemd_service "yes"
    fi
    
    if [[ "$SKIP_PULL" == "false" ]]; then
        pull_images
    fi
    
    if [[ "$SKIP_START" == "false" ]]; then
        start_services
        wait_for_services
    fi
    
    show_completion_info
}

# Run main function
main "$@"