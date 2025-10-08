# 🔐 Environment Configuration Manager

> A comprehensive, enterprise-grade SaaS platform for managing environment variables, secrets, and configuration across multiple environments with advanced security, monitoring, and collaboration features.

## 🌟 Overview

Environment Configuration Manager is a modern, full-stack SaaS application designed to solve the complex problem of managing environment variables and secrets across multiple environments, teams, and applications. Built with security-first principles, it provides a centralized platform for configuration management with enterprise-grade features.

### Why This Project?

- **Centralized Management**: Single source of truth for all environment configurations
- **Security First**: End-to-end encryption, RBAC, audit logging, and compliance features
- **Developer Experience**: Intuitive UI, powerful CLI, and comprehensive API
- **Team Collaboration**: Multi-tenant architecture with team management and permissions
- **Integration Ready**: Sync with AWS Secrets Manager, SSM, and other cloud providers
- **Production Ready**: Built-in monitoring, rate limiting, and error tracking

---

## ✨ Key Features

### 🔒 Security & Compliance

- **End-to-End Encryption**: AES-256-GCM encryption for all sensitive data
- **Multi-Factor Authentication (MFA)**: TOTP-based 2FA support
- **Role-Based Access Control (RBAC)**: Granular permissions system
- **Audit Logging**: Comprehensive activity tracking and compliance reporting
- **Secret Rotation**: Automated secret rotation with configurable intervals
- **API Key Management**: Scoped API keys with fine-grained permissions
- **Rate Limiting**: Token bucket algorithm with Redis-backed storage
- **Security Headers**: Helmet.js integration for HTTP security

### 🔐 Authentication & Authorization

- **Multiple Auth Methods**:
  - Email/Password with bcrypt hashing
  - OAuth 2.0 (Google, GitHub)
  - SAML 2.0 for enterprise SSO
  - LDAP/Active Directory integration
- **JWT-based Sessions**: Access and refresh token management
- **Session Management**: Redis-backed session storage
- **Password Policies**: Configurable complexity requirements

### 🏢 Multi-Tenancy & Collaboration

- **Organizations**: Isolated workspaces for teams
- **Projects**: Organize configurations by application
- **Environments**: Development, staging, production, and custom environments
- **Team Management**: Invite members, assign roles, manage permissions
- **Variable Inheritance**: Cascade configurations across environments

### 🔄 Integrations & Sync

- **AWS Integration**:
  - AWS Secrets Manager sync
  - AWS Systems Manager Parameter Store
- **Cloud Providers**: Extensible adapter pattern for multi-cloud support
- **Webhooks**: Real-time notifications for configuration changes
- **CLI Tool**: Command-line interface for CI/CD integration

### 📊 Monitoring & Observability

- **OpenTelemetry Integration**: Distributed tracing and metrics
- **Prometheus Metrics**: Custom business and system metrics
- **Sentry Integration**: Error tracking and performance monitoring
- **Health Checks**: Comprehensive system health endpoints
- **Logging**: Structured logging with Winston
- **Alerting**: Configurable alerts for critical events

### 💰 Billing & Usage

- **Stripe Integration**: Subscription management and payment processing
- **Usage Tracking**: Monitor API calls, storage, and resource consumption
- **Tiered Plans**: Free, Pro, and Enterprise tiers
- **Usage Limits**: Configurable quotas per plan
- **Billing Dashboard**: Real-time usage and billing information

---

## 🏗️ Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Dashboard │  │Variables │  │  Teams   │  │ Settings │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (Express)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Auth   │  │   RBAC   │  │Rate Limit│  │Validation│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Business Logic Layer                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Variables │  │  Secrets │  │   Sync   │  │  Audit   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Data Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │PostgreSQL│  │  Redis   │  │   AWS    │  │  Stripe  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Security Architecture

- **Encryption at Rest**: All sensitive data encrypted in database
- **Encryption in Transit**: TLS 1.3 for all communications
- **Key Management**: Secure key derivation and rotation
- **Zero-Knowledge Architecture**: Server never sees plaintext secrets

