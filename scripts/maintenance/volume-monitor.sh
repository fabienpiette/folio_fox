#!/bin/bash
# FolioFox Volume Monitoring and Maintenance Script

set -euo pipefail

# Configuration
MONITOR_INTERVAL="${MONITOR_INTERVAL:-300}"
DISK_USAGE_THRESHOLD="${DISK_USAGE_THRESHOLD:-80}"
CLEANUP_ENABLED="${CLEANUP_ENABLED:-true}"
LOG_FILE="/tmp/volume-monitor.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

# Check disk usage for a mount point
check_disk_usage() {
    local mount_point="$1"
    local usage
    
    if [ -d "$mount_point" ]; then
        usage=$(df "$mount_point" | awk 'NR==2 {print $5}' | sed 's/%//')
        if [ "$usage" -gt "$DISK_USAGE_THRESHOLD" ]; then
            log "WARNING: $mount_point usage is ${usage}% (threshold: ${DISK_USAGE_THRESHOLD}%)"
            return 1
        else
            log "INFO: $mount_point usage is ${usage}%"
            return 0
        fi
    else
        log "ERROR: Mount point $mount_point does not exist"
        return 1
    fi
}

# Clean up old log files
cleanup_logs() {
    log "Cleaning up old log files..."
    
    # Clean application logs older than 7 days
    find /monitor/logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
    
    # Rotate large log files
    find /monitor/logs -name "*.log" -size +100M -exec sh -c '
        for file; do
            mv "$file" "${file}.old"
            touch "$file"
            echo "Rotated large log file: $file"
        done
    ' sh {} +
    
    log "Log cleanup completed"
}

# Clean up old download files
cleanup_downloads() {
    log "Cleaning up old download files..."
    
    # Remove failed downloads older than 1 day
    find /monitor/downloads -name "*.tmp" -mtime +1 -delete 2>/dev/null || true
    find /monitor/downloads -name "*.part" -mtime +1 -delete 2>/dev/null || true
    
    # Remove completed downloads older than 30 days (if configured)
    if [ "${CLEANUP_OLD_DOWNLOADS:-false}" = "true" ]; then
        find /monitor/downloads -type f -mtime +30 -delete 2>/dev/null || true
        log "Removed downloads older than 30 days"
    fi
    
    log "Download cleanup completed"
}

# Optimize database files
optimize_databases() {
    log "Optimizing database files..."
    
    # SQLite optimization (if using SQLite)
    if [ -f "/monitor/app/foliofox.db" ]; then
        log "Running SQLite VACUUM operation..."
        # Note: This would need to be done through the application or a dedicated tool
        log "SQLite optimization would be performed here"
    fi
    
    # PostgreSQL optimization (via container)
    if docker exec foliofox-postgres pg_isready -U foliofox >/dev/null 2>&1; then
        log "Running PostgreSQL maintenance..."
        docker exec foliofox-postgres psql -U foliofox -d foliofox -c "VACUUM ANALYZE;" || true
        log "PostgreSQL optimization completed"
    fi
}

# Monitor container health
monitor_containers() {
    log "Monitoring container health..."
    
    local containers=("foliofox-backend" "foliofox-frontend" "foliofox-postgres" "foliofox-redis")
    
    for container in "${containers[@]}"; do
        if docker ps --filter "name=$container" --filter "status=running" --quiet | grep -q .; then
            log "INFO: Container $container is running"
        else
            log "WARNING: Container $container is not running"
            
            # Try to restart the container
            if [ "${AUTO_RESTART:-true}" = "true" ]; then
                log "Attempting to restart $container..."
                docker restart "$container" || log "ERROR: Failed to restart $container"
            fi
        fi
    done
}

# Check volume health
check_volume_health() {
    log "Checking volume health..."
    
    local volumes=("/monitor/postgres" "/monitor/redis" "/monitor/app" "/monitor/downloads" "/monitor/logs")
    
    for volume in "${volumes[@]}"; do
        if [ -d "$volume" ]; then
            # Check read/write permissions
            if [ -r "$volume" ] && [ -w "$volume" ]; then
                log "INFO: Volume $volume is healthy"
            else
                log "WARNING: Volume $volume has permission issues"
            fi
            
            # Check disk usage
            check_disk_usage "$volume"
        else
            log "ERROR: Volume $volume is not mounted"
        fi
    done
}

# Generate health report
generate_health_report() {
    local report_file="/tmp/health-report-$(date +%Y%m%d_%H%M%S).json"
    
    cat > "$report_file" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "system": {
        "uptime": "$(uptime -p)",
        "load": "$(uptime | awk -F'load average:' '{print $2}')",
        "memory": "$(free -h | awk '/^Mem:/ {print $3 "/" $2}')"
    },
    "volumes": {
        "postgres": "$(df /monitor/postgres | awk 'NR==2 {print $5}')",
        "redis": "$(df /monitor/redis | awk 'NR==2 {print $5}')",
        "app": "$(df /monitor/app | awk 'NR==2 {print $5}')",
        "downloads": "$(df /monitor/downloads | awk 'NR==2 {print $5}')",
        "logs": "$(df /monitor/logs | awk 'NR==2 {print $5}')"
    },
    "containers": {
EOF

    local first=true
    for container in foliofox-backend foliofox-frontend foliofox-postgres foliofox-redis; do
        if [ "$first" = false ]; then
            echo "," >> "$report_file"
        fi
        
        local status="stopped"
        if docker ps --filter "name=$container" --filter "status=running" --quiet | grep -q .; then
            status="running"
        fi
        
        echo "        \"$container\": \"$status\"" >> "$report_file"
        first=false
    done

    cat >> "$report_file" << EOF
    }
}
EOF

    log "Health report generated: $report_file"
    
    # Send to monitoring endpoint if configured
    if [ -n "${MONITORING_WEBHOOK_URL:-}" ]; then
        curl -X POST "${MONITORING_WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "@$report_file" || log "Failed to send health report to webhook"
    fi
}

# Main monitoring loop
main() {
    log "Starting FolioFox volume monitoring..."
    
    while true; do
        log "Running maintenance cycle..."
        
        # Check volume health
        check_volume_health
        
        # Monitor containers
        monitor_containers
        
        # Perform cleanup if enabled
        if [ "$CLEANUP_ENABLED" = "true" ]; then
            cleanup_logs
            cleanup_downloads
        fi
        
        # Optimize databases periodically (every 6 hours)
        if [ $(( $(date +%s) % 21600 )) -lt $MONITOR_INTERVAL ]; then
            optimize_databases
        fi
        
        # Generate health report
        generate_health_report
        
        log "Maintenance cycle completed. Sleeping for ${MONITOR_INTERVAL} seconds..."
        sleep "$MONITOR_INTERVAL"
    done
}

# Handle signals for graceful shutdown
trap 'log "Received shutdown signal, exiting..."; exit 0' SIGTERM SIGINT

# Run main function
main "$@"