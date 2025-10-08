import { Request, Response, NextFunction } from "express";
import metricsService from "../services/metrics.service";

// Middleware to track HTTP requests
export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = Date.now();

  // Increment in-progress requests
  metricsService.httpRequestsInProgress.inc();

  // Track response
  res.on("finish", () => {
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    const route = getRoutePattern(req);

    metricsService.recordHttpRequest(
      req.method,
      route,
      res.statusCode,
      duration
    );

    // Decrement in-progress requests
    metricsService.httpRequestsInProgress.dec();
  });

  next();
};

// Helper function to get route pattern (e.g., /api/v1/projects/:id instead of /api/v1/projects/123)
function getRoutePattern(req: Request): string {
  if (req.route) {
    return req.baseUrl + req.route.path;
  }

  // Fallback to path with IDs replaced
  return req.path
    .replace(/\/[0-9a-f]{24}/gi, "/:id") // MongoDB ObjectIds
    .replace(/\/[0-9]+/g, "/:id"); // Numeric IDs
}
