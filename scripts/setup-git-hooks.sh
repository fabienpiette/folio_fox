#!/bin/bash

# ==================================================================================
# FolioFox Git Hooks Setup Script
# ==================================================================================
# Installs and configures Git hooks for automated code quality checks
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
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

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

# Check if we're in a Git repository
check_git_repo() {
    if [[ ! -d "$PROJECT_ROOT/.git" ]]; then
        error "This is not a Git repository"
        info "Initialize Git repository with: git init"
        exit 1
    fi
    success "Git repository detected"
}

# Create pre-commit hook
create_pre_commit_hook() {
    log "Creating pre-commit hook..."
    
    local hook_file="$HOOKS_DIR/pre-commit"
    
    cat > "$hook_file" << 'EOF'
#!/bin/bash

# ==================================================================================
# FolioFox Pre-commit Hook
# ==================================================================================
# Runs code quality checks before allowing commits
# ==================================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo -e "${BLUE}🔍 Running pre-commit checks...${NC}"

# Check if this is a merge commit
if git rev-parse -q --verify MERGE_HEAD; then
    echo -e "${YELLOW}⚠️  Merge commit detected, skipping pre-commit checks${NC}"
    exit 0
fi

# Get list of staged files
STAGED_GO_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.go$' || true)
STAGED_TS_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' || true)
STAGED_JS_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx)$' || true)

# Flag to track if any checks fail
CHECKS_FAILED=0

# Function to run command and track failures
run_check() {
    local description="$1"
    shift
    
    echo -e "${BLUE}➤${NC} $description"
    
    if "$@"; then
        echo -e "${GREEN}✓${NC} $description passed"
    else
        echo -e "${RED}✗${NC} $description failed"
        CHECKS_FAILED=1
    fi
}

# Go checks
if [[ -n "$STAGED_GO_FILES" ]]; then
    echo -e "${BLUE}📝 Checking Go files...${NC}"
    
    # Format Go files
    run_check "Go formatting" gofmt -l $STAGED_GO_FILES | wc -l | grep -q "^0$"
    
    # Run go vet
    run_check "Go vet" go vet ./...
    
    # Run staticcheck if available
    if command -v staticcheck &> /dev/null; then
        run_check "Static analysis" staticcheck ./...
    else
        echo -e "${YELLOW}⚠️  staticcheck not found, skipping static analysis${NC}"
    fi
    
    # Run gosec if available
    if command -v gosec &> /dev/null; then
        run_check "Security scan" gosec -quiet ./...
    else
        echo -e "${YELLOW}⚠️  gosec not found, skipping security scan${NC}"
    fi
    
    # Run tests for affected packages
    AFFECTED_PACKAGES=$(echo "$STAGED_GO_FILES" | xargs -I {} dirname {} | sort -u | xargs -I {} echo "./{}...")
    if [[ -n "$AFFECTED_PACKAGES" ]]; then
        run_check "Go tests" go test -short $AFFECTED_PACKAGES
    fi
fi

# Frontend checks
if [[ -n "$STAGED_TS_FILES" || -n "$STAGED_JS_FILES" ]]; then
    echo -e "${BLUE}🎨 Checking frontend files...${NC}"
    
    cd "$FRONTEND_DIR"
    
    # Type check
    if [[ -n "$STAGED_TS_FILES" ]]; then
        run_check "TypeScript type checking" npm run type-check
    fi
    
    # Lint staged files
    if [[ -n "$STAGED_TS_FILES" || -n "$STAGED_JS_FILES" ]]; then
        STAGED_FRONTEND_FILES=""
        for file in $STAGED_TS_FILES $STAGED_JS_FILES; do
            # Convert to relative path from frontend directory
            rel_file=$(realpath --relative-to="$FRONTEND_DIR" "$PROJECT_ROOT/$file" 2>/dev/null || echo "$file")
            if [[ -f "$rel_file" ]]; then
                STAGED_FRONTEND_FILES="$STAGED_FRONTEND_FILES $rel_file"
            fi
        done
        
        if [[ -n "$STAGED_FRONTEND_FILES" ]]; then
            run_check "ESLint" npx eslint $STAGED_FRONTEND_FILES
        fi
    fi
    
    # Run unit tests
    run_check "Frontend unit tests" npm run test:unit
    
    cd "$PROJECT_ROOT"
fi

