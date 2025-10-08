import environmentService from "../environment.service";
import prisma from "../../lib/prisma";
import { NotFoundError, ValidationError } from "../../utils/errors";

// Mock Prisma
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    environment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe("EnvironmentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createEnvironment", () => {
    it("should create a new environment", async () => {
      const projectId = "project123";
      const environmentData = {
        name: "production",
      };

      const mockEnvironment = {
        id: "env123",
        projectId,
        name: environmentData.name,
        createdAt: new Date(),
        updatedAt: new Date(),
        project: {
          id: projectId,
          name: "Test Project",
        },
        _count: {
          variables: 0,
        },
      };

      // Mock findUnique to return null (no existing environment)
      (prisma.environment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.environment.create as jest.Mock).mockResolvedValue(
        mockEnvironment
      );

      const result = await environmentService.createEnvironment(
        projectId,
        environmentData
      );

      expect(result.id).toBe("env123");
      expect(result.name).toBe(environmentData.name);
      expect(result.variableCount).toBe(0);
      expect(prisma.environment.findUnique).toHaveBeenCalledWith({
        where: {
          projectId_name: {
            projectId,
            name: environmentData.name,
          },
        },
      });
      expect(prisma.environment.create).toHaveBeenCalledWith({
        data: {
          projectId,
          name: environmentData.name,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              variables: true,
            },
          },
        },
      });
    });

    it("should throw ValidationError if environment name already exists", async () => {
      const projectId = "project123";
      const environmentData = {
        name: "production",
      };

      const existingEnvironment = {
        id: "env123",
        projectId,
        name: environmentData.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.environment.findUnique as jest.Mock).mockResolvedValue(
        existingEnvironment
      );

      await expect(
        environmentService.createEnvironment(projectId, environmentData)
      ).rejects.toThrow(ValidationError);
      await expect(
        environmentService.createEnvironment(projectId, environmentData)
      ).rejects.toThrow(
        "Environment with name 'production' already exists in this project"
      );

      expect(prisma.environment.create).not.toHaveBeenCalled();
    });
  });

  describe("getEnvironments", () => {
    it("should return all environments for a project", async () => {
      const projectId = "project123";

      const mockEnvironments = [
        {
          id: "env1",
          projectId,
          name: "development",
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
          _count: {
            variables: 5,
          },
        },
        {
          id: "env2",
          projectId,
          name: "production",
          createdAt: new Date("2024-01-02"),
          updatedAt: new Date("2024-01-02"),
          _count: {
            variables: 10,
          },
        },
      ];

      (prisma.environment.findMany as jest.Mock).mockResolvedValue(
        mockEnvironments
      );

      const result = await environmentService.getEnvironments(projectId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("development");
      expect(result[0].variableCount).toBe(5);
      expect(result[1].name).toBe("production");
      expect(result[1].variableCount).toBe(10);
      expect(prisma.environment.findMany).toHaveBeenCalledWith({
        where: { projectId },
        include: {
          _count: {
            select: {
              variables: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    });

    it("should return empty array if project has no environments", async () => {
      (prisma.environment.findMany as jest.Mock).mockResolvedValue([]);

      const result = await environmentService.getEnvironments("project123");

      expect(result).toEqual([]);
    });
  });

  describe("getEnvironmentById", () => {
    it("should return environment by id", async () => {
      const environmentId = "env123";

      const mockEnvironment = {
        id: environmentId,
        projectId: "project123",
        name: "production",
        createdAt: new Date(),
        updatedAt: new Date(),
        project: {
          id: "project123",
          name: "Test Project",
        },
        _count: {
          variables: 15,
        },
      };

      (prisma.environment.findUnique as jest.Mock).mockResolvedValue(
        mockEnvironment
      );

      const result = await environmentService.getEnvironmentById(environmentId);

      expect(result.id).toBe(environmentId);
      expect(result.name).toBe("production");
      expect(result.variableCount).toBe(15);
      expect(prisma.environment.findUnique).toHaveBeenCalledWith({
        where: { id: environmentId },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              variables: true,
            },
          },
        },
      });
    });

    it("should throw NotFoundError if environment does not exist", async () => {
      (prisma.environment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        environmentService.getEnvironmentById("nonexistent")
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteEnvironment", () => {
    it("should delete an environment", async () => {
      const environmentId = "env123";

      (prisma.environment.delete as jest.Mock).mockResolvedValue({});

      await environmentService.deleteEnvironment(environmentId);

      expect(prisma.environment.delete).toHaveBeenCalledWith({
        where: { id: environmentId },
      });
    });
  });

  describe("countProjectEnvironments", () => {
    it("should return count of environments in a project", async () => {
      const projectId = "project123";

      (prisma.environment.count as jest.Mock).mockResolvedValue(3);

      const result = await environmentService.countProjectEnvironments(
        projectId
      );

      expect(result).toBe(3);
      expect(prisma.environment.count).toHaveBeenCalledWith({
        where: { projectId },
      });
    });

    it("should return 0 if project has no environments", async () => {
      (prisma.environment.count as jest.Mock).mockResolvedValue(0);

      const result = await environmentService.countProjectEnvironments(
        "project123"
      );

      expect(result).toBe(0);
    });
  });

  describe("countUserEnvironments", () => {
    it("should return total count of environments across all user projects", async () => {
      const userId = "user123";

      (prisma.environment.count as jest.Mock).mockResolvedValue(7);

      const result = await environmentService.countUserEnvironments(userId);

      expect(result).toBe(7);
      expect(prisma.environment.count).toHaveBeenCalledWith({
        where: {
          project: {
            ownerId: userId,
          },
        },
      });
    });

    it("should return 0 if user has no environments", async () => {
      (prisma.environment.count as jest.Mock).mockResolvedValue(0);

      const result = await environmentService.countUserEnvironments("user123");

      expect(result).toBe(0);
    });
  });
});
