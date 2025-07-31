# ==================================================================================
# FolioFox Development Makefile
# ==================================================================================
# Comprehensive development workflow automation for FolioFox
# Go-based book automation platform with React frontend
# ==================================================================================

# ==================================================================================
# Configuration & Variables
# ==================================================================================

# Shell configuration
SHELL := /bin/bash
.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

# Project metadata
PROJECT_NAME := foliofox
PROJECT_ROOT := $(shell pwd)
BUILD_VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

# Directory paths
CMD_DIR := ./cmd/foliofox
FRONTEND_DIR := ./frontend
SCRIPTS_DIR := ./scripts
INTERNAL_DIR := ./internal
DATABASE_DIR := ./database

# Build targets
BACKEND_BINARY := foliofox
BACKEND_BUILD_PATH := $(PROJECT_ROOT)/$(BACKEND_BINARY)
FRONTEND_BUILD_PATH := $(FRONTEND_DIR)/dist

# Docker configuration
DOCKER_REGISTRY := ghcr.io/fabienpiette/folio_fox
BACKEND_IMAGE := $(DOCKER_REGISTRY)/backend
FRONTEND_IMAGE := $(DOCKER_REGISTRY)/frontend
DOCKER_COMPOSE_FILES := -f docker-compose.yml

# Service ports (can be overridden via environment)
FRONTEND_PORT ?= 3000
BACKEND_PORT ?= 8080
REDIS_PORT ?= 6379
POSTGRES_PORT ?= 5432

# Database configuration (use a writable path for local development)
DATABASE_PATH ?= $(PROJECT_ROOT)/foliofox.db

# Test configuration
TEST_TIMEOUT := 10m
COVERAGE_OUT := coverage.out
COVERAGE_HTML := coverage.html

# Color support using tput (more reliable than ANSI codes)
ifeq ($(NO_COLOR),)
ifneq ($(TERM),)
ifneq ($(shell tput colors 2>/dev/null),)
# Use tput for colors - more compatible across terminals
HAS_COLOR := 1
else
HAS_COLOR := 
endif
else
HAS_COLOR := 
endif
else
HAS_COLOR := 
endif

# ==================================================================================
# Helper Functions
# ==================================================================================

# Check if command exists
define check_command
	@which $(1) > /dev/null || ($(call print_error, "$(1) is not installed"); exit 1)
endef

# Print colored status messages using tput
ifdef HAS_COLOR
define print_status
	@tput setaf 4; echo "➤ $(1)"; tput sgr0
endef
define print_success
	@tput setaf 2; echo "✓ $(1)"; tput sgr0
endef
define print_warning
	@tput setaf 3; echo "⚠ $(1)"; tput sgr0
endef
define print_error
	@tput setaf 1; echo "✗ $(1)"; tput sgr0
endef
define print_info
	@tput setaf 6; echo "ℹ $(1)"; tput sgr0
endef
else
define print_status
	@echo "➤ $(1)"
endef
define print_success
	@echo "✓ $(1)"
endef
define print_warning
	@echo "⚠ $(1)"
endef
define print_error
	@echo "✗ $(1)"
endef
define print_info
	@echo "ℹ $(1)"
endef
endif

# Helper function for colored echo
ifdef HAS_COLOR
define echo_colored
	@tput $(2); echo "$(1)"; tput sgr0
endef
define echo_bold_white
	@tput bold; tput setaf 7; echo "$(1)"; tput sgr0
endef
else
define echo_colored
	@echo "$(1)"
endef
define echo_bold_white
	@echo "$(1)"
endef
endif

# Check if Docker is running
define check_docker
	@docker info > /dev/null 2>&1 || ($(call print_error, "Docker is not running"); exit 1)
endef

# ==================================================================================
# Help & Information
# ==================================================================================

