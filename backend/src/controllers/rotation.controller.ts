import { Request, Response, NextFunction } from "express";
import secretRotationService from "../services/secretRotation.service";

export class RotationController {
  /**
   * Enable rotation for a variable
   */
  enableRotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { variableId } = req.params;
      const { rotationIntervalDays } = req.body;

      if (!rotationIntervalDays || typeof rotationIntervalDays !== "number") {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "rotationIntervalDays is required and must be a number",
          },
        });
      }

      await secretRotationService.enableRotation(
        variableId,
        rotationIntervalDays
      );

      res.status(200).json({
        message: "Rotation enabled successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Disable rotation for a variable
   */
  disableRotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { variableId } = req.params;

      await secretRotationService.disableRotation(variableId);

      res.status(200).json({
        message: "Rotation disabled successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update rotation interval
   */
  updateRotationInterval = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { variableId } = req.params;
      const { rotationIntervalDays } = req.body;

      if (!rotationIntervalDays || typeof rotationIntervalDays !== "number") {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "rotationIntervalDays is required and must be a number",
          },
        });
      }

      await secretRotationService.updateRotationInterval(
        variableId,
        rotationIntervalDays
      );

      res.status(200).json({
        message: "Rotation interval updated successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get rotation configuration
   */
  getRotationConfig = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { variableId } = req.params;

      const config = await secretRotationService.getRotationConfig(variableId);

      res.status(200).json(config);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Trigger manual notification for a variable
   */
  triggerNotification = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { variableId } = req.params;

      const rotationNotificationService = (
        await import("../services/rotationNotification.service")
      ).default;
      const success = await rotationNotificationService.triggerNotification(
        variableId
      );

      if (success) {
        res.status(200).json({
          message: "Notification sent successfully",
        });
      } else {
        res.status(400).json({
          error: {
            code: "NOTIFICATION_FAILED",
            message: "Failed to send notification",
          },
        });
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * Execute rotation for a variable
   */
  executeRotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { variableId } = req.params;
      const { providerConfig } = req.body;
      const userId = (req as any).user?.userId;

      const rotationExecutionService = (
        await import("../services/rotationExecution.service")
      ).default;

      const result = await rotationExecutionService.rotateVariable(
        variableId,
        providerConfig,
        userId
      );

      if (result.success) {
        res.status(200).json({
          message: "Secret rotated successfully",
          variableId: result.variableId,
        });
      } else {
        res.status(400).json({
          error: {
            code: "ROTATION_FAILED",
            message: result.errorMessage || "Failed to rotate secret",
          },
        });
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get rotation history for a variable
   */
  getRotationHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { variableId } = req.params;

      const rotationExecutionService = (
        await import("../services/rotationExecution.service")
      ).default;

      const history = await rotationExecutionService.getRotationHistory(
        variableId
      );

      res.status(200).json(history);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get rotation statistics
   */
  getRotationStats = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { projectId } = req.query;

      const rotationExecutionService = (
        await import("../services/rotationExecution.service")
      ).default;

      const stats = await rotationExecutionService.getRotationStats(
        projectId as string | undefined
      );

      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get failure statistics
   */
  getFailureStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.query;

      const rotationFailureHandler = (
        await import("../services/rotationFailureHandler.service")
      ).default;

      const stats = await rotationFailureHandler.getFailureStats(
        projectId as string | undefined
      );

      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get pending retries
   */
  getPendingRetries = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const rotationFailureHandler = (
        await import("../services/rotationFailureHandler.service")
      ).default;

      const retries = await rotationFailureHandler.getPendingRetries();

      res.status(200).json(retries);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Process pending retries manually
   */
  processPendingRetries = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const rotationFailureHandler = (
        await import("../services/rotationFailureHandler.service")
      ).default;

      const result = await rotationFailureHandler.processPendingRetries();

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export default new RotationController();
