#!/bin/bash
#
# FolioFox Download Queue Optimizer
# Provides queue management, cleanup, and optimization utilities
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/var/log/foliofox"
CONFIG_FILE="${SCRIPT_DIR}/../../../config/config.yaml"
DB_PATH="${SCRIPT_DIR}/../../../data/foliofox.db"

# Logging setup
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/queue_optimizer.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2
}

# Check dependencies
check_dependencies() {
    local deps=("sqlite3" "jq" "curl")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            error "Required dependency '$dep' not found"
            exit 1
        fi
    done
}

# Get database path from config
get_db_path() {
    if [[ -f "$CONFIG_FILE" ]]; then
        python3 -c "
import yaml
with open('$CONFIG_FILE', 'r') as f:
    config = yaml.safe_load(f)
    print(config.get('database', {}).get('path', '$DB_PATH'))
" 2>/dev/null || echo "$DB_PATH"
    else
        echo "$DB_PATH"
    fi
}

# Execute SQL query with error handling
execute_sql() {
    local query="$1"
    local db_path
    db_path=$(get_db_path)
    
    if [[ ! -f "$db_path" ]]; then
        error "Database file not found: $db_path"
        return 1
    fi
    
    sqlite3 "$db_path" "$query" 2>/dev/null || {
        error "SQL query failed: $query"
        return 1
    }
}