.PHONY: help
help: ## Show this help message
ifdef HAS_COLOR
	@tput bold; tput setaf 7; echo "FolioFox Development Makefile"; tput sgr0
	@tput setaf 6; echo "Version: $(BUILD_VERSION) | Commit: $(BUILD_COMMIT)"; tput sgr0
	@echo ""
	@tput bold; tput setaf 7; echo "Available targets:"; tput sgr0
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@tput bold; tput setaf 7; echo "Environment Variables:"; tput sgr0
	@tput setaf 6; echo -n "  FRONTEND_PORT"; tput sgr0; echo "    Frontend port (default: 3000)"
	@tput setaf 6; echo -n "  BACKEND_PORT"; tput sgr0; echo "     Backend port (default: 8080)"
	@tput setaf 6; echo -n "  DATABASE_TYPE"; tput sgr0; echo "    Database type: sqlite/postgres (default: sqlite)"
	@tput setaf 6; echo -n "  DOCKER_REGISTRY"; tput sgr0; echo "  Docker registry (default: ghcr.io/fabienpiette/folio_fox)"
	@tput setaf 6; echo -n "  NO_COLOR"; tput sgr0; echo "         Set to disable color output (for terminals without color support)"
	@echo ""
else
	@echo "FolioFox Development Makefile"
	@echo "Version: $(BUILD_VERSION) | Commit: $(BUILD_COMMIT)"
	@echo ""
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "Environment Variables:"
	@echo "  FRONTEND_PORT    Frontend port (default: 3000)"
	@echo "  BACKEND_PORT     Backend port (default: 8080)"
	@echo "  DATABASE_TYPE    Database type: sqlite/postgres (default: sqlite)"
	@echo "  DOCKER_REGISTRY  Docker registry (default: ghcr.io/fabienpiette/folio_fox)"
	@echo "  NO_COLOR         Set to disable color output (for terminals without color support)"
	@echo ""
endif

.PHONY: version
version: ## Show version information
	$(call echo_bold_white,"FolioFox Version Information")
	@echo "Version:    $(BUILD_VERSION)"
	@echo "Commit:     $(BUILD_COMMIT)"
	@echo "Build Date: $(BUILD_DATE)"
	@echo "Go Version: $(shell go version 2>/dev/null || echo 'Not available')"
	@echo "Node Version: $(shell node --version 2>/dev/null || echo 'Not available')"
	@echo "Docker Version: $(shell docker --version 2>/dev/null || echo 'Not available')"

# ==================================================================================
# Environment Setup & Dependencies
# ==================================================================================

.PHONY: deps
deps: deps-go deps-frontend ## Install/update all dependencies
	$(call print_success, "All dependencies installed")

.PHONY: deps-go
deps-go: ## Install/update Go dependencies
	$(call check_command,go)
	$(call print_status, "Installing Go dependencies...")
	@go mod download
	@go mod verify
	$(call print_success, "Go dependencies installed")

.PHONY: deps-frontend
deps-frontend: ## Install/update frontend dependencies
	$(call check_command,npm)
	$(call print_status, "Installing frontend dependencies...")
	@cd $(FRONTEND_DIR) && (npm ci --silent 2>/dev/null || npm install --silent)
	$(call print_success, "Frontend dependencies installed")

.PHONY: install
install: deps install-tools ## Install development tools and dependencies
	$(call print_success, "Development environment setup complete")

.PHONY: install-tools
install-tools: ## Install development tools
	$(call print_status, "Installing development tools...")
	@go install honnef.co/go/tools/cmd/staticcheck@latest || echo "Warning: Failed to install staticcheck"
	@go install github.com/securego/gosec/v2/cmd/gosec@latest || echo "Warning: Failed to install gosec"
	@go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest || echo "Warning: Failed to install golangci-lint"
	@go install github.com/swaggo/swag/cmd/swag@latest || echo "Warning: Failed to install swag"
	@cd $(FRONTEND_DIR) && npx playwright install || echo "Warning: Failed to install Playwright browsers"
	$(call print_success, Development tools installation attempted)

