import prisma from "../lib/prisma";
import axios from "axios";

interface RotationNotification {
  variableId: string;
  variableKey: string;
  environmentName: string;
  projectName: string;
  nextRotationAt: Date;
  rotationIntervalDays: number;
}

interface WebhookPayload {
  event: "rotation_due";
  timestamp: string;
  data: {
    variableId: string;
    variableKey: string;
    environmentName: string;
    projectName: string;
    nextRotationAt: string;
    rotationIntervalDays: number;
  };
}

class RotationNotificationService {
  /**
   * Send rotation notification via webhook
   */
  async sendWebhookNotification(
    webhookUrl: string,
    notification: RotationNotification
  ): Promise<boolean> {
    try {
      const payload: WebhookPayload = {
        event: "rotation_due",
        timestamp: new Date().toISOString(),
        data: {
          variableId: notification.variableId,
          variableKey: notification.variableKey,
          environmentName: notification.environmentName,
          projectName: notification.projectName,
          nextRotationAt: notification.nextRotationAt.toISOString(),
          rotationIntervalDays: notification.rotationIntervalDays,
        },
      };

      const response = await axios.post(webhookUrl, payload, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "EnvConfigManager/1.0",
        },
        timeout: 10000, // 10 second timeout
      });

      return response.status >= 200 && response.status < 300;
    } catch (error) {
      console.error("Failed to send webhook notification:", error);
      return false;
    }
  }

  /**
   * Check for variables due for rotation and send notifications
   */
  async checkAndNotify(): Promise<{
    notifiedCount: number;
    failedCount: number;
  }> {
    const now = new Date();
    const notificationWindow = new Date();
    // Notify 24 hours before rotation is due
    notificationWindow.setHours(notificationWindow.getHours() + 24);

    const variablesDue = await prisma.variable.findMany({
      where: {
        rotationEnabled: true,
        nextRotationAt: {
          gte: now,
          lte: notificationWindow,
        },
        deletedAt: null,
      },
      include: {
        environment: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                ownerId: true,
              },
            },
          },
        },
      },
    });

    let notifiedCount = 0;
    let failedCount = 0;

    for (const variable of variablesDue) {
      // Check if we have a webhook configured for this project
      const webhookConfig = await this.getProjectWebhook(
        variable.environment.project.id
      );

      if (webhookConfig) {
        const notification: RotationNotification = {
          variableId: variable.id,
          variableKey: variable.key,
          environmentName: variable.environment.name,
          projectName: variable.environment.project.name,
          nextRotationAt: variable.nextRotationAt!,
          rotationIntervalDays: variable.rotationIntervalDays!,
        };

        const success = await this.sendWebhookNotification(
          webhookConfig.url,
          notification
        );

        if (success) {
          notifiedCount++;
          // Log the notification
          await this.logNotification(variable.id, "webhook", true);
        } else {
          failedCount++;
          await this.logNotification(variable.id, "webhook", false);
        }
      }
    }

    return { notifiedCount, failedCount };
  }

  /**
   * Get webhook configuration for a project
   */
  private async getProjectWebhook(
    projectId: string
  ): Promise<{ url: string } | null> {
    const webhook = await prisma.webhookConfig.findFirst({
      where: {
        projectId,
        enabled: true,
        events: {
          has: "rotation_due",
        },
      },
    });

    if (webhook) {
      return { url: webhook.url };
    }

    return null;
  }

  /**
   * Log notification attempt
   */
  private async logNotification(
    variableId: string,
    notificationType: string,
    success: boolean
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: "rotation_notification",
          resourceType: "variable",
          resourceId: variableId,
          metadata: {
            notificationType,
            success,
          },
          severity: success ? "info" : "warning",
        },
      });
    } catch (error) {
      console.error("Failed to log notification:", error);
    }
  }

  /**
   * Manually trigger notification for a variable
   */
  async triggerNotification(variableId: string): Promise<boolean> {
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      include: {
        environment: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (
      !variable ||
      variable.deletedAt ||
      !variable.rotationEnabled ||
      !variable.nextRotationAt
    ) {
      return false;
    }

    const webhookConfig = await this.getProjectWebhook(
      variable.environment.project.id
    );

    if (!webhookConfig) {
      return false;
    }

    const notification: RotationNotification = {
      variableId: variable.id,
      variableKey: variable.key,
      environmentName: variable.environment.name,
      projectName: variable.environment.project.name,
      nextRotationAt: variable.nextRotationAt,
      rotationIntervalDays: variable.rotationIntervalDays!,
    };

    const success = await this.sendWebhookNotification(
      webhookConfig.url,
      notification
    );

    await this.logNotification(variableId, "webhook_manual", success);

    return success;
  }
}

export default new RotationNotificationService();
