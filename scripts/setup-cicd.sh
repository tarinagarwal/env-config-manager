#!/bin/bash

# CI/CD Setup Script for Environment Configuration Manager
# This script helps configure the CI/CD pipeline

set -e

echo "🚀 Environment Configuration Manager - CI/CD Setup"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI (gh) is not installed"
    print_info "Install it from: https://cli.github.com/"
    exit 1
fi

print_success "GitHub CLI is installed"

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    print_error "Not authenticated with GitHub CLI"
    print_info "Run: gh auth login"
    exit 1
fi

print_success "Authenticated with GitHub CLI"

# Get repository information
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
print_info "Repository: $REPO"
echo ""

# Function to set secret
set_secret() {
    local secret_name=$1
    local secret_description=$2
    local is_required=$3
    
    echo ""
    print_info "$secret_description"
    
    if [ "$is_required" = "true" ]; then
        echo -n "Enter value (required): "
    else
        echo -n "Enter value (optional, press Enter to skip): "
    fi
    
    read -s secret_value
    echo ""
    
    if [ -z "$secret_value" ]; then
        if [ "$is_required" = "true" ]; then
            print_error "This secret is required"
            return 1
        else
            print_warning "Skipped"
            return 0
        fi
    fi
    
    if gh secret set "$secret_name" --body "$secret_value" &> /dev/null; then
        print_success "Set $secret_name"
    else
        print_error "Failed to set $secret_name"
        return 1
    fi
}

# Main setup
echo "📝 Setting up GitHub Secrets"
echo "=============================="
echo ""
print_info "You'll be prompted to enter values for each secret"
print_info "Press Enter to skip optional secrets"
echo ""

# AWS Configuration
echo "🔧 AWS Configuration"
echo "-------------------"
set_secret "AWS_ACCESS_KEY_ID" "AWS Access Key ID for ECR and EKS" "true"
set_secret "AWS_SECRET_ACCESS_KEY" "AWS Secret Access Key" "true"
set_secret "AWS_REGION" "AWS Region (e.g., us-east-1)" "true"
set_secret "EKS_CLUSTER_NAME" "EKS Cluster Name" "true"

# Database URLs
echo ""
echo "🗄️  Database Configuration"
echo "-------------------------"
set_secret "STAGING_DATABASE_URL" "Staging MongoDB Connection String" "true"
set_secret "PRODUCTION_DATABASE_URL" "Production MongoDB Connection String" "true"

# API URLs
echo ""
echo "🌐 API Configuration"
echo "-------------------"
set_secret "STAGING_API_URL" "Staging API URL (e.g., https://api-staging.example.com)" "true"
set_secret "PRODUCTION_API_URL" "Production API URL (e.g., https://api.example.com)" "true"

# Docker Hub
echo ""
echo "🐳 Docker Hub Configuration"
echo "--------------------------"
print_info "Required for building and pushing Docker images"
set_secret "DOCKER_USERNAME" "Docker Hub Username" "false"
set_secret "DOCKER_PASSWORD" "Docker Hub Password/Token" "false"

# Notifications
echo ""
echo "📢 Notification Configuration"
echo "----------------------------"
set_secret "SLACK_WEBHOOK_URL" "Slack Webhook URL for notifications" "false"

# Security Scanning
echo ""
echo "🔒 Security Scanning Configuration"
echo "---------------------------------"
set_secret "SNYK_TOKEN" "Snyk API Token for vulnerability scanning" "false"

echo ""
echo "=================================="
print_success "Secret configuration complete!"
echo ""

# Create environments
echo "🌍 Setting up GitHub Environments"
echo "================================="
echo ""

print_info "Creating 'staging' environment..."
if gh api repos/$REPO/environments/staging -X PUT &> /dev/null; then
    print_success "Staging environment created"
else
    print_warning "Staging environment may already exist"
fi

print_info "Creating 'production' environment..."
if gh api repos/$REPO/environments/production -X PUT &> /dev/null; then
    print_success "Production environment created"
else
    print_warning "Production environment may already exist"
fi

echo ""
print_info "Note: Configure environment protection rules in GitHub:"
print_info "  Settings → Environments → production → Configure"
print_info "  - Add required reviewers"
print_info "  - Add wait timer (optional)"
echo ""

# Enable workflows
echo "⚙️  Enabling Workflows"
echo "====================="
echo ""

WORKFLOWS=(
    "ci.yml"
    "cd-staging.yml"
    "cd-production.yml"
    "database-migrations.yml"
    "security-scan.yml"
    "dependency-update.yml"
)

for workflow in "${WORKFLOWS[@]}"; do
    print_info "Enabling $workflow..."
    if gh workflow enable "$workflow" &> /dev/null; then
        print_success "$workflow enabled"
    else
        print_warning "$workflow may already be enabled"
    fi
done

echo ""
echo "=================================="
print_success "CI/CD Setup Complete! 🎉"
echo "=================================="
echo ""
print_info "Next steps:"
echo "  1. Review and configure environment protection rules"
echo "  2. Verify all secrets are set correctly"
echo "  3. Push code to trigger the CI pipeline"
echo "  4. Monitor workflow runs in the Actions tab"
echo ""
print_info "Documentation:"
echo "  - Workflows: .github/workflows/README.md"
echo "  - Full CI/CD docs: docs/CI_CD.md"
echo ""
print_success "Happy deploying! 🚀"