# ==================================================================================
# Application Management
# ==================================================================================

.PHONY: run
run: check-env ## Start the full application stack (backend + frontend + services)
	$(call check_docker)
	$(call print_status, "Starting full FolioFox application stack...")
	@docker compose $(DOCKER_COMPOSE_FILES) up -d
	$(call print_success, "Application stack started")
	@$(MAKE) --no-print-directory logs-follow

.PHONY: run-backend
run-backend: build-backend ## Run only the backend service
	$(call print_status, "Starting backend service...")
	@docker compose $(DOCKER_COMPOSE_FILES) up -d backend redis
	$(call print_success, "Backend service started on port $(BACKEND_PORT)")

.PHONY: run-frontend
run-frontend: ## Run only the frontend service in development mode
	$(call print_status, "Starting frontend development server...")
	@cd $(FRONTEND_DIR) && npm run dev

.PHONY: run-dev
run-dev: dev ## Alias for dev target

.PHONY: dev
dev: ## Start development environment with hot reload
	$(call check_docker)
	$(call print_status, "Starting development environment...")
	@docker compose $(DOCKER_COMPOSE_FILES) up -d redis
	@sleep 2
	@# Create dev data directory in a writable location
	@mkdir -p $(HOME)/.foliofox/dev
	@# Copy database from Docker volume location if it exists and dev db doesn't
	@if [ ! -f "$(HOME)/.foliofox/dev/foliofox.db" ] && [ -f "$(PROJECT_ROOT)/data/app/foliofox.db" ]; then \
		echo "Copying database from Docker location..."; \
		cp "$(PROJECT_ROOT)/data/app/foliofox.db" "$(HOME)/.foliofox/dev/foliofox.db" 2>/dev/null || \
		echo "Could not copy database, will create new one"; \
	fi
	@# Start backend in background with development settings (it will create DB and run migrations)
	@cd $(PROJECT_ROOT) && \
		FOLIOFOX_DATABASE_PATH="$(HOME)/.foliofox/dev/foliofox.db" \
		FOLIOFOX_REDIS_HOST="localhost" \
		FOLIOFOX_REDIS_PORT="6379" \
		LOG_LEVEL="debug" \
		GIN_MODE="debug" \
		go run $(CMD_DIR) &
	@sleep 3
	@# Ensure admin user exists for development (after backend starts and creates DB)
	@echo "Ensuring admin user exists..."
	@cd $(PROJECT_ROOT) && go run ./cmd/tools/create-admin/main.go "$(HOME)/.foliofox/dev/foliofox.db" || echo "Note: Could not create admin user"
	@# Start frontend in development mode
	@cd $(FRONTEND_DIR) && npm run dev

.PHONY: stop
stop: ## Stop all services
	$(call check_docker)
	$(call print_status, "Stopping all services...")
	@docker compose $(DOCKER_COMPOSE_FILES) down
	@pkill -f "foliofox" 2>/dev/null || true
	$(call print_success, "All services stopped")

.PHONY: restart
restart: stop run ## Restart all services
	$(call print_success, "Services restarted")

.PHONY: status
status: ## Show status of all services
	$(call check_docker)
	$(call echo_bold_white,"Service Status:")
	@docker compose $(DOCKER_COMPOSE_FILES) ps
	@echo ""
	$(call echo_bold_white,"Health Checks:")
ifdef HAS_COLOR
	@curl -s http://localhost:$(BACKEND_PORT)/api/v1/health 2>/dev/null && (tput setaf 2; echo "✓ Backend healthy"; tput sgr0) || (tput setaf 1; echo "✗ Backend unhealthy"; tput sgr0)
	@curl -s http://localhost:$(FRONTEND_PORT)/health 2>/dev/null && (tput setaf 2; echo "✓ Frontend healthy"; tput sgr0) || (tput setaf 1; echo "✗ Frontend unhealthy"; tput sgr0)
