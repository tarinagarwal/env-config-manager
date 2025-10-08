import prisma from "../lib/prisma";
import { AuditEvent, AuditLog, AuditFilters } from "../types/audit.types";

class AuditService {
  /**
   * Log an audit event
   */
  async log(event: AuditEvent): Promise<void> {
    try {
      const severity = this.determineSeverity(event.action);

      await prisma.auditLog.create({
        data: {
          userId: event.userId,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          metadata: event.metadata || {},
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          severity,
          createdAt: event.timestamp,
        },
      });
    } catch (error) {
      // Don't throw errors from audit logging to avoid breaking the main flow
      console.error("Failed to log audit event:", error);
    }
  }

  /**
   * Query audit logs with filtering
   */
  async query(filters: AuditFilters): Promise<AuditLog[]> {
    const where: any = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.resourceType) {
      where.resourceType = filters.resourceType;
    }

    if (filters.resourceId) {
      where.resourceId = filters.resourceId;
    }

    if (filters.severity) {
      where.severity = filters.severity;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take: 1000, // Limit to 1000 results
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      userId: log.userId || undefined,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId || undefined,
      metadata: (log.metadata as Record<string, any>) || undefined,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
      severity: log.severity as "info" | "warning" | "critical",
      timestamp: log.createdAt,
    }));
  }

  /**
   * Export audit logs in JSON or CSV format
   */
  async export(filters: AuditFilters, format: "json" | "csv"): Promise<string> {
    const logs = await this.query(filters);

    if (format === "json") {
      return JSON.stringify(logs, null, 2);
    } else {
      // CSV format
      const headers = [
        "ID",
        "User ID",
        "Action",
        "Resource Type",
        "Resource ID",
        "Severity",
        "IP Address",
        "User Agent",
        "Timestamp",
      ];

      const rows = logs.map((log) => [
        log.id,
        log.userId || "",
        log.action,
        log.resourceType,
        log.resourceId || "",
        log.severity,
        log.ipAddress || "",
        log.userAgent || "",
        log.timestamp.toISOString(),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");

      return csvContent;
    }
  }

  /**
   * Delete old audit logs based on retention policy
   */
  async enforceRetention(userId: string, plan: string): Promise<number> {
    const retentionDays = this.getRetentionDays(plan);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.auditLog.deleteMany({
      where: {
        userId,
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Get retention days based on subscription plan
   */
  private getRetentionDays(plan: string): number {
    switch (plan) {
      case "enterprise":
        return 730; // 2 years
      case "team":
        return 90; // 90 days
      case "pro":
        return 30; // 30 days
      case "free":
      default:
        return 30; // 30 days
    }
  }

  /**
   * Determine severity based on action
   */
  private determineSeverity(action: string): "info" | "warning" | "critical" {
    // Critical security events
    if (
      action.includes("failed") ||
      action.includes("unauthorized") ||
      action === "auth.2fa.disable" ||
      action === "project.delete" ||
      action === "rotation.failed"
    ) {
      return "critical";
    }

    // Warning events
    if (
      action.includes("delete") ||
      action.includes("secret.reveal") ||
      action.includes("member.remove")
    ) {
      return "warning";
    }

    // Default to info
    return "info";
  }

  /**
   * Trigger webhook for SIEM integration (Enterprise only)
   */
  async triggerSiemWebhook(
    event: AuditEvent,
    webhookUrl: string
  ): Promise<void> {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: event.action,
          timestamp: event.timestamp.toISOString(),
          userId: event.userId,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          metadata: event.metadata,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          severity: this.determineSeverity(event.action),
        }),
      });

      if (!response.ok) {
        console.error("SIEM webhook failed:", response.statusText);
      }
    } catch (error) {
      console.error("Failed to trigger SIEM webhook:", error);
    }
  }
}

export default new AuditService();
