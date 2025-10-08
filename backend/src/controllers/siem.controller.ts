import { Request, Response, NextFunction } from "express";
import siemIntegrationService from "../services/siemIntegration.service";
import { ValidationError } from "../utils/errors";

class SiemController {
  /**
   * Create SIEM webhook configuration
   * POST /api/v1/siem/webhooks
   */
  async createWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        throw new ValidationError("User not authenticated");
      }

      const { name, webhookUrl, eventFilters } = req.body;

      if (!name || !webhookUrl) {
        throw new ValidationError("Name and webhookUrl are required");
      }

      const webhook = await siemIntegrationService.createWebhook(
        req.user.userId,
        name,
        webhookUrl,
        eventFilters
      );

      res.status(201).json({
        success: true,
        data: webhook,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get SIEM webhooks
   * GET /api/v1/siem/webhooks
   */
  async getWebhooks(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        throw new ValidationError("User not authenticated");
      }

      const webhooks = await siemIntegrationService.getWebhooks(
        req.user.userId
      );

      res.json({
        success: true,
        data: webhooks,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete SIEM webhook
   * DELETE /api/v1/siem/webhooks/:id
   */
  async deleteWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        throw new ValidationError("User not authenticated");
      }

      const { id } = req.params;

      await siemIntegrationService.deleteWebhook(req.user.userId, id);

      res.json({
        success: true,
        message: "Webhook deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test SIEM webhook
   * POST /api/v1/siem/webhooks/test
   */
  async testWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const { webhookUrl } = req.body;

      if (!webhookUrl) {
        throw new ValidationError("webhookUrl is required");
      }

      const success = await siemIntegrationService.testWebhook(webhookUrl);

      res.json({
        success,
        message: success ? "Webhook test successful" : "Webhook test failed",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Stream audit logs for SIEM tools
   * GET /api/v1/siem/audit-stream
   */
  async streamAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        throw new ValidationError("User not authenticated");
      }

      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (req.query.startDate) {
        startDate = new Date(req.query.startDate as string);
        if (isNaN(startDate.getTime())) {
          throw new ValidationError("Invalid startDate format");
        }
      }

      if (req.query.endDate) {
        endDate = new Date(req.query.endDate as string);
        if (isNaN(endDate.getTime())) {
          throw new ValidationError("Invalid endDate format");
        }
      }

      const logs = await siemIntegrationService.streamAuditLogs(
        req.user.userId,
        startDate,
        endDate
      );

      res.json({
        success: true,
        data: logs,
        count: logs.length,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new SiemController();
