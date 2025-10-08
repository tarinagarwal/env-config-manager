import prisma from "../lib/prisma";
import redis from "../lib/redis";

interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
}

interface FailureAlert {
  variableId: string;
  variableKey: string;
  projectName: string;
  environmentName: string;
  errorMessage: string;
  attemptCount: number;
  timestamp: Date;
}

class RotationFailureHandlerService {
  private readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    retryDelayMs: 60000, // 1 minute
    backoffMultiplier: 2,
  };

  /**
   * Handle rotation failure with retry logic
   */
  async handleFailure(
    variableId: string,
    errorMessage: string,
    attemptCount: number = 1
  ): Promise<void> {
    // Log the failure
    await this.logFailure(variableId, errorMessage, attemptCount);

    // Check if we should retry
    if (attemptCount < this.DEFAULT_RETRY_CONFIG.maxRetries) {
      // Schedule retry
      await this.scheduleRetry(variableId, attemptCount);
    } else {
      // Max retries reached, alert users
      await this.alertUsers(variableId, errorMessage, attemptCount);
    }
  }

  /**
   * Log rotation failure
   */
  private async logFailure(
    variableId: string,
    errorMessage: string,
    attemptCount: number
  ): Promise<void> {
    try {
      // Log to rotation log
      await prisma.rotationLog.create({
        data: {
          variableId,
          status: "failed",
          errorMessage: `Attempt ${attemptCount}: ${errorMessage}`,
          rotatedBy: "system",
        },
      });

      // Log to audit log with critical severity if max retries reached
      const severity =
        attemptCount >= this.DEFAULT_RETRY_CONFIG.maxRetries
          ? "critical"
          : "warning";

      await prisma.auditLog.create({
        data: {
          action: "rotation_failure",
          resourceType: "variable",
          resourceId: variableId,
          metadata: {
            errorMessage,
            attemptCount,
            maxRetries: this.DEFAULT_RETRY_CONFIG.maxRetries,
          },
          severity,
        },
      });
    } catch (error) {
      console.error("Failed to log rotation failure:", error);
    }
  }

  /**
   * Schedule retry with exponential backoff
   */
  private async scheduleRetry(
    variableId: string,
    attemptCount: number
  ): Promise<void> {
    try {
      const delay =
        this.DEFAULT_RETRY_CONFIG.retryDelayMs *
        Math.pow(this.DEFAULT_RETRY_CONFIG.backoffMultiplier, attemptCount - 1);

      // Store retry info in Redis
      const retryKey = `rotation:retry:${variableId}`;
      const retryData = JSON.stringify({
        variableId,
        attemptCount: attemptCount + 1,
        scheduledAt: new Date().toISOString(),
        executeAt: new Date(Date.now() + delay).toISOString(),
      });

      await redis.setEx(retryKey, Math.ceil(delay / 1000), retryData);

      console.log(
        `Scheduled retry for variable ${variableId} in ${delay}ms (attempt ${
          attemptCount + 1
        })`
      );
    } catch (error) {
      console.error("Failed to schedule retry:", error);
    }
  }

  /**
   * Alert designated users about rotation failure
   */
  private async alertUsers(
    variableId: string,
    errorMessage: string,
    attemptCount: number
  ): Promise<void> {
    try {
      // Get variable with project and environment info
      const variable = await prisma.variable.findUnique({
        where: { id: variableId },
        include: {
          environment: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  ownerId: true,
                  owner: {
                    select: {
                      id: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!variable) {
        return;
      }

      const alert: FailureAlert = {
        variableId: variable.id,
        variableKey: variable.key,
        projectName: variable.environment.project.name,
        environmentName: variable.environment.name,
        errorMessage,
        attemptCount,
        timestamp: new Date(),
      };

      // Send alert via webhook if configured
      await this.sendWebhookAlert(variable.environment.project.id, alert);

      // Log alert
      console.error(
        `ROTATION FAILURE ALERT: Variable ${variable.key} in ${variable.environment.project.name}/${variable.environment.name} failed after ${attemptCount} attempts: ${errorMessage}`
      );
    } catch (error) {
      console.error("Failed to alert users:", error);
    }
  }

  /**
   * Send alert via webhook
   */
  private async sendWebhookAlert(
    projectId: string,
    alert: FailureAlert
  ): Promise<void> {
    try {
      // Get webhook configuration for rotation failures
      const webhook = await prisma.webhookConfig.findFirst({
        where: {
          projectId,
          enabled: true,
          events: {
            has: "rotation_failed",
          },
        },
      });

      if (!webhook) {
        return;
      }

      const axios = (await import("axios")).default;

      const payload = {
        event: "rotation_failed",
        timestamp: new Date().toISOString(),
        data: {
          variableId: alert.variableId,
          variableKey: alert.variableKey,
          projectName: alert.projectName,
          environmentName: alert.environmentName,
          errorMessage: alert.errorMessage,
          attemptCount: alert.attemptCount,
        },
      };

      await axios.post(webhook.url, payload, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "EnvConfigManager/1.0",
        },
        timeout: 10000,
      });

      console.log(
        `Sent failure alert webhook for variable ${alert.variableId}`
      );
    } catch (error) {
      console.error("Failed to send webhook alert:", error);
    }
  }

  /**
   * Get pending retries
   */
  async getPendingRetries(): Promise<any[]> {
    try {
      // In a real implementation, this would scan Redis for retry keys
      // For now, we'll return an empty array
      const keys = await redis.keys("rotation:retry:*");
      const retries = [];

      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          retries.push(JSON.parse(data));
        }
      }

      return retries;
    } catch (error) {
      console.error("Failed to get pending retries:", error);
      return [];
    }
  }

  /**
   * Process pending retries
   */
  async processPendingRetries(): Promise<{
    processedCount: number;
    successCount: number;
    failedCount: number;
  }> {
    const retries = await this.getPendingRetries();
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const retry of retries) {
      const executeAt = new Date(retry.executeAt);
      const now = new Date();

      // Check if it's time to execute
      if (executeAt <= now) {
        processedCount++;

        try {
          // Import rotation execution service
          const rotationExecutionService = (
            await import("./rotationExecution.service")
          ).default;

          // Execute rotation
          const result = await rotationExecutionService.rotateVariable(
            retry.variableId
          );

          if (result.success) {
            successCount++;
            // Remove retry from Redis
            await redis.del(`rotation:retry:${retry.variableId}`);
          } else {
            failedCount++;
            // Handle failure again (will schedule another retry or alert)
            await this.handleFailure(
              retry.variableId,
              result.errorMessage || "Unknown error",
              retry.attemptCount
            );
          }
        } catch (error) {
          failedCount++;
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          await this.handleFailure(
            retry.variableId,
            errorMessage,
            retry.attemptCount
          );
        }
      }
    }

    return {
      processedCount,
      successCount,
      failedCount,
    };
  }

  /**
   * Get failure statistics
   */
  async getFailureStats(projectId?: string): Promise<{
    totalFailures: number;
    recentFailures: number;
    pendingRetries: number;
  }> {
    let where: any = { status: "failed" };

    if (projectId) {
      // Get all variables for this project
      const variables = await prisma.variable.findMany({
        where: {
          environment: {
            projectId,
          },
        },
        select: { id: true },
      });

      const variableIds = variables.map((v: { id: string }) => v.id);
      where.variableId = { in: variableIds };
    }

    const [totalFailures, recentFailures] = await Promise.all([
      prisma.rotationLog.count({ where }),
      prisma.rotationLog.count({
        where: {
          ...where,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    const pendingRetries = (await this.getPendingRetries()).length;

    return {
      totalFailures,
      recentFailures,
      pendingRetries,
    };
  }

  /**
   * Clear retry for a variable
   */
  async clearRetry(variableId: string): Promise<void> {
    try {
      await redis.del(`rotation:retry:${variableId}`);
    } catch (error) {
      console.error("Failed to clear retry:", error);
    }
  }
}

export default new RotationFailureHandlerService();