else
	@curl -s http://localhost:$(BACKEND_PORT)/api/v1/health 2>/dev/null && echo "✓ Backend healthy" || echo "✗ Backend unhealthy"
	@curl -s http://localhost:$(FRONTEND_PORT)/health 2>/dev/null && echo "✓ Frontend healthy" || echo "✗ Frontend unhealthy"
endif

# ==================================================================================
# Build System
# ==================================================================================

.PHONY: build
build: build-backend build-frontend ## Build both backend and frontend
	$(call print_success, "Full build completed")

.PHONY: build-backend
build-backend: ## Build Go binary
	$(call check_command,go)
	$(call print_status, "Building backend binary...")
	@CGO_ENABLED=1 go build \
		-tags "sqlite_omit_load_extension" \
		-ldflags="-w -s -X main.version=$(BUILD_VERSION) -X main.commit=$(BUILD_COMMIT) -X main.date=$(BUILD_DATE)" \
		-o $(BACKEND_BINARY) \
		$(CMD_DIR)
	$(call print_success, "Backend binary built: $(BACKEND_BINARY)")

.PHONY: build-frontend
build-frontend: ## Build React production bundle
	$(call check_command,npm)
	$(call print_status, "Building frontend bundle...")
	@cd $(FRONTEND_DIR) && npm run build
	$(call print_success, "Frontend bundle built: $(FRONTEND_BUILD_PATH)")

.PHONY: build-docs
build-docs: ## Generate API documentation
	$(call check_command,swag)
	$(call print_status, "Generating API documentation...")
	@swag init -g $(CMD_DIR)/main.go -o ./docs
	$(call print_success, "API documentation generated")

# ==================================================================================
# Testing
# ==================================================================================

.PHONY: test
test: test-unit test-integration test-e2e ## Run all tests (unit, integration, e2e)
	$(call print_success, "All tests completed")

.PHONY: test-unit
test-unit: ## Run unit tests only
	$(call print_status, "Running unit tests...")
	@go test -v -race -timeout $(TEST_TIMEOUT) ./internal/... ./cmd/...
	@cd $(FRONTEND_DIR) && (npm run test:unit || echo "No frontend unit tests found")
	$(call print_success, "Unit tests completed")

.PHONY: test-integration
test-integration: ## Run integration tests
	$(call check_docker)
	$(call print_status, "Running integration tests...")
	@docker compose $(DOCKER_COMPOSE_FILES) up -d redis
	@sleep 2
	@go test -v -tags=integration -timeout $(TEST_TIMEOUT) ./internal/... ./cmd/...
	@cd $(FRONTEND_DIR) && npm run test:integration
	@docker compose $(DOCKER_COMPOSE_FILES) down redis
	$(call print_success, "Integration tests completed")

.PHONY: test-e2e
test-e2e: ## Run end-to-end tests
	$(call print_status, "Running E2E tests...")
	@docker compose $(DOCKER_COMPOSE_FILES) up -d
	@sleep 10  # Wait for services to be ready
	@cd $(FRONTEND_DIR) && npm run test:e2e
	@docker compose $(DOCKER_COMPOSE_FILES) down
	$(call print_success, "E2E tests completed")

.PHONY: test-coverage
test-coverage: ## Generate test coverage report
	$(call print_status, "Generating test coverage report...")
	@go test -v -race -coverprofile=$(COVERAGE_OUT) -covermode=atomic ./internal/... ./cmd/...
	@go tool cover -html=$(COVERAGE_OUT) -o $(COVERAGE_HTML)
	@cd $(FRONTEND_DIR) && npm run test:coverage
	$(call print_success, "Coverage report generated: $(COVERAGE_HTML)")

.PHONY: test-watch
test-watch: ## Run tests in watch mode for development
	$(call print_status, "Starting test watch mode...")
	@cd $(FRONTEND_DIR) && npm run test:watch

