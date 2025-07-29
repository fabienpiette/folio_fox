#!/bin/bash

# FolioFox Backup and Recovery Script
# This script provides comprehensive backup and restore functionality for FolioFox

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="foliofox_backup_$TIMESTAMP"

# S3 Configuration (optional)
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
S3_REGION="${BACKUP_S3_REGION:-us-east-1}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "${BACKUP_DIR}/backup.log"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "${BACKUP_DIR}/backup.log" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "${BACKUP_DIR}/backup.log"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "${BACKUP_DIR}/backup.log"
}

# Check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Check if FolioFox is running
check_foliofox() {
    if ! docker-compose -f "$PROJECT_ROOT/docker-compose.yml" ps | grep -q "Up"; then
        warning "FolioFox containers are not running. Some data may not be available."
    fi
}

# Create backup directory
setup_backup_dir() {
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
    log "Created backup directory: $BACKUP_DIR/$BACKUP_NAME"
}

# Backup PostgreSQL database
backup_postgres() {
    log "Starting PostgreSQL backup..."
    
    local postgres_container
    postgres_container=$(docker-compose -f "$PROJECT_ROOT/docker-compose.yml" ps -q postgres)
    
    if [ -z "$postgres_container" ]; then
        warning "PostgreSQL container not found. Skipping PostgreSQL backup."
        return 0
    fi
    
    local db_name="${POSTGRES_DB:-foliofox}"
    local db_user="${POSTGRES_USER:-foliofox}"
    
    docker exec "$postgres_container" pg_dump -U "$db_user" "$db_name" > "$BACKUP_DIR/$BACKUP_NAME/postgres_dump.sql"
    
    if [ $? -eq 0 ]; then
        success "PostgreSQL backup completed"
    else
        error "PostgreSQL backup failed"
        return 1
    fi
}

# Backup SQLite database
backup_sqlite() {
    log "Starting SQLite backup..."
    
    local app_data_dir="${DATA_DIR:-$PROJECT_ROOT/data}/app"
    
    if [ -f "$app_data_dir/foliofox.db" ]; then
        cp "$app_data_dir/foliofox.db" "$BACKUP_DIR/$BACKUP_NAME/"
        success "SQLite backup completed"
    else
        warning "SQLite database not found at $app_data_dir/foliofox.db"
    fi
}

# Backup Redis data
backup_redis() {
    log "Starting Redis backup..."
    
    local redis_container
    redis_container=$(docker-compose -f "$PROJECT_ROOT/docker-compose.yml" ps -q redis)
    
    if [ -z "$redis_container" ]; then
        warning "Redis container not found. Skipping Redis backup."
        return 0
    fi
    
    # Force Redis to save current state
    docker exec "$redis_container" redis-cli BGSAVE
    
    # Wait for background save to complete
    while [ "$(docker exec "$redis_container" redis-cli LASTSAVE)" = "$(docker exec "$redis_container" redis-cli LASTSAVE)" ]; do
        sleep 1
    done
    
    # Copy Redis dump file
    docker cp "$redis_container:/data/dump.rdb" "$BACKUP_DIR/$BACKUP_NAME/"
    
    if [ $? -eq 0 ]; then
        success "Redis backup completed"
    else
        error "Redis backup failed"
        return 1
    fi
}

# Backup application data
backup_app_data() {
    log "Starting application data backup..."
    
    local data_dirs=(
        "${DATA_DIR:-$PROJECT_ROOT/data}"
        "${LOGS_DIR:-$PROJECT_ROOT/logs}"
        "${DOWNLOADS_DIR:-$PROJECT_ROOT/downloads}"
        "${CONFIG_DIR:-$PROJECT_ROOT/config}"
    )
    
    for dir in "${data_dirs[@]}"; do
        if [ -d "$dir" ]; then
            local dir_name=$(basename "$dir")
            tar -czf "$BACKUP_DIR/$BACKUP_NAME/${dir_name}.tar.gz" -C "$(dirname "$dir")" "$dir_name"
            success "Backed up $dir"
        else
            warning "Directory not found: $dir"
        fi
    done
}

# Backup Docker volumes
backup_volumes() {
    log "Starting Docker volumes backup..."
    
    local volumes=(
        "foliofox-postgres-data"
        "foliofox-redis-data"
        "foliofox-app-data"
        "foliofox-app-logs"
        "foliofox-downloads"
        "foliofox-prometheus-data"
        "foliofox-grafana-data"
    )
    
    for volume in "${volumes[@]}"; do
        if docker volume inspect "$volume" >/dev/null 2>&1; then
            docker run --rm -v "$volume:/data" -v "$BACKUP_DIR/$BACKUP_NAME:/backup" alpine tar czf "/backup/${volume}.tar.gz" -C /data .
            success "Backed up volume: $volume"
        else
            warning "Volume not found: $volume"
        fi
    done
}

