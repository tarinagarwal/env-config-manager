import { Router, Request, Response } from "express";
import metricsService from "../services/metrics.service";
import healthService from "../services/health.service";

const router = Router();

// Prometheus metrics endpoint
router.get("/metrics", async (req: Request, res: Response) => {
  try {
    res.set("Content-Type", metricsService.registry.contentType);
    const metrics = await metricsService.getMetrics();
    res.send(metrics);
  } catch (error) {
    res.status(500).json({ error: "Failed to collect metrics" });
  }
});

// Basic health check (fast, for load balancers)
router.get("/health", async (req: Request, res: Response) => {
  try {
    const health = await healthService.basicHealthCheck();
    res.json(health);
  } catch (error) {
    res.status(503).json({ status: "error", message: "Health check failed" });
  }
});

// Detailed health check
router.get("/health/detailed", async (req: Request, res: Response) => {
  try {
    const health = await healthService.detailedHealthCheck();

    // Return appropriate status code based on health
    const statusCode =
      health.status === "healthy"
        ? 200
        : health.status === "degraded"
        ? 200
        : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      message: "Health check failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Kubernetes readiness probe
router.get("/health/ready", async (req: Request, res: Response) => {
  try {
    const readiness = await healthService.readinessCheck();

    if (readiness.ready) {
      res.json(readiness);
    } else {
      res.status(503).json(readiness);
    }
  } catch (error) {
    res.status(503).json({
      ready: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Kubernetes liveness probe
router.get("/health/live", async (req: Request, res: Response) => {
  try {
    const liveness = await healthService.livenessCheck();
    res.json(liveness);
  } catch (error) {
    res.status(503).json({
      alive: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
