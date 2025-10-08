import { Request, Response, NextFunction } from "express";
import { authenticate, requireScope } from "../auth.middleware";
import apiKeyService from "../../services/apiKey.service";
import authService from "../../services/auth.service";
import prisma from "../../lib/prisma";
import { AuthError } from "../../utils/errors";

// Mock dependencies
jest.mock("../../services/apiKey.service");
jest.mock("../../services/auth.service");
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

describe("API Key Authentication Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      user: undefined,
    };
    mockResponse = {};
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe("authenticate middleware", () => {
    it("should authenticate with valid API key", async () => {
      mockRequest.headers = {
        authorization: "Bearer ecm_live_validkey123",
      };

      const mockUser = {
        id: "user-123",
        email: "test@example.com",
      };

      (apiKeyService.validateApiKey as jest.Mock).mockResolvedValue({
        userId: "user-123",
        scopes: ["projects:read", "variables:read"],
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(apiKeyService.validateApiKey).toHaveBeenCalledWith(
        "ecm_live_validkey123"
      );
      expect(mockRequest.user).toEqual({
        userId: "user-123",
        email: "test@example.com",
        scopes: ["projects:read", "variables:read"],
      });
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it("should authenticate with valid JWT token", async () => {
      mockRequest.headers = {
        authorization: "Bearer jwt-token-123",
      };

      const mockPayload = {
        userId: "user-123",
        email: "test@example.com",
      };

      (authService.validateToken as jest.Mock).mockResolvedValue(mockPayload);

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.validateToken).toHaveBeenCalledWith("jwt-token-123");
      expect(mockRequest.user).toEqual(mockPayload);
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it("should reject request without authorization header", async () => {
      mockRequest.headers = {};

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AuthError));
    });

    it("should reject request with invalid API key", async () => {
      mockRequest.headers = {
        authorization: "Bearer ecm_live_invalidkey",
      };

      (apiKeyService.validateApiKey as jest.Mock).mockRejectedValue(
        new AuthError("AUTH_INVALID_API_KEY", "Invalid API key", 401)
      );

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AuthError));
    });

    it("should handle user not found for API key", async () => {
      mockRequest.headers = {
        authorization: "Bearer ecm_live_validkey123",
      };

      (apiKeyService.validateApiKey as jest.Mock).mockResolvedValue({
        userId: "user-123",
        scopes: ["projects:read"],
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AuthError));
    });
  });

  describe("requireScope middleware", () => {
    it("should allow request with required scope", () => {
      mockRequest.user = {
        userId: "user-123",
        email: "test@example.com",
        scopes: ["projects:read", "variables:read"],
      };

      (apiKeyService.hasScope as jest.Mock).mockReturnValue(true);

      const middleware = requireScope("projects:read");
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(apiKeyService.hasScope).toHaveBeenCalledWith(
        ["projects:read", "variables:read"],
        "projects:read"
      );
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it("should reject request without required scope", () => {
      mockRequest.user = {
        userId: "user-123",
        email: "test@example.com",
        scopes: ["projects:read"],
      };

      (apiKeyService.hasScope as jest.Mock).mockReturnValue(false);

      const middleware = requireScope("variables:write");
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(apiKeyService.hasScope).toHaveBeenCalledWith(
        ["projects:read"],
        "variables:write"
      );
      expect(nextFunction).toHaveBeenCalledWith(expect.any(AuthError));
    });

    it("should allow JWT authenticated users (no scopes)", () => {
      mockRequest.user = {
        userId: "user-123",
        email: "test@example.com",
        // No scopes property means JWT auth
      };

      const middleware = requireScope("projects:write");
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(apiKeyService.hasScope).not.toHaveBeenCalled();
      expect(nextFunction).toHaveBeenCalledWith();
    });
  });
});
