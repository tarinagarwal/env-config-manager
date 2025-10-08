import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Environment Configuration Manager API",
      version: "1.0.0",
      description: `
# Environment Configuration Manager API

A comprehensive API for managing environment variables, secrets, and configurations across multiple platforms.

## Features

- **Project & Environment Management**: Organize configurations into projects and environments
- **Secret Management**: Secure storage and encryption of sensitive values
- **Version Control**: Track all changes with full history and rollback capabilities
- **Access Control**: Role-based permissions (Viewer, Developer, Admin, Owner)
- **Multi-Platform Sync**: Sync to Vercel, AWS, Netlify, and more
- **Audit Logging**: Comprehensive audit trails for compliance
- **Secret Rotation**: Automated secret rotation with scheduling
- **CLI & API Access**: Full programmatic access via REST API and CLI tool

## Authentication

This API uses JWT (JSON Web Tokens) for authentication. There are multiple ways to authenticate:

### 1. Email/Password Authentication

1. Register: \`POST /api/v1/auth/register\`
2. Login: \`POST /api/v1/auth/login\`
3. Use the returned \`accessToken\` in the Authorization header

### 2. OAuth Authentication

- Google OAuth: \`GET /api/v1/auth/google\`
- GitHub OAuth: \`GET /api/v1/auth/github\`

### 3. API Key Authentication

Generate an API key from the dashboard and use it in the \`X-API-Key\` header.

### Using Authentication

Include the token in the Authorization header:

\`\`\`
Authorization: Bearer <your-access-token>
\`\`\`

Or use an API key:

\`\`\`
X-API-Key: <your-api-key>
\`\`\`

## Rate Limiting

API requests are rate-limited based on your subscription tier:

- **Free**: 100 requests/hour
- **Pro**: 1,000 requests/hour
- **Team**: 5,000 requests/hour
- **Enterprise**: 50,000 requests/hour

Rate limit information is included in response headers:
- \`X-RateLimit-Limit\`: Maximum requests allowed
- \`X-RateLimit-Remaining\`: Requests remaining
- \`X-RateLimit-Reset\`: Time when the limit resets (Unix timestamp)

## Error Handling

All errors follow a consistent format:

\`\`\`json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {},
    "requestId": "unique-request-id"
  }
}
\`\`\`

Common HTTP status codes:
- \`400\`: Bad Request - Invalid input
- \`401\`: Unauthorized - Missing or invalid authentication
- \`403\`: Forbidden - Insufficient permissions
- \`404\`: Not Found - Resource doesn't exist
- \`429\`: Too Many Requests - Rate limit exceeded
- \`500\`: Internal Server Error - Server-side error

## Pagination

List endpoints support pagination using query parameters:

- \`page\`: Page number (default: 1)
- \`limit\`: Items per page (default: 20, max: 100)

Paginated responses include:

\`\`\`json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
\`\`\`
      `,
      contact: {
        name: "API Support",
        email: "support@envconfig.example.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
      {
        url: "https://api.envconfig.example.com",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token obtained from login or OAuth",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API key for programmatic access",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  example: "VALIDATION_INVALID_INPUT",
                },
                message: {
                  type: "string",
                  example: "Invalid input provided",
                },
                details: {
                  type: "object",
                },
                requestId: {
                  type: "string",
                  example: "req_123456789",
                },
              },
            },
          },
        },
        User: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            email: {
              type: "string",
              format: "email",
              example: "user@example.com",
            },
            emailVerified: {
              type: "boolean",
              example: true,
            },
            twoFactorEnabled: {
              type: "boolean",
              example: false,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        AuthToken: {
          type: "object",
          properties: {
            accessToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
            refreshToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
            expiresIn: {
              type: "number",
              example: 900,
              description: "Token expiration time in seconds",
            },
          },
        },
        Project: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            name: {
              type: "string",
              example: "My Project",
            },
            description: {
              type: "string",
              example: "Project description",
            },
            ownerId: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        Environment: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            projectId: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
            },
            name: {
              type: "string",
              example: "production",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        Variable: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            environmentId: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
            },
            key: {
              type: "string",
              example: "DATABASE_URL",
            },
            value: {
              type: "string",
              example: "postgresql://localhost:5432/mydb",
            },
            isSecret: {
              type: "boolean",
              example: true,
            },
            rotationEnabled: {
              type: "boolean",
              example: false,
            },
            rotationIntervalDays: {
              type: "number",
              nullable: true,
              example: 90,
            },
            nextRotationAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            createdBy: {
              type: "string",
              example: "507f1f77bcf86cd799439013",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        VariableVersion: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            variableId: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
            },
            value: {
              type: "string",
              example: "old-value",
            },
            changeType: {
              type: "string",
              enum: ["created", "updated", "deleted", "rollback"],
              example: "updated",
            },
            changedBy: {
              type: "string",
              example: "507f1f77bcf86cd799439013",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        PlatformConnection: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            projectId: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
            },
            platform: {
              type: "string",
              enum: [
                "vercel",
                "aws-ssm",
                "aws-secrets-manager",
                "netlify",
                "heroku",
              ],
              example: "vercel",
            },
            targetResource: {
              type: "string",
              example: "prj_abc123",
            },
            lastSyncAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            status: {
              type: "string",
              enum: ["connected", "error"],
              example: "connected",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        AuditLog: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            userId: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
            },
            action: {
              type: "string",
              example: "variable.update",
            },
            resourceType: {
              type: "string",
              example: "variable",
            },
            resourceId: {
              type: "string",
              example: "507f1f77bcf86cd799439013",
            },
            metadata: {
              type: "object",
            },
            ipAddress: {
              type: "string",
              example: "192.168.1.1",
            },
            userAgent: {
              type: "string",
              example: "Mozilla/5.0...",
            },
            severity: {
              type: "string",
              enum: ["info", "warning", "critical"],
              example: "info",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        ApiKey: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            name: {
              type: "string",
              example: "Production API Key",
            },
            key: {
              type: "string",
              example: "eck_live_abc123...",
              description: "Only returned when creating a new key",
            },
            scopes: {
              type: "array",
              items: {
                type: "string",
              },
              example: ["projects:read", "variables:read"],
            },
            lastUsedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            expiresAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        Subscription: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            userId: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
            },
            plan: {
              type: "string",
              enum: ["free", "pro", "team", "enterprise"],
              example: "pro",
            },
            status: {
              type: "string",
              enum: ["active", "canceled", "past_due"],
              example: "active",
            },
            currentPeriodStart: {
              type: "string",
              format: "date-time",
            },
            currentPeriodEnd: {
              type: "string",
              format: "date-time",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
      {
        apiKeyAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/docs/*.yaml"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
