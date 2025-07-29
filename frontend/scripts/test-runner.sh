#!/bin/bash

# FolioFox Test Runner Script
# Comprehensive test execution with reporting and CI/CD integration

set -euo pipefail

# Configuration
TEST_OUTPUT_DIR="test-results"
COVERAGE_OUTPUT_DIR="coverage"
REPORTS_DIR="reports"
LOG_FILE="test-execution.log"
PARALLEL_WORKERS=${PARALLEL_WORKERS:-4}
TIMEOUT=${TIMEOUT:-600}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")
            echo -e "${BLUE}[INFO]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE"
            ;;
        "DEBUG")
            if [[ "${DEBUG:-false}" == "true" ]]; then
                echo -e "${PURPLE}[DEBUG]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE"
            fi
            ;;
    esac
}

# Error handling
handle_error() {
    local exit_code=$?
    local line_number=$1
    log "ERROR" "Test execution failed at line $line_number with exit code $exit_code"
    cleanup
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

# Cleanup function
cleanup() {
    log "INFO" "Cleaning up test processes..."
    
    # Kill any remaining test processes
    pkill -f "vitest" || true
    pkill -f "playwright" || true
    
    # Stop any test servers
    if [[ -f ".test-server.pid" ]]; then
        kill "$(cat .test-server.pid)" || true
        rm -f ".test-server.pid"
    fi
    
    log "INFO" "Cleanup completed"
}

# Setup function
setup_test_environment() {
    log "INFO" "Setting up test environment..."
    
    # Create output directories
    mkdir -p "$TEST_OUTPUT_DIR" "$COVERAGE_OUTPUT_DIR" "$REPORTS_DIR"
    
    # Clear previous results
    rm -rf "$TEST_OUTPUT_DIR"/* || true
    rm -rf "$COVERAGE_OUTPUT_DIR"/* || true
    rm -rf "$REPORTS_DIR"/* || true
    
    # Check dependencies
    if ! command -v node &> /dev/null; then
        log "ERROR" "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log "ERROR" "npm is not installed"
        exit 1
    fi
    
    # Install dependencies if needed
    if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
        log "INFO" "Installing dependencies..."
        npm ci
    fi
    
    # Set test environment variables
    export NODE_ENV=test
    export CI=true
    export FORCE_COLOR=1
    
    log "SUCCESS" "Test environment setup completed"
}

# Unit tests execution
run_unit_tests() {
    log "INFO" "Starting unit tests..."
    
    local start_time=$(date +%s)
    local exit_code=0
    
    # Run unit tests with coverage
    npm run test:unit -- \
        --reporter=verbose \
        --reporter=junit \
        --outputFile="$TEST_OUTPUT_DIR/unit-results.xml" \
        --coverage.enabled=true \
        --coverage.reportsDirectory="$COVERAGE_OUTPUT_DIR/unit" \
        --coverage.reporter=text \
        --coverage.reporter=lcov \
        --coverage.reporter=json \
        --maxWorkers=$PARALLEL_WORKERS \
        --timeout=$TIMEOUT \
        || exit_code=$?
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ $exit_code -eq 0 ]]; then
        log "SUCCESS" "Unit tests completed successfully in ${duration}s"
    else
        log "ERROR" "Unit tests failed with exit code $exit_code"
        return $exit_code
    fi
    
    # Generate unit test report
    generate_test_report "unit" "$TEST_OUTPUT_DIR/unit-results.xml"
    
    return 0
}

# Integration tests execution
run_integration_tests() {
    log "INFO" "Starting integration tests..."
    
    local start_time=$(date +%s)
    local exit_code=0
    
    # Start test database if needed
    if [[ "${USE_TEST_DB:-false}" == "true" ]]; then
        log "INFO" "Starting test database..."
        docker-compose -f docker-compose.test.yml up -d postgres redis
        sleep 5
    fi
    
    # Run integration tests
    npm run test:integration -- \
        --reporter=verbose \
        --reporter=junit \
        --outputFile="$TEST_OUTPUT_DIR/integration-results.xml" \
        --coverage.enabled=true \
        --coverage.reportsDirectory="$COVERAGE_OUTPUT_DIR/integration" \
        --coverage.reporter=text \
        --coverage.reporter=lcov \
        --coverage.reporter=json \
        --maxWorkers=$PARALLEL_WORKERS \
        --timeout=$TIMEOUT \
        || exit_code=$?
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ $exit_code -eq 0 ]]; then
        log "SUCCESS" "Integration tests completed successfully in ${duration}s"
    else
        log "ERROR" "Integration tests failed with exit code $exit_code"
    fi
    
    # Stop test database
    if [[ "${USE_TEST_DB:-false}" == "true" ]]; then
        log "INFO" "Stopping test database..."
        docker-compose -f docker-compose.test.yml down
    fi
    
    # Generate integration test report
    generate_test_report "integration" "$TEST_OUTPUT_DIR/integration-results.xml"
    
    return $exit_code
}

# End-to-end tests execution
run_e2e_tests() {
    log "INFO" "Starting end-to-end tests..."
    
    local start_time=$(date +%s)
    local exit_code=0
    
    # Install Playwright browsers if needed
    if [[ ! -d "$HOME/.cache/ms-playwright" ]]; then
        log "INFO" "Installing Playwright browsers..."
        npx playwright install
    fi
    
    # Start application server
    log "INFO" "Starting application server..."
    npm run build
    npm run preview &
    local server_pid=$!
    echo $server_pid > .test-server.pid
    
    # Wait for server to be ready
    log "INFO" "Waiting for server to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:3000 > /dev/null; then
            log "INFO" "Server is ready"
            break
        fi
        sleep 2
        if [[ $i -eq 30 ]]; then
            log "ERROR" "Server failed to start"
            return 1
        fi
    done
    
    # Run E2E tests
    npx playwright test \
        --workers=$PARALLEL_WORKERS \
        --timeout=$((TIMEOUT * 1000)) \
        --reporter=html \
        --reporter=junit \
        --output-dir="$TEST_OUTPUT_DIR/e2e" \
        || exit_code=$?
    
    # Stop application server
    kill $server_pid || true
    rm -f .test-server.pid
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ $exit_code -eq 0 ]]; then
        log "SUCCESS" "End-to-end tests completed successfully in ${duration}s"
    else
        log "ERROR" "End-to-end tests failed with exit code $exit_code"
    fi
    
    # Move Playwright reports
    if [[ -d "playwright-report" ]]; then
        mv playwright-report "$REPORTS_DIR/e2e-report"
    fi
    
    return $exit_code
}

# Performance tests execution
run_performance_tests() {
    log "INFO" "Starting performance tests..."
    
    local start_time=$(date +%s)
    local exit_code=0
    
    # Run performance tests
    npm run test:performance -- \
        --reporter=verbose \
        --reporter=junit \
        --outputFile="$TEST_OUTPUT_DIR/performance-results.xml" \
        --maxWorkers=1 \
        --timeout=$((TIMEOUT * 2)) \
        || exit_code=$?
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ $exit_code -eq 0 ]]; then
        log "SUCCESS" "Performance tests completed successfully in ${duration}s"
    else
        log "ERROR" "Performance tests failed with exit code $exit_code"
    fi
    
    # Generate performance report
    generate_test_report "performance" "$TEST_OUTPUT_DIR/performance-results.xml"
    
    return $exit_code
}

# Accessibility tests execution
run_accessibility_tests() {
    log "INFO" "Starting accessibility tests..."
    
    local start_time=$(date +%s)
    local exit_code=0
    
    # Run accessibility tests
    npx playwright test \
        --config=playwright.config.accessibility.ts \
        --workers=$PARALLEL_WORKERS \
        --timeout=$((TIMEOUT * 1000)) \
        --reporter=html \
        --reporter=junit \
        --output-dir="$TEST_OUTPUT_DIR/accessibility" \
        || exit_code=$?
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ $exit_code -eq 0 ]]; then
        log "SUCCESS" "Accessibility tests completed successfully in ${duration}s"
    else
        log "ERROR" "Accessibility tests failed with exit code $exit_code"
    fi
    
    return $exit_code
}

# Test report generation
generate_test_report() {
    local test_type=$1
    local results_file=$2
    
    log "INFO" "Generating $test_type test report..."
    
    if [[ -f "$results_file" ]]; then
        # Convert JUnit XML to HTML report
        node -e "
        const fs = require('fs');
        const xml2js = require('xml2js');
        
        if (!fs.existsSync('$results_file')) {
            console.log('Results file not found: $results_file');
            process.exit(0);
        }
        
        const xml = fs.readFileSync('$results_file', 'utf8');
        xml2js.parseString(xml, (err, result) => {
            if (err) {
                console.error('Error parsing XML:', err);
                return;
            }
            
            const testsuites = result.testsuites || {};
            const suites = testsuites.testsuite || [];
            
            let html = \`
<!DOCTYPE html>
<html>
<head>
    <title>$test_type Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e9ecef; padding: 15px; border-radius: 5px; flex: 1; }
        .metric.success { background: #d4edda; color: #155724; }
        .metric.failure { background: #f8d7da; color: #721c24; }
        .suite { border: 1px solid #ddd; margin: 10px 0; border-radius: 5px; }
        .suite-header { background: #f8f9fa; padding: 15px; font-weight: bold; }
        .test-case { padding: 10px 15px; border-bottom: 1px solid #eee; }
        .test-case:last-child { border-bottom: none; }
        .test-case.passed { background: #d4edda; }
        .test-case.failed { background: #f8d7da; }
        .failure-message { color: #721c24; font-family: monospace; font-size: 12px; }
    </style>
</head>
<body>
    <div class=\"header\">
        <h1>$test_type Test Report</h1>
        <p>Generated: \${new Date().toISOString()}</p>
    </div>
\`;
            
            let totalTests = 0;
            let totalFailures = 0;
            let totalErrors = 0;
            let totalTime = 0;
            
            suites.forEach(suite => {
                const tests = parseInt(suite.$.tests || 0);
                const failures = parseInt(suite.$.failures || 0);
                const errors = parseInt(suite.$.errors || 0);
                const time = parseFloat(suite.$.time || 0);
                
                totalTests += tests;
                totalFailures += failures;
                totalErrors += errors;
                totalTime += time;
            });
            
            html += \`
    <div class=\"summary\">
        <div class=\"metric\">
            <h3>Total Tests</h3>
            <div style=\"font-size: 24px; font-weight: bold;\">\${totalTests}</div>
        </div>
        <div class=\"metric \${totalFailures + totalErrors === 0 ? 'success' : 'failure'}\">
            <h3>Passed</h3>
            <div style=\"font-size: 24px; font-weight: bold;\">\${totalTests - totalFailures - totalErrors}</div>
        </div>
        <div class=\"metric \${totalFailures > 0 ? 'failure' : ''}\">
            <h3>Failed</h3>
            <div style=\"font-size: 24px; font-weight: bold;\">\${totalFailures}</div>
        </div>
        <div class=\"metric \${totalErrors > 0 ? 'failure' : ''}\">
            <h3>Errors</h3>
            <div style=\"font-size: 24px; font-weight: bold;\">\${totalErrors}</div>
        </div>
        <div class=\"metric\">
            <h3>Duration</h3>
            <div style=\"font-size: 24px; font-weight: bold;\">\${totalTime.toFixed(2)}s</div>
        </div>
    </div>
\`;
            
            suites.forEach(suite => {
                const suiteName = suite.$.name || 'Unknown Suite';
                const tests = suite.testcase || [];
                
                html += \`<div class=\"suite\">
                    <div class=\"suite-header\">\${suiteName}</div>\`;
                
                tests.forEach(test => {
                    const testName = test.$.name || 'Unknown Test';
                    const hasFailed = test.failure || test.error;
                    const status = hasFailed ? 'failed' : 'passed';
                    
                    html += \`<div class=\"test-case \${status}\">
                        <strong>\${testName}</strong>\`;
                    
                    if (hasFailed) {
                        const failure = test.failure || test.error;
                        if (failure && failure[0] && failure[0]._) {
                            html += \`<div class=\"failure-message\">\${failure[0]._}</div>\`;
                        }
                    }
                    
                    html += \`</div>\`;
                });
                
                html += \`</div>\`;
            });
            
            html += \`
</body>
</html>\`;
            
            fs.writeFileSync('$REPORTS_DIR/$test_type-report.html', html);
            console.log('Report generated: $REPORTS_DIR/$test_type-report.html');
        });
        " 2>/dev/null || log "WARN" "Could not generate HTML report for $test_type tests"
    else
        log "WARN" "No results file found for $test_type tests: $results_file"
    fi
}

# Coverage report generation
generate_coverage_report() {
    log "INFO" "Generating combined coverage report..."
    
    # Merge coverage reports
    if command -v nyc &> /dev/null; then
        nyc merge "$COVERAGE_OUTPUT_DIR" "$COVERAGE_OUTPUT_DIR/merged-coverage.json"
        nyc report \
            --temp-dir="$COVERAGE_OUTPUT_DIR" \
            --report-dir="$REPORTS_DIR/coverage" \
            --reporter=html \
            --reporter=text \
            --reporter=lcov
            
        log "SUCCESS" "Coverage report generated: $REPORTS_DIR/coverage/index.html"
    else
        log "WARN" "nyc not found, skipping coverage report merge"
    fi
}

# Slack notification
send_slack_notification() {
    local status=$1
    local message=$2
    
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        local color
        if [[ "$status" == "success" ]]; then
            color="good"
        elif [[ "$status" == "failure" ]]; then
            color="danger"
        else
            color="warning"
        fi
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"FolioFox Test Results\",
                    \"text\": \"$message\",
                    \"fields\": [
                        {
                            \"title\": \"Branch\",
                            \"value\": \"${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}\",
                            \"short\": true
                        },
                        {
                            \"title\": \"Commit\",
                            \"value\": \"${GIT_COMMIT:-$(git rev-parse --short HEAD)}\",
                            \"short\": true
                        }
                    ]
                }]
            }" \
            "$SLACK_WEBHOOK_URL" 2>/dev/null || log "WARN" "Failed to send Slack notification"
    fi
}

# Email notification
send_email_notification() {
    local status=$1
    local message=$2
    
    if [[ -n "${EMAIL_RECIPIENTS:-}" ]] && command -v mail &> /dev/null; then
        local subject="FolioFox Test Results - $status"
        
        echo "$message" | mail -s "$subject" "$EMAIL_RECIPIENTS" || \
            log "WARN" "Failed to send email notification"
    fi
}

# Main execution function
main() {
    local test_suite=${1:-"all"}
    local start_time=$(date +%s)
    local overall_exit_code=0
    
    log "INFO" "Starting FolioFox test execution - Suite: $test_suite"
    
    # Setup
    setup_test_environment
    
    # Execute tests based on suite selection
    case $test_suite in
        "unit")
            run_unit_tests || overall_exit_code=$?
            ;;
        "integration")
            run_integration_tests || overall_exit_code=$?
            ;;
        "e2e")
            run_e2e_tests || overall_exit_code=$?
            ;;
        "performance")
            run_performance_tests || overall_exit_code=$?
            ;;
        "accessibility")
            run_accessibility_tests || overall_exit_code=$?
            ;;
        "all")
            run_unit_tests || overall_exit_code=$?
            run_integration_tests || overall_exit_code=$?
            run_performance_tests || overall_exit_code=$?
            run_e2e_tests || overall_exit_code=$?
            run_accessibility_tests || overall_exit_code=$?
            ;;
        *)
            log "ERROR" "Unknown test suite: $test_suite"
            echo "Usage: $0 [unit|integration|e2e|performance|accessibility|all]"
            exit 1
            ;;
    esac
    
    # Generate reports
    generate_coverage_report
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    
    # Summary
    if [[ $overall_exit_code -eq 0 ]]; then
        local success_message="All tests passed successfully in ${total_duration}s"
        log "SUCCESS" "$success_message"
        send_slack_notification "success" "$success_message"
        send_email_notification "SUCCESS" "$success_message"
    else
        local failure_message="Some tests failed. Check logs for details. Total duration: ${total_duration}s"
        log "ERROR" "$failure_message"
        send_slack_notification "failure" "$failure_message"
        send_email_notification "FAILURE" "$failure_message"
    fi
    
    # Cleanup
    cleanup
    
    exit $overall_exit_code
}

# Handle script termination
trap cleanup EXIT

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi