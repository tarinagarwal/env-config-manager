import { Request, Response, NextFunction } from "express";
import variableService from "../services/variable.service";
import { z } from "zod";
import { validate } from "../utils/validation";

const createVariableSchema = z.object({
  key: z
    .string()
    .min(1, "Variable key is required")
    .max(255, "Variable key must be less than 255 characters"),
  value: z.string(),
  isSecret: z.boolean().default(false),
});

const updateVariableSchema = z.object({
  value: z.string(),
});

class VariableController {
  /**
   * Create a new variable
   */
  async createVariable(req: Request, res: Response, next: NextFunction) {
    try {
      const { environmentId } = req.params;
      const userId = req.user!.userId;
      const data = validate(createVariableSchema, req.body);

      const variable = await variableService.createVariable(
        environmentId,
        userId,
        data
      );

      res.status(201).json({
        message: "Variable created successfully",
        variable,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all variables for an environment
   */
  async getVariables(req: Request, res: Response, next: NextFunction) {
    try {
      const { environmentId } = req.params;
      const includeDeleted = req.query.includeDeleted === "true";
      const revealSecrets = req.query.revealSecrets === "true";

      const variables = await variableService.getVariables(
        environmentId,
        includeDeleted,
        revealSecrets
      );

      res.json({
        variables,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single variable by ID
   */
  async getVariable(req: Request, res: Response, next: NextFunction) {
    try {
      const { variableId } = req.params;
      const revealSecret = req.query.revealSecret === "true";

      const variable = await variableService.getVariableById(
        variableId,
        revealSecret
      );

      res.json({
        variable,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a variable value
   */
  async updateVariable(req: Request, res: Response, next: NextFunction) {
    try {
      const { variableId } = req.params;
      const userId = req.user!.userId;
      const data = validate(updateVariableSchema, req.body);

      const variable = await variableService.updateVariable(
        variableId,
        userId,
        data
      );

      res.json({
        message: "Variable updated successfully",
        variable,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a variable (soft delete)
   */
  async deleteVariable(req: Request, res: Response, next: NextFunction) {
    try {
      const { variableId } = req.params;
      const userId = req.user!.userId;

      await variableService.deleteVariable(variableId, userId);

      res.json({
        message: "Variable deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk copy variables from one environment to another
   */
  async bulkCopyVariables(req: Request, res: Response, next: NextFunction) {
    try {
      const { sourceEnvironmentId, targetEnvironmentId } = req.body;
      const variableIds = req.body.variableIds as string[] | undefined;
      const userId = req.user!.userId;

      if (!sourceEnvironmentId || !targetEnvironmentId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "sourceEnvironmentId and targetEnvironmentId are required",
          },
        });
      }

      const result = await variableService.bulkCopyVariables(
        sourceEnvironmentId,
        targetEnvironmentId,
        userId,
        variableIds
      );

      res.json({
        message: "Variables copied successfully",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk update variables
   */
  async bulkUpdateVariables(req: Request, res: Response, next: NextFunction) {
    try {
      const { updates } = req.body;
      const userId = req.user!.userId;

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "updates array is required and must not be empty",
          },
        });
      }

      const result = await variableService.bulkUpdateVariables(updates, userId);

      res.json({
        message: "Bulk update completed",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get version history for a specific variable
   */
  async getVariableHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { variableId } = req.params;
      const revealSecrets = req.query.revealSecrets === "true";

      // Parse filters from query params
      const filters: any = {};
      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }
      if (req.query.userId) {
        filters.userId = req.query.userId as string;
      }

      const history = await variableService.getVariableHistory(
        variableId,
        filters,
        revealSecrets
      );

      res.json({
        history,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get version history for all variables in an environment
   */
  async getEnvironmentHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { environmentId } = req.params;
      const revealSecrets = req.query.revealSecrets === "true";

      // Parse filters from query params
      const filters: any = {};
      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }
      if (req.query.userId) {
        filters.userId = req.query.userId as string;
      }
      if (req.query.variableKey) {
        filters.variableKey = req.query.variableKey as string;
      }

      const history = await variableService.getEnvironmentHistory(
        environmentId,
        filters,
        revealSecrets
      );

      res.json({
        history,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Rollback a variable to a previous version
   */
  async rollbackVariable(req: Request, res: Response, next: NextFunction) {
    try {
      const { variableId, versionId } = req.params;
      const userId = req.user!.userId;

      const variable = await variableService.rollbackVariable(
        variableId,
        versionId,
        userId
      );

      res.json({
        message: "Variable rolled back successfully",
        variable,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new VariableController();
