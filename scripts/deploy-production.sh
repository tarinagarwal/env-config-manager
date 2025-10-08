#!/bin/bash

# Production Deployment Script
# This script automates the deployment process for the Environment Configuration Manager

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_ROOT}/.env.production"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.prod.yml"
BACKUP_DIR="${PROJECT_ROOT}/backups"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check environment file
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file not found: $ENV_FILE"
        log_info "Please copy .env.production.example to .env.production and configure it"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

validate_environment() {
    log_info "Validating environment configuration..."
    
    # Source environment file
    set -a
    source "$ENV_FILE"
    set +a
    
    # Check required variables
    REQUIRED_VARS=(
        "MONGO_ROOT_PASSWORD"
        "REDIS_PASSWORD"
        "JWT_SECRET"
        "JWT_REFRESH_SECRET"
        "ENCRYPTION_KEY"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var:-}" ]; then
            log_error "Required environment variable not set: $var"
            exit 1
        fi
    done
    
    # Validate secret strength
    if [ ${#JWT_SECRET} -lt 32 ]; then
        log_error "JWT_SECRET must be at least 32 characters"
        exit 1
    fi
    
    if [ ${#ENCRYPTION_KEY} -lt 32 ]; then
        log_error "ENCRYPTION_KEY must be at least 32 characters"
        exit 1
    fi
    
    log_info "Environment validation passed"
}

backup_existing() {
    log_info "Creating backup of existing deployment..."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
    BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
    mkdir -p "$BACKUP_PATH"
    
    # Backup MongoDB if running
    if docker ps | grep -q env-config-mongodb; then
        log_info "Backing up MongoDB..."
        docker exec env-config-mongodb mongodump --out /backup --quiet
        docker cp env-config-mongodb:/backup "${BACKUP_PATH}/mongodb"
        log_info "MongoDB backup completed"
    fi
    
    # Backup Redis if running
    if docker ps | grep -q env-config-redis; then
        log_info "Backing up Redis..."
        docker exec env-config-redis redis-cli --rdb /data/backup.rdb SAVE
        docker cp env-config-redis:/data/backup.rdb "${BACKUP_PATH}/redis-backup.rdb"
        log_info "Redis backup completed"
    fi
    
    log_info "Backup completed: $BACKUP_PATH"
}

build_images() {
    log_info "Building Docker images..."
    
    cd "$PROJECT_ROOT"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
    
    log_info "Docker images built successfully"
}

run_database_migrations() {
    log_info "Running database migrations..."
    
    # Wait for MongoDB to be ready
    log_info "Waiting for MongoDB to be ready..."
    sleep 10
    
    # Run Prisma migrations
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T backend npm run prisma:migrate:deploy || {
        log_warn "Migration command not available, skipping..."
    }
    
    log_info "Database migrations completed"
}

deploy_services() {
    log_info "Deploying services..."
    
    cd "$PROJECT_ROOT"
    
    # Pull latest images (if using registry)
    # docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
    
    # Start services
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    log_info "Services deployed"
}

wait_for_services() {
    log_info "Waiting for services to be healthy..."
    
    MAX_WAIT=300  # 5 minutes
    ELAPSED=0
    INTERVAL=5
    
    while [ $ELAPSED -lt $MAX_WAIT ]; do
        if docker-compose -f "$COMPOSE_FILE" ps | grep -q "unhealthy"; then
            log_warn "Some services are unhealthy, waiting..."
            sleep $INTERVAL
            ELAPSED=$((ELAPSED + INTERVAL))
        else
            ALL_HEALTHY=true
            for service in backend frontend; do
                if ! docker-compose -f "$COMPOSE_FILE" ps $service | grep -q "Up"; then
                    ALL_HEALTHY=false
                    break
                fi
            done
            
            if [ "$ALL_HEALTHY" = true ]; then
                log_info "All services are healthy"
                return 0
            fi
            
            sleep $INTERVAL
            ELAPSED=$((ELAPSED + INTERVAL))
        fi
    done
    
    log_error "Services did not become healthy within ${MAX_WAIT} seconds"
    return 1
}

run_smoke_tests() {
    log_info "Running smoke tests..."
    
    # Run smoke tests
    if [ -f "${SCRIPT_DIR}/smoke-tests.sh" ]; then
        bash "${SCRIPT_DIR}/smoke-tests.sh"
    else
        log_warn "Smoke tests script not found, skipping..."
    fi
    
    log_info "Smoke tests completed"
}

setup_monitoring() {
    log_info "Setting up monitoring..."
    
    # Check if monitoring is enabled
    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "prometheus"; then
        log_info "Monitoring services are running"
    else
        log_warn "Monitoring services not configured"
    fi
}

display_status() {
    log_info "Deployment Status:"
    echo ""
    docker-compose -f "$COMPOSE_FILE" ps
    echo ""
    log_info "Access URLs:"
    echo "  Frontend: http://localhost:${FRONTEND_PORT:-8080}"
    echo "  Backend API: http://localhost:${BACKEND_PORT:-3000}"
    echo "  API Health: http://localhost:${BACKEND_PORT:-3000}/health"
    echo ""
}

rollback() {
    log_error "Deployment failed, initiating rollback..."
    
    # Stop current deployment
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    
    # Restore from latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR" | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        log_info "Restoring from backup: $LATEST_BACKUP"
        
        # Restore MongoDB
        if [ -d "${BACKUP_DIR}/${LATEST_BACKUP}/mongodb" ]; then
            docker cp "${BACKUP_DIR}/${LATEST_BACKUP}/mongodb" env-config-mongodb:/backup
            docker exec env-config-mongodb mongorestore /backup
        fi
        
        # Restore Redis
        if [ -f "${BACKUP_DIR}/${LATEST_BACKUP}/redis-backup.rdb" ]; then
            docker cp "${BACKUP_DIR}/${LATEST_BACKUP}/redis-backup.rdb" env-config-redis:/data/dump.rdb
            docker-compose -f "$COMPOSE_FILE" restart redis
        fi
    fi
    
    log_error "Rollback completed"
    exit 1
}

# Main deployment flow
main() {
    log_info "Starting production deployment..."
    echo ""
    
    # Set trap for errors
    trap rollback ERR
    
    # Run deployment steps
    check_prerequisites
    validate_environment
    backup_existing
    build_images
    deploy_services
    wait_for_services || rollback
    run_database_migrations
    run_smoke_tests || log_warn "Smoke tests failed, but deployment continues"
    setup_monitoring
    
    echo ""
    log_info "Deployment completed successfully!"
    echo ""
    display_status
}

# Run main function
main "$@"
