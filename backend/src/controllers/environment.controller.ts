import { Request, Response, NextFunction } from "express";
import environmentService from "../services/environment.service";
import billingService from "../services/billing.service";
import { ValidationError } from "../utils/errors";
import { z } from "zod";
import { validate } from "../utils/validation";

const createEnvironmentSchema = z.object({
  name: z
    .string()
    .min(1, "Environment name is required")
    .max(50, "Environment name must be less than 50 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Environment name can only contain letters, numbers, hyphens, and underscores"
    ),
});

class EnvironmentController {
  /**
   * Create a new environment
   */
  async createEnvironment(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const userId = req.user!.userId;
      const data = validate(createEnvironmentSchema, req.body);

      // Check plan limits
      await billingService.requireCanCreateEnvironment(userId, projectId);

      const environment = await environmentService.createEnvironment(
        projectId,
        data
      );

      res.status(201).json({
        message: "Environment created successfully",
        environment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all environments for a project
   */
  async getEnvironments(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const environments = await environmentService.getEnvironments(projectId);

      res.json({
        environments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single environment by ID
   */
  async getEnvironment(req: Request, res: Response, next: NextFunction) {
    try {
      const { environmentId } = req.params;
      const environment = await environmentService.getEnvironmentById(
        environmentId
      );

      res.json({
        environment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete an environment
   */
  async deleteEnvironment(req: Request, res: Response, next: NextFunction) {
    try {
      const { environmentId } = req.params;

      await environmentService.deleteEnvironment(environmentId);

      res.json({
        message: "Environment deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new EnvironmentController();
