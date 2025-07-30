#!/bin/bash

# ==================================================================================
# FolioFox CI Configuration Checker
# ==================================================================================
# Validates CI/CD configuration and simulates GitHub Actions locally
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
CI_DIR="$PROJECT_ROOT/.github/workflows"

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

# Check if GitHub Actions workflows exist
check_workflows() {
    log "Checking GitHub Actions workflows..."
    
    if [[ ! -d "$CI_DIR" ]]; then
        error "GitHub Actions workflows directory not found: $CI_DIR"
        return 1
    fi
    
    local workflows=(
        "ci-cd.yml"
        "ci.yml"
    )
    
    local found_workflows=()
    
    for workflow in "${workflows[@]}"; do
        if [[ -f "$CI_DIR/$workflow" ]]; then
            found_workflows+=("$workflow")
            success "Found workflow: $workflow"
        fi
    done
    
    if [[ ${#found_workflows[@]} -eq 0 ]]; then
        error "No GitHub Actions workflows found"
        return 1
    fi
    
    info "Found ${#found_workflows[@]} workflow(s)"
    return 0
}

# Validate YAML syntax
validate_yaml_syntax() {
    log "Validating YAML syntax..."
    
    local yaml_files=()
    local validation_failed=0
    
    # Find all YAML files in workflows directory
    while IFS= read -r -d '' file; do
        yaml_files+=("$file")
    done < <(find "$CI_DIR" -name "*.yml" -o -name "*.yaml" -print0 2>/dev/null)
    
    if [[ ${#yaml_files[@]} -eq 0 ]]; then
        warning "No YAML files found in workflows directory"
        return 0
    fi
    
    for file in "${yaml_files[@]}"; do
        local filename=$(basename "$file")
        
        # Check if yamllint is available
        if command -v yamllint &> /dev/null; then
            if yamllint "$file" >/dev/null 2>&1; then
                success "YAML syntax valid: $filename"
            else
                error "YAML syntax error in: $filename"
                yamllint "$file" 2>&1 | head -10
                validation_failed=1
            fi
        # Fallback to Python YAML parser
        elif command -v python3 &> /dev/null; then
            if python3 -c "import yaml; yaml.safe_load(open('$file'))" >/dev/null 2>&1; then
                success "YAML syntax valid: $filename"
            else
                error "YAML syntax error in: $filename"
                validation_failed=1
            fi
        else
            warning "No YAML validator found (yamllint or python3), skipping syntax check for $filename"
        fi
    done
    
    return $validation_failed
}

# Simulate backend testing
simulate_backend_tests() {
    log "Simulating backend testing pipeline..."
    
    cd "$PROJECT_ROOT"
    
    # Check Go modules
    if ! go mod verify; then
        error "Go modules verification failed"
        return 1
    fi
    success "Go modules verified"
    
    # Check Go vet
    if go vet ./...; then
        success "Go vet passed"
    else
        error "Go vet failed"
        return 1
    fi
    
    # Check staticcheck if available
    if command -v staticcheck &> /dev/null; then
        if staticcheck ./...; then
            success "Static analysis passed"
        else
            error "Static analysis failed"
            return 1
        fi
    else
        warning "staticcheck not available, skipping static analysis"
    fi
    
    # Check security scan if available
    if command -v gosec &> /dev/null; then
        if gosec -severity medium -confidence medium -quiet ./...; then
            success "Security scan passed"
        else
            error "Security scan failed"
            return 1
        fi
    else
        warning "gosec not available, skipping security scan"
    fi
    
    # Run tests
    if go test -v -race ./...; then
        success "Go tests passed"
    else
        error "Go tests failed"
        return 1
    fi
    
    return 0
}

# Simulate frontend testing
simulate_frontend_tests() {
    log "Simulating frontend testing pipeline..."
    
    cd "$FRONTEND_DIR"
    
    # Check if node_modules exists
    if [[ ! -d "node_modules" ]]; then
        warning "node_modules not found, running npm install..."
        npm ci
    fi
    
    # Type check
    if npm run type-check; then
        success "TypeScript type check passed"
    else
        error "TypeScript type check failed"
        return 1
    fi
    
    # Lint
    if npm run lint; then
        success "ESLint passed"
    else
        error "ESLint failed"
        return 1
    fi
    
    # Unit tests
    if npm run test:unit; then
        success "Frontend unit tests passed"
    else
        error "Frontend unit tests failed"
        return 1
    fi
    
    # Integration tests
    if npm run test:integration; then
        success "Frontend integration tests passed"
    else
        error "Frontend integration tests failed"
        return 1
    fi
    
    cd "$PROJECT_ROOT"
    return 0
}

# Simulate build process
simulate_build() {
    log "Simulating build process..."
    
    # Build backend
    if go build -o /tmp/foliofox-ci-test ./cmd/foliofox; then
        success "Backend build successful"
        rm -f /tmp/foliofox-ci-test
    else
        error "Backend build failed"
        return 1
    fi
    
    # Build frontend
    cd "$FRONTEND_DIR"
    if npm run build; then
        success "Frontend build successful"
    else
        error "Frontend build failed"
        return 1
    fi
    
    cd "$PROJECT_ROOT"
    return 0
}

# Check Docker configuration
check_docker_config() {
    log "Checking Docker configuration..."
    
    # Check Dockerfiles
    local dockerfiles=(
        "Dockerfile.backend"
        "Dockerfile.frontend"
    )
    
    for dockerfile in "${dockerfiles[@]}"; do
        if [[ -f "$PROJECT_ROOT/$dockerfile" ]]; then
            success "Found: $dockerfile"
            
            # Basic Dockerfile validation
            if grep -q "FROM" "$PROJECT_ROOT/$dockerfile"; then
                success "$dockerfile has valid FROM instruction"
            else
                error "$dockerfile missing FROM instruction"
                return 1
            fi
        else
            error "Missing: $dockerfile"
            return 1
        fi
    done
    
    # Check docker-compose files
    local compose_files=(
        "docker-compose.yml"
        "docker-compose.monitoring.yml"
    )
    
    for compose_file in "${compose_files[@]}"; do
        if [[ -f "$PROJECT_ROOT/$compose_file" ]]; then
            success "Found: $compose_file"
        else
            if [[ "$compose_file" == "docker-compose.yml" ]]; then
                error "Missing required: $compose_file"
                return 1
            else
                warning "Optional file missing: $compose_file"
            fi
        fi
    done
    
    return 0
}

# Check environment configuration
check_environment_config() {
    log "Checking environment configuration..."
    
    # Check for .env.example or .env
    if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
        success "Found .env.example"
    elif [[ -f "$PROJECT_ROOT/.env" ]]; then
        success "Found .env"
    else
        warning "No .env.example or .env file found"
    fi
    
    # Check for required directories
    local required_dirs=(
        "cmd/foliofox"
        "internal"
        "frontend/src"
        "database"
        "scripts"
    )
    
    for dir in "${required_dirs[@]}"; do
        if [[ -d "$PROJECT_ROOT/$dir" ]]; then
            success "Directory exists: $dir"
        else
            error "Required directory missing: $dir"
            return 1
        fi
    done
    
    return 0
}

# Check dependencies and tools
check_dependencies() {
    log "Checking dependencies and tools..."
    
    # Required tools
    local required_tools=(
        "go:Go compiler"
        "node:Node.js"
        "npm:Node package manager"
        "docker:Docker"
        "git:Git version control"
    )
    
    local missing_tools=()
    
    for tool_spec in "${required_tools[@]}"; do
        IFS=':' read -r tool description <<< "$tool_spec"
        
        if command -v "$tool" &> /dev/null; then
            success "$description is available"
        else
            error "$description is not available"
            missing_tools+=("$tool")
        fi
    done
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        error "Missing required tools: ${missing_tools[*]}"
        return 1
    fi
    
    # Optional tools
    local optional_tools=(
        "staticcheck:Go static analysis"
        "gosec:Go security scanner"
        "yamllint:YAML linter"
        "trivy:Container security scanner"
        "k6:Load testing tool"
    )
    
    for tool_spec in "${optional_tools[@]}"; do
        IFS=':' read -r tool description <<< "$tool_spec"
        
        if command -v "$tool" &> /dev/null; then
            success "$description is available"
        else
            info "$description is not available (optional)"
        fi
    done
    
    return 0
}

# Generate CI status report
generate_ci_report() {
    log "Generating CI status report..."
    
    local report_file="$PROJECT_ROOT/ci-check-report.md"
    local timestamp=$(date)
    
    cat > "$report_file" << EOF
# FolioFox CI Configuration Report

**Generated on:** $timestamp

## Summary

### GitHub Actions Workflows
$(if check_workflows >/dev/null 2>&1; then echo "✅ Valid"; else echo "❌ Issues found"; fi)

### YAML Syntax
$(if validate_yaml_syntax >/dev/null 2>&1; then echo "✅ Valid"; else echo "❌ Syntax errors"; fi)

### Docker Configuration
$(if check_docker_config >/dev/null 2>&1; then echo "✅ Valid"; else echo "❌ Issues found"; fi)

### Environment Configuration
$(if check_environment_config >/dev/null 2>&1; then echo "✅ Valid"; else echo "❌ Issues found"; fi)

### Dependencies
$(if check_dependencies >/dev/null 2>&1; then echo "✅ All required tools available"; else echo "❌ Missing dependencies"; fi)

## Test Simulation Results

### Backend Tests
$(if simulate_backend_tests >/dev/null 2>&1; then echo "✅ Would pass"; else echo "❌ Would fail"; fi)

### Frontend Tests
$(if simulate_frontend_tests >/dev/null 2>&1; then echo "✅ Would pass"; else echo "❌ Would fail"; fi)

### Build Process
$(if simulate_build >/dev/null 2>&1; then echo "✅ Would succeed"; else echo "❌ Would fail"; fi)

## Recommendations

### Immediate Actions
- Review any failed checks above
- Install missing dependencies
- Fix configuration issues

### Improvements
- Set up pre-commit hooks for code quality
- Add performance testing to CI pipeline
- Configure security scanning
- Set up deployment automation

### Monitoring
- Set up CI/CD pipeline notifications
- Monitor build performance
- Track test coverage over time

## Files Checked

EOF
    
    # List checked files
    echo "### Workflow Files" >> "$report_file"
    find "$CI_DIR" -name "*.yml" -o -name "*.yaml" 2>/dev/null | while read -r file; do
        echo "- $(basename "$file")" >> "$report_file"
    done
    
    echo "" >> "$report_file"
    echo "### Docker Files" >> "$report_file"
    echo "- Dockerfile.backend" >> "$report_file"
    echo "- Dockerfile.frontend" >> "$report_file"
    echo "- docker-compose.yml" >> "$report_file"
    
    success "CI report generated: $report_file"
}

# Run comprehensive CI check
run_full_check() {
    log "Running comprehensive CI configuration check..."
    
    local exit_code=0
    
    # Configuration checks
    check_workflows || exit_code=1
    echo ""
    
    validate_yaml_syntax || exit_code=1
    echo ""
    
    check_docker_config || exit_code=1
    echo ""
    
    check_environment_config || exit_code=1
    echo ""
    
    check_dependencies || exit_code=1
    echo ""
    
    # Test simulations
    if [[ $exit_code -eq 0 ]]; then
        simulate_backend_tests || exit_code=1
        echo ""
        
        simulate_frontend_tests || exit_code=1
        echo ""
        
        simulate_build || exit_code=1
        echo ""
    else
        warning "Skipping test simulations due to configuration errors"
    fi
    
    # Generate report
    generate_ci_report
    
    # Summary
    if [[ $exit_code -eq 0 ]]; then
        echo -e "${GREEN}🎉 CI configuration check passed!${NC}"
        echo -e "${CYAN}Your CI/CD pipeline should work correctly.${NC}"
    else
        echo -e "${RED}⚠️  CI configuration check failed!${NC}"
        echo -e "${YELLOW}Please fix the issues above before pushing to CI.${NC}"
    fi
    
    return $exit_code
}

# Show help
show_help() {
    cat << EOF
FolioFox CI Configuration Checker

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    check           Run comprehensive CI check (default)
    workflows       Check GitHub Actions workflows only
    yaml            Validate YAML syntax only
    backend         Simulate backend testing only
    frontend        Simulate frontend testing only
    build           Simulate build process only
    docker          Check Docker configuration only
    deps            Check dependencies only
    report          Generate CI status report
    help            Show this help message

Options:
    --quiet         Suppress non-error output
    --verbose       Show detailed output

This script validates:
- GitHub Actions workflow files
- YAML syntax in CI configurations
- Docker and docker-compose files
- Required dependencies and tools
- Project structure
- Simulates CI pipeline steps locally

The goal is to catch CI issues before pushing to GitHub.

EOF
}

# Parse command line arguments
COMMAND="check"
QUIET=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        check|workflows|yaml|backend|frontend|build|docker|deps|report|help)
            COMMAND=$1
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
        run_full_check
        ;;
    workflows)
        check_workflows
        ;;
    yaml)
        validate_yaml_syntax
        ;;
    backend)
        simulate_backend_tests
        ;;
    frontend)
        simulate_frontend_tests
        ;;
    build)
        simulate_build
        ;;
    docker)
        check_docker_config
        ;;
    deps)
        check_dependencies
        ;;
    report)
        generate_ci_report
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