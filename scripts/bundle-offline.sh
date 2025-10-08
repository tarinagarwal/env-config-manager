#!/bin/bash

# Bundle all dependencies for offline/air-gapped installation
# This script creates a complete package that can be deployed without internet access

set -e

echo "=== Environment Configuration Manager - Offline Bundle Creator ==="
echo ""

# Configuration
BUNDLE_DIR="offline-bundle"
VERSION=$(node -p "require('./package.json').version")
BUNDLE_NAME="env-config-manager-offline-v${VERSION}.tar.gz"

# Clean previous bundle
echo "Cleaning previous bundle..."
rm -rf "$BUNDLE_DIR"
rm -f "$BUNDLE_NAME"

# Create bundle directory
echo "Creating bundle directory..."
mkdir -p "$BUNDLE_DIR"

# Copy application files
echo "Copying application files..."
cp -r backend "$BUNDLE_DIR/"
cp -r frontend "$BUNDLE_DIR/"
cp -r cli "$BUNDLE_DIR/"
cp docker-compose.prod.yml "$BUNDLE_DIR/docker-compose.yml"
cp .env.production.example "$BUNDLE_DIR/.env.example"
cp -r nginx "$BUNDLE_DIR/"
cp -r helm "$BUNDLE_DIR/"
cp -r scripts "$BUNDLE_DIR/"
cp README.md "$BUNDLE_DIR/"
cp SETUP.md "$BUNDLE_DIR/"

# Create offline installation script
cat > "$BUNDLE_DIR/install-offline.sh" << 'EOF'
#!/bin/bash

# Offline Installation Script for Environment Configuration Manager

set -e

echo "=== Environment Configuration Manager - Offline Installation ==="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Error: Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Load Docker images
echo "Loading Docker images..."
if [ -f "docker-images/backend.tar" ]; then
    docker load -i docker-images/backend.tar
fi
if [ -f "docker-images/frontend.tar" ]; then
    docker load -i docker-images/frontend.tar
fi
if [ -f "docker-images/worker.tar" ]; then
    docker load -i docker-images/worker.tar
fi
if [ -f "docker-images/mongodb.tar" ]; then
    docker load -i docker-images/mongodb.tar
fi
if [ -f "docker-images/redis.tar" ]; then
    docker load -i docker-images/redis.tar
fi

echo ""
echo "Docker images loaded successfully!"
echo ""

# Setup environment file
if [ ! -f ".env.production" ]; then
    echo "Creating .env.production from template..."
    cp .env.example .env.production
    echo ""
    echo "IMPORTANT: Please edit .env.production and configure your environment variables."
    echo "Required variables:"
    echo "  - MONGO_ROOT_PASSWORD"
    echo "  - REDIS_PASSWORD"
    echo "  - JWT_SECRET"
    echo "  - JWT_REFRESH_SECRET"
    echo "  - ENCRYPTION_KEY"
    echo "  - LICENSE_KEY (for enterprise features)"
    echo ""
    read -p "Press Enter to continue after editing .env.production..."
fi

# Start services
echo "Starting services..."
docker-compose up -d

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Services are starting up. This may take a few minutes."
echo ""
echo "Access the application at:"
echo "  Frontend: http://localhost:8080"
echo "  Backend API: http://localhost:3000"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""
echo "To stop services:"
echo "  docker-compose down"
echo ""
EOF

chmod +x "$BUNDLE_DIR/install-offline.sh"

# Bundle npm dependencies for backend
echo "Bundling backend dependencies..."
cd backend
npm ci --production
tar -czf "../$BUNDLE_DIR/backend-node_modules.tar.gz" node_modules
cd ..

# Bundle npm dependencies for frontend
echo "Bundling frontend dependencies..."
cd frontend
npm ci
tar -czf "../$BUNDLE_DIR/frontend-node_modules.tar.gz" node_modules
cd ..

# Bundle npm dependencies for CLI
echo "Bundling CLI dependencies..."
cd cli
npm ci --production
tar -czf "../$BUNDLE_DIR/cli-node_modules.tar.gz" node_modules
cd ..

# Build Docker images
echo "Building Docker images..."
docker build -t env-config-backend:$VERSION -f backend/Dockerfile backend/
docker build -t env-config-frontend:$VERSION -f frontend/Dockerfile frontend/
docker build -t env-config-worker:$VERSION -f workers/Dockerfile .

