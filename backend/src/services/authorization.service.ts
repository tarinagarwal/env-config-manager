import { Role, Permission, RolePermissions } from "../types/rbac.types";
import prisma from "../lib/prisma";
import { ForbiddenError, NotFoundError } from "../utils/errors";

class AuthorizationService {
  // Define role-based permissions
  private rolePermissions: RolePermissions = {
    viewer: [
      "project:read",
      "environment:read",
      "variable:read",
      "variable:history",
    ],
    developer: [
      "project:read",
      "environment:read",
      "environment:create",
      "variable:read",
      "variable:read_secrets",
      "variable:create",
      "variable:update",
      "variable:history",
    ],
    admin: [
      "project:read",
      "project:update",
      "project:manage_members",
      "environment:read",
      "environment:create",
      "environment:delete",
      "variable:read",
      "variable:read_secrets",
      "variable:create",
      "variable:update",
      "variable:update_secrets",
      "variable:delete",
      "variable:history",
      "variable:rollback",
    ],
    owner: [
      "project:read",
      "project:update",
      "project:delete",
      "project:manage_members",
      "environment:read",
      "environment:create",
      "environment:delete",
      "variable:read",
      "variable:read_secrets",
      "variable:create",
      "variable:update",
      "variable:update_secrets",
      "variable:delete",
      "variable:history",
      "variable:rollback",
    ],
  };

  /**
   * Get user's role in a project
   */
  async getUserRole(userId: string, projectId: string): Promise<Role | null> {
    // Check if user is the project owner
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (!project) {
      throw new NotFoundError("Project");
    }

    if (project.ownerId === userId) {
      return "owner";
    }

    // Check if user is a project member
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      select: { role: true },
    });

    return member ? (member.role as Role) : null;
  }

  /**
   * Check if a role has a specific permission
   */
  hasPermission(role: Role, permission: Permission): boolean {
    return this.rolePermissions[role]?.includes(permission) || false;
  }

  /**
   * Check if user has permission for a project
   */
  async checkPermission(
    userId: string,
    projectId: string,
    permission: Permission
  ): Promise<boolean> {
    const role = await this.getUserRole(userId, projectId);

    if (!role) {
      return false;
    }

    return this.hasPermission(role, permission);
  }

  /**
   * Require permission or throw error
   */
  async requirePermission(
    userId: string,
    projectId: string,
    permission: Permission
  ): Promise<void> {
    const hasPermission = await this.checkPermission(
      userId,
      projectId,
      permission
    );

    if (!hasPermission) {
      throw new ForbiddenError(
        `You do not have permission to perform this action`
      );
    }
  }

  /**
   * Add member to project
   */
  async addProjectMember(
    projectId: string,
    userId: string,
    role: Role
  ): Promise<void> {
    await prisma.projectMember.create({
      data: {
        projectId,
        userId,
        role,
      },
    });
  }

  /**
   * Remove member from project
   */
  async removeProjectMember(projectId: string, userId: string): Promise<void> {
    await prisma.projectMember.delete({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    projectId: string,
    userId: string,
    role: Role
  ): Promise<void> {
    await prisma.projectMember.update({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      data: { role },
    });
  }

  /**
   * Get all project members
   */
  async getProjectMembers(projectId: string) {
    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            createdAt: true,
          },
        },
      },
    });

    return members.map((member: any) => ({
      userId: member.userId,
      role: member.role,
      email: member.user.email,
      addedAt: member.createdAt,
    }));
  }

  /**
   * Get permissions for a role
   */
  getRolePermissions(role: Role): Permission[] {
    return this.rolePermissions[role] || [];
  }
}

export default new AuthorizationService();
