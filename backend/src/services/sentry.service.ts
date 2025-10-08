import * as Sentry from "@sentry/node";
import { Express } from "express";
import config from "../config";

class SentryService {
  initialize(app: Express) {
    // Only initialize if Sentry DSN is provided
    if (!config.sentry?.dsn) {
      console.log("Sentry error tracking is disabled (no DSN provided)");
      return;
    }

    try {
      Sentry.init({
        dsn: config.sentry.dsn,
        environment: config.nodeEnv,
        tracesSampleRate: config.sentry.tracesSampleRate || 0.1,

        // Performance monitoring
        integrations: [
          // Enable HTTP calls tracing
          new Sentry.Integrations.Http({ tracing: true }),
          // Enable Express.js middleware tracing
          new Sentry.Integrations.Express({ app }),
        ],

        // Set sample rate for profiling
        profilesSampleRate: config.sentry.profilesSampleRate || 0.1,

        // Filter out sensitive data
        beforeSend(event) {
          // Remove sensitive headers
          if (event.request?.headers) {
            delete event.request.headers["authorization"];
            delete event.request.headers["cookie"];
          }

          // Remove sensitive query parameters
          if (event.request?.query_string) {
            const sensitiveParams = ["api_key", "token", "password", "secret"];
            sensitiveParams.forEach((param) => {
              if (event.request?.query_string?.includes(param)) {
                event.request.query_string = event.request.query_string.replace(
                  new RegExp(`${param}=[^&]*`, "gi"),
                  `${param}=[REDACTED]`
                );
              }
            });
          }

          return event;
        },
      });

      console.log("✓ Sentry error tracking initialized");
    } catch (error) {
      console.error("Failed to initialize Sentry:", error);
    }
  }

  // Capture exception
  captureException(error: Error, context?: Record<string, any>) {
    if (config.sentry?.dsn) {
      Sentry.captureException(error, {
        extra: context,
      });
    }
  }

  // Capture message
  captureMessage(
    message: string,
    level: Sentry.SeverityLevel = "info",
    context?: Record<string, any>
  ) {
    if (config.sentry?.dsn) {
      Sentry.captureMessage(message, {
        level,
        extra: context,
      });
    }
  }

  // Set user context
  setUser(user: { id: string; email?: string; username?: string }) {
    if (config.sentry?.dsn) {
      Sentry.setUser(user);
    }
  }

  // Clear user context
  clearUser() {
    if (config.sentry?.dsn) {
      Sentry.setUser(null);
    }
  }

  // Add breadcrumb
  addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
    if (config.sentry?.dsn) {
      Sentry.addBreadcrumb(breadcrumb);
    }
  }

  // Get Sentry request handler (must be first middleware)
  getRequestHandler() {
    return Sentry.Handlers.requestHandler();
  }

  // Get Sentry tracing handler (must be after request handler)
  getTracingHandler() {
    return Sentry.Handlers.tracingHandler();
  }

  // Get Sentry error handler (must be before other error handlers)
  getErrorHandler() {
    return Sentry.Handlers.errorHandler();
  }
}

export default new SentryService();