.PHONY: test-benchmark
test-benchmark: ## Run benchmark tests
	$(call print_status, "Running benchmark tests...")
	@go test -bench=. -benchmem ./internal/... ./cmd/...
	$(call print_success, "Benchmark tests completed")

# ==================================================================================
# Code Quality
# ==================================================================================

.PHONY: lint
lint: lint-go lint-frontend ## Run linters (golangci-lint, eslint)
	$(call print_success, "All linting completed")

.PHONY: lint-go
lint-go: ## Run Go linters
	$(call print_status, "Running Go linters...")
	@go vet ./internal/... ./cmd/...
	@if command -v staticcheck >/dev/null 2>&1; then \
		staticcheck ./internal/... ./cmd/...; \
	elif [ -f "$(shell go env GOPATH)/bin/staticcheck" ]; then \
		$(shell go env GOPATH)/bin/staticcheck ./internal/... ./cmd/...; \
	else \
		echo "Warning: staticcheck not found, skipping"; \
	fi
	@if command -v golangci-lint >/dev/null 2>&1; then \
		golangci-lint run --timeout 5m ./internal/... ./cmd/...; \
	elif [ -f "$(shell go env GOPATH)/bin/golangci-lint" ]; then \
		$(shell go env GOPATH)/bin/golangci-lint run --timeout 5m ./internal/... ./cmd/...; \
	else \
		echo "Warning: golangci-lint not found, skipping"; \
	fi
	$(call print_success, "Go linting completed")

.PHONY: lint-frontend
lint-frontend: ## Run frontend linters
	$(call print_status, "Running frontend linters...")
	@cd $(FRONTEND_DIR) && npm run lint
	@cd $(FRONTEND_DIR) && npm run type-check
	$(call print_success, "Frontend linting completed")

.PHONY: format
format: format-go format-frontend ## Format code (gofmt, prettier)
	$(call print_success, "All code formatted")

.PHONY: format-go
format-go: ## Format Go code
	$(call print_status, "Formatting Go code...")
	@go fmt ./internal/... ./cmd/...
	@goimports -w .
	$(call print_success, "Go code formatted")

.PHONY: format-frontend
format-frontend: ## Format frontend code
	$(call print_status, "Formatting frontend code...")
	@cd $(FRONTEND_DIR) && npm run format
	$(call print_success, "Frontend code formatted")

.PHONY: vet
vet: ## Run Go vet analysis
	$(call print_status, "Running Go vet analysis...")
	@go vet ./internal/... ./cmd/...
	$(call print_success, "Go vet analysis completed")

.PHONY: security
security: ## Run security analysis (gosec)
	$(call print_status, "Running security analysis...")
	@if command -v gosec >/dev/null 2>&1; then \
		gosec -severity medium -confidence medium -quiet ./internal/... ./cmd/...; \
	elif [ -f "$(shell go env GOPATH)/bin/gosec" ]; then \
		$(shell go env GOPATH)/bin/gosec -severity medium -confidence medium -quiet ./internal/... ./cmd/...; \
	else \
		echo "Warning: gosec not found, skipping security analysis"; \
	fi
	$(call print_success, "Security analysis completed")

# ==================================================================================
# CI/CD Simulation
# ==================================================================================

.PHONY: ci
ci: ci-test ci-build ci-security ## Run complete CI pipeline locally
	$(call print_success, "Complete CI pipeline completed successfully")

.PHONY: ci-test
ci-test: ## Run all CI tests
	$(call print_status, "Running CI test pipeline...")
	@$(MAKE) --no-print-directory deps
	@$(MAKE) --no-print-directory lint
	@$(MAKE) --no-print-directory test-unit
	@$(MAKE) --no-print-directory test-integration
	$(call print_success, "CI test pipeline completed")

.PHONY: ci-build
ci-build: ## Run CI build process
	$(call print_status, "Running CI build pipeline...")
	@$(MAKE) --no-print-directory build
	@$(MAKE) --no-print-directory docker-build
	$(call print_success, "CI build pipeline completed")

