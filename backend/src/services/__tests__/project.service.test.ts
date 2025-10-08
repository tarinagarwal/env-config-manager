import projectService from "../project.service";
import prisma from "../../lib/prisma";
import { NotFoundError } from "../../utils/errors";

// Mock Prisma
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    project: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    projectMember: {
      findMany: jest.fn(),
    },
  },
}));

describe("ProjectService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createProject", () => {
    it("should create a new project", async () => {
      const userId = "user123";
      const projectData = {
        name: "Test Project",
        description: "Test Description",
      };

      const mockProject = {
        id: "project123",
        name: projectData.name,
        description: projectData.description,
        ownerId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: {
          id: userId,
          email: "test@example.com",
        },
      };

      (prisma.project.create as jest.Mock).mockResolvedValue(mockProject);

      const result = await projectService.createProject(userId, projectData);

      expect(result).toEqual(mockProject);
      expect(prisma.project.create).toHaveBeenCalledWith({
        data: {
          name: projectData.name,
          description: projectData.description,
          ownerId: userId,
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });
    });

    it("should create a project without description", async () => {
      const userId = "user123";
      const projectData = {
        name: "Test Project",
      };

      const mockProject = {
        id: "project123",
        name: projectData.name,
        description: null,
        ownerId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: {
          id: userId,
          email: "test@example.com",
        },
      };

      (prisma.project.create as jest.Mock).mockResolvedValue(mockProject);

      const result = await projectService.createProject(userId, projectData);

      expect(result.description).toBeNull();
    });
  });

  describe("getUserProjects", () => {
    it("should return owned and member projects", async () => {
      const userId = "user123";

      const mockOwnedProjects = [
        {
          id: "project1",
          name: "Owned Project",
          description: "Description",
          ownerId: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          owner: {
            id: userId,
            email: "test@example.com",
          },
          _count: {
            environments: 2,
            members: 1,
          },
        },
      ];

      const mockMemberProjects = [
        {
          id: "member1",
          projectId: "project2",
          userId: userId,
          role: "developer",
          createdAt: new Date(),
          project: {
            id: "project2",
            name: "Member Project",
            description: "Description",
            ownerId: "otherUser",
            createdAt: new Date(),
            updatedAt: new Date(),
            owner: {
              id: "otherUser",
              email: "other@example.com",
            },
            _count: {
              environments: 3,
              members: 2,
            },
          },
        },
      ];

      (prisma.project.findMany as jest.Mock).mockResolvedValue(
        mockOwnedProjects
      );
      (prisma.projectMember.findMany as jest.Mock).mockResolvedValue(
        mockMemberProjects
      );

      const result = await projectService.getUserProjects(userId);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("owner");
      expect(result[0].environmentCount).toBe(2);
      expect(result[0].memberCount).toBe(2); // 1 member + 1 owner
      expect(result[1].role).toBe("developer");
      expect(result[1].environmentCount).toBe(3);
    });

    it("should return empty array if user has no projects", async () => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.projectMember.findMany as jest.Mock).mockResolvedValue([]);

      const result = await projectService.getUserProjects("user123");

      expect(result).toEqual([]);
    });
  });

  describe("getProjectById", () => {
    it("should return project by id", async () => {
      const projectId = "project123";

      const mockProject = {
        id: projectId,
        name: "Test Project",
        description: "Description",
        ownerId: "user123",
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: {
          id: "user123",
          email: "test@example.com",
        },
        _count: {
          environments: 2,
          members: 1,
        },
      };

      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);

      const result = await projectService.getProjectById(projectId);

      expect(result.id).toBe(projectId);
      expect(result.environmentCount).toBe(2);
      expect(result.memberCount).toBe(2);
    });

    it("should throw NotFoundError if project does not exist", async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        projectService.getProjectById("nonexistent")
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateProject", () => {
    it("should update project name and description", async () => {
      const projectId = "project123";
      const updateData = {
        name: "Updated Name",
        description: "Updated Description",
      };

      const mockUpdatedProject = {
        id: projectId,
        name: updateData.name,
        description: updateData.description,
        ownerId: "user123",
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: {
          id: "user123",
          email: "test@example.com",
        },
      };

      (prisma.project.update as jest.Mock).mockResolvedValue(
        mockUpdatedProject
      );

      const result = await projectService.updateProject(projectId, updateData);

      expect(result.name).toBe(updateData.name);
      expect(result.description).toBe(updateData.description);
    });

    it("should update only name if description not provided", async () => {
      const projectId = "project123";
      const updateData = {
        name: "Updated Name",
      };

      const mockUpdatedProject = {
        id: projectId,
        name: updateData.name,
        description: "Old Description",
        ownerId: "user123",
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: {
          id: "user123",
          email: "test@example.com",
        },
      };

      (prisma.project.update as jest.Mock).mockResolvedValue(
        mockUpdatedProject
      );

      await projectService.updateProject(projectId, updateData);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: projectId },
        data: {
          name: updateData.name,
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });
    });
  });

  describe("deleteProject", () => {
    it("should delete a project", async () => {
      const projectId = "project123";

      (prisma.project.delete as jest.Mock).mockResolvedValue({});

      await projectService.deleteProject(projectId);

      expect(prisma.project.delete).toHaveBeenCalledWith({
        where: { id: projectId },
      });
    });
  });

  describe("countUserProjects", () => {
    it("should return count of user projects", async () => {
      const userId = "user123";

      (prisma.project.count as jest.Mock).mockResolvedValue(5);

      const result = await projectService.countUserProjects(userId);

      expect(result).toBe(5);
      expect(prisma.project.count).toHaveBeenCalledWith({
        where: { ownerId: userId },
      });
    });

    it("should return 0 if user has no projects", async () => {
      (prisma.project.count as jest.Mock).mockResolvedValue(0);

      const result = await projectService.countUserProjects("user123");

      expect(result).toBe(0);
    });
  });
});
