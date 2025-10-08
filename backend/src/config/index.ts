import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  port: z.string().transform(Number).default("3000"),
  apiVersion: z.string().default("v1"),

  database: z.object({
    url: z.string(),
  }),

  redis: z.object({
    host: z.string().default("localhost"),
    port: z.string().transform(Number).default("6379"),
    password: z.string().optional(),
  }),

  jwt: z.object({
    secret: z.string(),
    accessExpiry: z.string().default("15m"),
    refreshExpiry: z.string().default("7d"),
  }),

  encryption: z.object({
    key: z.string(),
  }),

  cors: z.object({
    origin: z.string().default("http://localhost:5173"),
  }),

  oauth: z.object({
    google: z.object({
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      callbackUrl: z.string().optional(),
    }),
    github: z.object({
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      callbackUrl: z.string().optional(),
    }),
  }),

  tracing: z
    .object({
      enabled: z
        .string()
        .transform((val) => val === "true")
        .default("false"),
      otlpEndpoint: z.string().optional(),
      metricsPort: z.string().transform(Number).optional(),
    })
    .optional(),

  sentry: z
    .object({
      dsn: z.string().optional(),
      tracesSampleRate: z.string().transform(Number).optional(),
      profilesSampleRate: z.string().transform(Number).optional(),
    })
    .optional(),
});

const config = configSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  apiVersion: process.env.API_VERSION,

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY,
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY,
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },

  cors: {
    origin: process.env.CORS_ORIGIN,
  },

  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackUrl: process.env.GITHUB_CALLBACK_URL,
    },
  },

  tracing: {
    enabled: process.env.TRACING_ENABLED,
    otlpEndpoint: process.env.OTLP_ENDPOINT,
    metricsPort: process.env.METRICS_PORT,
  },

  sentry: {
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
    profilesSampleRate: process.env.SENTRY_PROFILES_SAMPLE_RATE,
  },
});

export default config;
