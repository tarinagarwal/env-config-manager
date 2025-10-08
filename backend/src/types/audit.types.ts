export interface AuditEvent {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface AuditLog extends AuditEvent {
  id: string;
  severity: "info" | "warning" | "critical";
}

export interface AuditFilters {
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  severity?: "info" | "warning" | "critical";
}

export type AuditAction =
  // Auth actions
  | "auth.register"
  | "auth.login"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.2fa.enable"
  | "auth.2fa.disable"
  | "auth.password.reset.request"
  | "auth.password.reset.complete"
  | "auth.token.refresh"
  // Project actions
  | "project.create"
  | "project.update"
  | "project.delete"
  | "project.member.add"
  | "project.member.remove"
  | "project.member.role.update"
  // Environment actions
  | "environment.create"
  | "environment.update"
  | "environment.delete"
  // Variable actions
  | "variable.create"
  | "variable.update"
  | "variable.delete"
  | "variable.view"
  | "variable.secret.reveal"
  | "variable.rollback"
  | "variable.bulk.copy"
  | "variable.bulk.update"
  // Platform connection actions
  | "connection.create"
  | "connection.delete"
  | "connection.sync"
  // Rotation actions
  | "rotation.enable"
  | "rotation.disable"
  | "rotation.execute"
  | "rotation.failed"
  // Subscription actions
  | "subscription.create"
  | "subscription.update"
  | "subscription.cancel"
  // API key actions
  | "apikey.create"
  | "apikey.delete"
  | "apikey.use"
  // Unauthorized access
  | "access.unauthorized";

export type ResourceType =
  | "user"
  | "project"
  | "environment"
  | "variable"
  | "connection"
  | "subscription"
  | "apikey";
