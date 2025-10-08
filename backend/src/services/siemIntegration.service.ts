import prisma from "../lib/prisma";
import auditService from "./audit.service";
import { AuditEvent } from "../types/audit.types";
import { ForbiddenError, NotFoundError } from "../utils/errors";

interface SiemWebhook {
  id: string;
  userId: string;
  name: string;
  webhookUrl: string;
  enabled: boolean;
  eventFilters?: string[]; // Filter by specific event types
  createdAt: Date;
  updatedAt: Date;
}

class SiemIntegrationService {
  /**
   * Create a SIEM webhook configuration (Enterprise only)
   */
  async createWebhook(
    userId: string,
    name: string,
    webhookUrl: string,
    eventFilters?: string[]
  ): Promise<SiemWebhook> {
    // Check if user has Enterprise plan
    await this.checkEnterprisePlan(userId);

    // Store webhook configuration in user metadata or separate collection
    // For now, we'll use a simple approach with user metadata
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User");
    }

    // In a real implementation, you'd want a separate SiemWebhook model
    // For this implementation, we'll return a mock structure
    const webhook: SiemWebhook = {
      id: `siem_${Date.now()}`,
      userId,
      name,
      webhookUrl,
      enabled: true,
      eventFilters,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return webhook;
  }

  /**
   * Trigger SIEM webhook for an audit event
   */
  async triggerWebhook(event: AuditEvent, webhookUrl: string): Promise<void> {
    await auditService.triggerSiemWebhook(event, webhookUrl);
  }

  /**
   * Get SIEM webhook configuration for a user
   */
  async getWebhooks(userId: string): Promise<SiemWebhook[]> {
    await this.checkEnterprisePlan(userId);

    // In a real implementation, fetch from database
    // For now, return empty array
    return [];
  }

  /**
   * Delete a SIEM webhook
   */
  async deleteWebhook(userId: string, webhookId: string): Promise<void> {
    await this.checkEnterprisePlan(userId);

    // In a real implementation, delete from database
  }

  /**
   * Test a SIEM webhook
   */
  async testWebhook(webhookUrl: string): Promise<boolean> {
    try {
      const testEvent: AuditEvent = {
        action: "test.webhook",
        resourceType: "user",
        timestamp: new Date(),
        metadata: {
          test: true,
          message:
            "This is a test event from Environment Configuration Manager",
        },
      };

      await auditService.triggerSiemWebhook(testEvent, webhookUrl);
      return true;
    } catch (error) {
      console.error("Webhook test failed:", error);
      return false;
    }
  }

  /**
   * Check if user has Enterprise plan
   */
  private async checkEnterprisePlan(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.subscription?.plan !== "enterprise") {
      throw new ForbiddenError(
        "SIEM integration is only available for Enterprise plan"
      );
    }
  }

  /**
   * Stream audit logs via API for SIEM tools (Enterprise only)
   */
  async streamAuditLogs(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    await this.checkEnterprisePlan(userId);

    const filters: any = { userId };

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.gte = startDate;
      if (endDate) filters.createdAt.lte = endDate;
    }

    const logs = await prisma.auditLog.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      take: 10000, // Limit for streaming
    });

    return logs.map((log) => ({
      id: log.id,
      timestamp: log.createdAt.toISOString(),
      userId: log.userId,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      severity: log.severity,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      metadata: log.metadata,
    }));
  }
}

export default new SiemIntegrationService();
