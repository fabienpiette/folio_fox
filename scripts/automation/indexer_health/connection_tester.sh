#!/bin/bash
#
# FolioFox Indexer Connection Tester
# Comprehensive connection testing and troubleshooting for Prowlarr/Jackett indexers
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/var/log/foliofox"
CONFIG_FILE="${SCRIPT_DIR}/../../../config/config.yaml"
DB_PATH="${SCRIPT_DIR}/../../../data/foliofox.db"

# Logging setup
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/connection_tester.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2
}

# Check dependencies
check_dependencies() {
    local deps=("curl" "jq" "sqlite3" "nslookup" "ping")
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

# Test DNS resolution for a hostname
test_dns_resolution() {
    local hostname="$1"
    log "Testing DNS resolution for $hostname..."
    
    if nslookup "$hostname" >/dev/null 2>&1; then
        log "✅ DNS resolution successful for $hostname"
        return 0
    else
        log "❌ DNS resolution failed for $hostname"
        return 1
    fi
}

# Test basic connectivity with ping
test_ping_connectivity() {
    local hostname="$1"
    log "Testing ping connectivity to $hostname..."
    
    if ping -c 3 -W 5 "$hostname" >/dev/null 2>&1; then
        log "✅ Ping successful to $hostname"
        return 0
    else
        log "❌ Ping failed to $hostname"
        return 1
    fi
}

# Test HTTP connectivity
test_http_connectivity() {
    local url="$1"
    local timeout="${2:-10}"
    
    log "Testing HTTP connectivity to $url (timeout: ${timeout}s)..."
    
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$timeout" --max-time "$timeout" "$url" 2>/dev/null || echo "000")
    
    if [[ "$status_code" =~ ^[2-3][0-9][0-9]$ ]]; then
        log "✅ HTTP connectivity successful (status: $status_code)"
        return 0
    else
        log "❌ HTTP connectivity failed (status: $status_code)"
        return 1
    fi
}

# Test Prowlarr API connectivity
test_prowlarr_api() {
    local base_url="$1"
    local api_key="$2"
    local timeout="${3:-15}"
    
    log "Testing Prowlarr API connectivity..."
    
    # Test system status endpoint
    local status_url="${base_url}/api/v1/system/status"
    local response
    
    response=$(curl -s --connect-timeout "$timeout" --max-time "$timeout" \
        -H "X-Api-Key: $api_key" \
        -H "Accept: application/json" \
        "$status_url" 2>/dev/null || echo "")
    
    if [[ -n "$response" ]] && echo "$response" | jq -e '.version' >/dev/null 2>&1; then
        local version
        version=$(echo "$response" | jq -r '.version')
        log "✅ Prowlarr API connectivity successful (version: $version)"
        
        # Test indexers endpoint
        local indexers_url="${base_url}/api/v1/indexer"
        local indexers_response
        
        indexers_response=$(curl -s --connect-timeout "$timeout" --max-time "$timeout" \
            -H "X-Api-Key: $api_key" \
            -H "Accept: application/json" \
            "$indexers_url" 2>/dev/null || echo "")
        
        if [[ -n "$indexers_response" ]] && echo "$indexers_response" | jq -e '.' >/dev/null 2>&1; then
            local indexer_count
            indexer_count=$(echo "$indexers_response" | jq '. | length')
            log "✅ Prowlarr indexers endpoint accessible ($indexer_count indexers configured)"
            return 0
        else
            log "⚠️  Prowlarr system accessible but indexers endpoint failed"
            return 1
        fi
    else
        log "❌ Prowlarr API connectivity failed"
        return 1
    fi
}

# Test Jackett API connectivity
test_jackett_api() {
    local base_url="$1"
    local api_key="$2"
    local timeout="${3:-15}"
    
    log "Testing Jackett API connectivity..."
    
    # Test server config endpoint
    local config_url="${base_url}/api/v2.0/server/config"
    local response
    
    response=$(curl -s --connect-timeout "$timeout" --max-time "$timeout" \
        -G -d "apikey=$api_key" \
        "$config_url" 2>/dev/null || echo "")
    
    if [[ -n "$response" ]] && echo "$response" | jq -e '.server_version' >/dev/null 2>&1; then
        local version
        version=$(echo "$response" | jq -r '.server_version')
        log "✅ Jackett API connectivity successful (version: $version)"
        
        # Test indexers endpoint
        local indexers_url="${base_url}/api/v2.0/indexers"
        local indexers_response
        
        indexers_response=$(curl -s --connect-timeout "$timeout" --max-time "$timeout" \
            -G -d "apikey=$api_key" \
            "$indexers_url" 2>/dev/null || echo "")
        
        if [[ -n "$indexers_response" ]] && echo "$indexers_response" | jq -e '.' >/dev/null 2>&1; then
            local indexer_count
            indexer_count=$(echo "$indexers_response" | jq '. | length')
            log "✅ Jackett indexers endpoint accessible ($indexer_count indexers configured)"
            return 0
        else
            log "⚠️  Jackett server accessible but indexers endpoint failed"
            return 1
        fi
    else
        log "❌ Jackett API connectivity failed"
        return 1
    fi
}

# Test specific indexer
test_indexer() {
    local indexer_id="$1"
    local detailed="${2:-false}"
    
    log "Testing indexer ID: $indexer_id"
    
    # Get indexer details from database
    local indexer_info
    indexer_info=$(execute_sql "
        SELECT id, name, type, base_url, api_key, timeout_seconds, enabled
        FROM indexers 
        WHERE id = $indexer_id;
    ")
    
    if [[ -z "$indexer_info" ]]; then
        error "Indexer ID $indexer_id not found in database"
        return 1
    fi
    
    # Parse indexer information
    IFS='|' read -r id name type base_url api_key timeout_seconds enabled <<< "$indexer_info"
    
    echo "Indexer Information:"
    echo "  ID: $id"
    echo "  Name: $name"
    echo "  Type: $type"
    echo "  Base URL: $base_url"
    echo "  Timeout: ${timeout_seconds}s"
    echo "  Enabled: $enabled"
    echo ""
    
    if [[ "$enabled" != "1" ]]; then
        log "⚠️  Indexer is disabled"
        return 1
    fi
    
    # Extract hostname from URL
    local hostname
    hostname=$(echo "$base_url" | sed -E 's|https?://([^:/]+).*|\1|')
    
    local test_results=()
    local all_passed=true
    
    # Basic connectivity tests
    if test_dns_resolution "$hostname"; then
        test_results+=("DNS: ✅")
    else
        test_results+=("DNS: ❌")
        all_passed=false
    fi
    
    if test_ping_connectivity "$hostname"; then
        test_results+=("Ping: ✅")
    else
        test_results+=("Ping: ❌")
        # Ping failure doesn't necessarily mean the service is down
    fi
    
    if test_http_connectivity "$base_url" "$timeout_seconds"; then
        test_results+=("HTTP: ✅")
    else
        test_results+=("HTTP: ❌")
        all_passed=false
    fi
    
    # API-specific tests
    if [[ "$type" == "prowlarr" ]]; then
        if test_prowlarr_api "$base_url" "$api_key" "$timeout_seconds"; then
            test_results+=("Prowlarr API: ✅")
        else
            test_results+=("Prowlarr API: ❌")
            all_passed=false
        fi
    elif [[ "$type" == "jackett" ]]; then
        if test_jackett_api "$base_url" "$api_key" "$timeout_seconds"; then
            test_results+=("Jackett API: ✅")
        else
            test_results+=("Jackett API: ❌")
            all_passed=false
        fi
    fi
    
    # Performance test if detailed mode
    if [[ "$detailed" == "true" ]]; then
        log "Running performance test..."
        test_indexer_performance "$type" "$base_url" "$api_key" "$timeout_seconds"
    fi
    
    # Summary
    echo ""
    echo "Test Results Summary:"
    printf "  %s\n" "${test_results[@]}"
    echo ""
    
    if [[ "$all_passed" == "true" ]]; then
        log "🎉 All tests passed for indexer: $name"
        
        # Update health status in database
        execute_sql "
            INSERT INTO indexer_health 
            (indexer_id, status, response_time_ms, error_message, checked_at)
            VALUES ($indexer_id, 'healthy', NULL, NULL, datetime('now'));
        " || true
        
        return 0
    else
        log "❌ Some tests failed for indexer: $name"
        
        # Update health status in database
        execute_sql "
            INSERT INTO indexer_health 
            (indexer_id, status, response_time_ms, error_message, checked_at)
            VALUES ($indexer_id, 'down', NULL, 'Connection test failed', datetime('now'));
        " || true
        
        return 1
    fi
}

# Test indexer performance (search capability)
test_indexer_performance() {
    local type="$1"
    local base_url="$2"
    local api_key="$3"
    local timeout="$4"
    
    log "Testing search performance..."
    
    local search_url
    local start_time
    local end_time
    local response_time
    
    start_time=$(date +%s%3N)
    
    if [[ "$type" == "prowlarr" ]]; then
        # Test Prowlarr search
        search_url="${base_url}/api/v1/search?query=test&categories=8000"
        curl -s --connect-timeout "$timeout" --max-time "$timeout" \
            -H "X-Api-Key: $api_key" \
            "$search_url" >/dev/null 2>&1
    elif [[ "$type" == "jackett" ]]; then
        # Test Jackett search (need to know indexer name)
        # This is a simplified test - real implementation would need indexer name
        search_url="${base_url}/api/v2.0/indexers/all/results?apikey=$api_key&Query=test&Category=8000"
        curl -s --connect-timeout "$timeout" --max-time "$timeout" \
            "$search_url" >/dev/null 2>&1
    fi
    
    end_time=$(date +%s%3N)
    response_time=$((end_time - start_time))
    
    if [[ $? -eq 0 ]]; then
        log "✅ Search test completed in ${response_time}ms"
    else
        log "❌ Search test failed"
    fi
}

# Test all indexers
test_all_indexers() {
    local detailed="${1:-false}"
    
    log "Testing all enabled indexers..."
    
    # Get all enabled indexers
    local indexer_ids
    indexer_ids=$(execute_sql "SELECT id FROM indexers WHERE enabled = 1 ORDER BY id;")
    
    if [[ -z "$indexer_ids" ]]; then
        log "No enabled indexers found"
        return 1
    fi
    
    local total_count=0
    local passed_count=0
    local failed_indexers=()
    
    while IFS= read -r indexer_id; do
        [[ -z "$indexer_id" ]] && continue
        
        echo "===========================================" | tee -a "$LOG_FILE"
        
        ((total_count++))
        
        if test_indexer "$indexer_id" "$detailed"; then
            ((passed_count++))
        else
            failed_indexers+=("$indexer_id")
        fi
        
        echo "" | tee -a "$LOG_FILE"
        
        # Small delay between tests to avoid overwhelming servers
        sleep 2
    done <<< "$indexer_ids"
    
    # Final summary
    echo "==========================================="
    echo "FINAL SUMMARY"
    echo "==========================================="
    echo "Total indexers tested: $total_count"
    echo "Passed: $passed_count"
    echo "Failed: $((total_count - passed_count))"
    
    if [[ ${#failed_indexers[@]} -gt 0 ]]; then
        echo ""
        echo "Failed indexers:"
        for failed_id in "${failed_indexers[@]}"; do
            local failed_name
            failed_name=$(execute_sql "SELECT name FROM indexers WHERE id = $failed_id;" || echo "Unknown")
            echo "  - ID $failed_id: $failed_name"
        done
    fi
    
    echo ""
    echo "Success rate: $(( (passed_count * 100) / total_count ))%"
    
    if [[ $passed_count -eq $total_count ]]; then
        log "🎉 All indexers passed connectivity tests!"
        return 0
    else
        log "⚠️  Some indexers failed connectivity tests"
        return 1
    fi
}

# Generate connectivity report
generate_report() {
    log "Generating connectivity report..."
    
    local report_file="/var/log/foliofox/connectivity_report_$(date +%Y%m%d_%H%M%S).json"
    
    # Get indexer information with latest health status
    local report_data
    report_data=$(execute_sql "
        SELECT json_object(
            'timestamp', datetime('now'),
            'indexers', json_group_array(
                json_object(
                    'id', i.id,
                    'name', i.name,
                    'type', i.type,
                    'base_url', i.base_url,
                    'enabled', i.enabled,
                    'last_health_check', h.checked_at,
                    'health_status', h.status,
                    'response_time_ms', h.response_time_ms,
                    'error_message', h.error_message
                )
            )
        )
        FROM indexers i
        LEFT JOIN (
            SELECT indexer_id, status, response_time_ms, error_message, checked_at,
                   ROW_NUMBER() OVER (PARTITION BY indexer_id ORDER BY checked_at DESC) as rn
            FROM indexer_health
        ) h ON i.id = h.indexer_id AND h.rn = 1
        ORDER BY i.id;
    ")
    
    echo "$report_data" | jq '.' > "$report_file"
    
    log "Connectivity report saved to: $report_file"
    
    # Also output summary to console
    echo "$report_data" | jq -r '
        "Connectivity Report - " + .timestamp,
        "================================",
        (.indexers | length | tostring) + " total indexers:",
        "",
        (.indexers[] | 
            "  " + (.name // "Unknown") + " (ID: " + (.id | tostring) + ")" +
            " - " + (.health_status // "Never tested") +
            (if .response_time_ms then " (" + (.response_time_ms | tostring) + "ms)" else "" end)
        ),
        "",
        "Healthy: " + ([.indexers[] | select(.health_status == "healthy")] | length | tostring),
        "Degraded: " + ([.indexers[] | select(.health_status == "degraded")] | length | tostring),
        "Down: " + ([.indexers[] | select(.health_status == "down")] | length | tostring),
        "Never tested: " + ([.indexers[] | select(.health_status == null)] | length | tostring)
    '
}

# Troubleshoot specific connectivity issues
troubleshoot_indexer() {
    local indexer_id="$1"
    
    log "Running detailed troubleshooting for indexer ID: $indexer_id"
    
    # Get indexer details
    local indexer_info
    indexer_info=$(execute_sql "
        SELECT id, name, type, base_url, api_key, timeout_seconds
        FROM indexers 
        WHERE id = $indexer_id;
    ")
    
    if [[ -z "$indexer_info" ]]; then
        error "Indexer ID $indexer_id not found"
        return 1
    fi
    
    IFS='|' read -r id name type base_url api_key timeout_seconds <<< "$indexer_info"
    
    echo "Troubleshooting: $name ($type)"
    echo "URL: $base_url"
    echo ""
    
    # Extract components
    local hostname
    local port
    local protocol
    
    hostname=$(echo "$base_url" | sed -E 's|https?://([^:/]+).*|\1|')
    port=$(echo "$base_url" | sed -E 's|https?://[^:/]+:([0-9]+).*|\1|')
    protocol=$(echo "$base_url" | sed -E 's|(https?)://.*|\1|')
    
    if [[ "$port" == "$base_url" ]]; then
        # No port specified, use defaults
        if [[ "$protocol" == "https" ]]; then
            port=443
        else
            port=80
        fi
    fi
    
    echo "Hostname: $hostname"
    echo "Port: $port"
    echo "Protocol: $protocol"
    echo ""
    
    # Detailed connectivity tests
    echo "1. Testing network connectivity..."
    
    # DNS lookup with details
    echo "   DNS lookup:"
    if nslookup "$hostname" 2>&1; then
        echo "   ✅ DNS resolution successful"
    else
        echo "   ❌ DNS resolution failed"
        echo "   Suggestions:"
        echo "     - Check DNS server configuration"
        echo "     - Try using IP address instead of hostname"
        echo "     - Check firewall DNS rules"
    fi
    
    echo ""
    
    # Port connectivity test
    echo "   Port connectivity:"
    if timeout 10 bash -c "echo >/dev/tcp/$hostname/$port" 2>/dev/null; then
        echo "   ✅ Port $port is reachable"
    else
        echo "   ❌ Port $port is not reachable"
        echo "   Suggestions:"
        echo "     - Check if service is running on target host"
        echo "     - Check firewall rules on both sides"
        echo "     - Verify port number in configuration"
        echo "     - Try telnet $hostname $port for manual testing"
    fi
    
    echo ""
    
    # HTTP/HTTPS test with verbose output
    echo "2. Testing HTTP(S) connectivity..."
    
    local curl_output
    curl_output=$(curl -v --connect-timeout 10 --max-time 15 "$base_url" 2>&1 || true)
    
    if echo "$curl_output" | grep -q "HTTP.*200\|HTTP.*30[0-9]"; then
        echo "   ✅ HTTP connection successful"
    else
        echo "   ❌ HTTP connection failed"
        echo "   Curl output (last few lines):"
        echo "$curl_output" | tail -5 | sed 's/^/     /'
        echo ""
        echo "   Suggestions:"
        echo "     - Check SSL certificate if using HTTPS"
        echo "     - Verify the exact URL and path"
        echo "     - Check for proxy or authentication requirements"
        echo "     - Try accessing the URL in a web browser"
    fi
    
    echo ""
    
    # API-specific tests
    echo "3. Testing API connectivity..."
    
    if [[ "$type" == "prowlarr" ]]; then
        local api_url="${base_url}/api/v1/system/status"
        echo "   Testing Prowlarr API: $api_url"
        
        local api_response
        api_response=$(curl -s -H "X-Api-Key: $api_key" "$api_url" 2>&1 || echo "CURL_ERROR")
        
        if echo "$api_response" | jq -e '.version' >/dev/null 2>&1; then
            echo "   ✅ Prowlarr API accessible"
            local version
            version=$(echo "$api_response" | jq -r '.version')
            echo "   Version: $version"
        else
            echo "   ❌ Prowlarr API failed"
            echo "   Response: ${api_response:0:200}..."
            echo ""
            echo "   Suggestions:"
            echo "     - Verify API key is correct"
            echo "     - Check Prowlarr authentication settings"
            echo "     - Ensure Prowlarr is running and accessible"
            echo "     - Check Prowlarr logs for errors"
        fi
        
    elif [[ "$type" == "jackett" ]]; then
        local api_url="${base_url}/api/v2.0/server/config?apikey=$api_key"
        echo "   Testing Jackett API: ${base_url}/api/v2.0/server/config"
        
        local api_response
        api_response=$(curl -s "$api_url" 2>&1 || echo "CURL_ERROR")
        
        if echo "$api_response" | jq -e '.server_version' >/dev/null 2>&1; then
            echo "   ✅ Jackett API accessible"
            local version
            version=$(echo "$api_response" | jq -r '.server_version')
            echo "   Version: $version"
        else
            echo "   ❌ Jackett API failed"
            echo "   Response: ${api_response:0:200}..."
            echo ""
            echo "   Suggestions:"
            echo "     - Verify API key is correct"
            echo "     - Check Jackett admin password if set"
            echo "     - Ensure Jackett is running and accessible"
            echo "     - Check Jackett logs for errors"
        fi
    fi
    
    echo ""
    echo "Troubleshooting complete for: $name"
}

# Main function
main() {
    local action=${1:-"help"}
    local indexer_id=${2:-""}
    local detailed=${3:-"false"}
    
    check_dependencies
    
    case "$action" in
        "test")
            if [[ -n "$indexer_id" ]]; then
                test_indexer "$indexer_id" "$detailed"
            else
                echo "Usage: $0 test <indexer_id> [detailed]"
                exit 1
            fi
            ;;
        "test-all")
            test_all_indexers "$detailed"
            ;;
        "troubleshoot")
            if [[ -n "$indexer_id" ]]; then
                troubleshoot_indexer "$indexer_id"
            else
                echo "Usage: $0 troubleshoot <indexer_id>"
                exit 1
            fi
            ;;
        "report")
            generate_report
            ;;
        "list")
            echo "Configured indexers:"
            execute_sql "
                SELECT id, name, type, base_url, enabled
                FROM indexers
                ORDER BY id;
            " | while IFS='|' read -r id name type base_url enabled; do
                local status_icon="✅"
                [[ "$enabled" != "1" ]] && status_icon="❌"
                echo "  $status_icon ID $id: $name ($type) - $base_url"
            done
            ;;
        "help"|"-h"|"--help")
            cat << EOF
FolioFox Indexer Connection Tester

Usage: $0 [ACTION] [OPTIONS]

Actions:
  test <id> [detailed]    Test specific indexer connection
  test-all [detailed]     Test all enabled indexers
  troubleshoot <id>       Run detailed troubleshooting for indexer
  report                  Generate connectivity report
  list                    List all configured indexers
  help                    Show this help message

Options:
  detailed               Run additional performance tests

Examples:
  $0 test 1                    # Test indexer ID 1
  $0 test 1 detailed           # Test indexer ID 1 with performance tests
  $0 test-all                  # Test all enabled indexers
  $0 troubleshoot 2            # Troubleshoot indexer ID 2
  $0 report                    # Generate connectivity report

The script tests:
  - DNS resolution
  - Network connectivity (ping)
  - HTTP/HTTPS connectivity
  - API authentication and accessibility
  - Search functionality (in detailed mode)

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