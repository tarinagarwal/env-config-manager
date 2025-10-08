# PowerShell script for creating offline bundle on Windows

param(
    [string]$Version = "1.0.0"
)

Write-Host "=== Environment Configuration Manager - Offline Bundle Creator ===" -ForegroundColor Green
Write-Host ""

# Configuration
$BundleDir = "offline-bundle"
$BundleName = "env-config-manager-offline-v$Version.zip"

# Clean previous bundle
Write-Host "Cleaning previous bundle..." -ForegroundColor Yellow
if (Test-Path $BundleDir) {
    Remove-Item -Recurse -Force $BundleDir
}
if (Test-Path $BundleName) {
    Remove-Item -Force $BundleName
}

# Create bundle directory
Write-Host "Creating bundle directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $BundleDir | Out-Null

# Copy application files
Write-Host "Copying application files..." -ForegroundColor Yellow
Copy-Item -Recurse backend "$BundleDir\"
Copy-Item -Recurse frontend "$BundleDir\"
Copy-Item -Recurse cli "$BundleDir\"
Copy-Item docker-compose.prod.yml "$BundleDir\docker-compose.yml"
Copy-Item .env.production.example "$BundleDir\.env.example"
Copy-Item -Recurse nginx "$BundleDir\"
Copy-Item -Recurse helm "$BundleDir\"
Copy-Item -Recurse scripts "$BundleDir\"
Copy-Item README.md "$BundleDir\"
Copy-Item SETUP.md "$BundleDir\"

# Create offline installation script for Windows
$InstallScript = @'
# Offline Installation Script for Environment Configuration Manager (Windows)

Write-Host "=== Environment Configuration Manager - Offline Installation ===" -ForegroundColor Green
Write-Host ""

# Check if Docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker is not installed. Please install Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Load Docker images
Write-Host "Loading Docker images..." -ForegroundColor Yellow
if (Test-Path "docker-images\backend.tar") {
    docker load -i docker-images\backend.tar
}
if (Test-Path "docker-images\frontend.tar") {
    docker load -i docker-images\frontend.tar
}
if (Test-Path "docker-images\worker.tar") {
    docker load -i docker-images\worker.tar
}
if (Test-Path "docker-images\mongodb.tar") {
    docker load -i docker-images\mongodb.tar
}
if (Test-Path "docker-images\redis.tar") {
    docker load -i docker-images\redis.tar
}

Write-Host ""
Write-Host "Docker images loaded successfully!" -ForegroundColor Green
Write-Host ""

# Setup environment file
if (-not (Test-Path ".env.production")) {
    Write-Host "Creating .env.production from template..." -ForegroundColor Yellow
    Copy-Item .env.example .env.production
    Write-Host ""
    Write-Host "IMPORTANT: Please edit .env.production and configure your environment variables." -ForegroundColor Yellow
    Write-Host "Required variables:"
    Write-Host "  - MONGO_ROOT_PASSWORD"
    Write-Host "  - REDIS_PASSWORD"
    Write-Host "  - JWT_SECRET"
    Write-Host "  - JWT_REFRESH_SECRET"
    Write-Host "  - ENCRYPTION_KEY"
    Write-Host "  - LICENSE_KEY (for enterprise features)"
    Write-Host ""
    Read-Host "Press Enter to continue after editing .env.production"
}

# Start services
Write-Host "Starting services..." -ForegroundColor Yellow
docker-compose up -d

Write-Host ""
Write-Host "=== Installation Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Services are starting up. This may take a few minutes."
Write-Host ""
Write-Host "Access the application at:"
Write-Host "  Frontend: http://localhost:8080"
Write-Host "  Backend API: http://localhost:3000"
Write-Host ""
Write-Host "To view logs:"
Write-Host "  docker-compose logs -f"
Write-Host ""
Write-Host "To stop services:"
Write-Host "  docker-compose down"
Write-Host ""
'@

Set-Content -Path "$BundleDir\install-offline.ps1" -Value $InstallScript

# Bundle npm dependencies
Write-Host "Bundling dependencies..." -ForegroundColor Yellow

Push-Location backend
npm ci --production
Compress-Archive -Path node_modules -DestinationPath "..\$BundleDir\backend-node_modules.zip" -Force
Pop-Location

Push-Location frontend
npm ci
Compress-Archive -Path node_modules -DestinationPath "..\$BundleDir\frontend-node_modules.zip" -Force
Pop-Location

Push-Location cli
npm ci --production
Compress-Archive -Path node_modules -DestinationPath "..\$BundleDir\cli-node_modules.zip" -Force
Pop-Location

# Build Docker images
Write-Host "Building Docker images..." -ForegroundColor Yellow
docker build -t "env-config-backend:$Version" -f backend/Dockerfile backend/
docker build -t "env-config-frontend:$Version" -f frontend/Dockerfile frontend/
docker build -t "env-config-worker:$Version" -f workers/Dockerfile .

# Save Docker images
Write-Host "Saving Docker images..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "$BundleDir\docker-images" -Force | Out-Null
docker save "env-config-backend:$Version" -o "$BundleDir\docker-images\backend.tar"
docker save "env-config-frontend:$Version" -o "$BundleDir\docker-images\frontend.tar"
docker save "env-config-worker:$Version" -o "$BundleDir\docker-images\worker.tar"

# Pull and save base images
Write-Host "Saving base images..." -ForegroundColor Yellow
docker pull mongo:7
docker save mongo:7 -o "$BundleDir\docker-images\mongodb.tar"
docker pull redis:7-alpine
docker save redis:7-alpine -o "$BundleDir\docker-images\redis.tar"

# Create checksums
Write-Host "Creating checksums..." -ForegroundColor Yellow
Get-ChildItem -Path $BundleDir -Recurse -File | ForEach-Object {
    $hash = Get-FileHash -Path $_.FullName -Algorithm SHA256
    "$($hash.Hash)  $($_.FullName.Replace("$BundleDir\", ""))"
} | Out-File "$BundleDir\CHECKSUMS.txt"

# Create final bundle
Write-Host "Creating final bundle archive..." -ForegroundColor Yellow
Compress-Archive -Path $BundleDir -DestinationPath $BundleName -Force

# Calculate final checksum
$bundleHash = Get-FileHash -Path $BundleName -Algorithm SHA256
"$($bundleHash.Hash)  $BundleName" | Out-File "${BundleName}.sha256"

Write-Host ""
Write-Host "=== Bundle Created Successfully ===" -ForegroundColor Green
Write-Host ""
Write-Host "Bundle: $BundleName"
Write-Host "Size: $((Get-Item $BundleName).Length / 1MB) MB"
Write-Host "Checksum: $($bundleHash.Hash)"
Write-Host ""
Write-Host "This bundle contains:"
Write-Host "  - Application source code"
Write-Host "  - All npm dependencies"
Write-Host "  - Docker images (backend, frontend, worker, mongodb, redis)"
Write-Host "  - Installation scripts"
Write-Host "  - Documentation"
Write-Host ""
Write-Host "Transfer this bundle to your air-gapped environment and run:"
Write-Host "  Expand-Archive $BundleName"
Write-Host "  cd $BundleDir"
Write-Host "  .\install-offline.ps1"
Write-Host ""
