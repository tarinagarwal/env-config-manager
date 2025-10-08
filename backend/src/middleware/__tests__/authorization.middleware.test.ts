import { Request, Response, NextFunction } from "express";
import {
  requirePermission,
  extractProjectFromEnvironment,
  extractProjectFromVariable,
} from "../authorization.middleware";
import authorizationService from "../../services/authorization.service";
import { ForbiddenError, ValidationError } from "../../utils/errors";

// Mock authorization service
jest.mock("../../services/authorization.service");

// Mock prisma
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    environment: {
      findUnique: jest.fn(),
    },
    variable: {
      findUnique: jest.fn(),
    },
  },
}));

describe("Authorization Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      user: {
        userId: "user123",
        email: "test@example.com",
        iat: Date.now(),
        exp: Date.now() + 3600,
      },
      params: {},
      body: {},
    };
    mockResponse = {};
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe("requirePermission", () => {
    it("should call next if user has permission", async () => {
      mockRequest.params = { projectId: "project123" };

      (authorizationService.requirePermission as jest.Mock).mockResolvedValue(
        undefined
      );

      const middleware = requirePermission("project:read");
      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(authorizationService.requirePermission).toHaveBeenCalledWith(
        "user123",
        "project123",
        "project:read"
      );
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.projectId).toBe("project123");
    });

    it("should extract projectId from body", async () => {
      mockRequest.body = { projectId: "project456" };

      (authorizationService.requirePermission as jest.Mock).mockResolvedValue(
        undefined
      );

      const middleware = requirePermission("project:update");
      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(authorizationService.requirePermission).toHaveBeenCalledWith(
        "user123",
        "project456",
        "project:update"
      );
    });

    it("should call next with ForbiddenError if user not authenticated", async () => {
      mockRequest.user = undefined;

      const middleware = requirePermission("project:read");
      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it("should call next with ValidationError if projectId missing", async () => {
      const middleware = requirePermission("project:read");
      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it("should call next with error if permission check fails", async () => {
      mockRequest.params = { projectId: "project123" };

      const error = new ForbiddenError("Insufficient permissions");
      (authorizationService.requirePermission as jest.Mock).mockRejectedValue(
        error
      );

      const middleware = requirePermission("project:delete");
      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("extractProjectFromEnvironment", () => {
    it("should extract projectId from environment", async () => {
      mockRequest.params = { environmentId: "env123" };

      const prisma = require("../../lib/prisma").default;
      (prisma.environment.findUnique as jest.Mock).mockResolvedValue({
        projectId: "project123",
      });

      await extractProjectFromEnvironment(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.projectId).toBe("project123");
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should handle envId param", async () => {
      mockRequest.params = { envId: "env456" };

      const prisma = require("../../lib/prisma").default;
      (prisma.environment.findUnique as jest.Mock).mockResolvedValue({
        projectId: "project456",
      });

      await extractProjectFromEnvironment(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.projectId).toBe("project456");
    });

    it("should call next without setting projectId if environment not found", async () => {
      mockRequest.params = { environmentId: "env123" };

      const prisma = require("../../lib/prisma").default;
      (prisma.environment.findUnique as jest.Mock).mockResolvedValue(null);

      await extractProjectFromEnvironment(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.projectId).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should call next if no environmentId in params", async () => {
      await extractProjectFromEnvironment(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should call next with error if database query fails", async () => {
      mockRequest.params = { environmentId: "env123" };

      const prisma = require("../../lib/prisma").default;
      const error = new Error("Database error");
      (prisma.environment.findUnique as jest.Mock).mockRejectedValue(error);

      await extractProjectFromEnvironment(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("extractProjectFromVariable", () => {
    it("should extract projectId from variable", async () => {
      mockRequest.params = { variableId: "var123" };

      const prisma = require("../../lib/prisma").default;
      (prisma.variable.findUnique as jest.Mock).mockResolvedValue({
        environment: {
          projectId: "project123",
        },
      });

      await extractProjectFromVariable(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.projectId).toBe("project123");
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should handle id param", async () => {
      mockRequest.params = { id: "var456" };

      const prisma = require("../../lib/prisma").default;
      (prisma.variable.findUnique as jest.Mock).mockResolvedValue({
        environment: {
          projectId: "project456",
        },
      });

      await extractProjectFromVariable(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.projectId).toBe("project456");
    });

    it("should call next without setting projectId if variable not found", async () => {
      mockRequest.params = { variableId: "var123" };

      const prisma = require("../../lib/prisma").default;
      (prisma.variable.findUnique as jest.Mock).mockResolvedValue(null);

      await extractProjectFromVariable(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.projectId).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should call next if no variableId in params", async () => {
      await extractProjectFromVariable(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
