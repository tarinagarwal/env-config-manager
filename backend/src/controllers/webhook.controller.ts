import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { NotFoundError, ValidationError } from "../utils/errors";

export class WebhookController {
  /**
   * Create webhook configuration
   */
  async createWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const { url, events } = req.body;

      if (!url || !events || !Array.isArray(events)) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "url and events array are required",
          },
        });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "Invalid URL format",
          },
        });
      }

      const webhook = await prisma.webhookConfig.create({
        data: {
          projectId,
          url,
          events,
        },
      });

      res.status(201).json(webhook);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get webhooks for a project
   */
  async getWebhooks(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;

      const webhooks = await prisma.webhookConfig.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json(webhooks);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const { webhookId } = req.params;
      const { url, events, enabled } = req.body;

      const updateData: any = {};

      if (url !== undefined) {
        try {
          new URL(url);
          updateData.url = url;
        } catch {
          return res.status(400).json({
            error: {
              code: "VALIDATION_INVALID_INPUT",
              message: "Invalid URL format",
            },
          });
        }
      }

      if (events !== undefined) {
        if (!Array.isArray(events)) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_INVALID_INPUT",
              message: "events must be an array",
            },
          });
        }
        updateData.events = events;
      }

      if (enabled !== undefined) {
        updateData.enabled = enabled;
      }

      const webhook = await prisma.webhookConfig.update({
        where: { id: webhookId },
        data: updateData,
      });

      res.status(200).json(webhook);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete webhook configuration
   */
  async deleteWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const { webhookId } = req.params;

      await prisma.webhookConfig.delete({
        where: { id: webhookId },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export default new WebhookController();
