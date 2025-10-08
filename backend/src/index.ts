import express from "express";
import cors from "cors";
import passport from "passport";
import swaggerUi from "swagger-ui-express";
import config from "./config";
import swaggerSpec from "./config/swagger";
import {
  helmetConfig,
  additionalSecurityHeaders,
  getSecurityConfig,
} from "./config/security";
import { connectRedis } from "./lib/redis";
import prisma from "./lib/prisma";
import authRoutes from "./routes/auth.routes";
import projectRoutes from "./routes/project.routes";
import environmentRoutes from "./routes/environment.routes";
import variableRoutes from "./routes/variable.routes";
import rotationRoutes from "./routes/rotation.routes";
import webhookRoutes from "./routes/webhook.routes";
import platformConnectionRoutes from "./routes/platformConnection.routes";
import syncRoutes from "./routes/sync.routes";
import auditRoutes from "./routes/audit.routes";
import siemRoutes from "./routes/siem.routes";
import billingRoutes from "./routes/billing.routes";
import apiKeyRoutes from "./routes/apiKey.routes";
import rateLimitRoutes from "./routes/rateLimit.routes";
import monitoringRoutes from "./routes/monitoring.routes";
import { errorHandler } from "./middleware/error.middleware";
import { logUnauthorizedAccess } from "./middleware/audit.middleware";
import { rateLimit } from "./middleware/rateLimit.middleware";
import { metricsMiddleware } from "./middleware/metrics.middleware";
import {
  CSRFProtection,
  sanitizeInput,
  cspViolationReporter,
  requestSizeLimiter,
  suspiciousActivityDetector,
  abuseDetector,
} from "./middleware/security.middleware";
import oauthService from "./services/oauth.service";
import tracingService from "./services/tracing.service";
import sentryService from "./services/sentry.service";
import logger from "./services/logger.service";
import { runStartupSecurityAudit } from "./utils/securityAudit";

// Initialize OpenTelemetry tracing (must be before app creation)
tracingService.initialize();

const app = express();

// Initialize Sentry (must be first)
sentryService.initialize(app);

// Initialize OAuth
oauthService.initializePassport();
app.use(passport.initialize());

// Sentry request handler (must be first middleware)
app.use(sentryService.getRequestHandler());

// Sentry tracing handler (must be after request handler)
app.use(sentryService.getTracingHandler());

// Security configuration
const securityConfig = getSecurityConfig(config.nodeEnv);

// Security middleware (order matters!)
app.use(helmetConfig); // Comprehensive security headers
app.use(additionalSecurityHeaders); // Additional custom headers
app.use(
  cors(securityConfig.cors) // CORS with strict configuration
);

// Body parsing with size limits
app.use(express.json(securityConfig.bodyParser.json));
app.use(express.urlencoded(securityConfig.bodyParser.urlencoded));

// Request size limiter (additional protection)
app.use(requestSizeLimiter(10 * 1024 * 1024)); // 10MB max

// Input sanitization (XSS protection)
app.use(sanitizeInput);

// Suspicious activity detection
app.use(suspiciousActivityDetector);

// Abuse detection (IP-based tracking)
app.use(abuseDetector);

// Metrics middleware (track all requests)
app.use(metricsMiddleware);

// Audit logging middleware for unauthorized access
app.use(logUnauthorizedAccess);

// Rate limiting middleware (applied to all routes)
app.use(rateLimit);

// CSRF protection - generate token for all requests
app.use(CSRFProtection.generateMiddleware);

// CSP violation reporting endpoint
app.post("/api/csp-violation-report", cspViolationReporter);

// Monitoring routes (health checks and metrics)
app.use(monitoringRoutes);

// API Documentation (no CSRF required)
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Environment Config Manager API Docs",
  })
);

// Serve OpenAPI spec as JSON
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// API routes
app.get(`/api/${config.apiVersion}`, (req, res) => {
  res.json({
    message: "Environment Configuration Manager API",
    version: config.apiVersion,
    documentation: "/api-docs",
  });
});

// Apply CSRF validation to all API routes (except auth login/register)
app.use(`/api/${config.apiVersion}/auth`, authRoutes);

// CSRF protection for authenticated routes
app.use(`/api/${config.apiVersion}`, CSRFProtection.validateMiddleware);

app.use(`/api/${config.apiVersion}/projects`, projectRoutes);
app.use(`/api/${config.apiVersion}`, environmentRoutes);
app.use(`/api/${config.apiVersion}`, variableRoutes);
app.use(`/api/${config.apiVersion}`, rotationRoutes);
app.use(`/api/${config.apiVersion}`, webhookRoutes);
app.use(`/api/${config.apiVersion}`, platformConnectionRoutes);
app.use(`/api/${config.apiVersion}`, syncRoutes);
app.use(`/api/${config.apiVersion}`, auditRoutes);
app.use(`/api/${config.apiVersion}`, siemRoutes);
app.use(`/api/${config.apiVersion}/billing`, billingRoutes);
app.use(`/api/${config.apiVersion}/api-keys`, apiKeyRoutes);
app.use(`/api/${config.apiVersion}/rate-limit`, rateLimitRoutes);

// Sentry error handler (must be before other error handlers)
app.use(sentryService.getErrorHandler());

// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Run security audit on startup
    if (config.nodeEnv !== "test") {
      await runStartupSecurityAudit();
    }

    // Connect to Redis
    await connectRedis();
    logger.info("✓ Redis connected");

    // Test Prisma connection
    await prisma.$connect();
    logger.info("✓ Database connected");

    app.listen(config.port, () => {
      logger.info(`✓ Server running on port ${config.port}`);
      logger.info(`✓ Environment: ${config.nodeEnv}`);
      logger.info(`✓ API Version: ${config.apiVersion}`);
      logger.info(
        `✓ API Documentation available at http://localhost:${config.port}/api-docs`
      );
      logger.info(
        `✓ OpenAPI spec available at http://localhost:${config.port}/api-docs.json`
      );
      logger.info(`✓ Metrics available at /metrics`);
      logger.info(`✓ Health check available at /health`);
      logger.info("✓ Security hardening enabled");
      logger.info("  - CSRF protection active");
      logger.info("  - XSS protection active");
      logger.info("  - Input validation active");
      logger.info("  - Security headers configured");
      logger.info("  - Suspicious activity detection active");
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    sentryService.captureException(error as Error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("\nShutting down gracefully...");

  try {
    await prisma.$disconnect();
    await tracingService.shutdown();
    logger.info("✓ Cleanup completed");
  } catch (error) {
    logger.error("Error during shutdown:", error);
  }

  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  sentryService.captureException(error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  sentryService.captureException(reason as Error);
});

startServer();
