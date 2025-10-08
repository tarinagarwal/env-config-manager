import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { NotFoundError } from "../utils/errors";
import { PlatformType, SyncVariable, SyncResult } from "../types/sync.types";
import platformConnectionService from "./platformConnection.service";
import { VercelAdapter } from "../adapters/vercel.adapter";
import { AWSAdapter } from "../adapters/aws.adapter";
import { NetlifyAdapter } from "../adapters/netlify.adapter";
import { BasePlatformAdapter } from "../adapters/base.adapter";
import variableService from "./variable.service";

interface SyncJob {
  connectionId: string;
  environmentId: string;
  timestamp: number;
  retryCount?: number;
}

class SyncService {
  private readonly SYNC_QUEUE_KEY = "sync:queue";
  private readonly SYNC_PROCESSING_KEY = "sync:processing";
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff in ms

  /**
   * Get the appropriate adapter for a platform type
   */
  private getAdapter(platform: PlatformType): BasePlatformAdapter {
    switch (platform) {
      case "vercel":
        return new VercelAdapter();
      case "aws-ssm":
      case "aws-secrets-manager":
        return new AWSAdapter();
      case "netlify":
        return new NetlifyAdapter();
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Queue a sync job
   */
  async queueSync(connectionId: string, environmentId: string): Promise<void> {
    const job: SyncJob = {
      connectionId,
      environmentId,
      timestamp: Date.now(),
    };

    // Add to Redis queue
    await redis.rPush(this.SYNC_QUEUE_KEY, JSON.stringify(job));
  }

  /**
   * Queue sync for all connections in a project when variables change
   */
  async queueSyncForEnvironment(environmentId: string): Promise<void> {
    // Get the environment to find the project
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      select: { projectId: true },
    });

    if (!environment) {
      throw new NotFoundError("Environment");
    }

    // Get all connections for the project
    const connections = await prisma.platformConnection.findMany({
      where: {
        projectId: environment.projectId,
        status: "connected",
      },
    });

    // Queue sync for each connection
    for (const connection of connections) {
      await this.queueSync(connection.id, environmentId);
    }
  }

  /**
   * Process a single sync job with retry logic
   */
  async processSyncJob(job: SyncJob): Promise<SyncResult> {
    const { connectionId, environmentId, retryCount = 0 } = job;

    try {
      // Get connection details
      const connection = await prisma.platformConnection.findUnique({
        where: { id: connectionId },
      });

      if (!connection) {
        throw new NotFoundError("Platform connection");
      }

      // Get variables from environment (with decrypted values)
      const variables = await variableService.getVariables(
        environmentId,
        false,
        true // Reveal secrets for syncing
      );

      // Filter out deleted variables
      const activeVariables = variables.filter((v: any) => !v.deletedAt);

      // Convert to SyncVariable format
      const syncVariables: SyncVariable[] = activeVariables.map((v: any) => ({
        key: v.key,
        value: v.value,
        isSecret: v.isSecret,
      }));

      // Get adapter and authenticate
      const adapter = this.getAdapter(connection.platform as PlatformType);
      const credentials = await platformConnectionService.decryptCredentials(
        connectionId
      );
      await adapter.authenticate(credentials);

      // Push variables
      const result = await adapter.pushVariables(
        syncVariables,
        connection.targetResource
      );

      // Log sync result
      await prisma.syncLog.create({
        data: {
          connectionId,
          environmentId,
          success: result.success,
          syncedCount: result.syncedCount,
          errorMessage:
            result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        },
      });

      // Update last sync timestamp if successful
      if (result.success) {
        await platformConnectionService.updateLastSync(connectionId);
        await platformConnectionService.updateConnectionStatus(
          connectionId,
          "connected"
        );
      } else {
        // If sync failed and we haven't exceeded retry attempts, retry
        if (retryCount < this.MAX_RETRY_ATTEMPTS) {
          await this.retrySync(job, retryCount);
        } else {
          // Mark connection as error after final failure
          await platformConnectionService.updateConnectionStatus(
            connectionId,
            "error"
          );
          await this.alertSyncFailure(
            connectionId,
            environmentId,
            result.errors
          );
        }
      }

      return result;
    } catch (error) {
      // Log failed sync
      await prisma.syncLog.create({
        data: {
          connectionId,
          environmentId,
          success: false,
          syncedCount: 0,
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        },
      });

      // If we haven't exceeded retry attempts, retry
      if (retryCount < this.MAX_RETRY_ATTEMPTS) {
        await this.retrySync(job, retryCount);
      } else {
        // Mark connection as error after final failure
        await platformConnectionService.updateConnectionStatus(
          connectionId,
          "error"
        );
        await this.alertSyncFailure(connectionId, environmentId, [
          {
            variableKey: "all",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        ]);
      }

      throw error;
    }
  }

  /**
   * Retry a failed sync with exponential backoff
   */
  private async retrySync(
    job: SyncJob,
    currentRetryCount: number
  ): Promise<void> {
    const nextRetryCount = currentRetryCount + 1;
    const delay =
      this.RETRY_DELAYS[currentRetryCount] ||
      this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1];

    console.log(
      `Scheduling retry ${nextRetryCount}/${this.MAX_RETRY_ATTEMPTS} for sync job after ${delay}ms`,
      { connectionId: job.connectionId, environmentId: job.environmentId }
    );

    // Schedule retry after delay
    setTimeout(async () => {
      const retryJob: SyncJob = {
        ...job,
        retryCount: nextRetryCount,
        timestamp: Date.now(),
      };

      await redis.rPush(this.SYNC_QUEUE_KEY, JSON.stringify(retryJob));
    }, delay);
  }

