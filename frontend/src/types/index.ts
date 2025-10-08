// Core type definitions for the application

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Variable {
  id: string;
  environmentId: string;
  key: string;
  value: string;
  isSecret: boolean;
  rotationEnabled: boolean;
  rotationIntervalDays?: number;
  nextRotationAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface VariableVersion {
  id: string;
  variableId: string;
  value: string;
  changeType: "created" | "updated" | "deleted" | "rollback";
  changedBy: string;
  createdAt: string;
}

export type Role = "viewer" | "developer" | "admin" | "owner";

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: Role;
  createdAt: string;
  user?: User;
}

export type PlatformType =
  | "vercel"
  | "aws-ssm"
  | "aws-secrets-manager"
  | "netlify"
  | "heroku";

export interface PlatformConnection {
  id: string;
  projectId: string;
  platform: PlatformType;
  targetResource: string;
  lastSyncAt?: string;
  status: "connected" | "error";
  createdAt: string;
  updatedAt: string;
}

export interface SyncLog {
  id: string;
  connectionId: string;
  environmentId: string;
  success: boolean;
  syncedCount?: number;
  errorMessage?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
  user?: User;
}

export type PlanType = "free" | "pro" | "team" | "enterprise";

export interface Subscription {
  id: string;
  userId: string;
  plan: PlanType;
  status: "active" | "canceled" | "past_due";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  requestId: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
