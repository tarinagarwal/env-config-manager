import variablePermissionService from "../variablePermission.service";
import authorizationService from "../authorization.service";
import prisma from "../../lib/prisma";
import { ForbiddenError } from "../../utils/errors";

// Mock dependencies
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    variable: {
      findUnique: jest.fn(),
    },
    environment: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("../authorization.service");

describe("VariablePermissionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("canReadVariable", () => {
    it("should return true if user can read non-secret variable", async () => {
      const mockVariable = {
        id: "var123",
        isSecret: false,
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        true
      );

      const canRead = await variablePermissionService.canReadVariable(
        "user123",
        "var123"
      );

      expect(canRead).toBe(true);
    });

    it("should return false if user cannot read variable", async () => {
      const mockVariable = {
        id: "var123",
        isSecret: false,
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        false
      );

      const canRead = await variablePermissionService.canReadVariable(
        "user123",
        "var123"
      );

      expect(canRead).toBe(false);
    });

    it("should check secret permission for secret variables", async () => {
      const mockVariable = {
        id: "var123",
        isSecret: true,
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock)
        .mockResolvedValueOnce(true) // variable:read
        .mockResolvedValueOnce(true); // variable:read_secrets

      const canRead = await variablePermissionService.canReadVariable(
        "user123",
        "var123",
        true
      );

      expect(canRead).toBe(true);
      expect(authorizationService.checkPermission).toHaveBeenCalledWith(
        "user123",
        "project123",
        "variable:read_secrets"
      );
    });

    it("should return false if user cannot read secrets", async () => {
      const mockVariable = {
        id: "var123",
        isSecret: true,
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock)
        .mockResolvedValueOnce(true) // variable:read
        .mockResolvedValueOnce(false); // variable:read_secrets

      const canRead = await variablePermissionService.canReadVariable(
        "user123",
        "var123",
        true
      );

      expect(canRead).toBe(false);
    });

    it("should return false if variable does not exist", async () => {
      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(null);

      const canRead = await variablePermissionService.canReadVariable(
        "user123",
        "var123"
      );

      expect(canRead).toBe(false);
    });
  });

  describe("canUpdateVariable", () => {
    it("should check update permission for non-secret variable", async () => {
      const mockVariable = {
        id: "var123",
        isSecret: false,
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        true
      );

      const canUpdate = await variablePermissionService.canUpdateVariable(
        "user123",
        "var123"
      );

      expect(canUpdate).toBe(true);
      expect(authorizationService.checkPermission).toHaveBeenCalledWith(
        "user123",
        "project123",
        "variable:update"
      );
    });

    it("should check update_secrets permission for secret variable", async () => {
      const mockVariable = {
        id: "var123",
        isSecret: true,
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        true
      );

      const canUpdate = await variablePermissionService.canUpdateVariable(
        "user123",
        "var123"
      );

      expect(canUpdate).toBe(true);
      expect(authorizationService.checkPermission).toHaveBeenCalledWith(
        "user123",
        "project123",
        "variable:update_secrets"
      );
    });
  });

  describe("canDeleteVariable", () => {
    it("should check delete permission", async () => {
      const mockVariable = {
        id: "var123",
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        true
      );

      const canDelete = await variablePermissionService.canDeleteVariable(
        "user123",
        "var123"
      );

      expect(canDelete).toBe(true);
      expect(authorizationService.checkPermission).toHaveBeenCalledWith(
        "user123",
        "project123",
        "variable:delete"
      );
    });
  });

  describe("requireReadVariable", () => {
    it("should not throw if user can read variable", async () => {
      const mockVariable = {
        id: "var123",
        isSecret: false,
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        true
      );

      await expect(
        variablePermissionService.requireReadVariable("user123", "var123")
      ).resolves.not.toThrow();
    });

    it("should throw ForbiddenError if user cannot read variable", async () => {
      const mockVariable = {
        id: "var123",
        isSecret: false,
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        false
      );

      await expect(
        variablePermissionService.requireReadVariable("user123", "var123")
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("requireUpdateVariable", () => {
    it("should throw ForbiddenError if user cannot update", async () => {
      const mockVariable = {
        id: "var123",
        isSecret: false,
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        false
      );

      await expect(
        variablePermissionService.requireUpdateVariable("user123", "var123")
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("requireDeleteVariable", () => {
    it("should throw ForbiddenError if user cannot delete", async () => {
      const mockVariable = {
        id: "var123",
        environment: { projectId: "project123" },
      };

      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(mockVariable);
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        false
      );

      await expect(
        variablePermissionService.requireDeleteVariable("user123", "var123")
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("filterVariables", () => {
    it("should mask secret values if user cannot read secrets", async () => {
      const mockVariables = [
        {
          id: "var1",
          environmentId: "env123",
          key: "API_KEY",
          value: "secret123",
          isSecret: true,
        },
        {
          id: "var2",
          environmentId: "env123",
          key: "PUBLIC_URL",
          value: "https://example.com",
          isSecret: false,
        },
      ];

      (prisma.environment.findUnique as jest.Mock).mockResolvedValue({
        projectId: "project123",
      });
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        false
      );

      const filtered = await variablePermissionService.filterVariables(
        "user123",
        mockVariables
      );

      expect(filtered[0].value).toBe("***MASKED***");
      expect(filtered[1].value).toBe("https://example.com");
    });

    it("should not mask secret values if user can read secrets", async () => {
      const mockVariables = [
        {
          id: "var1",
          environmentId: "env123",
          key: "API_KEY",
          value: "secret123",
          isSecret: true,
        },
      ];

      (prisma.environment.findUnique as jest.Mock).mockResolvedValue({
        projectId: "project123",
      });
      (authorizationService.checkPermission as jest.Mock).mockResolvedValue(
        true
      );

      const filtered = await variablePermissionService.filterVariables(
        "user123",
        mockVariables
      );

      expect(filtered[0].value).toBe("secret123");
    });

    it("should return empty array for empty input", async () => {
      const filtered = await variablePermissionService.filterVariables(
        "user123",
        []
      );

      expect(filtered).toEqual([]);
    });
  });
});
