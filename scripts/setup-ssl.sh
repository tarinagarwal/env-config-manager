#!/bin/bash

# SSL Certificate Setup Script
# Helps configure SSL certificates for production deployment

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
SSL_DIR="${PROJECT_ROOT}/nginx/ssl"
DOMAIN=""
EMAIL=""

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

show_menu() {
    echo ""
    echo "========================================="
    echo "  SSL Certificate Setup"
    echo "========================================="
    echo ""
    echo "Choose an option:"
    echo "  1) Generate self-signed certificate (Development/Testing)"
    echo "  2) Setup Let's Encrypt certificate (Production)"
    echo "  3) Import existing certificate"
    echo "  4) Exit"
    echo ""
}

generate_self_signed() {
    log_step "Generating self-signed certificate..."
    
    read -p "Enter domain name (e.g., localhost or yourdomain.com): " DOMAIN
    
    if [ -z "$DOMAIN" ]; then
        log_error "Domain name is required"
        return 1
    fi
    
    # Create SSL directory
    mkdir -p "$SSL_DIR"
    
    # Generate private key
    log_info "Generating private key..."
    openssl genrsa -out "${SSL_DIR}/key.pem" 2048
    
    # Generate certificate
    log_info "Generating certificate..."
    openssl req -new -x509 -key "${SSL_DIR}/key.pem" -out "${SSL_DIR}/cert.pem" -days 365 \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=${DOMAIN}"
    
    # Set permissions
    chmod 600 "${SSL_DIR}/key.pem"
    chmod 644 "${SSL_DIR}/cert.pem"
    
    log_info "Self-signed certificate generated successfully!"
    log_warn "Note: Self-signed certificates will show security warnings in browsers"
    log_info "Certificate location: ${SSL_DIR}/cert.pem"
    log_info "Private key location: ${SSL_DIR}/key.pem"
}

setup_letsencrypt() {
    log_step "Setting up Let's Encrypt certificate..."
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        log_error "Certbot is not installed"
        echo ""
        echo "Install certbot:"
        echo "  Ubuntu/Debian: sudo apt-get install certbot"
        echo "  CentOS/RHEL: sudo yum install certbot"
        echo "  macOS: brew install certbot"
        return 1
    fi
    
    read -p "Enter domain name: " DOMAIN
    read -p "Enter email address: " EMAIL
    
    if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
        log_error "Domain and email are required"
        return 1
    fi
    
    log_info "Obtaining certificate from Let's Encrypt..."
    log_warn "Make sure port 80 is accessible from the internet"
    
    # Create SSL directory
    mkdir -p "$SSL_DIR"
    
    # Obtain certificate
    sudo certbot certonly --standalone \
        -d "$DOMAIN" \
        --email "$EMAIL" \
        --agree-tos \
        --non-interactive
    
    # Copy certificates
    sudo cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${SSL_DIR}/cert.pem"
    sudo cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${SSL_DIR}/key.pem"
    
    # Set permissions
    sudo chown $(whoami):$(whoami) "${SSL_DIR}/cert.pem" "${SSL_DIR}/key.pem"
    chmod 600 "${SSL_DIR}/key.pem"
    chmod 644 "${SSL_DIR}/cert.pem"
    
    log_info "Let's Encrypt certificate installed successfully!"
    log_info "Certificate location: ${SSL_DIR}/cert.pem"
    log_info "Private key location: ${SSL_DIR}/key.pem"
    
    # Setup auto-renewal
    echo ""
    log_info "Setting up auto-renewal..."
    echo "Add this to your crontab (crontab -e):"
    echo "0 0 * * * certbot renew --quiet && cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ${SSL_DIR}/cert.pem && cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem ${SSL_DIR}/key.pem && docker-compose restart nginx"
}

import_certificate() {
    log_step "Importing existing certificate..."
    
    read -p "Enter path to certificate file (PEM format): " CERT_PATH
    read -p "Enter path to private key file: " KEY_PATH
    
    if [ ! -f "$CERT_PATH" ]; then
        log_error "Certificate file not found: $CERT_PATH"
        return 1
    fi
    
    if [ ! -f "$KEY_PATH" ]; then
        log_error "Private key file not found: $KEY_PATH"
        return 1
    fi
    
    # Create SSL directory
    mkdir -p "$SSL_DIR"
    
    # Copy files
    cp "$CERT_PATH" "${SSL_DIR}/cert.pem"
    cp "$KEY_PATH" "${SSL_DIR}/key.pem"
    
    # Set permissions
    chmod 600 "${SSL_DIR}/key.pem"
    chmod 644 "${SSL_DIR}/cert.pem"
    
    log_info "Certificate imported successfully!"
    log_info "Certificate location: ${SSL_DIR}/cert.pem"
    log_info "Private key location: ${SSL_DIR}/key.pem"
}

verify_certificate() {
    log_step "Verifying certificate..."
    
    if [ ! -f "${SSL_DIR}/cert.pem" ] || [ ! -f "${SSL_DIR}/key.pem" ]; then
        log_error "Certificate files not found"
        return 1
    fi
    
    # Check certificate
    log_info "Certificate details:"
    openssl x509 -in "${SSL_DIR}/cert.pem" -noout -subject -dates
    
    # Verify key matches certificate
    CERT_MODULUS=$(openssl x509 -noout -modulus -in "${SSL_DIR}/cert.pem" | openssl md5)
    KEY_MODULUS=$(openssl rsa -noout -modulus -in "${SSL_DIR}/key.pem" | openssl md5)
    
    if [ "$CERT_MODULUS" = "$KEY_MODULUS" ]; then
        log_info "Certificate and private key match"
    else
        log_error "Certificate and private key do not match!"
        return 1
    fi
}

update_nginx_config() {
    log_step "Updating Nginx configuration..."
    
    NGINX_CONF="${PROJECT_ROOT}/nginx/nginx.conf"
    
    if [ ! -f "$NGINX_CONF" ]; then
        log_warn "Nginx configuration not found, creating default..."
        
        mkdir -p "${PROJECT_ROOT}/nginx"
        
        cat > "$NGINX_CONF" << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:3000;
    }

    upstream frontend {
        server frontend:8080;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name _;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # API proxy
        location /api {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Frontend proxy
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
EOF
        
        log_info "Nginx configuration created"
    fi
    
    log_info "Nginx is configured to use SSL certificates"
    log_info "Restart Nginx to apply changes: docker-compose restart nginx"
}

main() {
    while true; do
        show_menu
        read -p "Select option [1-4]: " choice
        
        case $choice in
            1)
                generate_self_signed
                verify_certificate
                update_nginx_config
                ;;
            2)
                setup_letsencrypt
                verify_certificate
                update_nginx_config
                ;;
            3)
                import_certificate
                verify_certificate
                update_nginx_config
                ;;
            4)
                log_info "Exiting..."
                exit 0
                ;;
            *)
                log_error "Invalid option"
                ;;
        esac
        
        echo ""
        read -p "Press Enter to continue..."
    done
}

main "$@"
