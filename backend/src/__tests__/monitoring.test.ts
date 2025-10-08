import metricsService from "../services/metrics.service";
import healthService from "../services/health.service";

describe("Monitoring Services", () => {
  describe("MetricsService", () => {
    it("should record HTTP request metrics", async () => {
      const initialMetrics = await metricsService.getMetrics();

      metricsService.recordHttpRequest("GET", "/api/v1/projects", 200, 0.05);

      const updatedMetrics = await metricsService.getMetrics();

      expect(updatedMetrics).toContain("http_requests_total");
      expect(updatedMetrics).toContain("http_request_duration_seconds");
      expect(updatedMetrics.length).toBeGreaterThan(initialMetrics.length);
    });

    it("should record database query metrics", async () => {
      metricsService.recordDbQuery("findMany", "Project", 0.01);

      const metrics = await metricsService.getMetrics();

      expect(metrics).toContain("db_queries_total");
      expect(metrics).toContain("db_query_duration_seconds");
    });

    it("should record sync operation metrics", async () => {
      metricsService.recordSyncOperation("vercel", "success", 1.5);

      const metrics = await metricsService.getMetrics();

      expect(metrics).toContain("sync_operations_total");
      expect(metrics).toContain("sync_operation_duration_seconds");
    });

    it("should record authentication metrics", async () => {
      metricsService.recordAuthAttempt("email", "success");
      metricsService.recordAuthAttempt(
        "oauth",
        "failure",
        "invalid_credentials"
      );

      const metrics = await metricsService.getMetrics();

      expect(metrics).toContain("auth_attempts_total");
      expect(metrics).toContain("auth_failures_total");
    });

    it("should record error metrics", async () => {
      metricsService.recordError("app_error", "VALIDATION_ERROR");

      const metrics = await metricsService.getMetrics();

      expect(metrics).toContain("errors_total");
    });

    it("should record cache operation metrics", async () => {
      metricsService.recordCacheOperation("redis", true);
      metricsService.recordCacheOperation("redis", false);

      const metrics = await metricsService.getMetrics();

      expect(metrics).toContain("cache_hits_total");
      expect(metrics).toContain("cache_misses_total");
    });

    it("should return metrics in Prometheus format", async () => {
      const metrics = await metricsService.getMetrics();

      expect(typeof metrics).toBe("string");
      expect(metrics).toContain("# HELP");
      expect(metrics).toContain("# TYPE");
    });
  });

  describe("HealthService", () => {
    it("should return basic health check", async () => {
      const health = await healthService.basicHealthCheck();

      expect(health).toHaveProperty("status", "ok");
      expect(health).toHaveProperty("timestamp");
      expect(new Date(health.timestamp)).toBeInstanceOf(Date);
    });

    it("should return detailed health check", async () => {
      const health = await healthService.detailedHealthCheck();

      expect(health).toHaveProperty("status");
      expect(["healthy", "degraded", "unhealthy"]).toContain(health.status);
      expect(health).toHaveProperty("timestamp");
      expect(health).toHaveProperty("uptime");
      expect(health).toHaveProperty("version");
      expect(health).toHaveProperty("checks");
      expect(health.checks).toHaveProperty("database");
      expect(health.checks).toHaveProperty("redis");
      expect(health.checks).toHaveProperty("memory");
    });

    it("should check database health", async () => {
      const health = await healthService.detailedHealthCheck();

      expect(health.checks.database).toHaveProperty("status");
      expect(["pass", "warn", "fail"]).toContain(health.checks.database.status);
      expect(health.checks.database).toHaveProperty("message");
      expect(health.checks.database).toHaveProperty("responseTime");
    });

    it("should check Redis health", async () => {
      const health = await healthService.detailedHealthCheck();

      expect(health.checks.redis).toHaveProperty("status");
      expect(["pass", "warn", "fail"]).toContain(health.checks.redis.status);
      expect(health.checks.redis).toHaveProperty("message");
      expect(health.checks.redis).toHaveProperty("responseTime");
    });

    it("should check memory usage", async () => {
      const health = await healthService.detailedHealthCheck();

      expect(health.checks.memory).toHaveProperty("status");
      expect(["pass", "warn", "fail"]).toContain(health.checks.memory.status);
      expect(health.checks.memory).toHaveProperty("message");
      expect(health.checks.memory).toHaveProperty("details");
      expect(health.checks.memory.details).toHaveProperty("heapUsed");
      expect(health.checks.memory.details).toHaveProperty("heapTotal");
      expect(health.checks.memory.details).toHaveProperty("heapUsagePercent");
    });

    it("should return readiness check", async () => {
      const readiness = await healthService.readinessCheck();

      expect(readiness).toHaveProperty("ready");
      expect(typeof readiness.ready).toBe("boolean");
      expect(readiness).toHaveProperty("checks");
      expect(readiness.checks).toHaveProperty("database");
      expect(readiness.checks).toHaveProperty("redis");
    });

    it("should return liveness check", async () => {
      const liveness = await healthService.livenessCheck();

      expect(liveness).toHaveProperty("alive", true);
    });

    it("should include metrics summary in detailed health check", async () => {
      const health = await healthService.detailedHealthCheck();

      expect(health).toHaveProperty("metrics");
      expect(health.metrics).toHaveProperty("totalRequests");
      expect(health.metrics).toHaveProperty("activeConnections");
      expect(health.metrics).toHaveProperty("errorRate");
    });
  });
});
