import { z } from "zod";
import { ValidationError } from "./errors";

// Common validation patterns
const emailPattern = z.string().email("Invalid email address").max(255);
const passwordPattern = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be less than 128 characters")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain at least one uppercase letter, one lowercase letter, and one number"
  );

const objectIdPattern = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

const variableKeyPattern = z
  .string()
  .min(1, "Variable key is required")
  .max(255, "Variable key must be less than 255 characters")
  .regex(
    /^[A-Z_][A-Z0-9_]*$/,
    "Variable key must start with a letter or underscore and contain only uppercase letters, numbers, and underscores"
  );

// Auth schemas
export const registerSchema = z.object({
  email: emailPattern,
  password: passwordPattern,
});

export const loginSchema = z.object({
  email: emailPattern,
  password: z.string().min(1, "Password is required").max(128),
  twoFactorCode: z.string().length(6, "2FA code must be 6 digits").optional(),
});

export const passwordResetRequestSchema = z.object({
  email: emailPattern,
});

export const passwordResetSchema = z.object({
  token: z.string().min(1, "Reset token is required").max(500),
  newPassword: passwordPattern,
});

export const enable2FASchema = z.object({
  code: z.string().length(6, "2FA code must be 6 digits"),
});

// Project schemas
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name must be less than 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Project name contains invalid characters"),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
});

export const updateProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name must be less than 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Project name contains invalid characters")
    .optional(),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
});

export const addProjectMemberSchema = z.object({
  userId: objectIdPattern,
  role: z.enum(["viewer", "developer", "admin", "owner"]),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["viewer", "developer", "admin", "owner"]),
});

// Environment schemas
export const createEnvironmentSchema = z.object({
  name: z
    .string()
    .min(1, "Environment name is required")
    .max(50, "Environment name must be less than 50 characters")
    .regex(/^[a-zA-Z0-9\-_]+$/, "Environment name contains invalid characters"),
});

// Variable schemas
export const createVariableSchema = z.object({
  key: variableKeyPattern,
  value: z
    .string()
    .max(10000, "Variable value must be less than 10000 characters"),
  isSecret: z.boolean().default(false),
  rotationEnabled: z.boolean().default(false).optional(),
  rotationIntervalDays: z.number().int().min(1).max(365).optional(),
});

export const updateVariableSchema = z.object({
  value: z
    .string()
    .max(10000, "Variable value must be less than 10000 characters"),
});

export const bulkCopyVariablesSchema = z.object({
  sourceEnvironmentId: objectIdPattern,
  targetEnvironmentId: objectIdPattern,
  variableIds: z.array(objectIdPattern).optional(),
});

export const bulkUpdateVariablesSchema = z.object({
  updates: z
    .array(
      z.object({
        variableId: objectIdPattern,
        value: z.string().max(10000),
      })
    )
    .min(1, "At least one update is required")
    .max(100, "Cannot update more than 100 variables at once"),
});

// Platform connection schemas
export const createPlatformConnectionSchema = z.object({
  platform: z.enum([
    "vercel",
    "aws-ssm",
    "aws-secrets-manager",
    "netlify",
    "heroku",
  ]),
  credentials: z.record(z.string()),
  targetResource: z.string().min(1).max(500),
});

// API Key schemas
export const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "API key name is required")
    .max(100, "API key name must be less than 100 characters"),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

// Audit log schemas
export const auditLogQuerySchema = z.object({
  userId: objectIdPattern.optional(),
  action: z.string().max(100).optional(),
  resourceType: z.string().max(100).optional(),
  resourceId: objectIdPattern.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  limit: z.number().int().min(1).max(1000).default(100).optional(),
  offset: z.number().int().min(0).default(0).optional(),
});

// Billing schemas
export const createSubscriptionSchema = z.object({
  plan: z.enum(["free", "pro", "team", "enterprise"]),
});

export const updateSubscriptionSchema = z.object({
  plan: z.enum(["free", "pro", "team", "enterprise"]),
});

// Rotation schemas
export const updateRotationConfigSchema = z.object({
  rotationEnabled: z.boolean(),
  rotationIntervalDays: z.number().int().min(1).max(365).optional(),
});

// Webhook schemas
export const createWebhookSchema = z.object({
  url: z.string().url("Invalid webhook URL").max(500),
  events: z.array(z.string()).min(1, "At least one event is required"),
  secret: z.string().min(16).max(128).optional(),
});

// Validation helper
export const validate = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors.reduce((acc, err) => {
        const path = err.path.join(".");
        acc[path] = err.message;
        return acc;
      }, {} as Record<string, string>);

      throw new ValidationError("Validation failed", details);
    }
    throw error;
  }
};

// Validate MongoDB ObjectId
export const validateObjectId = (
  id: string,
  fieldName: string = "ID"
): void => {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    throw new ValidationError(`Invalid ${fieldName} format`);
  }
};

// Validate array of ObjectIds
export const validateObjectIds = (
  ids: string[],
  fieldName: string = "IDs"
): void => {
  ids.forEach((id) => validateObjectId(id, fieldName));
};