  /**
   * Alert users about sync failure
   */
  private async alertSyncFailure(
    connectionId: string,
    environmentId: string,
    errors: Array<{ variableKey: string; message: string }>
  ): Promise<void> {
    console.error("Sync failed after all retry attempts", {
      connectionId,
      environmentId,
      errors,
    });

    // TODO: Implement user notification (email, webhook, etc.)
    // For now, just log the failure
    // In a production system, this would:
    // 1. Send email to project admins
    // 2. Trigger webhook if configured
    // 3. Create in-app notification
  }

  /**
   * Process sync queue (should be called by a worker process)
   */
  async processSyncQueue(): Promise<void> {
    while (true) {
      try {
        // Pop a job from the queue (blocking with timeout)
        const jobData = await redis.blPop(this.SYNC_QUEUE_KEY, 5);

        if (!jobData) {
          // No jobs available, continue waiting
          continue;
        }

        const job: SyncJob = JSON.parse(jobData.element);

        // Mark as processing
        await redis.sAdd(this.SYNC_PROCESSING_KEY, job.connectionId);

        try {
          await this.processSyncJob(job);
        } finally {
          // Remove from processing set
          await redis.sRem(this.SYNC_PROCESSING_KEY, job.connectionId);
        }
      } catch (error) {
        console.error("Error processing sync queue:", error);
        // Continue processing other jobs
      }
    }
  }

  /**
   * Manually trigger sync for a connection
   */
  async triggerSync(
    connectionId: string,
    environmentId: string
  ): Promise<SyncResult> {
    // Verify connection exists
    const connection = await prisma.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundError("Platform connection");
    }

    // Verify environment exists
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
    });

    if (!environment) {
      throw new NotFoundError("Environment");
    }

    // Process sync immediately
    const job: SyncJob = {
      connectionId,
      environmentId,
      timestamp: Date.now(),
    };

    return await this.processSyncJob(job);
  }

  /**
   * Get sync status for a connection
   */
  async getSyncStatus(connectionId: string) {
    const connection = await prisma.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundError("Platform connection");
    }

    // Get recent sync logs
    const recentLogs = await prisma.syncLog.findMany({
      where: { connectionId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return {
      connectionId,
      status: connection.status,
      lastSyncAt: connection.lastSyncAt,
      recentLogs,
    };
  }

  /**
   * Get sync logs for an environment
   */
  async getSyncLogs(
    environmentId: string,
    filters?: {
      connectionId?: string;
      success?: boolean;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    const where: any = { environmentId };

    if (filters?.connectionId) {
      where.connectionId = filters.connectionId;
    }

    if (filters?.success !== undefined) {
      where.success = filters.success;
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const logs = await prisma.syncLog.findMany({
      where,
      include: {
        connection: {
          select: {
            platform: true,
            targetResource: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return logs;
  }
}

export default new SyncService();
