import { Request, Response, NextFunction } from "express";
import auditService from "../services/audit.service";
import { AuditAction, ResourceType } from "../types/audit.types";

/**
 * Middleware to automatically log audit events for API requests
 */
export const auditLog = (action: AuditAction, resourceType: ResourceType) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to capture response
    res.send = function (data: any): Response {
      // Only log if request was successful (2xx status)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Extract resource ID from various sources
        const resourceId =
          req.params.id ||
          req.params.projectId ||
          req.params.environmentId ||
          req.params.variableId ||
          req.params.connectionId ||
          req.body?.id;

        // Log the audit event asynchronously
        auditService
          .log({
            userId: req.user?.userId,
            action,
            resourceType,
            resourceId,
            metadata: {
              method: req.method,
              path: req.path,
              query: req.query,
              body: sanitizeBody(req.body, action),
            },
            ipAddress: getClientIp(req),
            userAgent: req.headers["user-agent"],
            timestamp: new Date(),
          })
          .catch((error) => {
            console.error("Audit logging failed:", error);
          });
      }

      // Call original send
      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Sanitize request body to remove sensitive data from audit logs
 */
function sanitizeBody(body: any, action: AuditAction): any {
  if (!body) return undefined;

  const sanitized = { ...body };

  // Remove passwords
  if (sanitized.password) {
    sanitized.password = "[REDACTED]";
  }

  // Remove secret values for variable operations
  if (action.startsWith("variable.") && sanitized.value && sanitized.isSecret) {
    sanitized.value = "[REDACTED]";
  }

  // Remove credentials for platform connections
  if (action.startsWith("connection.") && sanitized.credentials) {
    sanitized.credentials = "[REDACTED]";
  }

  // Remove API keys
  if (sanitized.apiKey) {
    sanitized.apiKey = "[REDACTED]";
  }

  return sanitized;
}

/**
 * Extract client IP address from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

/**
 * Middleware to log unauthorized access attempts
 */
export const logUnauthorizedAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Store original status function
  const originalStatus = res.status;

  // Override status to capture 401/403 responses
  res.status = function (code: number): Response {
    if (code === 401 || code === 403) {
      // Log unauthorized access attempt
      auditService
        .log({
          userId: req.user?.userId,
          action: "access.unauthorized",
          resourceType: "user",
          metadata: {
            method: req.method,
            path: req.path,
            statusCode: code,
          },
          ipAddress: getClientIp(req),
          userAgent: req.headers["user-agent"],
          timestamp: new Date(),
        })
        .catch((error) => {
          console.error("Audit logging failed:", error);
        });
    }

    return originalStatus.call(this, code);
  };

  next();
};
