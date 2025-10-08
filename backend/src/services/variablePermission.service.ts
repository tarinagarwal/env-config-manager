import prisma from "../lib/prisma";
import authorizationService from "./authorization.service";
import { ForbiddenError } from "../utils/errors";
import { Permission } from "../types/rbac.types";

class VariablePermissionService {
  /**
   * Check if user can read a variable (including secrets)
   */
  async canReadVariable(
    userId: string,
    variableId: string,
    includeSecrets: boolean = false
  ): Promise<boolean> {
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      include: {
        environment: {
          select: { projectId: true },
        },
      },
    });

    if (!variable) {
      return false;
    }

    const projectId = variable.environment.projectId;

    // Check basic read permission
    const canRead = await authorizationService.checkPermission(
      userId,
      projectId,
      "variable:read"
    );

    if (!canRead) {
      return false;
    }

    // If variable is secret and user wants to read it, check secret permission
    if (variable.isSecret && includeSecrets) {
      return await authorizationService.checkPermission(
        userId,
        projectId,
        "variable:read_secrets"
      );
    }

    return true;
  }

  /**
   * Check if user can update a variable
   */
  async canUpdateVariable(
    userId: string,
    variableId: string
  ): Promise<boolean> {
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      include: {
        environment: {
          select: { projectId: true },
        },
      },
    });

    if (!variable) {
      return false;
    }

    const projectId = variable.environment.projectId;
    const permission: Permission = variable.isSecret
      ? "variable:update_secrets"
      : "variable:update";

    return await authorizationService.checkPermission(
      userId,
      projectId,
      permission
    );
  }

  /**
   * Check if user can delete a variable
   */
  async canDeleteVariable(
    userId: string,
    variableId: string
  ): Promise<boolean> {
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      include: {
        environment: {
          select: { projectId: true },
        },
      },
    });

    if (!variable) {
      return false;
    }

    const projectId = variable.environment.projectId;

    return await authorizationService.checkPermission(
      userId,
      projectId,
      "variable:delete"
    );
  }

  /**
   * Require permission to read variable
   */
  async requireReadVariable(
    userId: string,
    variableId: string,
    includeSecrets: boolean = false
  ): Promise<void> {
    const canRead = await this.canReadVariable(
      userId,
      variableId,
      includeSecrets
    );

    if (!canRead) {
      throw new ForbiddenError(
        includeSecrets
          ? "You do not have permission to read secret variables"
          : "You do not have permission to read this variable"
      );
    }
  }

  /**
   * Require permission to update variable
   */
  async requireUpdateVariable(
    userId: string,
    variableId: string
  ): Promise<void> {
    const canUpdate = await this.canUpdateVariable(userId, variableId);

    if (!canUpdate) {
      throw new ForbiddenError(
        "You do not have permission to update this variable"
      );
    }
  }

  /**
   * Require permission to delete variable
   */
  async requireDeleteVariable(
    userId: string,
    variableId: string
  ): Promise<void> {
    const canDelete = await this.canDeleteVariable(userId, variableId);

    if (!canDelete) {
      throw new ForbiddenError(
        "You do not have permission to delete this variable"
      );
    }
  }

  /**
   * Filter variables based on user permissions
   * Masks secret values if user doesn't have read_secrets permission
   */
  async filterVariables(userId: string, variables: any[]): Promise<any[]> {
    if (variables.length === 0) {
      return [];
    }

    // Get project ID from first variable
    const firstVariable = variables[0];
    const environment = await prisma.environment.findUnique({
      where: { id: firstVariable.environmentId },
      select: { projectId: true },
    });

    if (!environment) {
      return [];
    }

    const canReadSecrets = await authorizationService.checkPermission(
      userId,
      environment.projectId,
      "variable:read_secrets"
    );

    return variables.map((variable) => {
      if (variable.isSecret && !canReadSecrets) {
        return {
          ...variable,
          value: "***MASKED***",
        };
      }
      return variable;
    });
  }
}

export default new VariablePermissionService();
