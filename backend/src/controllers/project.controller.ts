import { Request, Response, NextFunction } from "express";
import authorizationService from "../services/authorization.service";
import projectService from "../services/project.service";
import billingService from "../services/billing.service";
import { ValidationError } from "../utils/errors";
import { Role } from "../types/rbac.types";
import { z } from "zod";
import { validate } from "../utils/validation";

const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name must be less than 100 characters"),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
});

const updateProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name must be less than 100 characters")
    .optional(),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
});

class ProjectController {
  /**
   * Create a new project
   */
  async createProject(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const data = validate(createProjectSchema, req.body);

      // Check plan limits
      await billingService.requireCanCreateProject(userId);

      const project = await projectService.createProject(userId, data);

      res.status(201).json({
        message: "Project created successfully",
        project,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all projects for the authenticated user
   */
  async getProjects(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const projects = await projectService.getUserProjects(userId);

      res.json({
        projects,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single project by ID
   */
  async getProject(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const project = await projectService.getProjectById(projectId);

      res.json({
        project,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a project
   */
  async updateProject(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const data = validate(updateProjectSchema, req.body);

      const project = await projectService.updateProject(projectId, data);

      res.json({
        message: "Project updated successfully",
        project,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a project
   */
  async deleteProject(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const { confirm } = req.body;

      if (confirm !== true) {
        throw new ValidationError(
          "Project deletion requires confirmation. Set 'confirm' to true."
        );
      }

      await projectService.deleteProject(projectId);

      res.json({
        message: "Project deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
  /**
   * Add member to project
   */
  async addMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const { userId, role } = req.body;

      if (!userId || !role) {
        throw new ValidationError("userId and role are required");
      }

      // Validate role
      const validRoles: Role[] = ["viewer", "developer", "admin", "owner"];
      if (!validRoles.includes(role)) {
        throw new ValidationError("Invalid role");
      }

      await authorizationService.addProjectMember(projectId, userId, role);

      res.status(201).json({
        message: "Member added successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove member from project
   */
  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId, userId } = req.params;

      await authorizationService.removeProjectMember(projectId, userId);

      res.json({
        message: "Member removed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId, userId } = req.params;
      const { role } = req.body;

      if (!role) {
        throw new ValidationError("role is required");
      }

      // Validate role
      const validRoles: Role[] = ["viewer", "developer", "admin", "owner"];
      if (!validRoles.includes(role)) {
        throw new ValidationError("Invalid role");
      }

      await authorizationService.updateMemberRole(projectId, userId, role);

      res.json({
        message: "Member role updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get project members
   */
  async getMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;

      const members = await authorizationService.getProjectMembers(projectId);

      res.json({
        members,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's role in project
   */
  async getUserRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const userId = req.user!.userId;

      const role = await authorizationService.getUserRole(userId, projectId);

      if (!role) {
        res.json({ role: null, permissions: [] });
        return;
      }

      const permissions = authorizationService.getRolePermissions(role);

      res.json({
        role,
        permissions,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ProjectController();
