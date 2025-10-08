import billingService from "../billing.service";
import prisma from "../../lib/prisma";
import redisClient from "../../lib/redis";
import { AppError } from "../../utils/errors";

// Mock Prisma
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    subscription: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    project: {
      count: jest.fn(),
    },
    environment: {
      count: jest.fn(),
    },
  },
}));

// Mock Redis
jest.mock("../../lib/redis", () => ({
  __esModule: true,
  default: {
    incr: jest.fn(),
    expire: jest.fn(),
    get: jest.fn(),
  },
}));

describe("BillingService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getUserPlan", () => {
    it("should return user's active plan", async () => {
      const userId = "user123";

      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "pro",
        status: "active",
      });

      const plan = await billingService.getUserPlan(userId);

      expect(plan).toBe("pro");
    });

    it("should return 'free' if no subscription exists", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

      const plan = await billingService.getUserPlan("user123");

      expect(plan).toBe("free");
    });

    it("should return 'free' if subscription is not active", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "pro",
        status: "canceled",
      });

      const plan = await billingService.getUserPlan("user123");

      expect(plan).toBe("free");
    });
  });

  describe("getUserLimits", () => {
    it("should return free plan limits", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

      const limits = await billingService.getUserLimits("user123");

      expect(limits.projects).toBe(1);
      expect(limits.environments).toBe(3);
      expect(limits.apiCallsPerHour).toBe(100);
    });

    it("should return pro plan limits", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "pro",
        status: "active",
      });

      const limits = await billingService.getUserLimits("user123");

      expect(limits.projects).toBe(5);
      expect(limits.environments).toBe(-1); // unlimited
      expect(limits.apiCallsPerHour).toBe(1000);
    });

    it("should return enterprise plan limits", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "enterprise",
        status: "active",
      });

      const limits = await billingService.getUserLimits("user123");

      expect(limits.projects).toBe(-1); // unlimited
      expect(limits.environments).toBe(-1); // unlimited
      expect(limits.apiCallsPerHour).toBe(50000);
    });
  });

  describe("canCreateProject", () => {
    it("should return true if user is under project limit", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null); // free plan
      (prisma.project.count as jest.Mock).mockResolvedValue(0);

      const canCreate = await billingService.canCreateProject("user123");

      expect(canCreate).toBe(true);
    });

    it("should return false if user has reached project limit", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null); // free plan
      (prisma.project.count as jest.Mock).mockResolvedValue(1);

      const canCreate = await billingService.canCreateProject("user123");

      expect(canCreate).toBe(false);
    });

    it("should return true for unlimited projects (enterprise)", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "enterprise",
        status: "active",
      });
      (prisma.project.count as jest.Mock).mockResolvedValue(100);

      const canCreate = await billingService.canCreateProject("user123");

      expect(canCreate).toBe(true);
    });

    it("should return true if pro user is under limit", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "pro",
        status: "active",
      });
      (prisma.project.count as jest.Mock).mockResolvedValue(4);

      const canCreate = await billingService.canCreateProject("user123");

      expect(canCreate).toBe(true);
    });

    it("should return false if pro user has reached limit", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "pro",
        status: "active",
      });
      (prisma.project.count as jest.Mock).mockResolvedValue(5);

      const canCreate = await billingService.canCreateProject("user123");

      expect(canCreate).toBe(false);
    });
  });

  describe("canCreateEnvironment", () => {
    it("should return true if free user is under environment limit", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.environment.count as jest.Mock).mockResolvedValue(2);

      const canCreate = await billingService.canCreateEnvironment(
        "user123",
        "project123"
      );

      expect(canCreate).toBe(true);
    });

    it("should return false if free user has reached environment limit", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.environment.count as jest.Mock).mockResolvedValue(3);

      const canCreate = await billingService.canCreateEnvironment(
        "user123",
        "project123"
      );

      expect(canCreate).toBe(false);
    });

    it("should return true for unlimited environments (pro)", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "pro",
        status: "active",
      });

      const canCreate = await billingService.canCreateEnvironment(
        "user123",
        "project123"
      );

      expect(canCreate).toBe(true);
      expect(prisma.environment.count).not.toHaveBeenCalled();
    });
  });

  describe("requireCanCreateProject", () => {
    it("should not throw if user can create project", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.project.count as jest.Mock).mockResolvedValue(0);

      await expect(
        billingService.requireCanCreateProject("user123")
      ).resolves.not.toThrow();
    });

    it("should throw AppError if user cannot create project", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.project.count as jest.Mock).mockResolvedValue(1);

      await expect(
        billingService.requireCanCreateProject("user123")
      ).rejects.toThrow(AppError);

      await expect(
        billingService.requireCanCreateProject("user123")
      ).rejects.toMatchObject({
        code: "FORBIDDEN_PLAN_LIMIT",
        statusCode: 403,
      });
    });

    it("should include plan name in error message", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "pro",
        status: "active",
      });
      (prisma.project.count as jest.Mock).mockResolvedValue(5);

      try {
        await billingService.requireCanCreateProject("user123");
        fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).toContain("pro plan");
        expect(error.message).toContain("5");
      }
    });
  });

  describe("requireCanCreateEnvironment", () => {
    it("should not throw if user can create environment", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.environment.count as jest.Mock).mockResolvedValue(2);

      await expect(
        billingService.requireCanCreateEnvironment("user123", "project123")
      ).resolves.not.toThrow();
    });

    it("should throw AppError if user cannot create environment", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.environment.count as jest.Mock).mockResolvedValue(3);

      await expect(
        billingService.requireCanCreateEnvironment("user123", "project123")
      ).rejects.toThrow(AppError);

      await expect(
        billingService.requireCanCreateEnvironment("user123", "project123")
      ).rejects.toMatchObject({
        code: "FORBIDDEN_PLAN_LIMIT",
        statusCode: 403,
      });
    });
  });

  describe("getUserUsage", () => {
    it("should return current usage", async () => {
      (prisma.project.count as jest.Mock).mockResolvedValue(3);
      (prisma.environment.count as jest.Mock).mockResolvedValue(7);

      const usage = await billingService.getUserUsage("user123");

      expect(usage.projects).toBe(3);
      expect(usage.environments).toBe(7);
    });

    it("should return zero usage for new user", async () => {
      (prisma.project.count as jest.Mock).mockResolvedValue(0);
      (prisma.environment.count as jest.Mock).mockResolvedValue(0);

      const usage = await billingService.getUserUsage("user123");

      expect(usage.projects).toBe(0);
      expect(usage.environments).toBe(0);
    });
  });

  describe("createSubscription", () => {
    it("should create a new subscription", async () => {
      const userId = "user123";
      const plan = "pro";

      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.subscription.create as jest.Mock).mockResolvedValue({
        id: "sub123",
        userId,
        plan,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      });

      const subscription = await billingService.createSubscription(
        userId,
        plan
      );

      expect(subscription.plan).toBe(plan);
      expect(subscription.status).toBe("active");
      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            plan,
            status: "active",
          }),
        })
      );
    });

    it("should throw error if subscription already exists", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        id: "sub123",
        plan: "free",
      });

      await expect(
        billingService.createSubscription("user123", "pro")
      ).rejects.toThrow(AppError);

      await expect(
        billingService.createSubscription("user123", "pro")
      ).rejects.toMatchObject({
        code: "VALIDATION_DUPLICATE_SUBSCRIPTION",
        statusCode: 400,
      });
    });

    it("should throw error for invalid plan", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        billingService.createSubscription("user123", "invalid" as any)
      ).rejects.toThrow(AppError);

      await expect(
        billingService.createSubscription("user123", "invalid" as any)
      ).rejects.toMatchObject({
        code: "VALIDATION_INVALID_PLAN",
        statusCode: 400,
      });
    });
  });

  describe("updateSubscription", () => {
    it("should upgrade subscription successfully", async () => {
      const userId = "user123";

      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        id: "sub123",
        userId,
        plan: "free",
        status: "active",
      });

      (prisma.subscription.update as jest.Mock).mockResolvedValue({
        id: "sub123",
        userId,
        plan: "pro",
        status: "active",
      });

      const result = await billingService.updateSubscription(userId, "pro");

      expect(result.subscription.plan).toBe("pro");
      expect(result.isUpgrade).toBe(true);
      expect(result.message).toContain("upgraded");
    });

    it("should downgrade subscription if within limits", async () => {
      const userId = "user123";

      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        id: "sub123",
        userId,
        plan: "pro",
        status: "active",
      });

      (prisma.project.count as jest.Mock).mockResolvedValue(1);
      (prisma.environment.count as jest.Mock).mockResolvedValue(2);

      (prisma.subscription.update as jest.Mock).mockResolvedValue({
        id: "sub123",
        userId,
        plan: "free",
        status: "active",
      });

      const result = await billingService.updateSubscription(userId, "free");

      expect(result.subscription.plan).toBe("free");
      expect(result.isUpgrade).toBe(false);
      expect(result.message).toContain("downgraded");
    });

    it("should throw error if downgrade exceeds project limit", async () => {
      const userId = "user123";

      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        id: "sub123",
        userId,
        plan: "pro",
        status: "active",
      });

      (prisma.project.count as jest.Mock).mockResolvedValue(3); // More than free limit (1)
      (prisma.environment.count as jest.Mock).mockResolvedValue(2);

      await expect(
        billingService.updateSubscription(userId, "free")
      ).rejects.toThrow(AppError);

      await expect(
        billingService.updateSubscription(userId, "free")
      ).rejects.toMatchObject({
        code: "FORBIDDEN_PLAN_LIMIT",
        statusCode: 403,
      });
    });

    it("should throw error if downgrade exceeds environment limit", async () => {
      const userId = "user123";

      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        id: "sub123",
        userId,
        plan: "pro",
        status: "active",
      });

      (prisma.project.count as jest.Mock).mockResolvedValue(1);
      (prisma.environment.count as jest.Mock).mockResolvedValue(5); // More than free limit (3)

      await expect(
        billingService.updateSubscription(userId, "free")
      ).rejects.toThrow(AppError);

      await expect(
        billingService.updateSubscription(userId, "free")
      ).rejects.toMatchObject({
        code: "FORBIDDEN_PLAN_LIMIT",
        statusCode: 403,
      });
    });

    it("should throw error if subscription not found", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        billingService.updateSubscription("user123", "pro")
      ).rejects.toThrow(AppError);

      await expect(
        billingService.updateSubscription("user123", "pro")
      ).rejects.toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        statusCode: 404,
      });
    });
  });

  describe("cancelSubscription", () => {
    it("should cancel subscription successfully", async () => {
      const userId = "user123";

      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        id: "sub123",
        userId,
        plan: "pro",
        status: "active",
      });

      (prisma.subscription.update as jest.Mock).mockResolvedValue({
        id: "sub123",
        userId,
        plan: "pro",
        status: "canceled",
      });

      const result = await billingService.cancelSubscription(userId);

      expect(result.status).toBe("canceled");
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          data: expect.objectContaining({
            status: "canceled",
          }),
        })
      );
    });

    it("should throw error if subscription not found", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        billingService.cancelSubscription("user123")
      ).rejects.toThrow(AppError);

      await expect(
        billingService.cancelSubscription("user123")
      ).rejects.toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        statusCode: 404,
      });
    });
  });

  describe("getSubscription", () => {
    it("should return subscription if exists", async () => {
      const userId = "user123";

      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        id: "sub123",
        userId,
        plan: "pro",
        status: "active",
        user: {
          id: userId,
          email: "user@example.com",
        },
      });

      const subscription = await billingService.getSubscription(userId);

      expect(subscription.plan).toBe("pro");
      expect(subscription.status).toBe("active");
    });

    it("should return default free plan if no subscription", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

      const subscription = await billingService.getSubscription("user123");

      expect(subscription.plan).toBe("free");
      expect(subscription.status).toBe("active");
    });
  });

  describe("checkLimit", () => {
    it("should check project limit correctly", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.project.count as jest.Mock).mockResolvedValue(0);

      const check = await billingService.checkLimit("user123", "projects");

      expect(check.allowed).toBe(true);
      expect(check.current).toBe(0);
      expect(check.limit).toBe(1);
      expect(check.resourceType).toBe("projects");
    });

    it("should check environment limit correctly", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.environment.count as jest.Mock).mockResolvedValue(2);

      const check = await billingService.checkLimit("user123", "environments");

      expect(check.allowed).toBe(true);
      expect(check.current).toBe(2);
      expect(check.limit).toBe(3);
    });

    it("should check API calls limit correctly", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (redisClient.get as jest.Mock).mockResolvedValue("50");

      const check = await billingService.checkLimit("user123", "api_calls");

      expect(check.allowed).toBe(true);
      expect(check.current).toBe(50);
      expect(check.limit).toBe(100);
    });

    it("should return allowed false when limit exceeded", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.project.count as jest.Mock).mockResolvedValue(1);

      const check = await billingService.checkLimit("user123", "projects");

      expect(check.allowed).toBe(false);
      expect(check.current).toBe(1);
      expect(check.limit).toBe(1);
    });
  });

  describe("trackApiCall", () => {
    it("should track API call in Redis", async () => {
      (redisClient.incr as jest.Mock).mockResolvedValue(1);
      (redisClient.expire as jest.Mock).mockResolvedValue(1);

      await billingService.trackApiCall("user123");

      expect(redisClient.incr).toHaveBeenCalled();
      expect(redisClient.expire).toHaveBeenCalledWith(expect.any(String), 7200);
    });

    it("should not throw error if Redis fails", async () => {
      (redisClient.incr as jest.Mock).mockRejectedValue(
        new Error("Redis error")
      );

      await expect(
        billingService.trackApiCall("user123")
      ).resolves.not.toThrow();
    });
  });

  describe("getApiCallCount", () => {
    it("should return API call count from Redis", async () => {
      (redisClient.get as jest.Mock).mockResolvedValue("42");

      const count = await billingService.getApiCallCount("user123");

      expect(count).toBe(42);
    });

    it("should return 0 if no data in Redis", async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);

      const count = await billingService.getApiCallCount("user123");

      expect(count).toBe(0);
    });

    it("should return 0 if Redis fails", async () => {
      (redisClient.get as jest.Mock).mockRejectedValue(
        new Error("Redis error")
      );

      const count = await billingService.getApiCallCount("user123");

      expect(count).toBe(0);
    });
  });

  describe("checkApiRateLimit", () => {
    it("should return true if under limit", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (redisClient.get as jest.Mock).mockResolvedValue("50");

      const allowed = await billingService.checkApiRateLimit("user123");

      expect(allowed).toBe(true);
    });

    it("should return false if at or over limit", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (redisClient.get as jest.Mock).mockResolvedValue("100");

      const allowed = await billingService.checkApiRateLimit("user123");

      expect(allowed).toBe(false);
    });
  });

  describe("requireApiRateLimit", () => {
    it("should not throw if under limit", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (redisClient.get as jest.Mock).mockResolvedValue("50");

      await expect(
        billingService.requireApiRateLimit("user123")
      ).resolves.not.toThrow();
    });

    it("should throw error if limit exceeded", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      (redisClient.get as jest.Mock).mockResolvedValue("100");

      await expect(
        billingService.requireApiRateLimit("user123")
      ).rejects.toThrow(AppError);

      await expect(
        billingService.requireApiRateLimit("user123")
      ).rejects.toMatchObject({
        code: "FORBIDDEN_PLAN_LIMIT",
        statusCode: 429,
      });
    });
  });

  describe("getUserFeatures", () => {
    it("should return free plan features", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

      const features = await billingService.getUserFeatures("user123");

      expect(features.rbac).toBe(false);
      expect(features.secretRotation).toBe(false);
      expect(features.auditLogRetentionDays).toBe(30);
    });

    it("should return enterprise plan features", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "enterprise",
        status: "active",
      });

      const features = await billingService.getUserFeatures("user123");

      expect(features.rbac).toBe(true);
      expect(features.secretRotation).toBe(true);
      expect(features.auditLogRetentionDays).toBe(730);
      expect(features.siemIntegration).toBe(true);
      expect(features.customEncryptionKeys).toBe(true);
    });
  });

  describe("hasFeature", () => {
    it("should return true if user has feature", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "enterprise",
        status: "active",
      });

      const hasRbac = await billingService.hasFeature("user123", "rbac");

      expect(hasRbac).toBe(true);
    });

    it("should return false if user does not have feature", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

      const hasRbac = await billingService.hasFeature("user123", "rbac");

      expect(hasRbac).toBe(false);
    });
  });

  describe("getUsageStats", () => {
    it("should return comprehensive usage statistics", async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "pro",
        status: "active",
      });
      (prisma.project.count as jest.Mock).mockResolvedValue(3);
      (prisma.environment.count as jest.Mock).mockResolvedValue(10);
      (redisClient.get as jest.Mock).mockResolvedValue("500");

      const stats = await billingService.getUsageStats("user123");

      expect(stats.plan).toBe("pro");
      expect(stats.usage.projects).toBe(3);
      expect(stats.usage.environments).toBe(10);
      expect(stats.usage.apiCallsThisHour).toBe(500);
      expect(stats.limits.projects).toBe(5);
      expect(stats.limits.apiCallsPerHour).toBe(1000);
      expect(stats.features.rbac).toBe(false);
      expect(stats.percentages.projects).toBe(60); // 3/5 * 100
      expect(stats.percentages.apiCalls).toBe(50); // 500/1000 * 100
    });
  });
});