# Save Docker images
echo "Saving Docker images..."
mkdir -p "$BUNDLE_DIR/docker-images"
docker save env-config-backend:$VERSION -o "$BUNDLE_DIR/docker-images/backend.tar"
docker save env-config-frontend:$VERSION -o "$BUNDLE_DIR/docker-images/frontend.tar"
docker save env-config-worker:$VERSION -o "$BUNDLE_DIR/docker-images/worker.tar"

# Pull and save base images
echo "Saving base images..."
docker pull mongo:7
docker save mongo:7 -o "$BUNDLE_DIR/docker-images/mongodb.tar"
docker pull redis:7-alpine
docker save redis:7-alpine -o "$BUNDLE_DIR/docker-images/redis.tar"

# Create installation guide
cat > "$BUNDLE_DIR/OFFLINE-INSTALLATION.md" << 'EOF'
# Offline Installation Guide

This bundle contains everything needed to install Environment Configuration Manager in an air-gapped environment.

## Prerequisites

- Docker 20.10 or higher
- Docker Compose 2.0 or higher
- At least 8GB RAM
- At least 50GB disk space

## Installation Steps

### 1. Transfer Bundle

Transfer the entire bundle to your air-gapped environment using approved methods (USB drive, secure file transfer, etc.).

### 2. Extract Bundle

```bash
tar -xzf env-config-manager-offline-v*.tar.gz
cd offline-bundle
```

### 3. Run Installation Script

```bash
chmod +x install-offline.sh
./install-offline.sh
```

### 4. Configure Environment

Edit `.env.production` with your configuration:

```bash
nano .env.production
```

Required variables:
- `MONGO_ROOT_PASSWORD` - MongoDB root password
- `REDIS_PASSWORD` - Redis password
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - JWT refresh token secret
- `ENCRYPTION_KEY` - Encryption key for secrets
- `LICENSE_KEY` - Enterprise license key

### 5. Start Services

```bash
docker-compose up -d
```

### 6. Verify Installation

Check that all services are running:

```bash
docker-compose ps
```

Access the application:
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000

## Kubernetes Deployment

For Kubernetes deployment in air-gapped environments:

### 1. Load Images to Registry

```bash
# Tag images for your private registry
docker tag env-config-backend:VERSION your-registry.com/env-config-backend:VERSION
docker tag env-config-frontend:VERSION your-registry.com/env-config-frontend:VERSION
docker tag env-config-worker:VERSION your-registry.com/env-config-worker:VERSION

# Push to private registry
docker push your-registry.com/env-config-backend:VERSION
docker push your-registry.com/env-config-frontend:VERSION
docker push your-registry.com/env-config-worker:VERSION
```

### 2. Install Helm Chart

```bash
cd helm/env-config-manager

# Update values.yaml with your registry
sed -i 's|docker.io|your-registry.com|g' values.yaml

# Install
helm install env-config-manager . \
  --namespace env-config \
  --create-namespace \
  -f values.yaml
```

## Troubleshooting

### Services won't start

Check logs:
```bash
docker-compose logs
```

### Database connection issues

Verify MongoDB is running:
```bash
docker-compose ps mongodb
docker-compose logs mongodb
```

### License validation fails

Ensure LICENSE_KEY is correctly set in .env.production and matches your enterprise license.

## Support

For air-gapped deployment support, contact your account manager or support@example.com with your customer ID.
EOF

# Create checksums
echo "Creating checksums..."
cd "$BUNDLE_DIR"
find . -type f -exec sha256sum {} \; > CHECKSUMS.txt
cd ..

# Create final bundle
echo "Creating final bundle archive..."
tar -czf "$BUNDLE_NAME" "$BUNDLE_DIR"

# Calculate final checksum
sha256sum "$BUNDLE_NAME" > "${BUNDLE_NAME}.sha256"

echo ""
echo "=== Bundle Created Successfully ==="
echo ""
echo "Bundle: $BUNDLE_NAME"
echo "Size: $(du -h $BUNDLE_NAME | cut -f1)"
echo "Checksum: $(cat ${BUNDLE_NAME}.sha256)"
echo ""
echo "This bundle contains:"
echo "  - Application source code"
echo "  - All npm dependencies"
echo "  - Docker images (backend, frontend, worker, mongodb, redis)"
echo "  - Installation scripts"
echo "  - Documentation"
echo ""
echo "Transfer this bundle to your air-gapped environment and run:"
echo "  tar -xzf $BUNDLE_NAME"
echo "  cd $BUNDLE_DIR"
echo "  ./install-offline.sh"
echo ""
