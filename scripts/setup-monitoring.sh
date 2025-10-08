#!/bin/bash

# Monitoring Setup Script
# Configures monitoring and alerting for production deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MONITORING_DIR="${PROJECT_ROOT}/monitoring"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

create_monitoring_directory() {
    log_step "Creating monitoring directory structure..."
    
    mkdir -p "${MONITORING_DIR}/prometheus"
    mkdir -p "${MONITORING_DIR}/grafana/dashboards"
    mkdir -p "${MONITORING_DIR}/grafana/provisioning/datasources"
    mkdir -p "${MONITORING_DIR}/grafana/provisioning/dashboards"
    mkdir -p "${MONITORING_DIR}/alertmanager"
    
    log_info "Directory structure created"
}

setup_prometheus() {
    log_step "Setting up Prometheus configuration..."
    
    cat > "${MONITORING_DIR}/prometheus/prometheus.yml" << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'env-config-manager'
    environment: 'production'

# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

# Load rules once and periodically evaluate them
rule_files:
  - "alerts.yml"

# Scrape configurations
scrape_configs:
  # Backend API metrics
  - job_name: 'backend'
    static_configs:
      - targets: ['backend:3000']
    metrics_path: '/metrics'

  # Worker metrics
  - job_name: 'worker'
    static_configs:
      - targets: ['worker:3000']
    metrics_path: '/metrics'

  # MongoDB metrics (if exporter is configured)
  - job_name: 'mongodb'
    static_configs:
      - targets: ['mongodb-exporter:9216']

  # Redis metrics (if exporter is configured)
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  # Node exporter for system metrics
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']

  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
EOF

    log_info "Prometheus configuration created"
}

setup_prometheus_alerts() {
    log_step "Setting up Prometheus alert rules..."
    
    cat > "${MONITORING_DIR}/prometheus/alerts.yml" << 'EOF'
groups:
  - name: application_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec for {{ $labels.job }}"

      # Service down
      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "{{ $labels.job }} has been down for more than 2 minutes"

      # High response time
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"
          description: "95th percentile response time is {{ $value }}s for {{ $labels.job }}"

      # High CPU usage
      - alert: HighCPUUsage
        expr: rate(process_cpu_seconds_total[5m]) > 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"
          description: "CPU usage is {{ $value }} for {{ $labels.job }}"

      # High memory usage
      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes / 1024 / 1024 / 1024 > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}GB for {{ $labels.job }}"

      # Database connection pool exhausted
      - alert: DatabaseConnectionPoolExhausted
        expr: database_connections_active / database_connections_max > 0.9
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Database connection pool nearly exhausted"
          description: "{{ $value }}% of database connections are in use"

      # Redis connection issues
      - alert: RedisConnectionIssues
        expr: redis_connected_clients < 1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Redis connection issues"
          description: "No clients connected to Redis"

      # Sync failures
      - alert: HighSyncFailureRate
        expr: rate(sync_failures_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High sync failure rate"
          description: "Sync failure rate is {{ $value }} failures/sec"

  - name: infrastructure_alerts
    interval: 30s
    rules:
      # Disk space
      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Disk space is low"
          description: "Only {{ $value }}% disk space remaining on {{ $labels.device }}"

      # Disk space critical
      - alert: DiskSpaceCritical
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Disk space is critically low"
          description: "Only {{ $value }}% disk space remaining on {{ $labels.device }}"
EOF

    log_info "Prometheus alert rules created"
}