# Check for TODO/FIXME comments in staged files
if [[ -n "$STAGED_GO_FILES" || -n "$STAGED_TS_FILES" || -n "$STAGED_JS_FILES" ]]; then
    TODO_COUNT=$(git diff --cached | grep -c "^\+.*\(TODO\|FIXME\|XXX\|HACK\)" || true)
    if [[ $TODO_COUNT -gt 0 ]]; then
        echo -e "${YELLOW}⚠️  Found $TODO_COUNT TODO/FIXME comments in staged changes${NC}"
        echo -e "${YELLOW}   Consider addressing these before committing${NC}"
    fi
fi

# Check commit message format (if we have a commit message)
if [[ -f "$PROJECT_ROOT/.git/COMMIT_EDITMSG" ]]; then
    COMMIT_MSG=$(head -n1 "$PROJECT_ROOT/.git/COMMIT_EDITMSG")
    
    # Basic commit message format check
    if [[ ${#COMMIT_MSG} -lt 10 ]]; then
        echo -e "${RED}✗${NC} Commit message too short (minimum 10 characters)"
        CHECKS_FAILED=1
    elif [[ ${#COMMIT_MSG} -gt 72 ]]; then
        echo -e "${YELLOW}⚠️  Commit message over 72 characters (${#COMMIT_MSG} chars)${NC}"
    fi
    
    # Check for conventional commit format (optional)
    if [[ ! "$COMMIT_MSG" =~ ^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\(.+\))?: ]]; then
        echo -e "${YELLOW}⚠️  Consider using conventional commit format: type(scope): description${NC}"
        echo -e "${YELLOW}   Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build${NC}"
    fi
fi

# Summary
if [[ $CHECKS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}🎉 All pre-commit checks passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some pre-commit checks failed!${NC}"
    echo -e "${YELLOW}Fix the issues above and try committing again.${NC}"
    echo -e "${CYAN}Or use 'git commit --no-verify' to skip hooks (not recommended).${NC}"
    exit 1
fi
EOF
    
    chmod +x "$hook_file"
    success "Pre-commit hook created"
}

# Create pre-push hook
create_pre_push_hook() {
    log "Creating pre-push hook..."
    
    local hook_file="$HOOKS_DIR/pre-push"
    
    cat > "$hook_file" << 'EOF'
#!/bin/bash

# ==================================================================================
# FolioFox Pre-push Hook
# ==================================================================================
# Runs comprehensive tests before allowing pushes
# ==================================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Running pre-push checks...${NC}"

# Configuration
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Flag to track if any checks fail
CHECKS_FAILED=0

# Function to run command and track failures
run_check() {
    local description="$1"
    shift
    
    echo -e "${BLUE}➤${NC} $description"
    
    if "$@"; then
        echo -e "${GREEN}✓${NC} $description passed"
    else
        echo -e "${RED}✗${NC} $description failed"
        CHECKS_FAILED=1
    fi
}

# Check if we're pushing to main/master branch
protected_branch='main'
current_branch=$(git symbolic-ref HEAD | sed -e 's,.*/\(.*\),\1,')

if [[ $current_branch == $protected_branch ]]; then
    echo -e "${YELLOW}⚠️  Pushing to protected branch '$protected_branch'${NC}"
    echo -e "${BLUE}ℹ️  Running full test suite...${NC}"
    
    # Run comprehensive Go tests
    run_check "Go unit tests" go test -v -race ./...
    
    # Run integration tests if Docker is available
    if command -v docker &> /dev/null && docker info &> /dev/null; then
        run_check "Go integration tests" go test -v -tags=integration ./...
    else
        echo -e "${YELLOW}⚠️  Docker not available, skipping integration tests${NC}"
    fi
    
    # Run frontend tests
    cd "$FRONTEND_DIR"
    run_check "Frontend unit tests" npm run test:unit
    run_check "Frontend integration tests" npm run test:integration
    
    # Build check
    cd "$PROJECT_ROOT"
    run_check "Backend build" go build -o /tmp/foliofox-test ./cmd/foliofox
    
    cd "$FRONTEND_DIR"
    run_check "Frontend build" npm run build
    
    cd "$PROJECT_ROOT"
    
    # Clean up test binary
    rm -f /tmp/foliofox-test
else
    echo -e "${BLUE}ℹ️  Pushing to '$current_branch', running basic checks...${NC}"
    
    # Run basic tests for feature branches
    run_check "Go unit tests (short)" go test -short ./...
    
    cd "$FRONTEND_DIR"
    run_check "Frontend unit tests" npm run test:unit
    
    cd "$PROJECT_ROOT"
fi

# Check for large files
LARGE_FILES=$(git diff --cached --name-only | xargs -I {} find "$PROJECT_ROOT/{}" -size +10M 2>/dev/null || true)
if [[ -n "$LARGE_FILES" ]]; then
    echo -e "${RED}✗${NC} Large files detected (>10MB):"
    echo "$LARGE_FILES"
    echo -e "${YELLOW}Consider using Git LFS for large files${NC}"
    CHECKS_FAILED=1
fi

# Check for secrets/sensitive data
SENSITIVE_PATTERNS=(
    "password\s*=\s*['\"][^'\"]{8,}['\"]"
    "api[_-]?key\s*=\s*['\"][^'\"]{8,}['\"]"
    "secret\s*=\s*['\"][^'\"]{8,}['\"]"
    "token\s*=\s*['\"][^'\"]{8,}['\"]"
    "-----BEGIN (RSA )?PRIVATE KEY-----"
)

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    if git diff --cached | grep -iE "$pattern" >/dev/null; then
        echo -e "${RED}✗${NC} Potential sensitive data detected in staged changes"
        echo -e "${YELLOW}Pattern: $pattern${NC}"
        echo -e "${YELLOW}Please review your changes and remove any secrets${NC}"
        CHECKS_FAILED=1
    fi
done

# Summary
if [[ $CHECKS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}🎉 All pre-push checks passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some pre-push checks failed!${NC}"
    echo -e "${YELLOW}Fix the issues above and try pushing again.${NC}"
    echo -e "${CYAN}Or use 'git push --no-verify' to skip hooks (not recommended for main branch).${NC}"
    exit 1
fi
EOF
    
    chmod +x "$hook_file"
    success "Pre-push hook created"
}

# Create commit-msg hook
create_commit_msg_hook() {
    log "Creating commit-msg hook..."
    
    local hook_file="$HOOKS_DIR/commit-msg"
    
    cat > "$hook_file" << 'EOF'
#!/bin/bash

# ==================================================================================
# FolioFox Commit Message Hook
# ==================================================================================
# Validates commit message format and content
# ==================================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Read the commit message
COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")
FIRST_LINE=$(head -n1 "$COMMIT_MSG_FILE")

# Skip checks for merge commits
if [[ "$FIRST_LINE" =~ ^Merge ]]; then
    exit 0
fi

# Skip checks for revert commits
if [[ "$FIRST_LINE" =~ ^Revert ]]; then
    exit 0
fi

# Validation flags
VALIDATION_FAILED=0

# Check message length
if [[ ${#FIRST_LINE} -lt 10 ]]; then
    echo -e "${RED}✗${NC} Commit message too short (minimum 10 characters)"
    echo -e "${YELLOW}Current length: ${#FIRST_LINE} characters${NC}"
    VALIDATION_FAILED=1
fi

if [[ ${#FIRST_LINE} -gt 72 ]]; then
    echo -e "${RED}✗${NC} Commit message first line too long (maximum 72 characters)"
    echo -e "${YELLOW}Current length: ${#FIRST_LINE} characters${NC}"
    VALIDATION_FAILED=1
fi

# Check for conventional commit format
CONVENTIONAL_PATTERN='^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\(.+\))?: .+'

if [[ ! "$FIRST_LINE" =~ $CONVENTIONAL_PATTERN ]]; then
    echo -e "${YELLOW}⚠️  Commit message doesn't follow conventional commit format${NC}"
    echo -e "${CYAN}Recommended format: type(scope): description${NC}"
    echo -e "${CYAN}Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build${NC}"
    echo -e "${CYAN}Example: feat(auth): add JWT token validation${NC}"
    # This is a warning, not a failure
fi

# Check for proper capitalization
if [[ "$FIRST_LINE" =~ ^[a-z] ]] && [[ ! "$FIRST_LINE" =~ $CONVENTIONAL_PATTERN ]]; then
    echo -e "${YELLOW}⚠️  Consider capitalizing the first letter of commit message${NC}"
fi

# Check for period at end
if [[ "$FIRST_LINE" =~ \.$$ ]]; then
    echo -e "${YELLOW}⚠️  Remove period at end of commit message${NC}"
fi

# Check for common typos and improvements
declare -A SUGGESTIONS=(
    ["fix bug"]="fix: resolve issue with"
    ["update"]="refactor: improve"
    ["change"]="refactor: modify"
    ["add"]="feat: add"
    ["remove"]="refactor: remove"
    ["delete"]="refactor: remove"
)

FIRST_WORD=$(echo "$FIRST_LINE" | awk '{print tolower($1)}')
if [[ -n "${SUGGESTIONS[$FIRST_WORD]}" ]]; then
    echo -e "${CYAN}💡 Suggestion: Consider using '${SUGGESTIONS[$FIRST_WORD]}' instead of '$FIRST_WORD'${NC}"
fi

# Check for issue references
if [[ "$COMMIT_MSG" =~ (#[0-9]+|fixes?[ #]+[0-9]+|closes?[ #]+[0-9]+) ]]; then
    echo -e "${GREEN}✓${NC} Issue reference found"
fi

# Check for breaking changes
if [[ "$COMMIT_MSG" =~ BREAKING\ CHANGE ]]; then
    echo -e "${YELLOW}⚠️  Breaking change detected${NC}"
    echo -e "${CYAN}Make sure to document this in the changelog${NC}"
fi

# Summary
if [[ $VALIDATION_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓${NC} Commit message validation passed"
    exit 0
else
    echo -e "${RED}❌ Commit message validation failed${NC}"
    echo -e "${YELLOW}Please fix the issues above and try again${NC}"
    exit 1
fi
EOF
    
    chmod +x "$hook_file"
    success "Commit-msg hook created"
}

# Create post-commit hook
create_post_commit_hook() {
    log "Creating post-commit hook..."
    
    local hook_file="$HOOKS_DIR/post-commit"
    
    cat > "$hook_file" << 'EOF'
#!/bin/bash

# ==================================================================================
# FolioFox Post-commit Hook
# ==================================================================================
# Runs after successful commits to provide feedback and suggestions
# ==================================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get commit information
COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B)
AUTHOR=$(git log -1 --pretty=%an)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo -e "${GREEN}✅ Commit successful!${NC}"
echo -e "${BLUE}Hash:${NC} $COMMIT_HASH"
echo -e "${BLUE}Branch:${NC} $BRANCH"
echo -e "${BLUE}Author:${NC} $AUTHOR"

# Show file statistics
FILES_CHANGED=$(git diff --name-only HEAD~1)
if [[ -n "$FILES_CHANGED" ]]; then
    FILES_COUNT=$(echo "$FILES_CHANGED" | wc -l)
    echo -e "${BLUE}Files changed:${NC} $FILES_COUNT"
    
    # Show file types
    GO_FILES=$(echo "$FILES_CHANGED" | grep '\.go$' | wc -l)
    TS_FILES=$(echo "$FILES_CHANGED" | grep -E '\.(ts|tsx)$' | wc -l)
    
    if [[ $GO_FILES -gt 0 ]]; then
        echo -e "${CYAN}  Go files:${NC} $GO_FILES"
    fi
    
    if [[ $TS_FILES -gt 0 ]]; then
        echo -e "${CYAN}  TypeScript files:${NC} $TS_FILES"
    fi
fi

# Show commit statistics
INSERTIONS=$(git diff --shortstat HEAD~1 | grep -o '[0-9]* insertion' | cut -d' ' -f1)
DELETIONS=$(git diff --shortstat HEAD~1 | grep -o '[0-9]* deletion' | cut -d' ' -f1)

if [[ -n "$INSERTIONS" ]]; then
    echo -e "${CYAN}Lines added:${NC} $INSERTIONS"
fi

if [[ -n "$DELETIONS" ]]; then
    echo -e "${CYAN}Lines removed:${NC} $DELETIONS"
fi

# Suggestions based on commit content
if [[ "$COMMIT_MSG" =~ feat ]]; then
    echo -e "${CYAN}💡 Don't forget to update documentation and tests for new features${NC}"
fi

if [[ "$COMMIT_MSG" =~ fix ]]; then
    echo -e "${CYAN}💡 Consider adding a test case to prevent regression${NC}"
fi

if [[ "$BRANCH" != "main" && "$BRANCH" != "master" ]]; then
    COMMITS_AHEAD=$(git rev-list --count HEAD ^main 2>/dev/null || git rev-list --count HEAD ^master 2>/dev/null || echo "0")
    if [[ $COMMITS_AHEAD -gt 5 ]]; then
        echo -e "${CYAN}💡 Feature branch has $COMMITS_AHEAD commits. Consider rebasing or merging soon.${NC}"
    fi
fi

# Check if it's time for a push
UNPUSHED_COMMITS=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
if [[ $UNPUSHED_COMMITS -gt 3 ]]; then
    echo -e "${CYAN}💡 You have $UNPUSHED_COMMITS unpushed commits. Consider pushing to backup your work.${NC}"
fi
EOF
    
    chmod +x "$hook_file"
    success "Post-commit hook created"
}

# Install hooks
install_hooks() {
    log "Installing Git hooks..."
    
    # Create hooks directory if it doesn't exist
    mkdir -p "$HOOKS_DIR"
    
    # Create hooks
    create_pre_commit_hook
    create_pre_push_hook
    create_commit_msg_hook
    create_post_commit_hook
    
    success "Git hooks installed successfully"
}

# Uninstall hooks
uninstall_hooks() {
    log "Uninstalling Git hooks..."
    
    local hooks=("pre-commit" "pre-push" "commit-msg" "post-commit")
    
    for hook in "${hooks[@]}"; do
        local hook_file="$HOOKS_DIR/$hook"
        if [[ -f "$hook_file" ]]; then
            rm "$hook_file"
            success "Removed $hook hook"
        fi
    done
    
    success "Git hooks uninstalled"
}

# Test hooks
test_hooks() {
    log "Testing Git hooks..."
    
    local hooks=("pre-commit" "pre-push" "commit-msg")
    local test_failed=0
    
    for hook in "${hooks[@]}"; do
        local hook_file="$HOOKS_DIR/$hook"
        if [[ -f "$hook_file" && -x "$hook_file" ]]; then
            success "$hook hook is installed and executable"
        else
            error "$hook hook is missing or not executable"
            test_failed=1
        fi
    done
    
    if [[ $test_failed -eq 0 ]]; then
        success "All hooks are properly installed"
    else
        error "Some hooks are not properly installed"
        return 1
    fi
}

# Show hook status
show_status() {
    echo -e "${WHITE}Git Hooks Status${NC}"
    echo ""
    
    local hooks=("pre-commit" "pre-push" "commit-msg" "post-commit")
    
    for hook in "${hooks[@]}"; do
        local hook_file="$HOOKS_DIR/$hook"
        if [[ -f "$hook_file" ]]; then
            if [[ -x "$hook_file" ]]; then
                echo -e "  ${GREEN}✓${NC} $hook (installed and executable)"
            else
                echo -e "  ${YELLOW}⚠${NC} $hook (installed but not executable)"
            fi
        else
            echo -e "  ${RED}✗${NC} $hook (not installed)"
        fi
    done
    
    echo ""
    
    # Show Git configuration related to hooks
    echo -e "${CYAN}Git Configuration:${NC}"
    echo "  Core.hooksPath: $(git config --get core.hooksPath || echo 'default')"
}

# Show help
show_help() {
    cat << EOF
FolioFox Git Hooks Setup Script

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    install     Install Git hooks (default)
    uninstall   Remove Git hooks
    test        Test hook installation
    status      Show hook status
    help        Show this help message

Hooks:
    pre-commit      Runs linting, formatting, and unit tests
    pre-push        Runs comprehensive tests before push
    commit-msg      Validates commit message format
    post-commit     Provides post-commit feedback

Options:
    --force         Force overwrite existing hooks
    --quiet         Suppress non-error output

The hooks will:
- Run Go formatting, linting, and security checks
- Run TypeScript/JavaScript linting and type checking
- Execute unit tests for affected code
- Validate commit message format
- Prevent pushing large files or sensitive data
- Provide helpful feedback and suggestions

EOF
}

# Parse command line arguments
COMMAND="install"
FORCE=false
QUIET=false

while [[ $# -gt 0 ]]; do
    case $1 in
        install|uninstall|test|status|help)
            COMMAND=$1
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --quiet)
            QUIET=true
            shift
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
check_git_repo

case $COMMAND in
    install)
        if [[ "$FORCE" == "true" ]] || [[ ! -f "$HOOKS_DIR/pre-commit" ]]; then
            install_hooks
        else
            warning "Hooks already installed. Use --force to overwrite."
            show_status
        fi
        ;;
    uninstall)
        uninstall_hooks
        ;;
    test)
        test_hooks
        ;;
    status)
        show_status
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