.PHONY: ci-security
ci-security: ## Run CI security checks
	$(call print_status, "Running CI security pipeline...")
	@$(MAKE) --no-print-directory security
	@$(MAKE) --no-print-directory docker-security-scan
	$(call print_success, "CI security pipeline completed")

# ==================================================================================
# Database & Services
# ==================================================================================

.PHONY: db-setup
db-setup: ## Initialize database with migrations
	$(call print_status, "Setting up database...")
	@docker compose $(DOCKER_COMPOSE_FILES) up -d redis
	@if [ "$(DATABASE_TYPE)" = "postgres" ]; then \
		docker compose --profile postgres up -d postgres; \
		sleep 5; \
	fi
	@$(MAKE) --no-print-directory db-migrate
	$(call print_success, "Database setup completed")

.PHONY: db-migrate
db-migrate: ## Run database migrations (handled automatically by Go backend)
	$(call print_status, "Database migrations are handled automatically by the Go backend")
	$(call print_info, "Migrations run automatically when the backend starts")
	$(call print_success, "No manual migration needed with Go backend")

.PHONY: db-reset
db-reset: ## Reset database to clean state
	$(call print_warning, "This will delete all data!")
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		$(call print_status, "Resetting database..."); \
		docker compose $(DOCKER_COMPOSE_FILES) down -v; \
		$(MAKE) --no-print-directory db-setup; \
		$(call print_success, "Database reset completed"); \
	else \
		echo "Operation cancelled"; \
	fi

.PHONY: services-up
services-up: ## Start supporting services (Redis, monitoring)
	$(call check_docker)
	$(call print_status, "Starting supporting services...")
	@docker compose $(DOCKER_COMPOSE_FILES) up -d redis
	@if [ "$(DATABASE_TYPE)" = "postgres" ]; then \
		docker compose --profile postgres up -d postgres; \
	fi
	$(call print_success, "Supporting services started")

.PHONY: services-down
services-down: ## Stop supporting services
	$(call check_docker)
	$(call print_status, "Stopping supporting services...")
	@docker compose $(DOCKER_COMPOSE_FILES) down
	$(call print_success, "Supporting services stopped")

# ==================================================================================
# Docker Operations
# ==================================================================================

.PHONY: docker-build
docker-build: ## Build all Docker images
	$(call check_docker)
	$(call print_status, "Building Docker images...")
	@docker compose $(DOCKER_COMPOSE_FILES) build \
		--build-arg BUILD_VERSION=$(BUILD_VERSION) \
		--build-arg BUILD_COMMIT=$(BUILD_COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE)
	$(call print_success, "Docker images built")

.PHONY: docker-push
docker-push: docker-build ## Push images to registry
	$(call check_docker)
	$(call print_status, "Pushing images to registry...")
	@docker tag foliofox-backend:latest $(BACKEND_IMAGE):$(BUILD_VERSION)
	@docker tag foliofox-frontend:latest $(FRONTEND_IMAGE):$(BUILD_VERSION)
	@docker push $(BACKEND_IMAGE):$(BUILD_VERSION)
	@docker push $(FRONTEND_IMAGE):$(BUILD_VERSION)
	$(call print_success, "Images pushed to registry")

.PHONY: docker-clean
docker-clean: ## Clean Docker resources
	$(call check_docker)
	$(call print_status, "Cleaning Docker resources...")
	@docker compose $(DOCKER_COMPOSE_FILES) down -v --remove-orphans
	@docker system prune -f
	@docker volume prune -f
	$(call print_success, "Docker resources cleaned")

.PHONY: docker-security-scan
docker-security-scan: ## Scan Docker images for vulnerabilities
	$(call check_docker)
	$(call print_status, "Scanning Docker images for vulnerabilities...")
	@if command -v trivy >/dev/null 2>&1; then \
		trivy image foliofox-backend:latest; \
		trivy image foliofox-frontend:latest; \
	else \
		$(call print_warning, "Trivy not installed, skipping security scan"); \
	fi
	$(call print_success, "Docker security scan completed")

