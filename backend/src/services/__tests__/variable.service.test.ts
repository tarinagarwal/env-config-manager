import variableService from "../variable.service";
import prisma from "../../lib/prisma";
import { encryptionService } from "../encryption.service";
import { NotFoundError, ValidationError } from "../../utils/errors";

// Mock Prisma
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    variable: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    environment: {
      findUnique: jest.fn(),
    },
    variableVersion: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

// Mock encryption service
jest.mock("../encryption.service", () => ({
  encryptionService: {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  },
}));

describe("VariableService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createVariable", () => {
    it("should create a non-secret variable", async () => {
      const environmentId = "env123";
      const userId = "user123";
      const variableData = {
        key: "API_URL",
        value: "https://api.example.com",
        isSecret: false,
      };

      const mockEnvironment = {
        id: environmentId,
        projectId: "project123",
      };

      const mockVariable = {
        id: "var123",
        environmentId,
        key: variableData.key,
        value: variableData.value,
        isSecret: false,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.environment.findUnique as jest.Mock).mockResolvedValue(
        mockEnvironment
      );
      (prisma.variable.create as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.variableVersion.create as jest.Mock).mockResolvedValue({});

      const result = await variableService.createVariable(
        environmentId,
        userId,
        variableData
      );

      expect(result.key).toBe(variableData.key);
      expect(result.value).toBe(variableData.value);
      expect(result.isSecret).toBe(false);
      expect(prisma.variable.create).toHaveBeenCalled();
      expect(prisma.variableVersion.create).toHaveBeenCalledWith({
        data: {
          variableId: mockVariable.id,
          value: variableData.value,
          changeType: "created",
          changedBy: userId,
        },
      });
    });

    it("should create and encrypt a secret variable", async () => {
      const environmentId = "env123";
      const userId = "user123";
      const variableData = {
        key: "API_KEY",
        value: "secret-key-123",
        isSecret: true,
      };

      const mockEnvironment = {
        id: environmentId,
        projectId: "project123",
      };

      const mockTempVariable = {
        id: "var123",
        environmentId,
        key: variableData.key,
        value: "",
        isSecret: true,
        createdBy: userId,
      };

      const mockEncrypted = {
        encryptedValue: "encrypted-value",
        encryptedDek: '{"encryptedDek":"dek","iv":"iv","authTag":"tag"}',
        iv: "iv",
        authTag: "tag",
      };

      const mockVariable = {
        ...mockTempVariable,
        value: mockEncrypted.encryptedValue,
        encryptedDek: JSON.stringify({
          encryptedDek: mockEncrypted.encryptedDek,
          iv: mockEncrypted.iv,
          authTag: mockEncrypted.authTag,
        }),
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.environment.findUnique as jest.Mock).mockResolvedValue(
        mockEnvironment
      );
      (prisma.variable.create as jest.Mock).mockResolvedValue(mockTempVariable);
      (encryptionService.encrypt as jest.Mock).mockResolvedValue(mockEncrypted);
      (prisma.variable.update as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.variableVersion.create as jest.Mock).mockResolvedValue({});

      const result = await variableService.createVariable(
        environmentId,
        userId,
        variableData
      );

      expect(encryptionService.encrypt).toHaveBeenCalledWith(
        variableData.value,
        {
          projectId: mockEnvironment.projectId,
          environmentId,
          variableId: mockTempVariable.id,
        }
      );
      expect(result.value).toBe(mockEncrypted.encryptedValue);
      expect(result.isSecret).toBe(true);
    });

    it("should throw ValidationError if variable key already exists", async () => {
      const environmentId = "env123";
      const userId = "user123";
      const variableData = {
        key: "API_URL",
        value: "https://api.example.com",
        isSecret: false,
      };

      const existingVariable = {
        id: "var123",
        environmentId,
        key: variableData.key,
        deletedAt: null,
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
        existingVariable
      );

      await expect(
        variableService.createVariable(environmentId, userId, variableData)
      ).rejects.toThrow(ValidationError);
      await expect(
        variableService.createVariable(environmentId, userId, variableData)
      ).rejects.toThrow(
        "Variable with key 'API_URL' already exists in this environment"
      );
    });

    it("should throw ValidationError for invalid variable key", async () => {
      const environmentId = "env123";
      const userId = "user123";
      const variableData = {
        key: "123-INVALID",
        value: "value",
        isSecret: false,
      };

      await expect(
        variableService.createVariable(environmentId, userId, variableData)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("getVariables", () => {
    it("should return all non-secret variables", async () => {
      const environmentId = "env123";

      const mockVariables = [
        {
          id: "var1",
          environmentId,
          key: "API_URL",
          value: "https://api.example.com",
          isSecret: false,
          environment: {
            projectId: "project123",
          },
        },
        {
          id: "var2",
          environmentId,
          key: "PORT",
          value: "3000",
          isSecret: false,
          environment: {
            projectId: "project123",
          },
        },
      ];

      (prisma.variable.findMany as jest.Mock).mockResolvedValue(mockVariables);

      const result = await variableService.getVariables(environmentId);

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe("API_URL");
      expect(result[0].value).toBe("https://api.example.com");
      expect(result[1].key).toBe("PORT");
    });

    it("should mask secret variables by default", async () => {
      const environmentId = "env123";

      const mockVariables = [
        {
          id: "var1",
          environmentId,
          key: "API_KEY",
          value: "encrypted-secret-value-12345",
          isSecret: true,
          encryptedDek: '{"encryptedDek":"dek","iv":"iv","authTag":"tag"}',
          environment: {
            projectId: "project123",
          },
        },
      ];

      (prisma.variable.findMany as jest.Mock).mockResolvedValue(mockVariables);

      const result = await variableService.getVariables(environmentId, false);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("API_KEY");
      expect(result[0].value).toBe("****2345");
      expect(result[0].isSecret).toBe(true);
    });

    it("should decrypt secret variables when revealSecrets is true", async () => {
      const environmentId = "env123";

      const mockVariables = [
        {
          id: "var1",
          environmentId,
          key: "API_KEY",
          value: "encrypted-value",
          isSecret: true,
          encryptedDek: '{"encryptedDek":"dek","iv":"iv","authTag":"tag"}',
          environment: {
            projectId: "project123",
          },
        },
      ];

      (prisma.variable.findMany as jest.Mock).mockResolvedValue(mockVariables);
      (encryptionService.decrypt as jest.Mock).mockResolvedValue(
        "decrypted-secret-value"
      );

      const result = await variableService.getVariables(
        environmentId,
        false,
        true
      );

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe("decrypted-secret-value");
      expect(encryptionService.decrypt).toHaveBeenCalled();
    });
  });

  describe("getVariableById", () => {
    it("should return a non-secret variable", async () => {
      const variableId = "var123";

      const mockVariable = {
        id: variableId,
        environmentId: "env123",
        key: "API_URL",
        value: "https://api.example.com",
        isSecret: false,
        deletedAt: null,
        environment: {
          id: "env123",
          name: "production",
          projectId: "project123",
        },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);

      const result = await variableService.getVariableById(variableId);

      expect(result.key).toBe("API_URL");
      expect(result.value).toBe("https://api.example.com");
    });

    it("should mask secret variable by default", async () => {
      const variableId = "var123";

      const mockVariable = {
        id: variableId,
        environmentId: "env123",
        key: "API_KEY",
        value: "encrypted-secret-value-12345",
        isSecret: true,
        encryptedDek: '{"encryptedDek":"dek","iv":"iv","authTag":"tag"}',
        deletedAt: null,
        environment: {
          id: "env123",
          name: "production",
          projectId: "project123",
        },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);

      const result = await variableService.getVariableById(variableId, false);

      expect(result.value).toBe("****2345");
    });

    it("should throw NotFoundError if variable does not exist", async () => {
      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        variableService.getVariableById("nonexistent")
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateVariable", () => {
    it("should update a non-secret variable", async () => {
      const variableId = "var123";
      const userId = "user123";
      const updateData = {
        value: "https://new-api.example.com",
      };

      const mockVariable = {
        id: variableId,
        environmentId: "env123",
        key: "API_URL",
        value: "https://api.example.com",
        isSecret: false,
        deletedAt: null,
        environment: {
          id: "env123",
          name: "production",
          projectId: "project123",
        },
      };

      const mockUpdated = {
        ...mockVariable,
        value: updateData.value,
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.variable.update as jest.Mock).mockResolvedValue(mockUpdated);
      (prisma.variableVersion.create as jest.Mock).mockResolvedValue({});

      const result = await variableService.updateVariable(
        variableId,
        userId,
        updateData
      );

      expect(result.value).toBe(updateData.value);
      expect(prisma.variableVersion.create).toHaveBeenCalledWith({
        data: {
          variableId,
          value: updateData.value,
          encryptedDek: null,
          changeType: "updated",
          changedBy: userId,
        },
      });
    });

    it("should encrypt and update a secret variable", async () => {
      const variableId = "var123";
      const userId = "user123";
      const updateData = {
        value: "new-secret-value",
      };

      const mockVariable = {
        id: variableId,
        environmentId: "env123",
        key: "API_KEY",
        value: "old-encrypted-value",
        isSecret: true,
        deletedAt: null,
        environment: {
          id: "env123",
          name: "production",
          projectId: "project123",
        },
      };

      const mockEncrypted = {
        encryptedValue: "new-encrypted-value",
        encryptedDek: '{"encryptedDek":"dek","iv":"iv","authTag":"tag"}',
        iv: "iv",
        authTag: "tag",
      };

      const mockUpdated = {
        ...mockVariable,
        value: mockEncrypted.encryptedValue,
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (encryptionService.encrypt as jest.Mock).mockResolvedValue(mockEncrypted);
      (prisma.variable.update as jest.Mock).mockResolvedValue(mockUpdated);
      (prisma.variableVersion.create as jest.Mock).mockResolvedValue({});

      const result = await variableService.updateVariable(
        variableId,
        userId,
        updateData
      );

      expect(encryptionService.encrypt).toHaveBeenCalledWith(updateData.value, {
        projectId: mockVariable.environment.projectId,
        environmentId: mockVariable.environmentId,
        variableId,
      });
      expect(result.value).toBe(mockEncrypted.encryptedValue);
    });
  });

  describe("deleteVariable", () => {
    it("should soft delete a variable", async () => {
      const variableId = "var123";
      const userId = "user123";

      const mockVariable = {
        id: variableId,
        environmentId: "env123",
        key: "API_URL",
        value: "https://api.example.com",
        isSecret: false,
        encryptedDek: null,
        deletedAt: null,
      };

      const mockDeleted = {
        ...mockVariable,
        deletedAt: new Date(),
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (prisma.variable.update as jest.Mock).mockResolvedValue(mockDeleted);
      (prisma.variableVersion.create as jest.Mock).mockResolvedValue({});

      const result = await variableService.deleteVariable(variableId, userId);

      expect(result.deletedAt).toBeTruthy();
      expect(prisma.variable.update).toHaveBeenCalledWith({
        where: { id: variableId },
        data: {
          deletedAt: expect.any(Date),
        },
      });
      expect(prisma.variableVersion.create).toHaveBeenCalledWith({
        data: {
          variableId,
          value: mockVariable.value,
          encryptedDek: mockVariable.encryptedDek,
          changeType: "deleted",
          changedBy: userId,
        },
      });
    });
  });

  describe("bulkCopyVariables", () => {
    it("should copy variables from source to target environment", async () => {
      const sourceEnvId = "env1";
      const targetEnvId = "env2";
      const userId = "user123";

      const mockSourceEnv = {
        id: sourceEnvId,
        projectId: "project123",
      };

      const mockTargetEnv = {
        id: targetEnvId,
        projectId: "project123",
      };

      const mockVariables = [
        {
          id: "var1",
          environmentId: sourceEnvId,
          key: "API_URL",
          value: "https://api.example.com",
          isSecret: false,
          encryptedDek: null,
        },
      ];

      const mockCopiedVariable = {
        id: "var2",
        environmentId: targetEnvId,
        key: "API_URL",
        value: "https://api.example.com",
        isSecret: false,
      };

      (prisma.environment.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockSourceEnv)
        .mockResolvedValueOnce(mockTargetEnv);
      (prisma.variable.findMany as jest.Mock).mockResolvedValue(mockVariables);
      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.variable.create as jest.Mock).mockResolvedValue(
        mockCopiedVariable
      );
      (prisma.variableVersion.create as jest.Mock).mockResolvedValue({});

      const result = await variableService.bulkCopyVariables(
        sourceEnvId,
        targetEnvId,
        userId
      );

      expect(result.copiedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(prisma.variable.create).toHaveBeenCalled();
    });

    it("should skip variables that already exist in target", async () => {
      const sourceEnvId = "env1";
      const targetEnvId = "env2";
      const userId = "user123";

      const mockSourceEnv = {
        id: sourceEnvId,
        projectId: "project123",
      };

      const mockTargetEnv = {
        id: targetEnvId,
        projectId: "project123",
      };

      const mockVariables = [
        {
          id: "var1",
          environmentId: sourceEnvId,
          key: "API_URL",
          value: "https://api.example.com",
          isSecret: false,
        },
      ];

      const existingVariable = {
        id: "var2",
        environmentId: targetEnvId,
        key: "API_URL",
        deletedAt: null,
      };

      (prisma.environment.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockSourceEnv)
        .mockResolvedValueOnce(mockTargetEnv);
      (prisma.variable.findMany as jest.Mock).mockResolvedValue(mockVariables);
      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
        existingVariable
      );

      const result = await variableService.bulkCopyVariables(
        sourceEnvId,
        targetEnvId,
        userId
      );

      expect(result.copiedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(prisma.variable.create).not.toHaveBeenCalled();
    });
  });

  describe("bulkUpdateVariables", () => {
    it("should update multiple variables", async () => {
      const userId = "user123";
      const updates = [
        { variableId: "var1", value: "new-value-1" },
        { variableId: "var2", value: "new-value-2" },
      ];

      const mockVariable1 = {
        id: "var1",
        environmentId: "env123",
        key: "VAR1",
        value: "old-value-1",
        isSecret: false,
        deletedAt: null,
        environment: {
          id: "env123",
          name: "production",
          projectId: "project123",
        },
      };

      const mockVariable2 = {
        id: "var2",
        environmentId: "env123",
        key: "VAR2",
        value: "old-value-2",
        isSecret: false,
        deletedAt: null,
        environment: {
          id: "env123",
          name: "production",
          projectId: "project123",
        },
      };

      (prisma.variable.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockVariable1)
        .mockResolvedValueOnce(mockVariable2);
      (prisma.variable.update as jest.Mock)
        .mockResolvedValueOnce({ ...mockVariable1, value: "new-value-1" })
        .mockResolvedValueOnce({ ...mockVariable2, value: "new-value-2" });
      (prisma.variableVersion.create as jest.Mock).mockResolvedValue({});

      const result = await variableService.bulkUpdateVariables(updates, userId);

      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle partial failures", async () => {
      const userId = "user123";
      const updates = [
        { variableId: "var1", value: "new-value-1" },
        { variableId: "nonexistent", value: "new-value-2" },
      ];

      const mockVariable1 = {
        id: "var1",
        environmentId: "env123",
        key: "VAR1",
        value: "old-value-1",
        isSecret: false,
        deletedAt: null,
        environment: {
          id: "env123",
          name: "production",
          projectId: "project123",
        },
      };

      (prisma.variable.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockVariable1)
        .mockResolvedValueOnce(null);
      (prisma.variable.update as jest.Mock).mockResolvedValueOnce({
        ...mockVariable1,
        value: "new-value-1",
      });
      (prisma.variableVersion.create as jest.Mock).mockResolvedValue({});

      const result = await variableService.bulkUpdateVariables(updates, userId);

      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].variableId).toBe("nonexistent");
    });
  });

  describe("Version Control", () => {
    describe("getVariableHistory", () => {
      it("should return version history for a variable", async () => {
        const variableId = "var123";

        const mockVariable = {
          id: variableId,
          environmentId: "env123",
          key: "API_URL",
          value: "https://api.example.com",
          isSecret: false,
          environment: {
            projectId: "project123",
          },
        };

        const mockVersions = [
          {
            id: "version3",
            variableId,
            value: "https://api-v3.example.com",
            encryptedDek: null,
            changeType: "updated",
            changedBy: "user123",
            createdAt: new Date("2024-01-03"),
            user: {
              id: "user123",
              email: "user@example.com",
            },
          },
          {
            id: "version2",
            variableId,
            value: "https://api-v2.example.com",
            encryptedDek: null,
            changeType: "updated",
            changedBy: "user123",
            createdAt: new Date("2024-01-02"),
            user: {
              id: "user123",
              email: "user@example.com",
            },
          },
          {
            id: "version1",
            variableId,
            value: "https://api-v1.example.com",
            encryptedDek: null,
            changeType: "created",
            changedBy: "user123",
            createdAt: new Date("2024-01-01"),
            user: {
              id: "user123",
              email: "user@example.com",
            },
          },
        ];

        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
          mockVariable
        );
        (prisma.variableVersion.findMany as jest.Mock).mockResolvedValue(
          mockVersions
        );

        const result = await variableService.getVariableHistory(variableId);

        expect(result).toHaveLength(3);
        expect(result[0].changeType).toBe("updated");
        expect(result[0].value).toBe("https://api-v3.example.com");
        expect(result[2].changeType).toBe("created");
        expect(prisma.variableVersion.findMany).toHaveBeenCalledWith({
          where: { variableId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });
      });

      it("should filter version history by date range", async () => {
        const variableId = "var123";
        const startDate = new Date("2024-01-02");
        const endDate = new Date("2024-01-03");

        const mockVariable = {
          id: variableId,
          environmentId: "env123",
          isSecret: false,
          environment: {
            projectId: "project123",
          },
        };

        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
          mockVariable
        );
        (prisma.variableVersion.findMany as jest.Mock).mockResolvedValue([]);

        await variableService.getVariableHistory(variableId, {
          startDate,
          endDate,
        });

        expect(prisma.variableVersion.findMany).toHaveBeenCalledWith({
          where: {
            variableId,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });
      });

      it("should filter version history by user", async () => {
        const variableId = "var123";
        const userId = "user456";

        const mockVariable = {
          id: variableId,
          environmentId: "env123",
          isSecret: false,
          environment: {
            projectId: "project123",
          },
        };

        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
          mockVariable
        );
        (prisma.variableVersion.findMany as jest.Mock).mockResolvedValue([]);

        await variableService.getVariableHistory(variableId, { userId });

        expect(prisma.variableVersion.findMany).toHaveBeenCalledWith({
          where: {
            variableId,
            changedBy: userId,
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });
      });

      it("should mask secret values in version history", async () => {
        const variableId = "var123";

        const mockVariable = {
          id: variableId,
          environmentId: "env123",
          isSecret: true,
          environment: {
            projectId: "project123",
          },
        };

        const mockVersions = [
          {
            id: "version1",
            variableId,
            value: "encrypted-secret-value-12345",
            encryptedDek: '{"encryptedDek":"dek","iv":"iv","authTag":"tag"}',
            changeType: "created",
            changedBy: "user123",
            createdAt: new Date("2024-01-01"),
            user: {
              id: "user123",
              email: "user@example.com",
            },
          },
        ];

        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
          mockVariable
        );
        (prisma.variableVersion.findMany as jest.Mock).mockResolvedValue(
          mockVersions
        );

        const result = await variableService.getVariableHistory(
          variableId,
          undefined,
          false
        );

        expect(result[0].value).toBe("****2345");
      });

      it("should decrypt secret values when revealSecrets is true", async () => {
        const variableId = "var123";

        const mockVariable = {
          id: variableId,
          environmentId: "env123",
          isSecret: true,
          environment: {
            projectId: "project123",
          },
        };

        const mockVersions = [
          {
            id: "version1",
            variableId,
            value: "encrypted-value",
            encryptedDek: '{"encryptedDek":"dek","iv":"iv","authTag":"tag"}',
            changeType: "created",
            changedBy: "user123",
            createdAt: new Date("2024-01-01"),
            user: {
              id: "user123",
              email: "user@example.com",
            },
          },
        ];

        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
          mockVariable
        );
        (prisma.variableVersion.findMany as jest.Mock).mockResolvedValue(
          mockVersions
        );
        (encryptionService.decrypt as jest.Mock).mockResolvedValue(
          "decrypted-secret"
        );

        const result = await variableService.getVariableHistory(
          variableId,
          undefined,
          true
        );

        expect(result[0].value).toBe("decrypted-secret");
        expect(encryptionService.decrypt).toHaveBeenCalled();
      });

      it("should throw NotFoundError if variable does not exist", async () => {
        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(null);

        await expect(
          variableService.getVariableHistory("nonexistent")
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe("getEnvironmentHistory", () => {
      it("should return version history for all variables in environment", async () => {
        const environmentId = "env123";

        const mockEnvironment = {
          id: environmentId,
          projectId: "project123",
        };

        const mockVariables = [
          { id: "var1", key: "API_URL", isSecret: false },
          { id: "var2", key: "API_KEY", isSecret: false },
        ];

        const mockVersions = [
          {
            id: "version2",
            variableId: "var2",
            value: "key-value",
            encryptedDek: null,
            changeType: "created",
            changedBy: "user123",
            createdAt: new Date("2024-01-02"),
            variable: {
              id: "var2",
              key: "API_KEY",
              isSecret: false,
              environmentId,
            },
            user: {
              id: "user123",
              email: "user@example.com",
            },
          },
          {
            id: "version1",
            variableId: "var1",
            value: "https://api.example.com",
            encryptedDek: null,
            changeType: "created",
            changedBy: "user123",
            createdAt: new Date("2024-01-01"),
            variable: {
              id: "var1",
              key: "API_URL",
              isSecret: false,
              environmentId,
            },
            user: {
              id: "user123",
              email: "user@example.com",
            },
          },
        ];

        (prisma.environment.findUnique as jest.Mock).mockResolvedValue(
          mockEnvironment
        );
        (prisma.variable.findMany as jest.Mock).mockResolvedValue(
          mockVariables
        );
        (prisma.variableVersion.findMany as jest.Mock).mockResolvedValue(
          mockVersions
        );

        const result = await variableService.getEnvironmentHistory(
          environmentId
        );

        expect(result).toHaveLength(2);
        expect(result[0].variable.key).toBe("API_KEY");
        expect(result[1].variable.key).toBe("API_URL");
      });

      it("should filter environment history by variable key", async () => {
        const environmentId = "env123";

        const mockEnvironment = {
          id: environmentId,
          projectId: "project123",
        };

        const mockVariables = [
          { id: "var1", key: "API_URL", isSecret: false },
          { id: "var2", key: "API_KEY", isSecret: false },
        ];

        const mockVersions = [
          {
            id: "version2",
            variableId: "var2",
            value: "key-value",
            encryptedDek: null,
            changeType: "created",
            changedBy: "user123",
            createdAt: new Date("2024-01-02"),
            variable: {
              id: "var2",
              key: "API_KEY",
              isSecret: false,
              environmentId,
            },
            user: {
              id: "user123",
              email: "user@example.com",
            },
          },
          {
            id: "version1",
            variableId: "var1",
            value: "https://api.example.com",
            encryptedDek: null,
            changeType: "created",
            changedBy: "user123",
            createdAt: new Date("2024-01-01"),
            variable: {
              id: "var1",
              key: "API_URL",
              isSecret: false,
              environmentId,
            },
            user: {
              id: "user123",
              email: "user@example.com",
            },
          },
        ];

        (prisma.environment.findUnique as jest.Mock).mockResolvedValue(
          mockEnvironment
        );
        (prisma.variable.findMany as jest.Mock).mockResolvedValue(
          mockVariables
        );
        (prisma.variableVersion.findMany as jest.Mock).mockResolvedValue(
          mockVersions
        );

        const result = await variableService.getEnvironmentHistory(
          environmentId,
          { variableKey: "API_URL" }
        );

        expect(result).toHaveLength(1);
        expect(result[0].variable.key).toBe("API_URL");
      });

      it("should return empty array if no variables in environment", async () => {
        const environmentId = "env123";

        const mockEnvironment = {
          id: environmentId,
          projectId: "project123",
        };

        (prisma.environment.findUnique as jest.Mock).mockResolvedValue(
          mockEnvironment
        );
        (prisma.variable.findMany as jest.Mock).mockResolvedValue([]);

        const result = await variableService.getEnvironmentHistory(
          environmentId
        );

        expect(result).toHaveLength(0);
      });

      it("should throw NotFoundError if environment does not exist", async () => {
        (prisma.environment.findUnique as jest.Mock).mockResolvedValue(null);

        await expect(
          variableService.getEnvironmentHistory("nonexistent")
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe("rollbackVariable", () => {
      it("should rollback variable to a previous version", async () => {
        const variableId = "var123";
        const versionId = "version2";
        const userId = "user456";

        const mockVariable = {
          id: variableId,
          environmentId: "env123",
          key: "API_URL",
          value: "https://api-v3.example.com",
          isSecret: false,
          deletedAt: null,
          environment: {
            projectId: "project123",
          },
        };

        const mockVersion = {
          id: versionId,
          variableId,
          value: "https://api-v2.example.com",
          encryptedDek: null,
          changeType: "updated",
          changedBy: "user123",
          createdAt: new Date("2024-01-02"),
        };

        const mockUpdated = {
          ...mockVariable,
          value: mockVersion.value,
        };

        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
          mockVariable
        );
        (prisma.variableVersion.findUnique as jest.Mock).mockResolvedValue(
          mockVersion
        );
        (prisma.variable.update as jest.Mock).mockResolvedValue(mockUpdated);
        (prisma.variableVersion.create as jest.Mock).mockResolvedValue({});

        const result = await variableService.rollbackVariable(
          variableId,
          versionId,
          userId
        );

        expect(result.value).toBe("https://api-v2.example.com");
        expect(prisma.variable.update).toHaveBeenCalledWith({
          where: { id: variableId },
          data: {
            value: mockVersion.value,
            encryptedDek: mockVersion.encryptedDek,
            deletedAt: null,
            updatedAt: expect.any(Date),
          },
        });
        expect(prisma.variableVersion.create).toHaveBeenCalledWith({
          data: {
            variableId,
            value: mockVersion.value,
            encryptedDek: mockVersion.encryptedDek,
            changeType: "rollback",
            changedBy: userId,
          },
        });
      });

      it("should restore a deleted variable when rolling back", async () => {
        const variableId = "var123";
        const versionId = "version1";
        const userId = "user456";

        const mockVariable = {
          id: variableId,
          environmentId: "env123",
          key: "API_URL",
          value: "https://api.example.com",
          isSecret: false,
          deletedAt: new Date("2024-01-05"),
          environment: {
            projectId: "project123",
          },
        };

        const mockVersion = {
          id: versionId,
          variableId,
          value: "https://api-v1.example.com",
          encryptedDek: null,
          changeType: "created",
          changedBy: "user123",
          createdAt: new Date("2024-01-01"),
        };

        const mockRestored = {
          ...mockVariable,
          value: mockVersion.value,
          deletedAt: null,
        };

        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
          mockVariable
        );
        (prisma.variableVersion.findUnique as jest.Mock).mockResolvedValue(
          mockVersion
        );
        (prisma.variable.update as jest.Mock).mockResolvedValue(mockRestored);
        (prisma.variableVersion.create as jest.Mock).mockResolvedValue({});

        const result = await variableService.rollbackVariable(
          variableId,
          versionId,
          userId
        );

        expect(result.deletedAt).toBeNull();
        expect(prisma.variable.update).toHaveBeenCalledWith({
          where: { id: variableId },
          data: {
            value: mockVersion.value,
            encryptedDek: mockVersion.encryptedDek,
            deletedAt: null,
            updatedAt: expect.any(Date),
          },
        });
      });

      it("should throw NotFoundError if variable does not exist", async () => {
        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(null);

        await expect(
          variableService.rollbackVariable("nonexistent", "version1", "user123")
        ).rejects.toThrow(NotFoundError);
      });

      it("should throw NotFoundError if version does not exist", async () => {
        const mockVariable = {
          id: "var123",
          environmentId: "env123",
          environment: {
            projectId: "project123",
          },
        };

        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
          mockVariable
        );
        (prisma.variableVersion.findUnique as jest.Mock).mockResolvedValue(
          null
        );

        await expect(
          variableService.rollbackVariable("var123", "nonexistent", "user123")
        ).rejects.toThrow(NotFoundError);
      });

      it("should throw NotFoundError if version belongs to different variable", async () => {
        const mockVariable = {
          id: "var123",
          environmentId: "env123",
          environment: {
            projectId: "project123",
          },
        };

        const mockVersion = {
          id: "version1",
          variableId: "var456", // Different variable
          value: "value",
          encryptedDek: null,
          changeType: "created",
          changedBy: "user123",
          createdAt: new Date(),
        };

        (prisma.variable.findUnique as jest.Mock).mockResolvedValue(
          mockVariable
        );
        (prisma.variableVersion.findUnique as jest.Mock).mockResolvedValue(
          mockVersion
        );

        await expect(
          variableService.rollbackVariable("var123", "version1", "user123")
        ).rejects.toThrow(NotFoundError);
      });
    });
  });
});
