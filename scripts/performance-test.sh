#!/bin/bash

# ==================================================================================
# FolioFox Performance Testing Script
# ==================================================================================
# Comprehensive performance testing including load testing, benchmarks, and profiling
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
FRONTEND_DIR="$PROJECT_ROOT/frontend"
RESULTS_DIR="$PROJECT_ROOT/performance-results"

# Default test parameters
BACKEND_URL=${BACKEND_URL:-"http://localhost:8080"}
FRONTEND_URL=${FRONTEND_URL:-"http://localhost:3000"}
DURATION=${DURATION:-"30s"}
CONNECTIONS=${CONNECTIONS:-10}
RPS=${RPS:-100}
WARMUP_TIME=${WARMUP_TIME:-"10s"}

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

# Create results directory
create_results_dir() {
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    RESULTS_DIR="$PROJECT_ROOT/performance-results/$timestamp"
    mkdir -p "$RESULTS_DIR"
    info "Results will be saved to: $RESULTS_DIR"
}

# Check prerequisites
check_prerequisites() {
    log "Checking performance testing prerequisites..."
    
    # Check if services are running
    if ! curl -s "$BACKEND_URL/api/v1/health" >/dev/null; then
        error "Backend service is not accessible at $BACKEND_URL"
        info "Start the backend service with: make run-backend"
        return 1
    fi
    
    success "Backend service is accessible"
    
    # Check frontend (optional)
    if curl -s "$FRONTEND_URL/health" >/dev/null 2>&1; then
        success "Frontend service is accessible"
    else
        warning "Frontend service is not accessible (skipping frontend tests)"
    fi
    
    return 0
}

# Run Go benchmarks
run_go_benchmarks() {
    log "Running Go benchmarks..."
    
    cd "$PROJECT_ROOT"
    
    local bench_output="$RESULTS_DIR/go_benchmarks.txt"
    local bench_json="$RESULTS_DIR/go_benchmarks.json"
    
    # Run benchmarks with different options
    go test -bench=. -benchmem -benchtime=10s ./... | tee "$bench_output"
    
    # Run benchmarks with JSON output if available
    if go test -bench=. -benchmem -benchtime=10s -json ./... > "$bench_json" 2>/dev/null; then
        success "Go benchmarks saved to $bench_json"
    fi
    
    success "Go benchmarks completed"
}

# Run frontend performance tests
run_frontend_performance() {
    log "Running frontend performance tests..."
    
    cd "$FRONTEND_DIR"
    
    # Run Vitest performance tests
    if npm run test:performance > "$RESULTS_DIR/frontend_performance.txt" 2>&1; then
        success "Frontend performance tests completed"
    else
        warning "Frontend performance tests failed or not available"
    fi
    
    cd "$PROJECT_ROOT"
}

