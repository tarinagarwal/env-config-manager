import syncService from "../sync.service";
import platformConnectionService from "../platformConnection.service";
import variableService from "../variable.service";
import prisma from "../../lib/prisma";
import { VercelAdapter } from "../../adapters/vercel.adapter";
import { AWSAdapter } from "../../adapters/aws.adapter";
import { NetlifyAdapter } from "../../adapters/netlify.adapter";

// Mock the adapters
jest.mock("../../adapters/vercel.adapter");
jest.mock("../../adapters/aws.adapter");
jest.mock("../../adapters/netlify.adapter");

// Mock services
jest.mock("../platformConnection.service");
jest.mock("../variable.service");

// Mock Redis
jest.mock("../../lib/redis", () => ({
  __esModule: true,
  default: {
    rPush: jest.fn(),
    blPop: jest.fn(),
    sAdd: jest.fn(),
    sRem: jest.fn(),
  },
}));

import redis from "../../lib/redis";

describe("SyncService", () => {
  const mockConnectionId = "conn-123";
  const mockEnvironmentId = "env-456";
  const mockProjectId = "proj-789";

  const mockConnection = {
    id: mockConnectionId,
    projectId: mockProjectId,
    platform: "vercel",
    credentials: "encrypted-creds",
    encryptedDek: "encrypted-dek",
    targetResource: "vercel-project-id",
    status: "connected",
    lastSyncAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEnvironment = {
    id: mockEnvironmentId,
    projectId: mockProjectId,
    name: "production",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVariables = [
    {
      id: "var-1",
      environmentId: mockEnvironmentId,
      key: "API_KEY",
      value: "secret-value",
      isSecret: true,
      deletedAt: null,
    },
    {
      id: "var-2",
      environmentId: mockEnvironmentId,
      key: "DATABASE_URL",
      value: "postgres://localhost",
      isSecret: false,
      deletedAt: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("queueSync", () => {
    it("should queue a sync job to Redis", async () => {
      await syncService.queueSync(mockConnectionId, mockEnvironmentId);

      expect(redis.rPush).toHaveBeenCalledWith(
        "sync:queue",
        expect.stringContaining(mockConnectionId)
      );
      expect(redis.rPush).toHaveBeenCalledWith(
        "sync:queue",
        expect.stringContaining(mockEnvironmentId)
      );
    });
  });

  describe("queueSyncForEnvironment", () => {
    it("should queue sync for all connections in a project", async () => {
      const mockConnections = [
        { ...mockConnection, id: "conn-1" },
        { ...mockConnection, id: "conn-2" },
      ];

      jest
        .spyOn(prisma.environment, "findUnique")
        .mockResolvedValue(mockEnvironment as any);
      jest
        .spyOn(prisma.platformConnection, "findMany")
        .mockResolvedValue(mockConnections as any);

      await syncService.queueSyncForEnvironment(mockEnvironmentId);

      expect(redis.rPush).toHaveBeenCalledTimes(2);
    });

    it("should throw error if environment not found", async () => {
      jest.spyOn(prisma.environment, "findUnique").mockResolvedValue(null);

      await expect(
        syncService.queueSyncForEnvironment(mockEnvironmentId)
      ).rejects.toThrow("Environment not found");
    });
  });

  describe("processSyncJob", () => {
    it("should successfully sync variables to platform", async () => {
      const mockAdapter = {
        authenticate: jest.fn().mockResolvedValue(true),
        pushVariables: jest.fn().mockResolvedValue({
          success: true,
          syncedCount: 2,
          errors: [],
        }),
        testConnection: jest.fn().mockResolvedValue(true),
        getPlatformType: jest.fn().mockReturnValue("vercel"),
      };

      (VercelAdapter as jest.Mock).mockImplementation(() => mockAdapter);

      jest
        .spyOn(prisma.platformConnection, "findUnique")
        .mockResolvedValue(mockConnection as any);
      (variableService.getVariables as jest.Mock).mockResolvedValue(
        mockVariables
      );
      (
        platformConnectionService.decryptCredentials as jest.Mock
      ).mockResolvedValue({
        token: "test-token",
      });
      jest.spyOn(prisma.syncLog, "create").mockResolvedValue({} as any);
      (platformConnectionService.updateLastSync as jest.Mock).mockResolvedValue(
        undefined
      );
      (
        platformConnectionService.updateConnectionStatus as jest.Mock
      ).mockResolvedValue(undefined);

      const result = await syncService.processSyncJob({
        connectionId: mockConnectionId,
        environmentId: mockEnvironmentId,
        timestamp: Date.now(),
      });

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(2);
      expect(mockAdapter.authenticate).toHaveBeenCalled();
      expect(mockAdapter.pushVariables).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: "API_KEY" }),
          expect.objectContaining({ key: "DATABASE_URL" }),
        ]),
        mockConnection.targetResource
      );
      expect(platformConnectionService.updateLastSync).toHaveBeenCalledWith(
        mockConnectionId
      );
      expect(
        platformConnectionService.updateConnectionStatus
      ).toHaveBeenCalledWith(mockConnectionId, "connected");
    });

    it("should handle sync failure and retry", async () => {
      const mockAdapter = {
        authenticate: jest.fn().mockResolvedValue(true),
        pushVariables: jest.fn().mockResolvedValue({
          success: false,
          syncedCount: 0,
          errors: [{ variableKey: "API_KEY", message: "Sync failed" }],
        }),
        testConnection: jest.fn().mockResolvedValue(true),
        getPlatformType: jest.fn().mockReturnValue("vercel"),
      };

      (VercelAdapter as jest.Mock).mockImplementation(() => mockAdapter);

      jest
        .spyOn(prisma.platformConnection, "findUnique")
        .mockResolvedValue(mockConnection as any);
      (variableService.getVariables as jest.Mock).mockResolvedValue(
        mockVariables
      );
      (
        platformConnectionService.decryptCredentials as jest.Mock
      ).mockResolvedValue({
        token: "test-token",
      });
      jest.spyOn(prisma.syncLog, "create").mockResolvedValue({} as any);
      (
        platformConnectionService.updateConnectionStatus as jest.Mock
      ).mockResolvedValue(undefined);

      // Mock setTimeout to execute immediately
      jest.useFakeTimers();

      const result = await syncService.processSyncJob({
        connectionId: mockConnectionId,
        environmentId: mockEnvironmentId,
        timestamp: Date.now(),
        retryCount: 0,
      });

      // Fast-forward timers to trigger the retry
      jest.runAllTimers();

      expect(result.success).toBe(false);
      expect(redis.rPush).toHaveBeenCalled(); // Retry should be queued

      jest.useRealTimers();
    });

    it("should mark connection as error after max retries", async () => {
      const mockAdapter = {
        authenticate: jest.fn().mockResolvedValue(true),
        pushVariables: jest.fn().mockResolvedValue({
          success: false,
          syncedCount: 0,
          errors: [{ variableKey: "API_KEY", message: "Sync failed" }],
        }),
        testConnection: jest.fn().mockResolvedValue(true),
        getPlatformType: jest.fn().mockReturnValue("vercel"),
      };

      (VercelAdapter as jest.Mock).mockImplementation(() => mockAdapter);

      jest
        .spyOn(prisma.platformConnection, "findUnique")
        .mockResolvedValue(mockConnection as any);
      (variableService.getVariables as jest.Mock).mockResolvedValue(
        mockVariables
      );
      (
        platformConnectionService.decryptCredentials as jest.Mock
      ).mockResolvedValue({
        token: "test-token",
      });
      jest.spyOn(prisma.syncLog, "create").mockResolvedValue({} as any);
      (
        platformConnectionService.updateConnectionStatus as jest.Mock
      ).mockResolvedValue(undefined);

      const result = await syncService.processSyncJob({
        connectionId: mockConnectionId,
        environmentId: mockEnvironmentId,
        timestamp: Date.now(),
        retryCount: 5, // Max retries exceeded
      });

      expect(result.success).toBe(false);
      expect(
        platformConnectionService.updateConnectionStatus
      ).toHaveBeenCalledWith(mockConnectionId, "error");
    });

    it("should filter out deleted variables", async () => {
      const mockAdapter = {
        authenticate: jest.fn().mockResolvedValue(true),
        pushVariables: jest.fn().mockResolvedValue({
          success: true,
          syncedCount: 1,
          errors: [],
        }),
        testConnection: jest.fn().mockResolvedValue(true),
        getPlatformType: jest.fn().mockReturnValue("vercel"),
      };

      (VercelAdapter as jest.Mock).mockImplementation(() => mockAdapter);

      const variablesWithDeleted = [
        ...mockVariables,
        {
          id: "var-3",
          environmentId: mockEnvironmentId,
          key: "DELETED_VAR",
          value: "deleted",
          isSecret: false,
          deletedAt: new Date(),
        },
      ];

      jest
        .spyOn(prisma.platformConnection, "findUnique")
        .mockResolvedValue(mockConnection as any);
      (variableService.getVariables as jest.Mock).mockResolvedValue(
        variablesWithDeleted
      );
      (
        platformConnectionService.decryptCredentials as jest.Mock
      ).mockResolvedValue({
        token: "test-token",
      });
      jest.spyOn(prisma.syncLog, "create").mockResolvedValue({} as any);
      (platformConnectionService.updateLastSync as jest.Mock).mockResolvedValue(
        undefined
      );
      (
        platformConnectionService.updateConnectionStatus as jest.Mock
      ).mockResolvedValue(undefined);

      await syncService.processSyncJob({
        connectionId: mockConnectionId,
        environmentId: mockEnvironmentId,
        timestamp: Date.now(),
      });

      expect(mockAdapter.pushVariables).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: "API_KEY" }),
          expect.objectContaining({ key: "DATABASE_URL" }),
        ]),
        mockConnection.targetResource
      );

      // Should not include deleted variable
      expect(mockAdapter.pushVariables).not.toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: "DELETED_VAR" }),
        ]),
        expect.anything()
      );
    });
  });

  describe("triggerSync", () => {
    it("should manually trigger sync immediately", async () => {
      const mockAdapter = {
        authenticate: jest.fn().mockResolvedValue(true),
        pushVariables: jest.fn().mockResolvedValue({
          success: true,
          syncedCount: 2,
          errors: [],
        }),
        testConnection: jest.fn().mockResolvedValue(true),
        getPlatformType: jest.fn().mockReturnValue("vercel"),
      };

      (VercelAdapter as jest.Mock).mockImplementation(() => mockAdapter);

      jest
        .spyOn(prisma.platformConnection, "findUnique")
        .mockResolvedValue(mockConnection as any);
      jest
        .spyOn(prisma.environment, "findUnique")
        .mockResolvedValue(mockEnvironment as any);
      (variableService.getVariables as jest.Mock).mockResolvedValue(
        mockVariables
      );
      (
        platformConnectionService.decryptCredentials as jest.Mock
      ).mockResolvedValue({
        token: "test-token",
      });
      jest.spyOn(prisma.syncLog, "create").mockResolvedValue({} as any);
      (platformConnectionService.updateLastSync as jest.Mock).mockResolvedValue(
        undefined
      );
      (
        platformConnectionService.updateConnectionStatus as jest.Mock
      ).mockResolvedValue(undefined);

      const result = await syncService.triggerSync(
        mockConnectionId,
        mockEnvironmentId
      );

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(2);
    });
  });

  describe("getSyncStatus", () => {
    it("should return sync status for a connection", async () => {
      const mockLogs = [
        {
          id: "log-1",
          connectionId: mockConnectionId,
          environmentId: mockEnvironmentId,
          success: true,
          syncedCount: 2,
          errorMessage: null,
          createdAt: new Date(),
        },
      ];

      jest
        .spyOn(prisma.platformConnection, "findUnique")
        .mockResolvedValue(mockConnection as any);
      jest.spyOn(prisma.syncLog, "findMany").mockResolvedValue(mockLogs as any);

      const status = await syncService.getSyncStatus(mockConnectionId);

      expect(status.connectionId).toBe(mockConnectionId);
      expect(status.status).toBe("connected");
      expect(status.recentLogs).toHaveLength(1);
    });
  });

  describe("getSyncLogs", () => {
    it("should return sync logs for an environment", async () => {
      const mockLogs = [
        {
          id: "log-1",
          connectionId: mockConnectionId,
          environmentId: mockEnvironmentId,
          success: true,
          syncedCount: 2,
          errorMessage: null,
          createdAt: new Date(),
          connection: {
            platform: "vercel",
            targetResource: "vercel-project-id",
          },
        },
      ];

      jest.spyOn(prisma.syncLog, "findMany").mockResolvedValue(mockLogs as any);

      const logs = await syncService.getSyncLogs(mockEnvironmentId);

      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(true);
    });

    it("should filter sync logs by connection", async () => {
      jest.spyOn(prisma.syncLog, "findMany").mockResolvedValue([] as any);

      await syncService.getSyncLogs(mockEnvironmentId, {
        connectionId: mockConnectionId,
      });

      expect(prisma.syncLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            connectionId: mockConnectionId,
          }),
        })
      );
    });

    it("should filter sync logs by success status", async () => {
      jest.spyOn(prisma.syncLog, "findMany").mockResolvedValue([] as any);

      await syncService.getSyncLogs(mockEnvironmentId, {
        success: true,
      });

      expect(prisma.syncLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            success: true,
          }),
        })
      );
    });
  });
});