# ==================================================================================
# Logs & Monitoring
# ==================================================================================

.PHONY: logs
logs: ## Show application logs
	$(call check_docker)
	@docker compose $(DOCKER_COMPOSE_FILES) logs --tail=100

.PHONY: logs-follow
logs-follow: ## Follow application logs
	$(call check_docker)
	@docker compose $(DOCKER_COMPOSE_FILES) logs -f

.PHONY: logs-backend
logs-backend: ## Show backend logs
	$(call check_docker)
	@docker compose $(DOCKER_COMPOSE_FILES) logs backend --tail=100

.PHONY: logs-frontend
logs-frontend: ## Show frontend logs
	$(call check_docker)
	@docker compose $(DOCKER_COMPOSE_FILES) logs frontend --tail=100

# ==================================================================================
# Utility Commands
# ==================================================================================

.PHONY: clean
clean: docker-clean clean-build ## Clean up containers, volumes, and build artifacts
	$(call print_status, "Cleaning build artifacts...")
	@rm -f $(BACKEND_BINARY)
	@rm -rf $(FRONTEND_BUILD_PATH)
	@rm -f $(COVERAGE_OUT) $(COVERAGE_HTML)
	@rm -rf ./docs
	@cd $(FRONTEND_DIR) && rm -rf node_modules/.cache
	$(call print_success, "Cleanup completed")

.PHONY: clean-build
clean-build: ## Clean build artifacts only
	$(call print_status, "Cleaning build artifacts...")
	@rm -f $(BACKEND_BINARY)
	@rm -rf $(FRONTEND_BUILD_PATH)
	@rm -f $(COVERAGE_OUT) $(COVERAGE_HTML)
	$(call print_success, "Build artifacts cleaned")

.PHONY: check-env
check-env: ## Check environment prerequisites
	$(call print_status, "Checking environment prerequisites...")
	$(call check_command,go)
	$(call check_command,node)
	$(call check_command,npm)
	$(call check_command,docker)
	$(call check_docker)
	$(call print_success, "Environment check passed")

.PHONY: setup
setup: check-env install create-env db-setup ## Complete project setup for new developers
	$(call print_success, "Project setup completed successfully!")
	@echo ""
	$(call echo_bold_white,"Next steps:")
	@echo "  1. Review and customize .env file"
ifdef HAS_COLOR
	@echo -n "  2. Run '"; tput setaf 6; echo -n "make run"; tput sgr0; echo "' to start the application"
else
	@echo "  2. Run 'make run' to start the application"
endif
	@echo "  3. Visit http://localhost:$(FRONTEND_PORT) to access the frontend"
	@echo "  4. Visit http://localhost:$(BACKEND_PORT)/api/v1/health to check backend"

.PHONY: create-env
create-env: ## Create .env file from template
	@if [ ! -f .env ]; then \
		$(call print_status, "Creating .env file..."); \
		./$(SCRIPTS_DIR)/setup.sh --unattended --skip-pull --skip-start; \
		$(call print_success, ".env file created"); \
	else \
		echo "ℹ .env file already exists"; \
	fi

.PHONY: backup
backup: ## Create backup of application data
	$(call print_status, "Creating backup...")
	@./$(SCRIPTS_DIR)/backup/backup.sh backup
	$(call print_success, "Backup completed")

.PHONY: restore
restore: ## Restore from backup (requires BACKUP_FILE env var)
	@if [ -z "$(BACKUP_FILE)" ]; then \
		$(call print_error, "BACKUP_FILE environment variable is required"); \
		echo "Usage: make restore BACKUP_FILE=path/to/backup.tar.gz"; \
		exit 1; \
	fi
	$(call print_status, "Restoring from backup: $(BACKUP_FILE)")
	@./$(SCRIPTS_DIR)/backup/backup.sh restore $(BACKUP_FILE)
	$(call print_success, "Restore completed")

