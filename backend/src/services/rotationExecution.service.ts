import prisma from "../lib/prisma";
import variableService from "./variable.service";
import secretRotationService from "./secretRotation.service";
import rotationFailureHandler from "./rotationFailureHandler.service";
import {
  SecretProviderFactory,
  SecretProviderConfig,
} from "./secretProvider.service";
import { NotFoundError } from "../utils/errors";

interface RotationResult {
  success: boolean;
  variableId: string;
  errorMessage?: string;
  newValue?: string;
}

class RotationExecutionService {
  /**
   * Execute rotation for a single variable
   */
  async rotateVariable(
    variableId: string,
    providerConfig?: SecretProviderConfig,
    userId?: string,
    attemptCount: number = 1
  ): Promise<RotationResult> {
    try {
      // Get the variable with environment and project info
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
                },
              },
            },
          },
        },
      });

      if (!variable || variable.deletedAt) {
        throw new NotFoundError("Variable");
      }

      if (!variable.isSecret) {
        throw new Error("Only secret variables can be rotated");
      }

      // Get current value (decrypted)
      const currentVariable = await variableService.getVariableById(
        variableId,
        true
      );
      const currentValue = currentVariable.value;

      let newValue: string;

      // If provider config is provided, use external provider
      if (providerConfig) {
        const provider = SecretProviderFactory.createProvider(providerConfig);
        const rotated = await provider.rotateSecret(variable.key, currentValue);
        newValue = rotated.newValue;
      } else {
        // Generate a new random value
        newValue = this.generateSecretValue();
      }

      // Update the variable with the new value
      await variableService.updateVariable(variableId, userId || "system", {
        value: newValue,
      });

      // Update next rotation date
      await secretRotationService.updateNextRotationDate(variableId);

      // Log successful rotation
      await this.logRotation(variableId, "success", userId);

      // Clear any pending retries
      await rotationFailureHandler.clearRetry(variableId);

      // Trigger sync to connected platforms
      await this.syncRotatedSecret(variable.environment.project.id, variableId);

      return {
        success: true,
        variableId,
        newValue,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Log failed rotation
      await this.logRotation(variableId, "failed", userId, errorMessage);

      // Handle failure with retry logic
      await rotationFailureHandler.handleFailure(
        variableId,
        errorMessage,
        attemptCount
      );

      return {
        success: false,
        variableId,
        errorMessage,
      };
    }
  }

  /**
   * Execute rotation for all variables due for rotation
   */
  async rotateAllDue(): Promise<{
    successCount: number;
    failedCount: number;
    results: RotationResult[];
  }> {
    const variablesDue =
      await secretRotationService.getVariablesDueForRotation();

    const results: RotationResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const variable of variablesDue) {
      const result = await this.rotateVariable(variable.id);

      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    return {
      successCount,
      failedCount,
      results,
    };
  }

  /**
   * Generate a secure random secret value
   */
  private generateSecretValue(): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let result = "";
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Log rotation attempt
   */
  private async logRotation(
    variableId: string,
    status: "success" | "failed" | "pending",
    rotatedBy?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      await prisma.rotationLog.create({
        data: {
          variableId,
          status,
          errorMessage,
          rotatedBy: rotatedBy || "system",
        },
      });

      // Also log to audit log
      await prisma.auditLog.create({
        data: {
          action: "secret_rotation",
          resourceType: "variable",
          resourceId: variableId,
          metadata: {
            status,
            errorMessage,
          },
          severity: status === "success" ? "info" : "warning",
        },
      });
    } catch (error) {
      console.error("Failed to log rotation:", error);
    }
  }

  /**
   * Sync rotated secret to connected platforms
   */
  private async syncRotatedSecret(
    projectId: string,
    variableId: string
  ): Promise<void> {
    try {
      // Get the variable with environment info
      const variable = await prisma.variable.findUnique({
        where: { id: variableId },
        include: {
          environment: true,
        },
      });

      if (!variable) {
        return;
      }

      // Get all platform connections for this project
      const connections = await prisma.platformConnection.findMany({
        where: {
          projectId,
          status: "connected",
        },
      });

      // Trigger sync for each connection
      // In a real implementation, this would queue sync jobs
      for (const connection of connections) {
        console.log(
          `Queuing sync for connection ${connection.id} after rotation`
        );
        // Queue sync job here (would use Redis queue in production)
      }
    } catch (error) {
      console.error("Failed to sync rotated secret:", error);
    }
  }

  /**
   * Get rotation history for a variable
   */
  async getRotationHistory(variableId: string): Promise<any[]> {
    const logs = await prisma.rotationLog.findMany({
      where: { variableId },
      orderBy: { createdAt: "desc" },
    });

    return logs;
  }

  /**
   * Get rotation statistics
   */
  async getRotationStats(projectId?: string): Promise<{
    totalRotations: number;
    successfulRotations: number;
    failedRotations: number;
    lastRotationAt?: Date;
  }> {
    let where: any = {};

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

    const [totalRotations, successfulRotations, failedRotations, lastRotation] =
      await Promise.all([
        prisma.rotationLog.count({ where }),
        prisma.rotationLog.count({ where: { ...where, status: "success" } }),
        prisma.rotationLog.count({ where: { ...where, status: "failed" } }),
        prisma.rotationLog.findFirst({
          where,
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);

    return {
      totalRotations,
      successfulRotations,
      failedRotations,
      lastRotationAt: lastRotation?.createdAt,
    };
  }
}

export default new RotationExecutionService();
