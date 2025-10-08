import { Request, Response, NextFunction } from "express";
import authorizationService from "../services/authorization.service";
import { Permission } from "../types/rbac.types";
import { ForbiddenError, ValidationError } from "../utils/errors";

// Extend Express Request to include projectId
declare global {
  namespace Express {
    interface Request {
      projectId?: string;
    }
  }
}

/**
 * Middleware to check if user has required permission for a project
 */
export const requirePermission = (permission: Permission) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ForbiddenError("Authentication required");
      }

      // Extract projectId from params, body, or query
      const projectId =
        req.params.projectId || req.body.projectId || req.projectId;

      if (!projectId) {
        throw new ValidationError("Project ID is required");
      }

      await authorizationService.requirePermission(
        req.user.userId,
        projectId,
        permission
      );

      // Store projectId in request for downstream use
      req.projectId = projectId;

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to extract and validate projectId from environment
 */
export const extractProjectFromEnvironment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const environmentId = req.params.environmentId || req.params.envId;

    if (!environmentId) {
      return next();
    }

    const prisma = (await import("../lib/prisma")).default;
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      select: { projectId: true },
    });

    if (environment) {
      req.projectId = environment.projectId;
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to extract and validate projectId from variable
 */
export const extractProjectFromVariable = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const variableId = req.params.variableId || req.params.id;

    if (!variableId) {
      return next();
    }

    const prisma = (await import("../lib/prisma")).default;
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      include: {
        environment: {
          select: { projectId: true },
        },
      },
    });

    if (variable) {
      req.projectId = variable.environment.projectId;
    }

    next();
  } catch (error) {
    next(error);
  }
};
