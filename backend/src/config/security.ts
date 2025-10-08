import helmet from "helmet";
import { Request } from "express";

/**
 * Comprehensive security headers configuration using Helmet
 */
export const helmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for Swagger UI
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for Swagger UI
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
    reportOnly: false,
  },

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false,
  },

  // Expect-CT (Certificate Transparency)
  expectCt: {
    enforce: true,
    maxAge: 86400, // 24 hours
  },

  // Frameguard (X-Frame-Options)
  frameguard: {
    action: "deny",
  },

  // Hide Powered-By header
  hidePoweredBy: true,

  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // IE No Open
  ieNoOpen: true,

  // Don't Sniff Mimetype
  noSniff: true,

  // Permitted Cross-Domain Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: "none",
  },

  // Referrer Policy
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin",
  },

  // XSS Filter
  xssFilter: true,
});

/**
 * Additional security headers middleware
 */
export const additionalSecurityHeaders = (
  req: Request,
  res: any,
  next: any
) => {
  // Prevent caching of sensitive data
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  // Additional security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Download-Options", "noopen");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

  // Permissions Policy (formerly Feature Policy)
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  );

  // Cross-Origin policies
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  next();
};

/**
 * Security configuration for different environments
 */
export const getSecurityConfig = (env: string) => {
  const isDevelopment = env === "development";

  return {
    // CORS configuration
    cors: {
      origin: isDevelopment
        ? ["http://localhost:5173", "http://localhost:3000"]
        : process.env.CORS_ORIGIN?.split(",") || [],
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-CSRF-Token",
        "X-API-Key",
        "X-Request-ID",
      ],
      exposedHeaders: ["X-CSRF-Token", "X-Request-ID", "X-RateLimit-Remaining"],
      maxAge: 86400, // 24 hours
    },

    // Rate limiting configuration
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: isDevelopment ? 1000 : 100, // Requests per window
      message: "Too many requests from this IP, please try again later",
      standardHeaders: true,
      legacyHeaders: false,
    },

    // Session configuration
    session: {
      secret: process.env.SESSION_SECRET || "change-this-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: !isDevelopment, // HTTPS only in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: "strict" as const,
      },
    },

    // Body parser limits
    bodyParser: {
      json: {
        limit: "10mb",
        strict: true,
      },
      urlencoded: {
        limit: "10mb",
        extended: true,
        parameterLimit: 10000,
      },
    },
  };
};

/**
 * Security best practices checklist
 */
export const securityChecklist = {
  authentication: [
    "✓ JWT tokens with short expiration",
    "✓ Secure password hashing with bcrypt",
    "✓ Two-factor authentication support",
    "✓ OAuth 2.0 integration",
    "✓ API key authentication with scopes",
  ],
  authorization: [
    "✓ Role-based access control (RBAC)",
    "✓ Resource-level permissions",
    "✓ Permission checks on all endpoints",
  ],
  encryption: [
    "✓ AES-256-GCM encryption for secrets",
    "✓ Envelope encryption pattern",
    "✓ TLS 1.3 for data in transit",
    "✓ Secure key management",
  ],
  inputValidation: [
    "✓ Zod schema validation on all inputs",
    "✓ XSS protection and sanitization",
    "✓ SQL injection prevention (parameterized queries)",
    "✓ Path traversal prevention",
    "✓ Request size limits",
  ],
  headers: [
    "✓ Content Security Policy",
    "✓ HTTP Strict Transport Security",
    "✓ X-Frame-Options",
    "✓ X-Content-Type-Options",
    "✓ Referrer Policy",
    "✓ Permissions Policy",
  ],
  csrf: [
    "✓ CSRF token generation",
    "✓ CSRF token validation on state-changing requests",
    "✓ SameSite cookie attribute",
  ],
  monitoring: [
    "✓ Audit logging for all actions",
    "✓ Security event flagging",
    "✓ Suspicious activity detection",
    "✓ Rate limiting",
    "✓ Error tracking with Sentry",
  ],
  deployment: [
    "✓ Environment variable configuration",
    "✓ Secrets management",
    "✓ Regular security updates",
    "✓ Database connection security",
  ],
};
