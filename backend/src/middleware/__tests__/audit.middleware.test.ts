import { Request, Response, NextFunction } from "express";
import { auditLog, logUnauthorizedAccess } from "../audit.middleware";
import auditService from "../../services/audit.service";

// Mock audit service
jest.mock("../../services/audit.service", () => ({
  __esModule: true,
  default: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("Audit Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      method: "POST",
      path: "/api/v1/variables",
      params: {},
      query: {},
      body: {},
      headers: {},
      socket: {
        remoteAddress: "192.168.1.1",
      } as any,
      user: {
        userId: "user-123",
        email: "test@example.com",
      },
    };

    mockResponse = {
      statusCode: 200,
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    nextFunction = jest.fn();
  });

  describe("auditLog", () => {
    it("should log audit event on successful request", async () => {
      const middleware = auditLog("variable.create", "variable");

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();

      // Trigger the response
      mockResponse.send!("success");

      // Wait for async logging
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-123",
          action: "variable.create",
          resourceType: "variable",
          ipAddress: "192.168.1.1",
        })
      );
    });

    it("should extract resource ID from params", async () => {
      mockRequest.params = { id: "var-123" };
      const middleware = auditLog("variable.update", "variable");

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      mockResponse.send!("success");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: "var-123",
        })
      );
    });

    it("should sanitize password from body", async () => {
      mockRequest.body = {
        email: "test@example.com",
        password: "SecretPassword123",
      };

      const middleware = auditLog("auth.register", "user");

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      mockResponse.send!("success");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            body: expect.objectContaining({
              password: "[REDACTED]",
            }),
          }),
        })
      );
    });

    it("should sanitize secret variable values", async () => {
      mockRequest.body = {
        key: "API_KEY",
        value: "secret-value",
        isSecret: true,
      };

      const middleware = auditLog("variable.create", "variable");

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      mockResponse.send!("success");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            body: expect.objectContaining({
              value: "[REDACTED]",
            }),
          }),
        })
      );
    });

    it("should not log on error responses", async () => {
      mockResponse.statusCode = 400;
      const middleware = auditLog("variable.create", "variable");

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      mockResponse.send!("error");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).not.toHaveBeenCalled();
    });

    it("should extract IP from x-forwarded-for header", async () => {
      mockRequest.headers = {
        "x-forwarded-for": "203.0.113.1, 198.51.100.1",
      };

      const middleware = auditLog("variable.create", "variable");

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      mockResponse.send!("success");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: "203.0.113.1",
        })
      );
    });

    it("should include user agent in audit log", async () => {
      mockRequest.headers = {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      };

      const middleware = auditLog("variable.create", "variable");

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      mockResponse.send!("success");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        })
      );
    });
  });

  describe("logUnauthorizedAccess", () => {
    it("should log unauthorized access on 401 response", async () => {
      logUnauthorizedAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();

      // Trigger 401 status
      mockResponse.status!(401);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "access.unauthorized",
          resourceType: "user",
          metadata: expect.objectContaining({
            statusCode: 401,
          }),
        })
      );
    });

    it("should log unauthorized access on 403 response", async () => {
      logUnauthorizedAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      mockResponse.status!(403);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "access.unauthorized",
          metadata: expect.objectContaining({
            statusCode: 403,
          }),
        })
      );
    });

    it("should not log on successful responses", async () => {
      logUnauthorizedAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      mockResponse.status!(200);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).not.toHaveBeenCalled();
    });

    it("should not log on other error responses", async () => {
      logUnauthorizedAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      mockResponse.status!(500);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.log).not.toHaveBeenCalled();
    });
  });
});
