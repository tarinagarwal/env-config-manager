import { Registry, Counter, Histogram, Gauge } from "prom-client";

class MetricsService {
  public registry: Registry;

  // HTTP metrics
  public httpRequestsTotal: Counter;
  public httpRequestDuration: Histogram;
  public httpRequestsInProgress: Gauge;

  // Database metrics
  public dbQueriesTotal: Counter;
  public dbQueryDuration: Histogram;
  public dbConnectionsActive: Gauge;

  // Business metrics
  public projectsTotal: Gauge;
  public environmentsTotal: Gauge;
  public variablesTotal: Gauge;
  public secretsTotal: Gauge;
  public syncOperationsTotal: Counter;
  public syncOperationDuration: Histogram;
  public syncFailuresTotal: Counter;

  // Authentication metrics
  public authAttemptsTotal: Counter;
  public authFailuresTotal: Counter;
  public activeSessionsTotal: Gauge;

  // Error metrics
  public errorsTotal: Counter;

  // Cache metrics
  public cacheHitsTotal: Counter;
  public cacheMissesTotal: Counter;

  constructor() {
    this.registry = new Registry();

    // HTTP metrics
    this.httpRequestsTotal = new Counter({
      name: "http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: "http_request_duration_seconds",
      help: "Duration of HTTP requests in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });

    this.httpRequestsInProgress = new Gauge({
      name: "http_requests_in_progress",
      help: "Number of HTTP requests currently being processed",
      registers: [this.registry],
    });

    // Database metrics
    this.dbQueriesTotal = new Counter({
      name: "db_queries_total",
      help: "Total number of database queries",
      labelNames: ["operation", "model"],
      registers: [this.registry],
    });

    this.dbQueryDuration = new Histogram({
      name: "db_query_duration_seconds",
      help: "Duration of database queries in seconds",
      labelNames: ["operation", "model"],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    });

    this.dbConnectionsActive = new Gauge({
      name: "db_connections_active",
      help: "Number of active database connections",
      registers: [this.registry],
    });

    // Business metrics
    this.projectsTotal = new Gauge({
      name: "projects_total",
      help: "Total number of projects",
      registers: [this.registry],
    });

    this.environmentsTotal = new Gauge({
      name: "environments_total",
      help: "Total number of environments",
      registers: [this.registry],
    });

    this.variablesTotal = new Gauge({
      name: "variables_total",
      help: "Total number of variables",
      registers: [this.registry],
    });

    this.secretsTotal = new Gauge({
      name: "secrets_total",
      help: "Total number of secret variables",
      registers: [this.registry],
    });

    this.syncOperationsTotal = new Counter({
      name: "sync_operations_total",
      help: "Total number of sync operations",
      labelNames: ["platform", "status"],
      registers: [this.registry],
    });

    this.syncOperationDuration = new Histogram({
      name: "sync_operation_duration_seconds",
      help: "Duration of sync operations in seconds",
      labelNames: ["platform"],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });

    this.syncFailuresTotal = new Counter({
      name: "sync_failures_total",
      help: "Total number of sync failures",
      labelNames: ["platform", "error_type"],
      registers: [this.registry],
    });

    // Authentication metrics
    this.authAttemptsTotal = new Counter({
      name: "auth_attempts_total",
      help: "Total number of authentication attempts",
      labelNames: ["method", "status"],
      registers: [this.registry],
    });

    this.authFailuresTotal = new Counter({
      name: "auth_failures_total",
      help: "Total number of authentication failures",
      labelNames: ["method", "reason"],
      registers: [this.registry],
    });

    this.activeSessionsTotal = new Gauge({
      name: "active_sessions_total",
      help: "Number of active user sessions",
      registers: [this.registry],
    });

    // Error metrics
    this.errorsTotal = new Counter({
      name: "errors_total",
      help: "Total number of errors",
      labelNames: ["type", "code"],
      registers: [this.registry],
    });

    // Cache metrics
    this.cacheHitsTotal = new Counter({
      name: "cache_hits_total",
      help: "Total number of cache hits",
      labelNames: ["cache_type"],
      registers: [this.registry],
    });

    this.cacheMissesTotal = new Counter({
      name: "cache_misses_total",
      help: "Total number of cache misses",
      labelNames: ["cache_type"],
      registers: [this.registry],
    });
  }

  // Helper method to get all metrics
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  // Helper method to record HTTP request
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number
  ) {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode });
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );
  }

  // Helper method to record database query
  recordDbQuery(operation: string, model: string, duration: number) {
    this.dbQueriesTotal.inc({ operation, model });
    this.dbQueryDuration.observe({ operation, model }, duration);
  }

  // Helper method to record sync operation
  recordSyncOperation(
    platform: string,
    status: "success" | "failure",
    duration: number,
    errorType?: string
  ) {
    this.syncOperationsTotal.inc({ platform, status });
    this.syncOperationDuration.observe({ platform }, duration);

    if (status === "failure" && errorType) {
      this.syncFailuresTotal.inc({ platform, error_type: errorType });
    }
  }

  // Helper method to record authentication attempt
  recordAuthAttempt(
    method: string,
    status: "success" | "failure",
    reason?: string
  ) {
    this.authAttemptsTotal.inc({ method, status });

    if (status === "failure" && reason) {
      this.authFailuresTotal.inc({ method, reason });
    }
  }

  // Helper method to record error
  recordError(type: string, code: string) {
    this.errorsTotal.inc({ type, code });
  }

  // Helper method to record cache operation
  recordCacheOperation(cacheType: string, hit: boolean) {
    if (hit) {
      this.cacheHitsTotal.inc({ cache_type: cacheType });
    } else {
      this.cacheMissesTotal.inc({ cache_type: cacheType });
    }
  }
}

export default new MetricsService();