setup_alertmanager() {
    log_step "Setting up Alertmanager configuration..."
    
    read -p "Enter email address for alerts (or press Enter to skip): " ALERT_EMAIL
    read -p "Enter Slack webhook URL (or press Enter to skip): " SLACK_WEBHOOK
    
    cat > "${MONITORING_DIR}/alertmanager/alertmanager.yml" << EOF
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: 'critical'
    - match:
        severity: warning
      receiver: 'warning'

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://localhost:5001/webhook'

  - name: 'critical'
EOF

    if [ -n "$ALERT_EMAIL" ]; then
        cat >> "${MONITORING_DIR}/alertmanager/alertmanager.yml" << EOF
    email_configs:
      - to: '${ALERT_EMAIL}'
        from: 'alerts@env-config-manager.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'your-email@gmail.com'
        auth_password: 'your-app-password'
        headers:
          Subject: '[CRITICAL] {{ .GroupLabels.alertname }}'
EOF
    fi

    if [ -n "$SLACK_WEBHOOK" ]; then
        cat >> "${MONITORING_DIR}/alertmanager/alertmanager.yml" << EOF
    slack_configs:
      - api_url: '${SLACK_WEBHOOK}'
        channel: '#alerts'
        title: '[CRITICAL] {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
EOF
    fi

    cat >> "${MONITORING_DIR}/alertmanager/alertmanager.yml" << 'EOF'

  - name: 'warning'
    webhook_configs:
      - url: 'http://localhost:5001/webhook'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'cluster', 'service']
EOF

    log_info "Alertmanager configuration created"
}

setup_grafana() {
    log_step "Setting up Grafana configuration..."
    
    # Datasource configuration
    cat > "${MONITORING_DIR}/grafana/provisioning/datasources/prometheus.yml" << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
EOF

    # Dashboard provisioning
    cat > "${MONITORING_DIR}/grafana/provisioning/dashboards/dashboard.yml" << 'EOF'
apiVersion: 1

providers:
  - name: 'Default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
EOF

    # Create a basic dashboard
    cat > "${MONITORING_DIR}/grafana/dashboards/overview.json" << 'EOF'
{
  "dashboard": {
    "title": "Environment Config Manager - Overview",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m])"
          }
        ]
      },
      {
        "title": "Response Time (95th percentile)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
          }
        ]
      }
    ]
  }
}
EOF

    log_info "Grafana configuration created"
}

create_docker_compose_monitoring() {
    log_step "Creating Docker Compose monitoring configuration..."
    
    cat > "${PROJECT_ROOT}/docker-compose.monitoring.yml" << 'EOF'
version: "3.8"

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: env-config-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus:/etc/prometheus
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    networks:
      - monitoring

  alertmanager:
    image: prom/alertmanager:latest
    container_name: env-config-alertmanager
    restart: unless-stopped
    ports:
      - "9093:9093"
    volumes:
      - ./monitoring/alertmanager:/etc/alertmanager
      - alertmanager_data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: env-config-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - grafana_data:/var/lib/grafana
    networks:
      - monitoring

  node-exporter:
    image: prom/node-exporter:latest
    container_name: env-config-node-exporter
    restart: unless-stopped
    ports:
      - "9100:9100"
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    networks:
      - monitoring

volumes:
  prometheus_data:
  alertmanager_data:
  grafana_data:

networks:
  monitoring:
    driver: bridge
EOF

    log_info "Docker Compose monitoring configuration created"
}

start_monitoring() {
    log_step "Starting monitoring services..."
    
    cd "$PROJECT_ROOT"
    docker-compose -f docker-compose.monitoring.yml up -d
    
    log_info "Monitoring services started"
    echo ""
    log_info "Access URLs:"
    echo "  Prometheus: http://localhost:9090"
    echo "  Alertmanager: http://localhost:9093"
    echo "  Grafana: http://localhost:3001 (admin/admin)"
    echo ""
}

main() {
    echo ""
    echo "========================================="
    echo "  Monitoring Setup"
    echo "========================================="
    echo ""
    
    create_monitoring_directory
    setup_prometheus
    setup_prometheus_alerts
    setup_alertmanager
    setup_grafana
    create_docker_compose_monitoring
    
    echo ""
    read -p "Start monitoring services now? (y/n): " START_NOW
    
    if [ "$START_NOW" = "y" ] || [ "$START_NOW" = "Y" ]; then
        start_monitoring
    else
        log_info "Monitoring configured but not started"
        log_info "To start monitoring: docker-compose -f docker-compose.monitoring.yml up -d"
    fi
    
    echo ""
    log_info "Monitoring setup complete!"
}

main "$@"
