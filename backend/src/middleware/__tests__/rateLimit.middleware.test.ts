import { Request, Response, NextFunction } from "express";
import { rateLimit, getRateLimitInfo } from "../rateLimit.middleware";
import redisClient from "../../lib/redis";
import billingService from "../../services/billing.service";

// Mock dependencies
jest.mock("../../lib/redis", () => ({
  __esModule: true,
  default: {
    zRemRangeByScore: jest.fn().mockResolvedValue(0),
    zCard: jest.fn().mockResolvedValue(0),
    zRangeWithScores: jest.fn().mockResolvedValue([]),
    zAdd: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock("../../services/billing.service", () => ({
  __esModule: true,
  default: {
    getUserPlan: jest.fn().mockResolvedValue("free"),
    getUserLimits: jest.fn().mockResolvedValue({
      projects: 1,
      environments: 3,
      apiCallsPerHour: 100,
    }),
  },
}));

describe("Rate Limit Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      path: "/api/v1/projects",
      user: {
        userId: "user-123",
        email: "test@example.com",
      },
    } as any;

    mockResponse = {
      setHeader: jest.fn(),
    };

    nextFunction = jest.fn();
  });

  describe("rateLimit middleware", () => {
    it("should allow request when under rate limit", async () => {
      (redisClient.zCard as jest.Mock).mockResolvedValue(50);

      await rateLimit(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Limit",
        "100"
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Remaining",
        "49"
      );
      expect(redisClient.zAdd).toHaveBeenCalled();
    });

    it("should block request when rate limit exceeded", async () => {
      (redisClient.zCard as jest.Mock).mockResolvedValue(100);
      (redisClient.zRangeWithScores as jest.Mock).mockResolvedValue([
        { value: "request-id", score: Date.now() - 3000000 },
      ]);

      await rateLimit(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "RATE_LIMIT_EXCEEDED",
          statusCode: 429,
        })
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Remaining",
        "0"
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Retry-After",
        expect.any(String)
      );
      expect(redisClient.zAdd).not.toHaveBeenCalled();
    });

    it("should skip rate limiting for health check endpoint", async () => {
      const healthRequest = {
        ...mockRequest,
        path: "/health",
      } as any;

      await rateLimit(
        healthRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
      expect(redisClient.zCard).not.toHaveBeenCalled();
    });

    it("should skip rate limiting for login endpoint", async () => {
      const loginRequest = {
        ...mockRequest,
        path: "/api/v1/auth/login",
      } as any;

      await rateLimit(
        loginRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
      expect(redisClient.zCard).not.toHaveBeenCalled();
    });

    it("should skip rate limiting for register endpoint", async () => {
      const registerRequest = {
        ...mockRequest,
        path: "/api/v1/auth/register",
      } as any;

      await rateLimit(
        registerRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
      expect(redisClient.zCard).not.toHaveBeenCalled();
    });

    it("should skip rate limiting when user is not authenticated", async () => {
      mockRequest.user = undefined;

      await rateLimit(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
      expect(redisClient.zCard).not.toHaveBeenCalled();
    });

    it("should apply different limits for pro tier", async () => {
      (billingService.getUserPlan as jest.Mock).mockResolvedValue("pro");
      (billingService.getUserLimits as jest.Mock).mockResolvedValue({
        projects: 5,
        environments: -1,
        apiCallsPerHour: 1000,
      });
      (redisClient.zCard as jest.Mock).mockResolvedValue(500);

      await rateLimit(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Limit",
        "1000"
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Remaining",
        "499"
      );
    });

    it("should apply different limits for team tier", async () => {
      (billingService.getUserPlan as jest.Mock).mockResolvedValue("team");
      (billingService.getUserLimits as jest.Mock).mockResolvedValue({
        projects: -1,
        environments: -1,
        apiCallsPerHour: 5000,
      });
      (redisClient.zCard as jest.Mock).mockResolvedValue(2000);

      await rateLimit(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Limit",
        "5000"
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Remaining",
        "2999"
      );
    });

    it("should apply different limits for enterprise tier", async () => {
      (billingService.getUserPlan as jest.Mock).mockResolvedValue("enterprise");
      (billingService.getUserLimits as jest.Mock).mockResolvedValue({
        projects: -1,
        environments: -1,
        apiCallsPerHour: 50000,
      });
      (redisClient.zCard as jest.Mock).mockResolvedValue(10000);

      await rateLimit(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Limit",
        "50000"
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Remaining",
        "39999"
      );
    });

    it("should clean up old entries from sliding window", async () => {
      (redisClient.zCard as jest.Mock).mockResolvedValue(50);

      await rateLimit(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(redisClient.zRemRangeByScore).toHaveBeenCalledWith(
        "ratelimit:user-123",
        0,
        expect.any(Number)
      );
    });

    it("should set expiration on Redis key", async () => {
      (redisClient.zCard as jest.Mock).mockResolvedValue(50);

      await rateLimit(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(redisClient.expire).toHaveBeenCalledWith(
        "ratelimit:user-123",
        expect.any(Number)
      );
    });

    it("should include reset timestamp in headers", async () => {
      (redisClient.zCard as jest.Mock).mockResolvedValue(50);

      await rateLimit(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Reset",
        expect.any(String)
      );
    });

    it("should calculate correct retry-after when limit exceeded", async () => {
      const now = Date.now();
      const oldestTimestamp = now - 3000000; // 50 minutes ago

      // Reset to free tier for this test
      (billingService.getUserPlan as jest.Mock).mockResolvedValue("free");
      (billingService.getUserLimits as jest.Mock).mockResolvedValue({
        projects: 1,
        environments: 3,
        apiCallsPerHour: 100,
      });

      (redisClient.zCard as jest.Mock).mockResolvedValue(100);
      (redisClient.zRangeWithScores as jest.Mock).mockResolvedValue([
        { value: "request-id", score: oldestTimestamp },
      ]);

      await rateLimit(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Retry-After",
        expect.stringMatching(/^\d+$/)
      );
    });
  });

  describe("getRateLimitInfo", () => {
    it("should return rate limit info for user", async () => {
      // Reset to free tier for this test
      (billingService.getUserPlan as jest.Mock).mockResolvedValue("free");
      (billingService.getUserLimits as jest.Mock).mockResolvedValue({
        projects: 1,
        environments: 3,
        apiCallsPerHour: 100,
      });
      (redisClient.zCard as jest.Mock).mockResolvedValue(50);

      const info = await getRateLimitInfo("user-123");

      expect(info).toEqual({
        limit: 100,
        remaining: 50,
        reset: expect.any(Number),
      });
    });

    it("should return zero remaining when at limit", async () => {
      // Reset to free tier for this test
      (billingService.getUserPlan as jest.Mock).mockResolvedValue("free");
      (billingService.getUserLimits as jest.Mock).mockResolvedValue({
        projects: 1,
        environments: 3,
        apiCallsPerHour: 100,
      });
      (redisClient.zCard as jest.Mock).mockResolvedValue(100);

      const info = await getRateLimitInfo("user-123");

      expect(info).toEqual({
        limit: 100,
        remaining: 0,
        reset: expect.any(Number),
      });
    });

    it("should return zero remaining when over limit", async () => {
      // Reset to free tier for this test
      (billingService.getUserPlan as jest.Mock).mockResolvedValue("free");
      (billingService.getUserLimits as jest.Mock).mockResolvedValue({
        projects: 1,
        environments: 3,
        apiCallsPerHour: 100,
      });
      (redisClient.zCard as jest.Mock).mockResolvedValue(150);

      const info = await getRateLimitInfo("user-123");

      expect(info).toEqual({
        limit: 100,
        remaining: 0,
        reset: expect.any(Number),
      });
    });

    it("should clean up old entries before counting", async () => {
      await getRateLimitInfo("user-123");

      expect(redisClient.zRemRangeByScore).toHaveBeenCalledWith(
        "ratelimit:user-123",
        0,
        expect.any(Number)
      );
    });

    it("should respect tier-based limits", async () => {
      (billingService.getUserLimits as jest.Mock).mockResolvedValue({
        projects: -1,
        environments: -1,
        apiCallsPerHour: 5000,
      });
      (redisClient.zCard as jest.Mock).mockResolvedValue(2000);

      const info = await getRateLimitInfo("user-123");

      expect(info).toEqual({
        limit: 5000,
        remaining: 3000,
        reset: expect.any(Number),
      });
    });
  });
});