# Create k6 load test script
create_k6_script() {
    local script_file="$RESULTS_DIR/load_test.js"
    
    cat > "$script_file" << EOF
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
export let errorRate = new Rate('errors');

// Test configuration
export let options = {
  stages: [
    { duration: '${WARMUP_TIME}', target: ${CONNECTIONS} }, // warm up
    { duration: '${DURATION}', target: ${CONNECTIONS} },   // stay at ${CONNECTIONS} for ${DURATION}
    { duration: '10s', target: 0 },                        // ramp-down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.1'],    // http errors should be less than 10%
  },
};

const BASE_URL = '${BACKEND_URL}';

export default function () {
  // Test health endpoint
  let healthRes = http.get(\`\${BASE_URL}/api/v1/health\`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 100ms': (r) => r.timings.duration < 100,
  }) || errorRate.add(1);

  sleep(1);
  
  // Test API endpoints (add more based on your API)
  let endpoints = [
    '/api/v1/books',
    '/api/v1/indexers',
    '/api/v1/downloads',
  ];
  
  endpoints.forEach(endpoint => {
    let res = http.get(\`\${BASE_URL}\${endpoint}\`);
    check(res, {
      [\`\${endpoint} status is 200 or 401\`]: (r) => r.status === 200 || r.status === 401, // 401 might be expected for protected endpoints
      [\`\${endpoint} response time < 1000ms\`]: (r) => r.timings.duration < 1000,
    }) || errorRate.add(1);
    
    sleep(0.5);
  });
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data, null, 2),
    'summary.html': htmlReport(data),
  };
}

function htmlReport(data) {
  const template = \`
<!DOCTYPE html>
<html>
<head>
    <title>FolioFox Load Test Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
        .success { color: green; } .warning { color: orange; } .error { color: red; }
    </style>
</head>
<body>
    <h1>FolioFox Load Test Results</h1>
    <p>Generated on: \${new Date().toISOString()}</p>
    
    <h2>Summary</h2>
    <div class="metric">
        <strong>Total Requests:</strong> \${data.metrics.http_reqs.count}
    </div>
    <div class="metric">
        <strong>Failed Requests:</strong> \${data.metrics.http_req_failed.count} (\${(data.metrics.http_req_failed.rate * 100).toFixed(2)}%)
    </div>
    <div class="metric">
        <strong>Average Response Time:</strong> \${data.metrics.http_req_duration.avg.toFixed(2)}ms
    </div>
    <div class="metric">
        <strong>95th Percentile:</strong> \${data.metrics.http_req_duration['p(95)'].toFixed(2)}ms
    </div>
    <div class="metric">
        <strong>Request Rate:</strong> \${data.metrics.http_reqs.rate.toFixed(2)} req/s
    </div>
    
    <h2>Detailed Metrics</h2>
    <pre>\${JSON.stringify(data.metrics, null, 2)}</pre>
</body>
</html>
\`;
  return template;
}
EOF
    
    echo "$script_file"
}

# Run k6 load tests
run_k6_load_test() {
    log "Running k6 load tests..."
    
    if ! command -v k6 &> /dev/null; then
        warning "k6 not found, skipping load tests"
        info "Install k6: https://k6.io/docs/getting-started/installation/"
        return 0
    fi
    
    local script_file
    script_file=$(create_k6_script)
    
    cd "$RESULTS_DIR"
    
    # Run load test
    if k6 run --out json=load_test_results.json "$script_file"; then
        success "k6 load test completed"
        
        # Generate additional reports if results exist
        if [[ -f "summary.json" ]]; then
            info "Load test summary saved to summary.json"
        fi
        
        if [[ -f "summary.html" ]]; then
            info "Load test HTML report saved to summary.html"
        fi
    else
        error "k6 load test failed"
        return 1
    fi
    
    cd "$PROJECT_ROOT"
}

# Run curl-based stress test (fallback if k6 not available)
run_curl_stress_test() {
    log "Running curl-based stress test..."
    
    local test_urls=(
        "$BACKEND_URL/api/v1/health"
        "$BACKEND_URL/api/v1/books"
        "$BACKEND_URL/api/v1/indexers"
    )
    
    local results_file="$RESULTS_DIR/curl_stress_test.txt"
    
    echo "Curl Stress Test Results" > "$results_file"
    echo "========================" >> "$results_file"
    echo "Test Date: $(date)" >> "$results_file"
    echo "Duration: $DURATION" >> "$results_file"
    echo "Concurrent Connections: $CONNECTIONS" >> "$results_file"
    echo "" >> "$results_file"
    
    for url in "${test_urls[@]}"; do
        echo "Testing: $url" | tee -a "$results_file"
        
        # Convert duration to seconds for timeout
        local timeout_seconds
        timeout_seconds=$(echo "$DURATION" | sed 's/s//')
        
        # Run concurrent requests
        for ((i=1; i<=CONNECTIONS; i++)); do
            (
                local start_time=$(date +%s.%N)
                local response_code
                response_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$timeout_seconds" "$url")
                local end_time=$(date +%s.%N)
                local duration=$(echo "$end_time - $start_time" | bc -l)
                
                echo "Connection $i: HTTP $response_code, Time: ${duration}s"
            ) &
        done
        
        # Wait for all background jobs to complete
        wait
        
        echo "" | tee -a "$results_file"
    done
    
    success "Curl stress test completed"
}

# Profile Go application
run_go_profiling() {
    log "Running Go profiling..."
    
    if ! command -v go &> /dev/null; then
        warning "Go not found, skipping profiling"
        return 0
    fi
    
    cd "$PROJECT_ROOT"
    
    # CPU profiling
    log "Running CPU profiling..."
    if go test -cpuprofile="$RESULTS_DIR/cpu.prof" -bench=. ./... > "$RESULTS_DIR/profile_output.txt" 2>&1; then
        success "CPU profiling completed"
        
        # Generate CPU profile report
        if command -v go &> /dev/null; then
            go tool pprof -text "$RESULTS_DIR/cpu.prof" > "$RESULTS_DIR/cpu_profile_report.txt" 2>&1 || true
        fi
    else
        warning "CPU profiling failed"
    fi
    
    # Memory profiling
    log "Running memory profiling..."
    if go test -memprofile="$RESULTS_DIR/mem.prof" -bench=. ./... >> "$RESULTS_DIR/profile_output.txt" 2>&1; then
        success "Memory profiling completed"
        
        # Generate memory profile report
        if command -v go &> /dev/null; then
            go tool pprof -text "$RESULTS_DIR/mem.prof" > "$RESULTS_DIR/mem_profile_report.txt" 2>&1 || true
        fi
    else
        warning "Memory profiling failed"
    fi
}

# Analyze Docker container performance
run_container_analysis() {
    log "Analyzing Docker container performance..."
    
    if ! command -v docker &> /dev/null; then
        warning "Docker not found, skipping container analysis"
        return 0
    fi
    
    # Get container stats
    local stats_file="$RESULTS_DIR/container_stats.txt"
    
    echo "Docker Container Performance Analysis" > "$stats_file"
    echo "====================================" >> "$stats_file"
    echo "Timestamp: $(date)" >> "$stats_file"
    echo "" >> "$stats_file"
    
    # Check if containers are running
    if docker compose ps | grep -q "running"; then
        echo "Container Status:" >> "$stats_file"
        docker compose ps >> "$stats_file"
        echo "" >> "$stats_file"
        
        echo "Resource Usage (snapshot):" >> "$stats_file"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" >> "$stats_file"
        echo "" >> "$stats_file"
        
        # Collect stats over time during test
        log "Collecting container stats during test..."
        local stats_duration=30
        docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" > "$RESULTS_DIR/container_stats_over_time.txt" &
        local docker_stats_pid=$!
        
        sleep "$stats_duration"
        kill $docker_stats_pid 2>/dev/null || true
        
        success "Container analysis completed"
    else
        warning "No running containers found"
    fi
}

# Generate performance report
generate_report() {
    log "Generating performance report..."
    
    local report_file="$RESULTS_DIR/performance_report.md"
    
    cat > "$report_file" << EOF
# FolioFox Performance Test Report

**Generated on:** $(date)  
**Test Configuration:**
- Backend URL: $BACKEND_URL
- Frontend URL: $FRONTEND_URL
- Duration: $DURATION
- Connections: $CONNECTIONS
- Target RPS: $RPS

## Test Summary

### Go Benchmarks
$(if [[ -f "$RESULTS_DIR/go_benchmarks.txt" ]]; then
    echo "✅ Completed - see go_benchmarks.txt"
else
    echo "❌ Skipped or failed"
fi)

### Frontend Performance Tests
$(if [[ -f "$RESULTS_DIR/frontend_performance.txt" ]]; then
    echo "✅ Completed - see frontend_performance.txt"
else
    echo "❌ Skipped or failed"
fi)

### Load Testing
$(if [[ -f "$RESULTS_DIR/summary.json" ]]; then
    echo "✅ k6 load test completed - see summary.json and summary.html"
elif [[ -f "$RESULTS_DIR/curl_stress_test.txt" ]]; then
    echo "✅ Curl stress test completed - see curl_stress_test.txt"
else
    echo "❌ Load testing skipped or failed"
fi)

### Profiling
$(if [[ -f "$RESULTS_DIR/cpu.prof" ]]; then
    echo "✅ CPU profiling completed - see cpu.prof and cpu_profile_report.txt"
else
    echo "❌ CPU profiling skipped or failed"
fi)

$(if [[ -f "$RESULTS_DIR/mem.prof" ]]; then
    echo "✅ Memory profiling completed - see mem.prof and mem_profile_report.txt"
else
    echo "❌ Memory profiling skipped or failed"
fi)

### Container Analysis
$(if [[ -f "$RESULTS_DIR/container_stats.txt" ]]; then
    echo "✅ Container analysis completed - see container_stats.txt"
else
    echo "❌ Container analysis skipped or failed"
fi)

## Files Generated

EOF
    
    # List all generated files
    find "$RESULTS_DIR" -type f -name "*.txt" -o -name "*.json" -o -name "*.html" -o -name "*.prof" | while read -r file; do
        echo "- $(basename "$file")" >> "$report_file"
    done
    
    cat >> "$report_file" << EOF

## Recommendations

### Performance Optimization
- Review CPU and memory profiles for bottlenecks
- Check database query performance
- Optimize API response times
- Consider caching strategies

### Load Testing
- Increase load gradually to find breaking points
- Test with realistic data volumes
- Monitor system resources during peak load
- Set up performance regression testing

### Monitoring
- Set up continuous performance monitoring
- Configure alerts for performance degradation
- Track key performance metrics over time

## Next Steps

1. Analyze the generated reports
2. Identify performance bottlenecks
3. Implement optimizations
4. Re-run tests to validate improvements
5. Set up automated performance testing in CI/CD

EOF
    
    success "Performance report generated: $report_file"
}

# Run all performance tests
run_all_tests() {
    log "Starting comprehensive performance testing..."
    
    create_results_dir
    
    if ! check_prerequisites; then
        error "Prerequisites check failed"
        return 1
    fi
    
    # Run tests in parallel where possible
    run_go_benchmarks &
    local go_bench_pid=$!
    
    run_frontend_performance &
    local frontend_perf_pid=$!
    
    run_container_analysis &
    local container_analysis_pid=$!
    
    # Wait for background jobs
    wait $go_bench_pid
    wait $frontend_perf_pid
    wait $container_analysis_pid
    
    # Run profiling (sequential)
    run_go_profiling
    
    # Run load tests (sequential)
    if command -v k6 &> /dev/null; then
        run_k6_load_test
    else
        run_curl_stress_test
    fi
    
    # Generate final report
    generate_report
    
    success "Performance testing completed!"
    info "Results saved to: $RESULTS_DIR"
    
    # Show quick summary
    echo ""
    echo -e "${WHITE}Quick Summary:${NC}"
    echo "📁 Results directory: $RESULTS_DIR"
    echo "📊 Main report: $RESULTS_DIR/performance_report.md"
    
    if [[ -f "$RESULTS_DIR/summary.html" ]]; then
        echo "🌐 Load test report: $RESULTS_DIR/summary.html"
    fi
    
    echo ""
    echo -e "${CYAN}View the report with:${NC}"
    echo "  cat $RESULTS_DIR/performance_report.md"
    
    if [[ -f "$RESULTS_DIR/summary.html" ]]; then
        echo "  open $RESULTS_DIR/summary.html"
    fi
}

# Show help
show_help() {
    cat << EOF
FolioFox Performance Testing Script

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    all             Run all performance tests (default)
    benchmark       Run Go benchmarks only
    frontend        Run frontend performance tests only
    load            Run load tests only
    profile         Run Go profiling only
    container       Run container analysis only
    help            Show this help message

Options:
    --backend-url URL       Backend URL (default: http://localhost:8080)
    --frontend-url URL      Frontend URL (default: http://localhost:3000)
    --duration DURATION     Test duration (default: 30s)
    --connections NUM       Concurrent connections (default: 10)
    --rps NUM              Target requests per second (default: 100)
    --warmup TIME          Warmup time (default: 10s)
    --results-dir DIR      Custom results directory

Environment Variables:
    BACKEND_URL            Backend service URL
    FRONTEND_URL           Frontend service URL
    DURATION               Test duration
    CONNECTIONS            Number of concurrent connections
    RPS                    Target requests per second
    WARMUP_TIME            Warmup duration

Examples:
    $0                                    # Run all tests with defaults
    $0 load --duration 60s --connections 20  # Custom load test
    $0 benchmark                          # Run only Go benchmarks
    $0 all --backend-url http://prod:8080 # Test against production

Prerequisites:
    - FolioFox services must be running
    - k6 (optional, for advanced load testing)
    - Go (for benchmarks and profiling)
    - Docker (for container analysis)

EOF
}

# Parse command line arguments
COMMAND="all"

while [[ $# -gt 0 ]]; do
    case $1 in
        all|benchmark|frontend|load|profile|container|help)
            COMMAND=$1
            shift
            ;;
        --backend-url)
            BACKEND_URL=$2
            shift 2
            ;;
        --frontend-url)
            FRONTEND_URL=$2
            shift 2
            ;;
        --duration)
            DURATION=$2
            shift 2
            ;;
        --connections)
            CONNECTIONS=$2
            shift 2
            ;;
        --rps)
            RPS=$2
            shift 2
            ;;
        --warmup)
            WARMUP_TIME=$2
            shift 2
            ;;
        --results-dir)
            RESULTS_DIR=$2
            mkdir -p "$RESULTS_DIR"
            shift 2
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
    all)
        run_all_tests
        ;;
    benchmark)
        create_results_dir
        run_go_benchmarks
        ;;
    frontend)
        create_results_dir
        run_frontend_performance
        ;;
    load)
        create_results_dir
        check_prerequisites
        if command -v k6 &> /dev/null; then
            run_k6_load_test
        else
            run_curl_stress_test
        fi
        ;;
    profile)
        create_results_dir
        run_go_profiling
        ;;
    container)
        create_results_dir
        run_container_analysis
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