import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import logger from "../services/logger.service";
import metricsService from "../services/metrics.service";
import sentryService from "../services/sentry.service";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error
  logger.error("Error:", {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: (req as any).user?.id,
  });

  if (err instanceof AppError) {
    // Record error metric
    metricsService.recordError("app_error", err.code);

    // Capture in Sentry if it's a server error
    if (err.statusCode >= 500) {
      sentryService.captureException(err, {
        path: req.path,
        method: req.method,
        statusCode: err.statusCode,
      });
    }

    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.headers["x-request-id"] || "unknown",
      },
    });
  }

  // Record unknown error metric
  metricsService.recordError("unknown_error", "INTERNAL_SERVER_ERROR");

  // Capture unknown errors in Sentry
  sentryService.captureException(err, {
    path: req.path,
    method: req.method,
  });

  // Default error response
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      requestId: req.headers["x-request-id"] || "unknown",
    },
  });
};
