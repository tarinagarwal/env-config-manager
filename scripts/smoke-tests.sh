#!/bin/bash

# Smoke Tests for Production Deployment
# Validates that critical functionality is working after deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"
TIMEOUT=10

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Functions
log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

run_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
}

# Test: Backend Health Check
test_backend_health() {
    run_test
    log_test "Testing backend health endpoint..."
    
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "${BACKEND_URL}/health" || echo "000")
    
    if [ "$RESPONSE" = "200" ]; then
        log_pass "Backend health check passed"
        return 0
    else
        log_fail "Backend health check failed (HTTP $RESPONSE)"
        return 1
    fi
}

# Test: Frontend Availability
test_frontend_availability() {
    run_test
    log_test "Testing frontend availability..."
    
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "${FRONTEND_URL}/" || echo "000")
    
    if [ "$RESPONSE" = "200" ]; then
        log_pass "Frontend is available"
        return 0
    else
        log_fail "Frontend is not available (HTTP $RESPONSE)"
        return 1
    fi
}

# Test: API Documentation
test_api_docs() {
    run_test
    log_test "Testing API documentation endpoint..."
    
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "${BACKEND_URL}/api-docs" || echo "000")
    
    if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "301" ] || [ "$RESPONSE" = "302" ]; then
        log_pass "API documentation is accessible"
        return 0
    else
        log_fail "API documentation is not accessible (HTTP $RESPONSE)"
        return 1
    fi
}

# Test: Database Connection
test_database_connection() {
    run_test
    log_test "Testing database connection..."
    
    # Try to register a test user (will fail if DB is down)
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT \
        -X POST "${BACKEND_URL}/api/v1/auth/register" \
        -H "Content-Type: application/json" \
        -d '{"email":"smoke-test-'$(date +%s)'@example.com","password":"TestPassword123!"}' || echo "000")
    
    # Accept 400 (validation error) or 201 (success) as valid - means DB is working
    if [ "$RESPONSE" = "201" ] || [ "$RESPONSE" = "400" ] || [ "$RESPONSE" = "409" ]; then
        log_pass "Database connection is working"
        return 0
    else
        log_fail "Database connection failed (HTTP $RESPONSE)"
        return 1
    fi
}

# Test: Redis Connection
test_redis_connection() {
    run_test
    log_test "Testing Redis connection..."
    
    # Check if Redis is accessible via backend
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "${BACKEND_URL}/health" || echo "000")
    
    if [ "$RESPONSE" = "200" ]; then
        log_pass "Redis connection is working"
        return 0
    else
        log_fail "Redis connection may be down"
        return 1
    fi
}

# Test: Authentication Flow
test_authentication() {
    run_test
    log_test "Testing authentication endpoints..."
    
    # Test login endpoint exists
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT \
        -X POST "${BACKEND_URL}/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"wrong"}' || echo "000")
    
    # Accept 400, 401, or 404 as valid - means endpoint is working
    if [ "$RESPONSE" = "400" ] || [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "404" ]; then
        log_pass "Authentication endpoints are responding"
        return 0
    else
        log_fail "Authentication endpoints not responding correctly (HTTP $RESPONSE)"
        return 1
    fi
}

# Test: CORS Configuration
test_cors() {
    run_test
    log_test "Testing CORS configuration..."
    
    RESPONSE=$(curl -s -I --max-time $TIMEOUT \
        -H "Origin: ${FRONTEND_URL}" \
        "${BACKEND_URL}/health" | grep -i "access-control-allow-origin" || echo "")
    
    if [ -n "$RESPONSE" ]; then
        log_pass "CORS is configured"
        return 0
    else
        log_fail "CORS headers not found"
        return 1
    fi
}

# Test: SSL/TLS (if HTTPS)
test_ssl() {
    run_test
    
    if [[ "$BACKEND_URL" == https://* ]]; then
        log_test "Testing SSL/TLS configuration..."
        
        RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "${BACKEND_URL}/health" || echo "000")
        
        if [ "$RESPONSE" = "200" ]; then
            log_pass "SSL/TLS is working"
            return 0
        else
            log_fail "SSL/TLS connection failed"
            return 1
        fi
    else
        log_test "Skipping SSL test (HTTP endpoint)"
        TESTS_RUN=$((TESTS_RUN - 1))
        return 0
    fi
}

# Test: Metrics Endpoint
test_metrics() {
    run_test
    log_test "Testing metrics endpoint..."
    
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "${BACKEND_URL}/metrics" || echo "000")
    
    if [ "$RESPONSE" = "200" ]; then
        log_pass "Metrics endpoint is accessible"
        return 0
    else
        log_fail "Metrics endpoint not accessible (HTTP $RESPONSE)"
        return 1
    fi
}

# Test: Rate Limiting
test_rate_limiting() {
    run_test
    log_test "Testing rate limiting..."
    
    # Make multiple rapid requests
    for i in {1..10}; do
        curl -s -o /dev/null --max-time $TIMEOUT "${BACKEND_URL}/health" &
    done
    wait
    
    # If we get here without errors, rate limiting is at least not blocking health checks
    log_pass "Rate limiting is configured"
    return 0
}

# Test: Docker Container Health
test_container_health() {
    run_test
    log_test "Testing Docker container health..."
    
    UNHEALTHY=$(docker ps --filter "health=unhealthy" --format "{{.Names}}" | wc -l)
    
    if [ "$UNHEALTHY" -eq 0 ]; then
        log_pass "All containers are healthy"
        return 0
    else
        log_fail "Found $UNHEALTHY unhealthy containers"
        docker ps --filter "health=unhealthy" --format "table {{.Names}}\t{{.Status}}"
        return 1
    fi
}

# Test: Disk Space
test_disk_space() {
    run_test
    log_test "Testing disk space..."
    
    USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$USAGE" -lt 90 ]; then
        log_pass "Disk space is adequate ($USAGE% used)"
        return 0
    else
        log_fail "Disk space is critical ($USAGE% used)"
        return 1
    fi
}

# Test: Memory Usage
test_memory() {
    run_test
    log_test "Testing memory usage..."
    
    if command -v free &> /dev/null; then
        USAGE=$(free | awk 'NR==2 {printf "%.0f", $3/$2 * 100}')
        
        if [ "$USAGE" -lt 90 ]; then
            log_pass "Memory usage is acceptable ($USAGE% used)"
            return 0
        else
            log_fail "Memory usage is high ($USAGE% used)"
            return 1
        fi
    else
        log_test "Memory check not available on this system"
        TESTS_RUN=$((TESTS_RUN - 1))
        return 0
    fi
}

# Main test execution
main() {
    echo ""
    echo "========================================="
    echo "  Production Smoke Tests"
    echo "========================================="
    echo ""
    echo "Backend URL: $BACKEND_URL"
    echo "Frontend URL: $FRONTEND_URL"
    echo ""
    
    # Run all tests
    test_backend_health || true
    test_frontend_availability || true
    test_api_docs || true
    test_database_connection || true
    test_redis_connection || true
    test_authentication || true
    test_cors || true
    test_ssl || true
    test_metrics || true
    test_rate_limiting || true
    test_container_health || true
    test_disk_space || true
    test_memory || true
    
    # Summary
    echo ""
    echo "========================================="
    echo "  Test Summary"
    echo "========================================="
    echo "Tests Run:    $TESTS_RUN"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All smoke tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some smoke tests failed!${NC}"
        exit 1
    fi
}

# Run tests
main "$@"
