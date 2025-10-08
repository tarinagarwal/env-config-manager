import secretRotationService from "../secretRotation.service";
import rotationExecutionService from "../rotationExecution.service";
import rotationFailureHandler from "../rotationFailureHandler.service";
import prisma from "../../lib/prisma";
import { NotFoundError, ValidationError } from "../../utils/errors";

// Mock Prisma
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    variable: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    rotationLog: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    platformConnection: {
      findMany: jest.fn(),
    },
    webhookConfig: {
      findFirst: jest.fn(),
    },
  },
}));

// Mock variable service
jest.mock("../variable.service", () => ({
  __esModule: true,
  default: {
    getVariableById: jest.fn(),
    updateVariable: jest.fn(),
  },
}));

// Mock Redis
jest.mock("../../lib/redis", () => ({
  __esModule: true,
  default: {
    setEx: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  },
}));

describe("SecretRotationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("enableRotation", () => {
    it("should enable rotation for a secret variable", async () => {
      const variableId = "var123";
      const rotationIntervalDays = 30;

      const mockVariable = {
        id: variableId,
        key: "API_KEY",
        isSecret: true,
        deletedAt: null,
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.variable.update as jest.Mock).mockResolvedValue({
        ...mockVariable,
        rotationEnabled: true,
        rotationIntervalDays,
      });

      await secretRotationService.enableRotation(
        variableId,
        rotationIntervalDays
      );

      expect(prisma.variable.update).toHaveBeenCalledWith({
        where: { id: variableId },
        data: expect.objectContaining({
          rotationEnabled: true,
          rotationIntervalDays,
          nextRotationAt: expect.any(Date),
        }),
      });
    });

    it("should throw error if rotation interval is less than 1 day", async () => {
      const variableId = "var123";
      const rotationIntervalDays = 0;

      await expect(
        secretRotationService.enableRotation(variableId, rotationIntervalDays)
      ).rejects.toThrow(ValidationError);
    });

    it("should throw error if variable is not a secret", async () => {
      const variableId = "var123";
      const rotationIntervalDays = 30;

      const mockVariable = {
        id: variableId,
        key: "API_URL",
        isSecret: false,
        deletedAt: null,
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);

      await expect(
        secretRotationService.enableRotation(variableId, rotationIntervalDays)
      ).rejects.toThrow(ValidationError);
    });

    it("should throw error if variable not found", async () => {
      const variableId = "var123";
      const rotationIntervalDays = 30;

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        secretRotationService.enableRotation(variableId, rotationIntervalDays)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("disableRotation", () => {
    it("should disable rotation for a variable", async () => {
      const variableId = "var123";

      const mockVariable = {
        id: variableId,
        key: "API_KEY",
        isSecret: true,
        rotationEnabled: true,
        deletedAt: null,
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.variable.update as jest.Mock).mockResolvedValue({
        ...mockVariable,
        rotationEnabled: false,
        rotationIntervalDays: null,
        nextRotationAt: null,
      });

      await secretRotationService.disableRotation(variableId);

      expect(prisma.variable.update).toHaveBeenCalledWith({
        where: { id: variableId },
        data: {
          rotationEnabled: false,
          rotationIntervalDays: null,
          nextRotationAt: null,
        },
      });
    });
  });

  describe("updateRotationInterval", () => {
    it("should update rotation interval", async () => {
      const variableId = "var123";
      const newInterval = 60;

      const mockVariable = {
        id: variableId,
        key: "API_KEY",
        isSecret: true,
        rotationEnabled: true,
        rotationIntervalDays: 30,
        updatedAt: new Date(),
        deletedAt: null,
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.variable.update as jest.Mock).mockResolvedValue({
        ...mockVariable,
        rotationIntervalDays: newInterval,
      });

      await secretRotationService.updateRotationInterval(
        variableId,
        newInterval
      );

      expect(prisma.variable.update).toHaveBeenCalledWith({
        where: { id: variableId },
        data: expect.objectContaining({
          rotationIntervalDays: newInterval,
          nextRotationAt: expect.any(Date),
        }),
      });
    });

    it("should throw error if rotation is not enabled", async () => {
      const variableId = "var123";
      const newInterval = 60;

      const mockVariable = {
        id: variableId,
        key: "API_KEY",
        isSecret: true,
        rotationEnabled: false,
        deletedAt: null,
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);

      await expect(
        secretRotationService.updateRotationInterval(variableId, newInterval)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("getVariablesDueForRotation", () => {
    it("should return variables due for rotation", async () => {
      const mockVariables = [
        {
          id: "var1",
          key: "API_KEY_1",
          rotationEnabled: true,
          nextRotationAt: new Date(Date.now() - 1000),
          environment: {
            id: "env1",
            name: "production",
            project: {
              id: "proj1",
              name: "Project 1",
              ownerId: "user1",
            },
          },
        },
        {
          id: "var2",
          key: "API_KEY_2",
          rotationEnabled: true,
          nextRotationAt: new Date(Date.now() - 2000),
          environment: {
            id: "env2",
            name: "staging",
            project: {
              id: "proj2",
              name: "Project 2",
              ownerId: "user2",
            },
          },
        },
      ];

      (prisma.variable.findMany as jest.Mock).mockResolvedValue(mockVariables);

      const result = await secretRotationService.getVariablesDueForRotation();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("var1");
      expect(result[1].id).toBe("var2");
    });

    it("should return empty array if no variables due", async () => {
      (prisma.variable.findMany as jest.Mock).mockResolvedValue([]);

      const result = await secretRotationService.getVariablesDueForRotation();

      expect(result).toHaveLength(0);
    });
  });
});

describe("RotationExecutionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rotateVariable", () => {
    it("should successfully rotate a variable", async () => {
      const variableId = "var123";
      const userId = "user123";

      const mockVariable = {
        id: variableId,
        key: "API_KEY",
        isSecret: true,
        deletedAt: null,
        environment: {
          id: "env123",
          name: "production",
          project: {
            id: "proj123",
            name: "Project 1",
            ownerId: "user123",
          },
        },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);

      const variableService = require("../variable.service").default;
      (variableService.getVariableById as jest.Mock).mockResolvedValue({
        ...mockVariable,
        value: "old-secret-value",
      });
      (variableService.updateVariable as jest.Mock).mockResolvedValue({
        ...mockVariable,
        value: "new-secret-value",
      });

      (prisma.variable.update as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.rotationLog.create as jest.Mock).mockResolvedValue({});
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
      (prisma.platformConnection.findMany as jest.Mock).mockResolvedValue([]);

      const result = await rotationExecutionService.rotateVariable(
        variableId,
        undefined,
        userId
      );

      expect(result.success).toBe(true);
      expect(result.variableId).toBe(variableId);
      expect(result.newValue).toBeDefined();
      expect(variableService.updateVariable).toHaveBeenCalled();
    });

    it("should handle rotation failure", async () => {
      const variableId = "var123";

      (prisma.variable.findUnique as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      const result = await rotationExecutionService.rotateVariable(variableId);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  describe("rotateAllDue", () => {
    it("should rotate all variables due for rotation", async () => {
      const mockVariables = [
        {
          id: "var1",
          key: "API_KEY_1",
          isSecret: true,
          deletedAt: null,
          environment: {
            id: "env1",
            name: "production",
            project: {
              id: "proj1",
              name: "Project 1",
              ownerId: "user1",
            },
          },
        },
      ];

      (prisma.variable.findMany as jest.Mock).mockResolvedValue(mockVariables);
      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
        mockVariables[0]
      );

      const variableService = require("../variable.service").default;
      (variableService.getVariableById as jest.Mock).mockResolvedValue({
        ...mockVariables[0],
        value: "old-secret",
      });
      (variableService.updateVariable as jest.Mock).mockResolvedValue({
        ...mockVariables[0],
        value: "new-secret",
      });

      (prisma.variable.update as jest.Mock).mockResolvedValue(mockVariables[0]);
      (prisma.rotationLog.create as jest.Mock).mockResolvedValue({});
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
      (prisma.platformConnection.findMany as jest.Mock).mockResolvedValue([]);

      const result = await rotationExecutionService.rotateAllDue();

      expect(result.successCount).toBeGreaterThan(0);
      expect(result.results).toHaveLength(1);
    });
  });

  describe("getRotationHistory", () => {
    it("should return rotation history for a variable", async () => {
      const variableId = "var123";
      const mockLogs = [
        {
          id: "log1",
          variableId,
          status: "success",
          createdAt: new Date(),
        },
        {
          id: "log2",
          variableId,
          status: "failed",
          errorMessage: "Connection timeout",
          createdAt: new Date(),
        },
      ];

      (prisma.rotationLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const result = await rotationExecutionService.getRotationHistory(
        variableId
      );

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe("success");
      expect(result[1].status).toBe("failed");
    });
  });

  describe("getRotationStats", () => {
    it("should return rotation statistics", async () => {
      (prisma.rotationLog.count as jest.Mock)
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8) // successful
        .mockResolvedValueOnce(2); // failed

      (prisma.rotationLog.findFirst as jest.Mock).mockResolvedValue({
        createdAt: new Date(),
      });

      const result = await rotationExecutionService.getRotationStats();

      expect(result.totalRotations).toBe(10);
      expect(result.successfulRotations).toBe(8);
      expect(result.failedRotations).toBe(2);
      expect(result.lastRotationAt).toBeDefined();
    });
  });
});

describe("RotationFailureHandlerService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("handleFailure", () => {
    it("should schedule retry for first failure", async () => {
      const variableId = "var123";
      const errorMessage = "Connection timeout";
      const attemptCount = 1;

      (prisma.rotationLog.create as jest.Mock).mockResolvedValue({});
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const redis = require("../../lib/redis").default;
      (redis.setEx as jest.Mock).mockResolvedValue("OK");

      await rotationFailureHandler.handleFailure(
        variableId,
        errorMessage,
        attemptCount
      );

      expect(prisma.rotationLog.create).toHaveBeenCalled();
      expect(redis.setEx).toHaveBeenCalled();
    });

    it("should alert users after max retries", async () => {
      const variableId = "var123";
      const errorMessage = "Connection timeout";
      const attemptCount = 3;

      const mockVariable = {
        id: variableId,
        key: "API_KEY",
        environment: {
          id: "env123",
          name: "production",
          project: {
            id: "proj123",
            name: "Project 1",
            ownerId: "user123",
            owner: {
              id: "user123",
              email: "user@example.com",
            },
          },
        },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.webhookConfig.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.rotationLog.create as jest.Mock).mockResolvedValue({});
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      await rotationFailureHandler.handleFailure(
        variableId,
        errorMessage,
        attemptCount
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: "critical",
          }),
        })
      );
    });
  });

  describe("getFailureStats", () => {
    it("should return failure statistics", async () => {
      (prisma.rotationLog.count as jest.Mock)
        .mockResolvedValueOnce(5) // total failures
        .mockResolvedValueOnce(2); // recent failures

      const redis = require("../../lib/redis").default;
      (redis.keys as jest.Mock).mockResolvedValue(["rotation:retry:var1"]);
      (redis.get as jest.Mock).mockResolvedValue(
        JSON.stringify({
          variableId: "var1",
          attemptCount: 2,
        })
      );

      const result = await rotationFailureHandler.getFailureStats();

      expect(result.totalFailures).toBe(5);
      expect(result.recentFailures).toBe(2);
      expect(result.pendingRetries).toBe(1);
    });
  });

  describe("processPendingRetries", () => {
    it("should process pending retries", async () => {
      const redis = require("../../lib/redis").default;
      (redis.keys as jest.Mock).mockResolvedValue(["rotation:retry:var1"]);
      (redis.get as jest.Mock).mockResolvedValue(
        JSON.stringify({
          variableId: "var1",
          attemptCount: 2,
          executeAt: new Date(Date.now() - 1000).toISOString(),
        })
      );
      (redis.del as jest.Mock).mockResolvedValue(1);

      const mockVariable = {
        id: "var1",
        key: "API_KEY",
        isSecret: true,
        deletedAt: null,
        environment: {
          id: "env1",
          name: "production",
          project: {
            id: "proj1",
            name: "Project 1",
            ownerId: "user1",
          },
        },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.variable.findMany as jest.Mock).mockResolvedValue([mockVariable]);

      const variableService = require("../variable.service").default;
      (variableService.getVariableById as jest.Mock).mockResolvedValue({
        ...mockVariable,
        value: "old-secret",
      });
      (variableService.updateVariable as jest.Mock).mockResolvedValue({
        ...mockVariable,
        value: "new-secret",
      });

      (prisma.variable.update as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.rotationLog.create as jest.Mock).mockResolvedValue({});
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
      (prisma.platformConnection.findMany as jest.Mock).mockResolvedValue([]);

      const result = await rotationFailureHandler.processPendingRetries();

      expect(result.processedCount).toBeGreaterThan(0);
    });
  });
});
