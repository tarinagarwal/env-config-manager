export type Role = "viewer" | "developer" | "admin" | "owner";

export type Permission =
  | "project:read"
  | "project:update"
  | "project:delete"
  | "project:manage_members"
  | "environment:read"
  | "environment:create"
  | "environment:delete"
  | "variable:read"
  | "variable:read_secrets"
  | "variable:create"
  | "variable:update"
  | "variable:update_secrets"
  | "variable:delete"
  | "variable:history"
  | "variable:rollback";

export interface RolePermissions {
  [key: string]: Permission[];
}

export interface ProjectMemberDto {
  userId: string;
  role: Role;
}

export interface CheckPermissionParams {
  userId: string;
  projectId: string;
  permission: Permission;
  resourceId?: string;
}
