import { Request, Response, NextFunction } from "express";
import auditService from "../services/audit.service";
import auditRetentionService from "../services/auditRetention.service";
import { AuditFilters } from "../types/audit.types";
import { ValidationError } from "../utils/errors";

class AuditController {
  /**
   * Query audit logs with filtering
   * GET /api/v1/audit-logs
   */
  async queryLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const filters: AuditFilters = {};

      // Parse query parameters
      if (req.query.userId) {
        filters.userId = req.query.userId as string;
      }

      if (req.query.action) {
        filters.action = req.query.action as string;
      }

      if (req.query.resourceType) {
        filters.resourceType = req.query.resourceType as string;
      }

      if (req.query.resourceId) {
        filters.resourceId = req.query.resourceId as string;
      }

      if (req.query.severity) {
        const severity = req.query.severity as string;
        if (!["info", "warning", "critical"].includes(severity)) {
          throw new ValidationError("Invalid severity value");
        }
        filters.severity = severity as "info" | "warning" | "critical";
      }

      if (req.query.startDate) {
        const startDate = new Date(req.query.startDate as string);
        if (isNaN(startDate.getTime())) {
          throw new ValidationError("Invalid startDate format");
        }
        filters.startDate = startDate;
      }

      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate as string);
        if (isNaN(endDate.getTime())) {
          throw new ValidationError("Invalid endDate format");
        }
        filters.endDate = endDate;
      }

      const logs = await auditService.query(filters);

      res.json({
        success: true,
        data: logs,
        count: logs.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export audit logs
   * GET /api/v1/audit-logs/export
   */
  async exportLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const format = (req.query.format as string) || "json";

      if (!["json", "csv"].includes(format)) {
        throw new ValidationError("Invalid format. Must be 'json' or 'csv'");
      }

      const filters: AuditFilters = {};

      // Parse query parameters (same as queryLogs)
      if (req.query.userId) {
        filters.userId = req.query.userId as string;
      }

      if (req.query.action) {
        filters.action = req.query.action as string;
      }

      if (req.query.resourceType) {
        filters.resourceType = req.query.resourceType as string;
      }

      if (req.query.resourceId) {
        filters.resourceId = req.query.resourceId as string;
      }

      if (req.query.severity) {
        const severity = req.query.severity as string;
        if (!["info", "warning", "critical"].includes(severity)) {
          throw new ValidationError("Invalid severity value");
        }
        filters.severity = severity as "info" | "warning" | "critical";
      }

      if (req.query.startDate) {
        const startDate = new Date(req.query.startDate as string);
        if (isNaN(startDate.getTime())) {
          throw new ValidationError("Invalid startDate format");
        }
        filters.startDate = startDate;
      }

      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate as string);
        if (isNaN(endDate.getTime())) {
          throw new ValidationError("Invalid endDate format");
        }
        filters.endDate = endDate;
      }

      const exportData = await auditService.export(
        filters,
        format as "json" | "csv"
      );

      // Set appropriate headers
      const contentType = format === "json" ? "application/json" : "text/csv";
      const filename = `audit-logs-${new Date().toISOString()}.${format}`;

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.send(exportData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get retention information for current user
   * GET /api/v1/audit-logs/retention
   */
  async getRetentionInfo(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        throw new ValidationError("User not authenticated");
      }

      const info = await auditRetentionService.getRetentionInfo(
        req.user.userId
      );

      res.json({
        success: true,
        data: info,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Manually trigger retention enforcement for current user
   * POST /api/v1/audit-logs/retention/enforce
   */
  async enforceRetention(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        throw new ValidationError("User not authenticated");
      }

      const deleted = await auditRetentionService.enforceRetentionForUser(
        req.user.userId
      );

      res.json({
        success: true,
        data: {
          deletedCount: deleted,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuditController();

export default new AuditController();