# Create backup metadata
create_metadata() {
    log "Creating backup metadata..."
    
    cat > "$BACKUP_DIR/$BACKUP_NAME/metadata.json" <<EOF
{
    "backup_name": "$BACKUP_NAME",
    "timestamp": "$TIMESTAMP",
    "date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "foliofox_version": "$(cd "$PROJECT_ROOT" && git describe --tags --always 2>/dev/null || echo 'unknown')",
    "git_commit": "$(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "backup_size": "$(du -sh "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)",
    "components": {
        "postgres": $([ -f "$BACKUP_DIR/$BACKUP_NAME/postgres_dump.sql" ] && echo "true" || echo "false"),
        "sqlite": $([ -f "$BACKUP_DIR/$BACKUP_NAME/foliofox.db" ] && echo "true" || echo "false"),
        "redis": $([ -f "$BACKUP_DIR/$BACKUP_NAME/dump.rdb" ] && echo "true" || echo "false"),
        "app_data": $([ -f "$BACKUP_DIR/$BACKUP_NAME/data.tar.gz" ] && echo "true" || echo "false"),
        "logs": $([ -f "$BACKUP_DIR/$BACKUP_NAME/logs.tar.gz" ] && echo "true" || echo "false"),
        "downloads": $([ -f "$BACKUP_DIR/$BACKUP_NAME/downloads.tar.gz" ] && echo "true" || echo "false"),
        "config": $([ -f "$BACKUP_DIR/$BACKUP_NAME/config.tar.gz" ] && echo "true" || echo "false")
    }
}
EOF
    
    success "Backup metadata created"
}

# Compress backup
compress_backup() {
    log "Compressing backup..."
    
    cd "$BACKUP_DIR"
    tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
    rm -rf "$BACKUP_NAME"
    
    success "Backup compressed: ${BACKUP_NAME}.tar.gz"
}

# Upload to S3 (if configured)
upload_to_s3() {
    if [ -z "$S3_BUCKET" ]; then
        log "S3 backup not configured. Skipping upload."
        return 0
    fi
    
    log "Uploading backup to S3..."
    
    if command -v aws >/dev/null 2>&1; then
        aws s3 cp "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" "s3://$S3_BUCKET/foliofox-backups/" --region "$S3_REGION"
        success "Backup uploaded to S3"
    else
        error "AWS CLI not found. Please install it to enable S3 backups."
        return 1
    fi
}

# Clean old backups
cleanup_old_backups() {
    log "Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
    
    find "$BACKUP_DIR" -name "foliofox_backup_*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete
    
    # Clean S3 backups if configured
    if [ -n "$S3_BUCKET" ] && command -v aws >/dev/null 2>&1; then
        local cutoff_date
        cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)
        
        aws s3 ls "s3://$S3_BUCKET/foliofox-backups/" --region "$S3_REGION" | while read -r line; do
            local file_date
            file_date=$(echo "$line" | awk '{print $1}')
            local file_name
            file_name=$(echo "$line" | awk '{print $4}')
            
            if [[ "$file_date" < "$cutoff_date" ]]; then
                aws s3 rm "s3://$S3_BUCKET/foliofox-backups/$file_name" --region "$S3_REGION"
                log "Deleted old S3 backup: $file_name"
            fi
        done
    fi
    
    success "Old backups cleaned up"
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log "Starting restore from backup: $backup_file"
    
    # Extract backup
    local restore_dir="$BACKUP_DIR/restore_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$restore_dir"
    tar -xzf "$backup_file" -C "$restore_dir" --strip-components=1
    
    # Stop FolioFox services
    log "Stopping FolioFox services..."
    cd "$PROJECT_ROOT"
    docker-compose down
    
    # Restore data based on what's available
    if [ -f "$restore_dir/postgres_dump.sql" ]; then
        log "Restoring PostgreSQL database..."
        docker-compose up -d postgres
        sleep 10
        local postgres_container
        postgres_container=$(docker-compose ps -q postgres)
        docker exec -i "$postgres_container" psql -U "${POSTGRES_USER:-foliofox}" "${POSTGRES_DB:-foliofox}" < "$restore_dir/postgres_dump.sql"
        docker-compose down
    fi
    
    if [ -f "$restore_dir/foliofox.db" ]; then
        log "Restoring SQLite database..."
        local app_data_dir="${DATA_DIR:-$PROJECT_ROOT/data}/app"
        mkdir -p "$app_data_dir"
        cp "$restore_dir/foliofox.db" "$app_data_dir/"
    fi
    
    # Restore other data
    local restore_mappings=(
        "data.tar.gz:${DATA_DIR:-$PROJECT_ROOT/data}"
        "logs.tar.gz:${LOGS_DIR:-$PROJECT_ROOT/logs}"
        "downloads.tar.gz:${DOWNLOADS_DIR:-$PROJECT_ROOT/downloads}"
        "config.tar.gz:${CONFIG_DIR:-$PROJECT_ROOT/config}"
    )
    
    for mapping in "${restore_mappings[@]}"; do
        local archive="${mapping%:*}"
        local target_dir="${mapping#*:}"
        
        if [ -f "$restore_dir/$archive" ]; then
            log "Restoring $archive to $target_dir"
            mkdir -p "$(dirname "$target_dir")"
            tar -xzf "$restore_dir/$archive" -C "$(dirname "$target_dir")"
        fi
    done
    
    # Start services
    log "Starting FolioFox services..."
    docker-compose up -d
    
    # Cleanup
    rm -rf "$restore_dir"
    
    success "Restore completed successfully"
}

