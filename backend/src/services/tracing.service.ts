import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import config from "../config";

class TracingService {
  private sdk: NodeSDK | null = null;

  initialize() {
    // Only initialize if tracing is enabled
    if (!config.tracing?.enabled) {
      console.log("OpenTelemetry tracing is disabled");
      return;
    }

    try {
      // Create OTLP trace exporter
      const traceExporter = new OTLPTraceExporter({
        url: config.tracing.otlpEndpoint || "http://localhost:4318/v1/traces",
      });

      // Create Prometheus metrics exporter
      const metricsExporter = new PrometheusExporter({
        port: config.tracing.metricsPort || 9464,
      });

      // Create SDK
      this.sdk = new NodeSDK({
        resource: new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: "env-config-manager",
          [SemanticResourceAttributes.SERVICE_VERSION]: "1.0.0",
          [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.nodeEnv,
        }),
        traceExporter,
        metricReader: metricsExporter,
        instrumentations: [
          getNodeAutoInstrumentations({
            // Customize instrumentation
            "@opentelemetry/instrumentation-fs": {
              enabled: false, // Disable file system instrumentation
            },
            "@opentelemetry/instrumentation-http": {
              enabled: true,
            },
            "@opentelemetry/instrumentation-express": {
              enabled: true,
            },
          }),
        ],
      });

      // Start the SDK
      this.sdk.start();
      console.log("✓ OpenTelemetry tracing initialized");
    } catch (error) {
      console.error("Failed to initialize OpenTelemetry:", error);
    }
  }

  async shutdown() {
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
        console.log("OpenTelemetry SDK shut down successfully");
      } catch (error) {
        console.error("Error shutting down OpenTelemetry SDK:", error);
      }
    }
  }
}

export default new TracingService();
