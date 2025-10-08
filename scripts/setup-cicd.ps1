# CI/CD Setup Script for Environment Configuration Manager (PowerShell)
# This script helps configure the CI/CD pipeline

$ErrorActionPreference = "Stop"

Write-Host "🚀 Environment Configuration Manager - CI/CD Setup" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Function to print colored output
function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor White
}

# Check if GitHub CLI is installed
try {
    $null = Get-Command gh -ErrorAction Stop
    Write-Success "GitHub CLI is installed"
} catch {
    Write-Error-Custom "GitHub CLI (gh) is not installed"
    Write-Info "Install it from: https://cli.github.com/"
    exit 1
}

# Check if user is authenticated
try {
    gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Not authenticated"
    }
    Write-Success "Authenticated with GitHub CLI"
} catch {
    Write-Error-Custom "Not authenticated with GitHub CLI"
    Write-Info "Run: gh auth login"
    exit 1
}

# Get repository information
$REPO = gh repo view --json nameWithOwner -q .nameWithOwner
Write-Info "Repository: $REPO"
Write-Host ""

# Function to set secret
function Set-GitHubSecret {
    param(
        [string]$SecretName,
        [string]$SecretDescription,
        [bool]$IsRequired
    )
    
    Write-Host ""
    Write-Info $SecretDescription
    
    if ($IsRequired) {
        $prompt = "Enter value (required)"
    } else {
        $prompt = "Enter value (optional, press Enter to skip)"
    }
    
    $secureValue = Read-Host -Prompt $prompt -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    $secretValue = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
    
    if ([string]::IsNullOrWhiteSpace($secretValue)) {
        if ($IsRequired) {
            Write-Error-Custom "This secret is required"
            return $false
        } else {
            Write-Warning-Custom "Skipped"
            return $true
        }
    }
    
    try {
        $secretValue | gh secret set $SecretName 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Set $SecretName"
            return $true
        } else {
            Write-Error-Custom "Failed to set $SecretName"
            return $false
        }
    } catch {
        Write-Error-Custom "Failed to set $SecretName"
        return $false
    }
}

# Main setup
Write-Host "📝 Setting up GitHub Secrets" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""
Write-Info "You'll be prompted to enter values for each secret"
Write-Info "Press Enter to skip optional secrets"
Write-Host ""

# AWS Configuration
Write-Host "🔧 AWS Configuration" -ForegroundColor Yellow
Write-Host "-------------------" -ForegroundColor Yellow
Set-GitHubSecret -SecretName "AWS_ACCESS_KEY_ID" -SecretDescription "AWS Access Key ID for ECR and EKS" -IsRequired $true
Set-GitHubSecret -SecretName "AWS_SECRET_ACCESS_KEY" -SecretDescription "AWS Secret Access Key" -IsRequired $true
Set-GitHubSecret -SecretName "AWS_REGION" -SecretDescription "AWS Region (e.g., us-east-1)" -IsRequired $true
Set-GitHubSecret -SecretName "EKS_CLUSTER_NAME" -SecretDescription "EKS Cluster Name" -IsRequired $true

# Database URLs
Write-Host ""
Write-Host "🗄️  Database Configuration" -ForegroundColor Yellow
Write-Host "-------------------------" -ForegroundColor Yellow
Set-GitHubSecret -SecretName "STAGING_DATABASE_URL" -SecretDescription "Staging MongoDB Connection String" -IsRequired $true
Set-GitHubSecret -SecretName "PRODUCTION_DATABASE_URL" -SecretDescription "Production MongoDB Connection String" -IsRequired $true

# API URLs
Write-Host ""
Write-Host "🌐 API Configuration" -ForegroundColor Yellow
Write-Host "-------------------" -ForegroundColor Yellow
Set-GitHubSecret -SecretName "STAGING_API_URL" -SecretDescription "Staging API URL (e.g., https://api-staging.example.com)" -IsRequired $true
Set-GitHubSecret -SecretName "PRODUCTION_API_URL" -SecretDescription "Production API URL (e.g., https://api.example.com)" -IsRequired $true

# Docker Hub
Write-Host ""
Write-Host "🐳 Docker Hub Configuration" -ForegroundColor Yellow
Write-Host "--------------------------" -ForegroundColor Yellow
Write-Info "Required for building and pushing Docker images"
Set-GitHubSecret -SecretName "DOCKER_USERNAME" -SecretDescription "Docker Hub Username" -IsRequired $false
Set-GitHubSecret -SecretName "DOCKER_PASSWORD" -SecretDescription "Docker Hub Password/Token" -IsRequired $false

# Notifications
Write-Host ""
Write-Host "📢 Notification Configuration" -ForegroundColor Yellow
Write-Host "----------------------------" -ForegroundColor Yellow
Set-GitHubSecret -SecretName "SLACK_WEBHOOK_URL" -SecretDescription "Slack Webhook URL for notifications" -IsRequired $false

# Security Scanning
Write-Host ""
Write-Host "🔒 Security Scanning Configuration" -ForegroundColor Yellow
Write-Host "---------------------------------" -ForegroundColor Yellow
Set-GitHubSecret -SecretName "SNYK_TOKEN" -SecretDescription "Snyk API Token for vulnerability scanning" -IsRequired $false

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Success "Secret configuration complete!"
Write-Host ""

# Create environments
Write-Host "🌍 Setting up GitHub Environments" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

Write-Info "Creating 'staging' environment..."
try {
    gh api "repos/$REPO/environments/staging" -X PUT 2>&1 | Out-Null
    Write-Success "Staging environment created"
} catch {
    Write-Warning-Custom "Staging environment may already exist"
}

Write-Info "Creating 'production' environment..."
try {
    gh api "repos/$REPO/environments/production" -X PUT 2>&1 | Out-Null
    Write-Success "Production environment created"
} catch {
    Write-Warning-Custom "Production environment may already exist"
}

Write-Host ""
Write-Info "Note: Configure environment protection rules in GitHub:"
Write-Info "  Settings → Environments → production → Configure"
Write-Info "  - Add required reviewers"
Write-Info "  - Add wait timer (optional)"
Write-Host ""

# Enable workflows
Write-Host "⚙️  Enabling Workflows" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""

$workflows = @(
    "ci.yml",
    "cd-staging.yml",
    "cd-production.yml",
    "database-migrations.yml",
    "security-scan.yml",
    "dependency-update.yml"
)

foreach ($workflow in $workflows) {
    Write-Info "Enabling $workflow..."
    try {
        gh workflow enable $workflow 2>&1 | Out-Null
        Write-Success "$workflow enabled"
    } catch {
        Write-Warning-Custom "$workflow may already be enabled"
    }
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Success "CI/CD Setup Complete! 🎉"
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Info "Next steps:"
Write-Host "  1. Review and configure environment protection rules"
Write-Host "  2. Verify all secrets are set correctly"
Write-Host "  3. Push code to trigger the CI pipeline"
Write-Host "  4. Monitor workflow runs in the Actions tab"
Write-Host ""
Write-Info "Documentation:"
Write-Host "  - Workflows: .github/workflows/README.md"
Write-Host "  - Full CI/CD docs: docs/CI_CD.md"
Write-Host ""
Write-Success "Happy deploying! 🚀"