# List available backups
list_backups() {
    log "Available local backups:"
    ls -la "$BACKUP_DIR"/foliofox_backup_*.tar.gz 2>/dev/null || echo "No local backups found"
    
    if [ -n "$S3_BUCKET" ] && command -v aws >/dev/null 2>&1; then
        log "Available S3 backups:"
        aws s3 ls "s3://$S3_BUCKET/foliofox-backups/" --region "$S3_REGION" 2>/dev/null || echo "No S3 backups found or AWS CLI not configured"
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log "Verifying backup integrity: $backup_file"
    
    if tar -tzf "$backup_file" >/dev/null 2>&1; then
        success "Backup file is valid"
        
        # List contents
        log "Backup contents:"
        tar -tzf "$backup_file" | head -20
        
        # Show metadata if available
        if tar -tzf "$backup_file" | grep -q "metadata.json"; then
            log "Backup metadata:"
            tar -xzf "$backup_file" -O "*/metadata.json" 2>/dev/null | jq . 2>/dev/null || cat
        fi
    else
        error "Backup file is corrupted or invalid"
        exit 1
    fi
}

# Help function
show_help() {
    cat <<EOF
FolioFox Backup and Recovery Script

Usage: $0 [OPTIONS] COMMAND

Commands:
    backup      Create a new backup
    restore     Restore from backup file
    list        List available backups
    verify      Verify backup integrity
    cleanup     Clean up old backups

Options:
    -h, --help          Show this help message
    -d, --dir DIR       Set backup directory (default: $BACKUP_DIR)
    -r, --retention N   Set retention days (default: $RETENTION_DAYS)

Examples:
    $0 backup                                    # Create a new backup
    $0 restore /path/to/backup.tar.gz          # Restore from backup
    $0 list                                     # List available backups
    $0 verify /path/to/backup.tar.gz           # Verify backup integrity
    $0 cleanup                                  # Clean up old backups

Environment Variables:
    BACKUP_DIR                  Backup directory path
    BACKUP_RETENTION_DAYS      Number of days to keep backups
    BACKUP_S3_BUCKET           S3 bucket for remote backups
    BACKUP_S3_REGION           S3 region
    AWS_ACCESS_KEY_ID          AWS access key
    AWS_SECRET_ACCESS_KEY      AWS secret key

EOF
}

# Main function
main() {
    local command=""
    local backup_file=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -d|--dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            -r|--retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            backup|restore|list|verify|cleanup)
                command="$1"
                shift
                if [ "$command" = "restore" ] || [ "$command" = "verify" ]; then
                    backup_file="$1"
                    shift || true
                fi
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    if [ -z "$command" ]; then
        error "No command specified"
        show_help
        exit 1
    fi
    
    # Execute command
    case $command in
        backup)
            check_docker
            check_foliofox
            setup_backup_dir
            
            # Determine database type and backup accordingly
            if [ "${DATABASE_TYPE:-sqlite}" = "postgres" ]; then
                backup_postgres
            else
                backup_sqlite
            fi
            
            backup_redis
            backup_app_data
            backup_volumes
            create_metadata
            compress_backup
            upload_to_s3
            cleanup_old_backups
            
            success "Backup completed successfully: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
            ;;
        restore)
            if [ -z "$backup_file" ]; then
                error "Backup file not specified"
                exit 1
            fi
            check_docker
            restore_backup "$backup_file"
            ;;
        list)
            list_backups
            ;;
        verify)
            if [ -z "$backup_file" ]; then
                error "Backup file not specified"
                exit 1
            fi
            verify_backup "$backup_file"
            ;;
        cleanup)
            cleanup_old_backups
            ;;
    esac
}

# Run main function
main "$@"