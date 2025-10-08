import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { AppError } from "../utils/errors";
import logger from "../services/logger.service";

/**
 * CSRF Protection Middleware
 * Generates and validates CSRF tokens for state-changing operations
 */
export class CSRFProtection {
  private static tokens = new Map<string, { token: string; expires: number }>();
  private static readonly TOKEN_EXPIRY = 3600000; // 1 hour

  /**
   * Generate CSRF token for a session
   */
  static generateToken(sessionId: string): string {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + this.TOKEN_EXPIRY;

    this.tokens.set(sessionId, { token, expires });

    // Clean up expired tokens
    this.cleanupExpiredTokens();

    return token;
  }

  /**
   * Validate CSRF token
   */
  static validateToken(sessionId: string, token: string): boolean {
    const stored = this.tokens.get(sessionId);

    if (!stored) {
      return false;
    }

    if (stored.expires < Date.now()) {
      this.tokens.delete(sessionId);
      return false;
    }

    return stored.token === token;
  }

  /**
   * Clean up expired tokens
   */
  private static cleanupExpiredTokens() {
    const now = Date.now();
    for (const [sessionId, data] of this.tokens.entries()) {
      if (data.expires < now) {
        this.tokens.delete(sessionId);
      }
    }
  }

  /**
   * Middleware to generate CSRF token
   */
  static generateMiddleware(req: Request, res: Response, next: NextFunction) {
    const sessionId = req.user?.userId || req.sessionID || req.ip;
    const token = CSRFProtection.generateToken(sessionId);

    // Add token to response header
    res.setHeader("X-CSRF-Token", token);

    // Also make it available in response locals for rendering
    res.locals.csrfToken = token;

    next();
  }

  /**
   * Middleware to validate CSRF token on state-changing requests
   */
  static validateMiddleware(req: Request, res: Response, next: NextFunction) {
    // Skip CSRF validation for safe methods
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    // Skip for API key authentication (stateless)
    if (req.headers["x-api-key"]) {
      return next();
    }

    const sessionId = req.user?.userId || req.sessionID || req.ip;
    const token =
      req.headers["x-csrf-token"] || req.body?._csrf || req.query._csrf;

    if (!token || typeof token !== "string") {
      logger.warn("CSRF token missing", {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: req.user?.userId,
      });

      throw new AppError(
        "SECURITY_CSRF_TOKEN_MISSING",
        "CSRF token is required for this operation",
        403
      );
    }

    if (!CSRFProtection.validateToken(sessionId, token)) {
      logger.warn("CSRF token validation failed", {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: req.user?.userId,
      });

      throw new AppError(
        "SECURITY_CSRF_TOKEN_INVALID",
        "Invalid or expired CSRF token",
        403
      );
    }

    next();
  }
}

/**
 * XSS Protection - Sanitize user input
 */
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sanitizeValue = (value: any): any => {
    if (typeof value === "string") {
      // Remove potential XSS vectors
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/javascript:/gi, "")
        .replace(/on\w+\s*=/gi, "")
        .trim();
    }

    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }

    if (value && typeof value === "object") {
      const sanitized: any = {};
      for (const key in value) {
        sanitized[key] = sanitizeValue(value[key]);
      }
      return sanitized;
    }

    return value;
  };

  // Sanitize body
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  // Sanitize query params
  if (req.query) {
    req.query = sanitizeValue(req.query);
  }

  next();
};

/**
 * Content Security Policy violation reporter
 */
export const cspViolationReporter = (req: Request, res: Response) => {
  if (req.body) {
    logger.warn("CSP Violation", {
      violation: req.body,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }
  res.status(204).end();
};

/**
 * Request size limiter
 */
export const requestSizeLimiter = (maxSize: number = 10 * 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers["content-length"];

    if (contentLength && parseInt(contentLength) > maxSize) {
      throw new AppError(
        "SECURITY_REQUEST_TOO_LARGE",
        `Request size exceeds maximum allowed size of ${maxSize} bytes`,
        413
      );
    }

    next();
  };
};

/**
 * Suspicious activity detector
 */
export const suspiciousActivityDetector = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const suspiciousPatterns = [
    /(\.\.|\/etc\/|\/proc\/|\/sys\/)/i, // Path traversal
    /(union\s+select|insert\s+into|drop\s+table)/i, // SQL injection
    /(<script|javascript:|onerror=|onload=)/i, // XSS
    /(eval\(|exec\(|system\()/i, // Code injection
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === "string") {
      return suspiciousPatterns.some((pattern) => pattern.test(value));
    }

    if (Array.isArray(value)) {
      return value.some(checkValue);
    }

    if (value && typeof value === "object") {
      return Object.values(value).some(checkValue);
    }

    return false;
  };

  // Check URL
  if (suspiciousPatterns.some((pattern) => pattern.test(req.url))) {
    logger.warn("Suspicious activity detected in URL", {
      url: req.url,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      userId: req.user?.userId,
    });
  }

  // Check body
  if (req.body && checkValue(req.body)) {
    logger.warn("Suspicious activity detected in request body", {
      path: req.path,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      userId: req.user?.userId,
    });
  }

  // Check query params
  if (req.query && checkValue(req.query)) {
    logger.warn("Suspicious activity detected in query params", {
      path: req.path,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      userId: req.user?.userId,
    });
  }

  next();
};

/**
 * IP-based request tracking for abuse detection
 */
class IPTracker {
  private static requests = new Map<string, number[]>();
  private static readonly WINDOW_MS = 60000; // 1 minute
  private static readonly MAX_REQUESTS = 1000; // Max requests per window

  static track(ip: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(ip) || [];

    // Remove old requests outside the window
    const recentRequests = requests.filter(
      (time) => now - time < this.WINDOW_MS
    );

    // Check if limit exceeded
    if (recentRequests.length >= this.MAX_REQUESTS) {
      return false;
    }

    // Add current request
    recentRequests.push(now);
    this.requests.set(ip, recentRequests);

    // Cleanup old IPs periodically
    if (Math.random() < 0.01) {
      this.cleanup();
    }

    return true;
  }

  private static cleanup() {
    const now = Date.now();
    for (const [ip, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(
        (time) => now - time < this.WINDOW_MS
      );
      if (recentRequests.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, recentRequests);
      }
    }
  }
}

/**
 * Abuse detection middleware
 */
export const abuseDetector = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  if (!IPTracker.track(ip)) {
    logger.warn("Potential abuse detected - too many requests", {
      ip,
      path: req.path,
      userAgent: req.headers["user-agent"],
      userId: req.user?.userId,
    });

    throw new AppError(
      "SECURITY_TOO_MANY_REQUESTS",
      "Too many requests from this IP address. Please try again later.",
      429
    );
  }

  next();
};
