import authorizationService from "../authorization.service";
import prisma from "../../lib/prisma";
import { ForbiddenError, NotFoundError } from "../../utils/errors";

// Mock Prisma
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    project: {
      findUnique: jest.fn(),
    },
    projectMember: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

describe("AuthorizationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getUserRole", () => {
    it("should return 'owner' if user is project owner", async () => {
      const userId = "user123";
      const projectId = "project123";

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        ownerId: userId,
      });

      const role = await authorizationService.getUserRole(userId, projectId);

      expect(role).toBe("owner");
      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: projectId },
        select: { ownerId: true },
      });
    });

    it("should return member role if user is a project member", async () => {
      const userId = "user123";
      const projectId = "project123";

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        ownerId: "otherUser",
      });

      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
        role: "developer",
      });

      const role = await authorizationService.getUserRole(userId, projectId);

      expect(role).toBe("developer");
    });

    it("should return null if user has no role in project", async () => {
      const userId = "user123";
      const projectId = "project123";

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        ownerId: "otherUser",
      });

      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

      const role = await authorizationService.getUserRole(userId, projectId);

      expect(role).toBeNull();
    });

    it("should throw NotFoundError if project does not exist", async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authorizationService.getUserRole("user123", "project123")
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("hasPermission", () => {
    it("should return true if viewer has read permission", () => {
      expect(authorizationService.hasPermission("viewer", "project:read")).toBe(
        true
      );
      expect(
        authorizationService.hasPermission("viewer", "variable:read")
      ).toBe(true);
    });

    it("should return false if viewer tries to update", () => {
      expect(
        authorizationService.hasPermission("viewer", "variable:update")
      ).toBe(false);
    });

    it("should return true if developer can read secrets", () => {
      expect(
        authorizationService.hasPermission("developer", "variable:read_secrets")
      ).toBe(true);
    });

    it("should return false if developer tries to delete", () => {
      expect(
        authorizationService.hasPermission("developer", "variable:delete")
      ).toBe(false);
    });

    it("should return true if admin can manage members", () => {
      expect(
        authorizationService.hasPermission("admin", "project:manage_members")
      ).toBe(true);
    });

    it("should return false if admin tries to delete project", () => {
      expect(
        authorizationService.hasPermission("admin", "project:delete")
      ).toBe(false);
    });

    it("should return true if owner has all permissions", () => {
      expect(
        authorizationService.hasPermission("owner", "project:delete")
      ).toBe(true);
      expect(
        authorizationService.hasPermission("owner", "variable:delete")
      ).toBe(true);
    });
  });

  describe("checkPermission", () => {
    it("should return true if user has permission", async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        ownerId: "user123",
      });

      const hasPermission = await authorizationService.checkPermission(
        "user123",
        "project123",
        "project:delete"
      );

      expect(hasPermission).toBe(true);
    });

    it("should return false if user does not have permission", async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        ownerId: "otherUser",
      });

      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
        role: "viewer",
      });

      const hasPermission = await authorizationService.checkPermission(
        "user123",
        "project123",
        "variable:update"
      );

      expect(hasPermission).toBe(false);
    });

    it("should return false if user has no role", async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        ownerId: "otherUser",
      });

      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

      const hasPermission = await authorizationService.checkPermission(
        "user123",
        "project123",
        "project:read"
      );

      expect(hasPermission).toBe(false);
    });
  });

  describe("requirePermission", () => {
    it("should not throw if user has permission", async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        ownerId: "user123",
      });

      await expect(
        authorizationService.requirePermission(
          "user123",
          "project123",
          "project:read"
        )
      ).resolves.not.toThrow();
    });

    it("should throw ForbiddenError if user lacks permission", async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        ownerId: "otherUser",
      });

      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
        role: "viewer",
      });

      await expect(
        authorizationService.requirePermission(
          "user123",
          "project123",
          "variable:delete"
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("addProjectMember", () => {
    it("should add member to project", async () => {
      (prisma.projectMember.create as jest.Mock).mockResolvedValue({
        projectId: "project123",
        userId: "user123",
        role: "developer",
      });

      await authorizationService.addProjectMember(
        "project123",
        "user123",
        "developer"
      );

      expect(prisma.projectMember.create).toHaveBeenCalledWith({
        data: {
          projectId: "project123",
          userId: "user123",
          role: "developer",
        },
      });
    });
  });

  describe("removeProjectMember", () => {
    it("should remove member from project", async () => {
      (prisma.projectMember.delete as jest.Mock).mockResolvedValue({});

      await authorizationService.removeProjectMember("project123", "user123");

      expect(prisma.projectMember.delete).toHaveBeenCalledWith({
        where: {
          projectId_userId: {
            projectId: "project123",
            userId: "user123",
          },
        },
      });
    });
  });

  describe("updateMemberRole", () => {
    it("should update member role", async () => {
      (prisma.projectMember.update as jest.Mock).mockResolvedValue({
        role: "admin",
      });

      await authorizationService.updateMemberRole(
        "project123",
        "user123",
        "admin"
      );

      expect(prisma.projectMember.update).toHaveBeenCalledWith({
        where: {
          projectId_userId: {
            projectId: "project123",
            userId: "user123",
          },
        },
        data: { role: "admin" },
      });
    });
  });

  describe("getProjectMembers", () => {
    it("should return all project members", async () => {
      const mockMembers = [
        {
          userId: "user1",
          role: "developer",
          createdAt: new Date(),
          user: {
            id: "user1",
            email: "user1@example.com",
            createdAt: new Date(),
          },
        },
        {
          userId: "user2",
          role: "admin",
          createdAt: new Date(),
          user: {
            id: "user2",
            email: "user2@example.com",
            createdAt: new Date(),
          },
        },
      ];

      (prisma.projectMember.findMany as jest.Mock).mockResolvedValue(
        mockMembers
      );

      const members = await authorizationService.getProjectMembers(
        "project123"
      );

      expect(members).toHaveLength(2);
      expect(members[0]).toHaveProperty("email", "user1@example.com");
      expect(members[1]).toHaveProperty("role", "admin");
    });
  });

  describe("getRolePermissions", () => {
    it("should return permissions for viewer role", () => {
      const permissions = authorizationService.getRolePermissions("viewer");

      expect(permissions).toContain("project:read");
      expect(permissions).toContain("variable:read");
      expect(permissions).not.toContain("variable:update");
    });

    it("should return permissions for owner role", () => {
      const permissions = authorizationService.getRolePermissions("owner");

      expect(permissions).toContain("project:delete");
      expect(permissions).toContain("variable:delete");
    });
  });
});