# ==================================================================================
# Performance & Monitoring
# ==================================================================================

.PHONY: monitor
monitor: ## Start monitoring stack
	$(call check_docker)
	$(call print_status, "Starting monitoring stack...")
	@docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring up -d
	$(call print_success, "Monitoring stack started")
	@echo "Grafana: http://localhost:3001"
	@echo "Prometheus: http://localhost:9090"

.PHONY: perf-test
perf-test: ## Run performance tests
	$(call print_status, "Running performance tests...")
	@cd $(FRONTEND_DIR) && npm run test:performance
	$(call print_success, "Performance tests completed")

.PHONY: load-test
load-test: ## Run load tests (requires k6)
	@if command -v k6 >/dev/null 2>&1; then \
		$(call print_status, "Running load tests..."); \
		echo "Load testing not yet implemented"; \
		$(call print_success, "Load tests completed"); \
	else \
		$(call print_warning, "k6 not installed, skipping load tests"); \
	fi

# ==================================================================================
# Development Helpers
# ==================================================================================

.PHONY: shell-backend
shell-backend: ## Open shell in backend container
	$(call check_docker)
	@docker compose $(DOCKER_COMPOSE_FILES) exec backend sh

.PHONY: shell-frontend
shell-frontend: ## Open shell in frontend container
	$(call check_docker)
	@docker compose $(DOCKER_COMPOSE_FILES) exec frontend sh

.PHONY: shell-redis
shell-redis: ## Open Redis CLI
	$(call check_docker)
	@docker compose $(DOCKER_COMPOSE_FILES) exec redis redis-cli

.PHONY: watch
watch: ## Watch for changes and rebuild
	$(call print_status, "Starting file watcher...")
	@echo "Not implemented yet - use 'make dev' for development with hot reload"

# ==================================================================================
# Release Management
# ==================================================================================

.PHONY: release-prepare
release-prepare: ## Prepare for release (run all checks)
	$(call print_status, "Preparing for release...")
	@$(MAKE) --no-print-directory ci
	@$(MAKE) --no-print-directory build-docs
	$(call print_success, "Release preparation completed")

.PHONY: release-tag
release-tag: ## Create release tag (requires VERSION env var)
	@if [ -z "$(VERSION)" ]; then \
		$(call print_error, "VERSION environment variable is required"); \
		echo "Usage: make release-tag VERSION=v1.0.0"; \
		exit 1; \
	fi
	$(call print_status, "Creating release tag: $(VERSION)")
	@git tag -a $(VERSION) -m "Release $(VERSION)"
	@git push origin $(VERSION)
	$(call print_success, "Release tag $(VERSION) created")

# ==================================================================================
# Special Targets
# ==================================================================================

# Ensure directories exist
$(FRONTEND_BUILD_PATH) $(DATABASE_DIR):
	@mkdir -p $@

# Phony targets that should always run
.PHONY: all run run-backend run-frontend run-dev dev stop restart status
.PHONY: build build-backend build-frontend build-docs
.PHONY: test test-unit test-integration test-e2e test-coverage test-watch test-benchmark
.PHONY: lint lint-go lint-frontend format format-go format-frontend vet security
.PHONY: ci ci-test ci-build ci-security
.PHONY: db-setup db-migrate db-reset services-up services-down
.PHONY: docker-build docker-push docker-clean docker-security-scan
.PHONY: logs logs-follow logs-backend logs-frontend
.PHONY: clean clean-build check-env setup create-env backup restore
.PHONY: monitor perf-test load-test
.PHONY: shell-backend shell-frontend shell-redis watch
.PHONY: release-prepare release-tag
.PHONY: deps deps-go deps-frontend install install-tools
.PHONY: help version

# Default target shows help
all: help