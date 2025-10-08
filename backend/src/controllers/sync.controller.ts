import { Request, Response, NextFunction } from "express";
import syncService from "../services/sync.service";
import { ValidationError } from "../utils/errors";

class SyncController {
  /**
   * Manually trigger sync for a connection and environment
   */
  async triggerSync(req: Request, res: Response, next: NextFunction) {
    try {
      const { connectionId } = req.params;
      const { environmentId } = req.body;

      if (!environmentId) {
        throw new ValidationError("environmentId is required");
      }

      const result = await syncService.triggerSync(connectionId, environmentId);

      res.json({
        success: result.success,
        syncedCount: result.syncedCount,
        errors: result.errors,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get sync status for a connection
   */
  async getSyncStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { connectionId } = req.params;

      const status = await syncService.getSyncStatus(connectionId);

      res.json(status);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get sync logs for an environment
   */
  async getSyncLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const { environmentId } = req.params;
      const { connectionId, success, startDate, endDate } = req.query;

      const filters: any = {};

      if (connectionId) {
        filters.connectionId = connectionId as string;
      }

      if (success !== undefined) {
        filters.success = success === "true";
      }

      if (startDate) {
        filters.startDate = new Date(startDate as string);
      }

      if (endDate) {
        filters.endDate = new Date(endDate as string);
      }

      const logs = await syncService.getSyncLogs(environmentId, filters);

      res.json(logs);
    } catch (error) {
      next(error);
    }
  }
}

export default new SyncController();
