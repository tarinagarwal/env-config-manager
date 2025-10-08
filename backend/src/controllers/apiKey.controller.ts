import { Request, Response, NextFunction } from "express";
import apiKeyService, { CreateApiKeyDto } from "../services/apiKey.service";
import auditService from "../services/audit.service";

class ApiKeyController {
  /**
   * Create a new API key
   * POST /api/v1/api-keys
   */
  async createApiKey(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const data: CreateApiKeyDto = req.body;

      const apiKey = await apiKeyService.createApiKey(userId, data);

      // Log audit event
      await auditService.log({
        userId,
        action: "api_key.created",
        resourceType: "api_key",
        resourceId: apiKey.id,
        metadata: {
          name: apiKey.name,
          scopes: apiKey.scopes,
          expiresAt: apiKey.expiresAt,
        },
        ipAddress: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: new Date(),
      });

      res.status(201).json({
        success: true,
        data: apiKey,
        message:
          "API key created successfully. Make sure to save it - you won't be able to see it again!",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List all API keys for the authenticated user
   * GET /api/v1/api-keys
   */
  async listApiKeys(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const apiKeys = await apiKeyService.listApiKeys(userId);

      res.json({
        success: true,
        data: apiKeys,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete an API key
   * DELETE /api/v1/api-keys/:id
   */
  async deleteApiKey(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const keyId = req.params.id;

      await apiKeyService.deleteApiKey(userId, keyId);

      // Log audit event
      await auditService.log({
        userId,
        action: "api_key.deleted",
        resourceType: "api_key",
        resourceId: keyId,
        metadata: {},
        ipAddress: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: new Date(),
      });

      res.json({
        success: true,
        message: "API key deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ApiKeyController();