# Get queue statistics
get_queue_stats() {
    log "Generating queue statistics..."
    
    local stats_query="
    SELECT 
        status,
        COUNT(*) as count,
        AVG(CASE WHEN status = 'completed' THEN 
            (julianday(updated_at) - julianday(created_at)) * 24 * 60 
            ELSE NULL END) as avg_completion_minutes
    FROM download_queue 
    GROUP BY status;
    "
    
    echo "Queue Status Report - $(date)"
    echo "======================================"
    
    execute_sql "$stats_query" | while IFS='|' read -r status count avg_time; do
        if [[ "$avg_time" != "" && "$status" == "completed" ]]; then
            printf "%-12s: %5d items (avg completion: %.1f min)\n" "$status" "$count" "$avg_time"
        else
            printf "%-12s: %5d items\n" "$status" "$count"
        fi
    done
    
    # Overall statistics
    local total_items
    total_items=$(execute_sql "SELECT COUNT(*) FROM download_queue;")
    echo "Total items: $total_items"
    
    # Recent activity (last 24 hours)
    local recent_completed
    recent_completed=$(execute_sql "
        SELECT COUNT(*) FROM download_queue 
        WHERE status = 'completed' 
        AND updated_at > datetime('now', '-1 day');
    ")
    echo "Completed (24h): $recent_completed"
    
    # Success rate (last 24 hours)
    local success_rate
    success_rate=$(execute_sql "
        SELECT 
            COALESCE(
                ROUND(
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 100.0 / 
                    COUNT(*), 2
                ), 0
            )
        FROM download_queue 
        WHERE updated_at > datetime('now', '-1 day');
    ")
    echo "Success rate (24h): ${success_rate}%"
}

# Clean up old completed downloads
cleanup_completed() {
    local days=${1:-30}
    log "Cleaning up completed downloads older than $days days..."
    
    local cleanup_query="
    DELETE FROM download_queue 
    WHERE status = 'completed' 
    AND updated_at < datetime('now', '-$days days');
    "
    
    local deleted_count
    deleted_count=$(execute_sql "
        SELECT COUNT(*) FROM download_queue 
        WHERE status = 'completed' 
        AND updated_at < datetime('now', '-$days days');
    ")
    
    if [[ "$deleted_count" -gt 0 ]]; then
        execute_sql "$cleanup_query"
        log "Cleaned up $deleted_count completed downloads"
    else
        log "No old completed downloads to clean up"
    fi
}

# Clean up cancelled downloads
cleanup_cancelled() {
    local days=${1:-7}
    log "Cleaning up cancelled downloads older than $days days..."
    
    local cleanup_query="
    DELETE FROM download_queue 
    WHERE status = 'cancelled' 
    AND updated_at < datetime('now', '-$days days');
    "
    
    local deleted_count
    deleted_count=$(execute_sql "
        SELECT COUNT(*) FROM download_queue 
        WHERE status = 'cancelled' 
        AND updated_at < datetime('now', '-$days days');
    ")
    
    if [[ "$deleted_count" -gt 0 ]]; then
        execute_sql "$cleanup_query"
        log "Cleaned up $deleted_count cancelled downloads"
    else
        log "No old cancelled downloads to clean up"
    fi
}

# Optimize queue priorities
optimize_priorities() {
    log "Optimizing queue priorities..."
    
    # Boost priority for old pending downloads
    local boost_old_query="
    UPDATE download_queue 
    SET priority = CASE 
        WHEN priority > 1 THEN priority - 1 
        ELSE 1 
    END,
    updated_at = datetime('now')
    WHERE status = 'pending' 
    AND created_at < datetime('now', '-1 hour')
    AND priority > 1;
    "
    
    local boosted_count
    boosted_count=$(execute_sql "
        SELECT COUNT(*) FROM download_queue 
        WHERE status = 'pending' 
        AND created_at < datetime('now', '-1 hour')
        AND priority > 1;
    ")
    
    if [[ "$boosted_count" -gt 0 ]]; then
        execute_sql "$boost_old_query"
        log "Boosted priority for $boosted_count old pending downloads"
    fi
    
    # Lower priority for repeatedly failed downloads
    local lower_failed_query="
    UPDATE download_queue 
    SET priority = CASE 
        WHEN priority < 10 THEN priority + 1 
        ELSE 10 
    END,
    updated_at = datetime('now')
    WHERE status = 'failed' 
    AND retry_count >= 2
    AND priority < 10;
    "
    
    local lowered_count
    lowered_count=$(execute_sql "
        SELECT COUNT(*) FROM download_queue 
        WHERE status = 'failed' 
        AND retry_count >= 2
        AND priority < 10;
    ")
    
    if [[ "$lowered_count" -gt 0 ]]; then
        execute_sql "$lower_failed_query"
        log "Lowered priority for $lowered_count repeatedly failed downloads"
    fi
}

# Find and report problematic downloads
find_problems() {
    log "Scanning for problematic downloads..."
    
    echo "Problematic Downloads Report - $(date)"
    echo "========================================"
    
    # Stale downloads (downloading for > 1 hour)
    local stale_downloads
    stale_downloads=$(execute_sql "
        SELECT COUNT(*) FROM download_queue 
        WHERE status = 'downloading' 
        AND updated_at < datetime('now', '-1 hour');
    ")
    
    if [[ "$stale_downloads" -gt 0 ]]; then
        echo "⚠️  Stale downloads (downloading > 1h): $stale_downloads"
        execute_sql "
            SELECT id, title, author_name, 
                   strftime('%Y-%m-%d %H:%M', updated_at) as last_update
            FROM download_queue 
            WHERE status = 'downloading' 
            AND updated_at < datetime('now', '-1 hour')
            ORDER BY updated_at ASC
            LIMIT 10;
        " | while IFS='|' read -r id title author last_update; do
            echo "   ID $id: $title by $author (since $last_update)"
        done
    fi
    
    # High-retry failures
    local high_retry_failures
    high_retry_failures=$(execute_sql "
        SELECT COUNT(*) FROM download_queue 
        WHERE status = 'failed' 
        AND retry_count >= max_retries;
    ")
    
    if [[ "$high_retry_failures" -gt 0 ]]; then
        echo "❌ Failed downloads (max retries exceeded): $high_retry_failures"
        execute_sql "
            SELECT id, title, author_name, retry_count, error_message
            FROM download_queue 
            WHERE status = 'failed' 
            AND retry_count >= max_retries
            ORDER BY updated_at DESC
            LIMIT 5;
        " | while IFS='|' read -r id title author retries error; do
            echo "   ID $id: $title by $author ($retries retries) - ${error:0:80}..."
        done
    fi
    
    # Large queue backlog
    local pending_count
    pending_count=$(execute_sql "SELECT COUNT(*) FROM download_queue WHERE status = 'pending';")
    
    if [[ "$pending_count" -gt 100 ]]; then
        echo "📚 Large queue backlog: $pending_count pending downloads"
    fi
    
    # Duplicate downloads
    local duplicates
    duplicates=$(execute_sql "
        SELECT download_url, COUNT(*) as count
        FROM download_queue 
        WHERE status IN ('pending', 'downloading')
        GROUP BY download_url
        HAVING count > 1;
    " | wc -l)
    
    if [[ "$duplicates" -gt 0 ]]; then
        echo "🔄 Potential duplicate downloads: $duplicates URLs"
    fi
}

# Remove duplicate downloads
remove_duplicates() {
    log "Removing duplicate downloads..."
    
    local duplicates_query="
    WITH duplicates AS (
        SELECT id, download_url, 
               ROW_NUMBER() OVER (PARTITION BY download_url ORDER BY created_at ASC) as rn
        FROM download_queue 
        WHERE status IN ('pending', 'downloading')
    )
    SELECT id FROM duplicates WHERE rn > 1;
    "
    
    local duplicate_ids
    duplicate_ids=$(execute_sql "$duplicates_query")
    
    if [[ -n "$duplicate_ids" ]]; then
        local count=0
        while IFS= read -r id; do
            execute_sql "DELETE FROM download_queue WHERE id = $id;"
            ((count++))
        done <<< "$duplicate_ids"
        
        log "Removed $count duplicate downloads"
    else
        log "No duplicate downloads found"
    fi
}

# Vacuum database to reclaim space
vacuum_database() {
    log "Vacuuming database to reclaim space..."
    
    local db_path
    db_path=$(get_db_path)
    
    local size_before
    size_before=$(du -h "$db_path" | cut -f1)
    
    execute_sql "VACUUM;"
    
    local size_after
    size_after=$(du -h "$db_path" | cut -f1)
    
    log "Database size: $size_before -> $size_after"
}

# Reset stale downloads
reset_stale_downloads() {
    log "Resetting stale downloads..."
    
    local reset_query="
    UPDATE download_queue 
    SET status = 'pending',
        updated_at = datetime('now')
    WHERE status = 'downloading' 
    AND updated_at < datetime('now', '-1 hour');
    "
    
    local reset_count
    reset_count=$(execute_sql "
        SELECT COUNT(*) FROM download_queue 
        WHERE status = 'downloading' 
        AND updated_at < datetime('now', '-1 hour');
    ")
    
    if [[ "$reset_count" -gt 0 ]]; then
        execute_sql "$reset_query"
        log "Reset $reset_count stale downloads to pending"
    else
        log "No stale downloads to reset"
    fi
}

# Export queue data for analysis
export_queue_data() {
    local output_file=${1:-"queue_export_$(date +%Y%m%d_%H%M%S).json"}
    log "Exporting queue data to $output_file..."
    
    local export_query="
    SELECT json_object(
        'id', id,
        'user_id', user_id,
        'title', title,
        'author_name', author_name,
        'file_format', file_format,
        'status', status,
        'priority', priority,
        'retry_count', retry_count,
        'max_retries', max_retries,
        'created_at', created_at,
        'updated_at', updated_at,
        'error_message', error_message
    ) FROM download_queue
    ORDER BY created_at DESC;
    "
    
    {
        echo "["
        execute_sql "$export_query" | sed '$!s/$/,/'
        echo "]"
    } > "$output_file"
    
    local export_count
    export_count=$(execute_sql "SELECT COUNT(*) FROM download_queue;")
    log "Exported $export_count downloads to $output_file"
}

# Generate performance report
performance_report() {
    log "Generating performance report..."
    
    echo "Performance Report - $(date)"
    echo "============================"
    
    # Download throughput (last 24 hours)
    local completed_24h
    completed_24h=$(execute_sql "
        SELECT COUNT(*) FROM download_queue 
        WHERE status = 'completed' 
        AND updated_at > datetime('now', '-1 day');
    ")
    echo "Downloads completed (24h): $completed_24h"
    
    # Average queue wait time
    local avg_wait_time
    avg_wait_time=$(execute_sql "
        SELECT AVG(
            (julianday(updated_at) - julianday(created_at)) * 24 * 60
        ) FROM download_queue 
        WHERE status = 'completed' 
        AND updated_at > datetime('now', '-7 days');
    ")
    if [[ "$avg_wait_time" != "" ]]; then
        printf "Average queue wait time: %.1f minutes\n" "$avg_wait_time"
    fi
    
    # Peak queue size (approximate)
    local current_total
    current_total=$(execute_sql "SELECT COUNT(*) FROM download_queue WHERE status != 'completed';")
    echo "Current active queue size: $current_total"
    
    # Error rate analysis
    local error_rate
    error_rate=$(execute_sql "
        SELECT 
            ROUND(
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) * 100.0 / 
                COUNT(*), 2
            )
        FROM download_queue 
        WHERE updated_at > datetime('now', '-7 days')
        AND status IN ('completed', 'failed');
    ")
    if [[ "$error_rate" != "" ]]; then
        echo "Error rate (7 days): ${error_rate}%"
    fi
    
    # Top error messages
    echo ""
    echo "Top Error Messages:"
    execute_sql "
        SELECT error_message, COUNT(*) as count
        FROM download_queue 
        WHERE status = 'failed' 
        AND error_message IS NOT NULL
        AND updated_at > datetime('now', '-7 days')
        GROUP BY error_message
        ORDER BY count DESC
        LIMIT 5;
    " | while IFS='|' read -r error count; do
        echo "   ($count) ${error:0:80}..."
    done
}

# Main function
main() {
    local action=${1:-"stats"}
    
    check_dependencies
    
    case "$action" in
        "stats")
            get_queue_stats
            ;;
        "cleanup")
            cleanup_completed "${2:-30}"
            cleanup_cancelled "${2:-7}"
            vacuum_database
            ;;
        "optimize")
            optimize_priorities
            remove_duplicates
            ;;
        "problems")
            find_problems
            ;;
        "reset-stale")
            reset_stale_downloads
            ;;
        "export")
            export_queue_data "$2"
            ;;
        "performance")
            performance_report
            ;;
        "full-maintenance")
            log "Running full maintenance cycle..."
            get_queue_stats
            find_problems
            reset_stale_downloads
            optimize_priorities
            remove_duplicates
            cleanup_completed
            cleanup_cancelled
            vacuum_database
            log "Full maintenance cycle completed"
            ;;
        "help"|"-h"|"--help")
            cat << EOF
FolioFox Queue Optimizer

Usage: $0 [ACTION] [OPTIONS]

Actions:
  stats              Show queue statistics (default)
  cleanup [days]     Clean up old completed/cancelled downloads
  optimize           Optimize queue priorities and remove duplicates
  problems           Find and report problematic downloads
  reset-stale        Reset stale downloads back to pending
  export [file]      Export queue data to JSON file
  performance        Generate performance report
  full-maintenance   Run complete maintenance cycle
  help               Show this help message

Examples:
  $0 stats                    # Show current queue statistics
  $0 cleanup 14               # Clean up downloads older than 14 days
  $0 export queue_backup.json # Export queue to specific file
  $0 full-maintenance         # Run all maintenance tasks

Logs are written to: $LOG_FILE
EOF
            ;;
        *)
            error "Unknown action: $action"
            echo "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"