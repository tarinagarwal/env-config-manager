import prisma from "../lib/prisma";
import { getRedisClient } from "../lib/redis";
import metricsService from "./metrics.service";

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    memory: HealthCheck;
    disk?: HealthCheck;
  };
  metrics?: {
    totalRequests: number;
    activeConnections: number;
    errorRate: number;
  };
}

export interface HealthCheck {
  status: "pass" | "fail" | "warn";
  message?: string;
  responseTime?: number;
  details?: Record<string, any>;
}

class HealthService {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  // Basic health check (fast, for load balancers)
  async basicHealthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  // Detailed health check (comprehensive)
  async detailedHealthCheck(): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
    ]);

    const [database, redis, memory] = checks;

    // Determine overall status
    const hasFailure = checks.some((check) => check.status === "fail");
    const hasWarning = checks.some((check) => check.status === "warn");

    let overallStatus: "healthy" | "degraded" | "unhealthy";
    if (hasFailure) {
      overallStatus = "unhealthy";
    } else if (hasWarning) {
      overallStatus = "degraded";
    } else {
      overallStatus = "healthy";
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: "1.0.0",
      checks: {
        database,
        redis,
        memory,
      },
      metrics: await this.getMetricsSummary(),
    };
  }

  // Check database connectivity
  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Simple query to check connection (MongoDB compatible)
      await prisma.user.findFirst({ take: 1 });

      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 100 ? "pass" : "warn",
        message:
          responseTime < 100
            ? "Database is healthy"
            : "Database response is slow",
        responseTime,
      };
    } catch (error) {
      return {
        status: "fail",
        message: "Database connection failed",
        responseTime: Date.now() - startTime,
        details: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  // Check Redis connectivity
  private async checkRedis(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const redis = getRedisClient();

      // Ping Redis
      const pong = await redis.ping();

      const responseTime = Date.now() - startTime;

      if (pong !== "PONG") {
        return {
          status: "fail",
          message: "Redis ping failed",
          responseTime,
        };
      }

      return {
        status: responseTime < 50 ? "pass" : "warn",
        message:
          responseTime < 50 ? "Redis is healthy" : "Redis response is slow",
        responseTime,
      };
    } catch (error) {
      return {
        status: "fail",
        message: "Redis connection failed",
        responseTime: Date.now() - startTime,
        details: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  // Check memory usage
  private async checkMemory(): Promise<HealthCheck> {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const heapUsagePercent = Math.round(
      (memUsage.heapUsed / memUsage.heapTotal) * 100
    );

    let status: "pass" | "warn" | "fail";
    let message: string;

    if (heapUsagePercent > 90) {
      status = "fail";
      message = "Memory usage is critical";
    } else if (heapUsagePercent > 75) {
      status = "warn";
      message = "Memory usage is high";
    } else {
      status = "pass";
      message = "Memory usage is normal";
    }

    return {
      status,
      message,
      details: {
        heapUsed: `${heapUsedMB} MB`,
        heapTotal: `${heapTotalMB} MB`,
        heapUsagePercent: `${heapUsagePercent}%`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
      },
    };
  }

  // Get metrics summary
  private async getMetricsSummary(): Promise<{
    totalRequests: number;
    activeConnections: number;
    errorRate: number;
  }> {
    try {
      const metrics = await metricsService.registry.getMetricsAsJSON();

      // Extract relevant metrics
      const httpRequestsMetric = metrics.find(
        (m) => m.name === "http_requests_total"
      );
      const httpInProgressMetric = metrics.find(
        (m) => m.name === "http_requests_in_progress"
      );
      const errorsMetric = metrics.find((m) => m.name === "errors_total");

      let totalRequests = 0;
      let totalErrors = 0;

      if (httpRequestsMetric && "values" in httpRequestsMetric) {
        totalRequests = httpRequestsMetric.values.reduce(
          (sum, v) => sum + (v.value || 0),
          0
        );
      }

      if (errorsMetric && "values" in errorsMetric) {
        totalErrors = errorsMetric.values.reduce(
          (sum, v) => sum + (v.value || 0),
          0
        );
      }

      const activeConnections =
        httpInProgressMetric && "values" in httpInProgressMetric
          ? httpInProgressMetric.values[0]?.value || 0
          : 0;

      const errorRate =
        totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

      return {
        totalRequests,
        activeConnections,
        errorRate: Math.round(errorRate * 100) / 100,
      };
    } catch (error) {
      return {
        totalRequests: 0,
        activeConnections: 0,
        errorRate: 0,
      };
    }
  }

  // Readiness check (for Kubernetes)
  async readinessCheck(): Promise<{
    ready: boolean;
    checks: Record<string, boolean>;
  }> {
    const [dbCheck, redisCheck] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const checks = {
      database: dbCheck.status === "pass",
      redis: redisCheck.status === "pass",
    };

    const ready = Object.values(checks).every((check) => check === true);

    return { ready, checks };
  }

  // Liveness check (for Kubernetes)
  async livenessCheck(): Promise<{ alive: boolean }> {
    // Simple check - if the process is running, it's alive
    return { alive: true };
  }
}

export default new HealthService();
