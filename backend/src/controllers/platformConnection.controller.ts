import { Request, Response, NextFunction } from "express";
import platformConnectionService from "../services/platformConnection.service";
import { ValidationError } from "../utils/errors";

class PlatformConnectionController {
  /**
   * Create a new platform connection
   */
  async createConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const { platform, credentials, targetResource } = req.body;

      if (!platform || !credentials || !targetResource) {
        throw new ValidationError(
          "platform, credentials, and targetResource are required"
        );
      }

      const connection = await platformConnectionService.createConnection(
        projectId,
        {
          platform,
          credentials,
          targetResource,
        }
      );

      res.status(201).json(connection);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all connections for a project
   */
  async getConnections(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;

      const connections = await platformConnectionService.getConnections(
        projectId
      );

      res.json(connections);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single connection by ID
   */
  async getConnectionById(req: Request, res: Response, next: NextFunction) {
    try {
      const { connectionId } = req.params;

      const connection = await platformConnectionService.getConnectionById(
        connectionId
      );

      res.json(connection);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a platform connection
   */
  async deleteConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const { connectionId } = req.params;

      const result = await platformConnectionService.deleteConnection(
        connectionId
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test a platform connection
   */
  async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const { connectionId } = req.params;

      const result = await platformConnectionService.testConnection(
        connectionId
      );

      res.json({
        success: result,
        message: result
          ? "Connection test successful"
          : "Connection test failed",
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new PlatformConnectionController();