---

## 🛠️ Tech Stack

### Backend

- **Runtime**: Node.js 20+ with TypeScript 5.3
- **Framework**: Express.js with async/await patterns
- **Database**: PostgreSQL 15+ with Prisma ORM
- **Cache**: Redis 7.0 for sessions and rate limiting
- **Authentication**: Passport.js with multiple strategies
- **Validation**: Zod for runtime type validation
- **Testing**: Jest + Supertest for unit and integration tests

### Frontend

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Routing**: React Router v6
- **State Management**: Zustand for global state
- **UI Components**: Custom components with Tailwind CSS
- **Forms**: React Hook Form with Zod validation
- **HTTP Client**: Axios with interceptors

### DevOps & Infrastructure

- **Containerization**: Docker with multi-stage builds
- **Orchestration**: Docker Compose for local development
- **CI/CD**: GitHub Actions for automated testing and deployment
- **Monitoring**: OpenTelemetry, Prometheus, Sentry
- **Cloud**: AWS (Secrets Manager, SSM, S3)

---

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v20.0.0 or higher ([Download](https://nodejs.org/))
- **npm**: v10.0.0 or higher (comes with Node.js)
- **PostgreSQL**: v15.0 or higher ([Download](https://www.postgresql.org/download/))
- **Redis**: v7.0 or higher ([Download](https://redis.io/download))
- **Docker** (optional): For containerized development ([Download](https://www.docker.com/))

### Optional Services

- **AWS Account**: For cloud integrations
- **Stripe Account**: For billing features
- **Sentry Account**: For error tracking

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/env-config-manager.git
cd env-config-manager
```

### 2. Install Dependencies

```bash
npm install
```

This will install dependencies for both backend and frontend workspaces.

### 3. Set Up Environment Variables

#### Backend Configuration

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your configuration:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/env_config_manager"

# Redis
REDIS_URL="redis://localhost:6379"

# Security
JWT_SECRET="your-super-secret-jwt-key-change-this"
ENCRYPTION_KEY="your-32-character-encryption-key"

# Server
PORT=3000
NODE_ENV=development

# Optional: AWS
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"

# Optional: Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Optional: OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
```

#### Frontend Configuration

```bash
cd ../frontend
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

### 4. Set Up the Database

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

### 5. Start the Development Servers

#### Option A: Using npm workspaces (recommended)

```bash
# From the root directory
npm run dev
```

This starts both backend and frontend concurrently.

#### Option B: Start services individually

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 6. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api-docs

### Default Login Credentials

```
Email: admin@example.com
Password: Admin123!
```

---

## 📁 Project Structure

```
env-config-manager/
├── backend/                    # Backend application
│   ├── src/
│   │   ├── adapters/          # Cloud provider adapters
│   │   ├── controllers/       # Request handlers
│   │   ├── middleware/        # Express middleware
│   │   ├── routes/            # API routes
│   │   ├── services/          # Business logic
│   │   ├── types/             # TypeScript types
│   │   ├── utils/             # Utility functions
│   │   └── index.ts           # Application entry point
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   ├── migrations/        # Database migrations
│   │   └── seed.ts            # Seed data
│   ├── tests/                 # Test files
│   └── package.json
├── frontend/                   # Frontend application
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/             # Page components
│   │   ├── services/          # API services
│   │   ├── stores/            # State management
│   │   ├── types/             # TypeScript types
│   │   ├── utils/             # Utility functions
│   │   └── App.tsx            # Root component
│   ├── public/                # Static assets
│   └── package.json
├── cli/                        # CLI tool
│   ├── src/
│   │   ├── commands/          # CLI commands
│   │   └── index.ts
│   └── package.json
├── docs/                       # Documentation
├── .github/                    # GitHub Actions workflows
├── docker-compose.yml          # Docker services
└── package.json               # Root package.json
```

---

## ⚙️ Configuration

### Environment Variables

#### Backend Environment Variables

| Variable            | Description                  | Required | Default     |
| ------------------- | ---------------------------- | -------- | ----------- |
| `DATABASE_URL`      | PostgreSQL connection string | Yes      | -           |
| `REDIS_URL`         | Redis connection string      | Yes      | -           |
| `JWT_SECRET`        | Secret for JWT signing       | Yes      | -           |
| `ENCRYPTION_KEY`    | Key for data encryption      | Yes      | -           |
| `PORT`              | Server port                  | No       | 3000        |
| `NODE_ENV`          | Environment mode             | No       | development |
| `AWS_REGION`        | AWS region                   | No       | us-east-1   |
| `STRIPE_SECRET_KEY` | Stripe API key               | No       | -           |
| `SENTRY_DSN`        | Sentry error tracking DSN    | No       | -           |

### Database Configuration

The application uses Prisma ORM with PostgreSQL. To modify the schema:

1. Edit `backend/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name your_migration_name`
3. Run `npx prisma generate` to update the Prisma Client

---

## 💻 Development

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# Run tests with coverage
npm test -- --coverage
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run type-check

# Format code
npm run format
```

### Database Management

```bash
# Create a new migration
npx prisma migrate dev --name migration_name

# Reset database
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio
```

---

## 🧪 Testing

### Test Structure

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test API endpoints and database interactions
- **E2E Tests**: Test complete user workflows

### Running Specific Tests

```bash
# Run specific test file
npm test -- path/to/test.spec.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

---

## 🚢 Deployment

### Docker Deployment

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f
```

### Production Deployment

1. **Set environment variables** for production
2. **Build the frontend**:
   ```bash
   cd frontend
   npm run build
   ```
3. **Run database migrations**:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```
4. **Start the backend**:
   ```bash
   npm run start
   ```

### Environment-Specific Configurations

- **Development**: Hot reload, verbose logging
- **Staging**: Production-like environment for testing
- **Production**: Optimized builds, error tracking, monitoring

---

## 🔒 Security

### Security Best Practices

- All passwords are hashed using bcrypt with salt rounds of 12
- Sensitive data is encrypted using AES-256-GCM
- JWT tokens expire after 15 minutes (access) and 7 days (refresh)
- Rate limiting prevents brute force attacks
- CORS is configured for specific origins
- Security headers are set using Helmet.js
- SQL injection prevention via Prisma ORM
- XSS protection through input validation and sanitization

### Reporting Security Issues

Please report security vulnerabilities to security@example.com

---

## 📊 Monitoring & Observability

### Metrics

The application exposes Prometheus metrics at `/metrics`:

- HTTP request duration and count
- Database query performance
- Cache hit/miss rates
- Business metrics (variables created, API calls, etc.)

### Tracing

OpenTelemetry integration provides distributed tracing:

- Request flow visualization
- Performance bottleneck identification
- Error tracking and debugging

### Health Checks

- `/health`: Basic health check
- `/health/ready`: Readiness probe (checks dependencies)
- `/health/live`: Liveness probe

---

## 📚 API Documentation

### Interactive API Documentation

Access the Swagger UI at: http://localhost:3000/api-docs

### Authentication

All API requests (except auth endpoints) require a Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/variables
```

### Example API Calls

#### Create a Variable

```bash
POST /api/variables
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "key": "DATABASE_URL",
  "value": "postgresql://...",
  "environmentId": "env-123",
  "isSecret": true
}
```

#### Get Variables

```bash
GET /api/variables?environmentId=env-123
Authorization: Bearer YOUR_TOKEN
```

---

## 🖥️ CLI Tool

### Installation

```bash
npm install -g @env-config-manager/cli
```

### Usage

```bash
# Login
ecm login

# Pull variables
ecm pull --env production

# Push variables
ecm push --env staging

# List environments
ecm env list

# Create a variable
ecm var create DATABASE_URL "postgresql://..." --secret
```

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation as needed
- Ensure all tests pass before submitting PR

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with ❤️ using modern web technologies
- Inspired by industry-leading configuration management tools
- Thanks to all contributors and the open-source community

---

Made with ❤️ by Tarin
