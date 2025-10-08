import prisma from "../lib/prisma";
import redisClient from "../lib/redis";
import { AppError } from "../utils/errors";

type PlanType = "free" | "pro" | "team" | "enterprise";
type ResourceType = "projects" | "environments" | "api_calls";

interface PlanLimits {
  projects: number;
  environments: number;
  apiCallsPerHour: number;
}

interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
  resourceType: ResourceType;
}

interface PlanFeatures {
  rbac: boolean; // Role-based access control
  secretRotation: boolean;
  auditLogRetentionDays: number;
  siemIntegration: boolean;
  customEncryptionKeys: boolean;
  onPremiseDeployment: boolean;
  prioritySupport: boolean;
}

class BillingService {
  // Define plan limits
  private planLimits: Record<PlanType, PlanLimits> = {
    free: {
      projects: 1,
      environments: 3,
      apiCallsPerHour: 100,
    },
    pro: {
      projects: 5,
      environments: -1, // unlimited
      apiCallsPerHour: 1000,
    },
    team: {
      projects: -1, // unlimited
      environments: -1, // unlimited
      apiCallsPerHour: 5000,
    },
    enterprise: {
      projects: -1, // unlimited
      environments: -1, // unlimited
      apiCallsPerHour: 50000,
    },
  };

  // Define plan features
  private planFeatures: Record<PlanType, PlanFeatures> = {
    free: {
      rbac: false,
      secretRotation: false,
      auditLogRetentionDays: 30,
      siemIntegration: false,
      customEncryptionKeys: false,
      onPremiseDeployment: false,
      prioritySupport: false,
    },
    pro: {
      rbac: false,
      secretRotation: false,
      auditLogRetentionDays: 30,
      siemIntegration: false,
      customEncryptionKeys: false,
      onPremiseDeployment: false,
      prioritySupport: false,
    },
    team: {
      rbac: true,
      secretRotation: false,
      auditLogRetentionDays: 90,
      siemIntegration: false,
      customEncryptionKeys: false,
      onPremiseDeployment: false,
      prioritySupport: true,
    },
    enterprise: {
      rbac: true,
      secretRotation: true,
      auditLogRetentionDays: 730, // 2 years
      siemIntegration: true,
      customEncryptionKeys: true,
      onPremiseDeployment: true,
      prioritySupport: true,
    },
  };

  /**
   * Get user's subscription plan
   */
  async getUserPlan(userId: string): Promise<PlanType> {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true },
    });

    // Default to free plan if no subscription
    if (!subscription || subscription.status !== "active") {
      return "free";
    }

    return subscription.plan as PlanType;
  }

  /**
   * Get plan limits for a user
   */
  async getUserLimits(userId: string): Promise<PlanLimits> {
    const plan = await this.getUserPlan(userId);
    return this.planLimits[plan];
  }

  /**
   * Get plan features for a user
   */
  async getUserFeatures(userId: string): Promise<PlanFeatures> {
    const plan = await this.getUserPlan(userId);
    return this.planFeatures[plan];
  }

  /**
   * Check if user has access to a specific feature
   */
  async hasFeature(
    userId: string,
    feature: keyof PlanFeatures
  ): Promise<boolean> {
    const features = await this.getUserFeatures(userId);
    return features[feature] as boolean;
  }

  /**
   * Check if user can create a project
   */
  async canCreateProject(userId: string): Promise<boolean> {
    const plan = await this.getUserPlan(userId);
    const limits = this.planLimits[plan];

    // Unlimited projects
    if (limits.projects === -1) {
      return true;
    }

    // Count current projects
    const projectCount = await prisma.project.count({
      where: { ownerId: userId },
    });

    return projectCount < limits.projects;
  }

  /**
   * Check if user can create an environment in a project
   */
  async canCreateEnvironment(
    userId: string,
    projectId: string
  ): Promise<boolean> {
    const plan = await this.getUserPlan(userId);
    const limits = this.planLimits[plan];

    // Unlimited environments
    if (limits.environments === -1) {
      return true;
    }

    // For free tier, count total environments across all projects
    if (plan === "free") {
      const totalEnvironments = await prisma.environment.count({
        where: {
          project: {
            ownerId: userId,
          },
        },
      });

      return totalEnvironments < limits.environments;
    }

    // For other tiers with limits, count per project
    const environmentCount = await prisma.environment.count({
      where: { projectId },
    });

    return environmentCount < limits.environments;
  }

  /**
   * Require project creation permission or throw error
   */
  async requireCanCreateProject(userId: string): Promise<void> {
    const canCreate = await this.canCreateProject(userId);

    if (!canCreate) {
      const plan = await this.getUserPlan(userId);
      const limits = this.planLimits[plan];

      throw new AppError(
        "FORBIDDEN_PLAN_LIMIT",
        `You have reached the maximum number of projects (${limits.projects}) for your ${plan} plan. Please upgrade to create more projects.`,
        403
      );
    }
  }

  /**
   * Require environment creation permission or throw error
   */
  async requireCanCreateEnvironment(
    userId: string,
    projectId: string
  ): Promise<void> {
    const canCreate = await this.canCreateEnvironment(userId, projectId);

    if (!canCreate) {
      const plan = await this.getUserPlan(userId);
      const limits = this.planLimits[plan];

      throw new AppError(
        "FORBIDDEN_PLAN_LIMIT",
        `You have reached the maximum number of environments (${limits.environments}) for your ${plan} plan. Please upgrade to create more environments.`,
        403
      );
    }
  }

  /**
   * Get current usage for a user
   */
  async getUserUsage(userId: string) {
    const [projectCount, totalEnvironments] = await Promise.all([
      prisma.project.count({
        where: { ownerId: userId },
      }),
      prisma.environment.count({
        where: {
          project: {
            ownerId: userId,
          },
        },
      }),
    ]);

    return {
      projects: projectCount,
      environments: totalEnvironments,
    };
  }

  /**
   * Create a subscription for a user
   */
  async createSubscription(userId: string, plan: PlanType) {
    // Check if user already has a subscription
    const existingSubscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (existingSubscription) {
      throw new AppError(
        "VALIDATION_DUPLICATE_SUBSCRIPTION",
        "User already has a subscription. Use update instead.",
        400
      );
    }

    // Validate plan
    if (!["free", "pro", "team", "enterprise"].includes(plan)) {
      throw new AppError(
        "VALIDATION_INVALID_PLAN",
        "Invalid plan type. Must be one of: free, pro, team, enterprise",
        400
      );
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1); // 1 month subscription period

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        plan,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    return subscription;
  }

  /**
   * Update a user's subscription plan
   */
  async updateSubscription(userId: string, newPlan: PlanType) {
    // Validate plan
    if (!["free", "pro", "team", "enterprise"].includes(newPlan)) {
      throw new AppError(
        "VALIDATION_INVALID_PLAN",
        "Invalid plan type. Must be one of: free, pro, team, enterprise",
        400
      );
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        "Subscription not found for this user",
        404
      );
    }

    const currentPlan = subscription.plan as PlanType;

    // Check if this is an upgrade or downgrade
    const planHierarchy = { free: 0, pro: 1, team: 2, enterprise: 3 };
    const isUpgrade = planHierarchy[newPlan] > planHierarchy[currentPlan];

    // If downgrade, check if user needs to reduce resources BEFORE updating
    if (!isUpgrade) {
      await this.enforceNewLimits(userId, newPlan);
    }

    // Update subscription
    const updatedSubscription = await prisma.subscription.update({
      where: { userId },
      data: {
        plan: newPlan,
        updatedAt: new Date(),
      },
    });

    return {
      subscription: updatedSubscription,
      isUpgrade,
      message: isUpgrade
        ? "Plan upgraded successfully. New features are now available."
        : "Plan downgraded successfully. New limits are now in effect.",
    };
  }

  /**
   * Cancel a user's subscription
   */
  async cancelSubscription(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        "Subscription not found for this user",
        404
      );
    }

    // Mark subscription as canceled
    const canceledSubscription = await prisma.subscription.update({
      where: { userId },
      data: {
        status: "canceled",
        updatedAt: new Date(),
      },
    });

    return canceledSubscription;
  }

  /**
   * Get subscription details for a user
   */
  async getSubscription(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!subscription) {
      // Return default free plan if no subscription exists
      return {
        userId,
        plan: "free",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      };
    }

    return subscription;
  }

  /**
   * Check limit for a specific resource type
   */
  async checkLimit(
    userId: string,
    resourceType: ResourceType
  ): Promise<LimitCheck> {
    const plan = await this.getUserPlan(userId);
    const limits = this.planLimits[plan];

    let current = 0;
    let limit = 0;

    switch (resourceType) {
      case "projects":
        current = await prisma.project.count({
          where: { ownerId: userId },
        });
        limit = limits.projects;
        break;

      case "environments":
        current = await prisma.environment.count({
          where: {
            project: {
              ownerId: userId,
            },
          },
        });
        limit = limits.environments;
        break;

      case "api_calls":
        current = await this.getApiCallCount(userId);
        limit = limits.apiCallsPerHour;
        break;

      default:
        throw new AppError(
          "VALIDATION_INVALID_INPUT",
          `Invalid resource type: ${resourceType}`,
          400
        );
    }

    const allowed = limit === -1 || current < limit;

    return {
      allowed,
      current,
      limit,
      resourceType,
    };
  }

  /**
   * Check multiple limits at once
   */
  async checkLimits(
    userId: string,
    resourceTypes: ResourceType[]
  ): Promise<LimitCheck[]> {
    const checks = await Promise.all(
      resourceTypes.map((type) => this.checkLimit(userId, type))
    );
    return checks;
  }

  /**
   * Track API call for a user
   */
  async trackApiCall(userId: string): Promise<void> {
    const now = new Date();
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const redisKey = `api_calls:${userId}:${hourKey}`;

    try {
      // Increment the counter
      await redisClient.incr(redisKey);

      // Set expiration to 2 hours (to clean up old data)
      await redisClient.expire(redisKey, 7200);
    } catch (error) {
      console.error("Error tracking API call:", error);
      // Don't throw error - tracking failure shouldn't break the API
    }
  }

  /**
   * Get API call count for current hour
   */
  async getApiCallCount(userId: string): Promise<number> {
    const now = new Date();
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const redisKey = `api_calls:${userId}:${hourKey}`;

    try {
      const count = await redisClient.get(redisKey);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      console.error("Error getting API call count:", error);
      return 0;
    }
  }

  /**
   * Check if user has exceeded API rate limit
   */
  async checkApiRateLimit(userId: string): Promise<boolean> {
    const plan = await this.getUserPlan(userId);
    const limits = this.planLimits[plan];
    const currentCount = await this.getApiCallCount(userId);

    return currentCount < limits.apiCallsPerHour;
  }

  /**
   * Require API rate limit check or throw error
   */
  async requireApiRateLimit(userId: string): Promise<void> {
    const allowed = await this.checkApiRateLimit(userId);

    if (!allowed) {
      const plan = await this.getUserPlan(userId);
      const limits = this.planLimits[plan];

      throw new AppError(
        "FORBIDDEN_PLAN_LIMIT",
        `API rate limit exceeded. You have reached the maximum of ${limits.apiCallsPerHour} API calls per hour for your ${plan} plan.`,
        429
      );
    }
  }

  /**
   * Get comprehensive usage statistics
   */
  async getUsageStats(userId: string) {
    const [basicUsage, apiCallCount, plan, limits, features] =
      await Promise.all([
        this.getUserUsage(userId),
        this.getApiCallCount(userId),
        this.getUserPlan(userId),
        this.getUserLimits(userId),
        this.getUserFeatures(userId),
      ]);

    return {
      plan,
      usage: {
        ...basicUsage,
        apiCallsThisHour: apiCallCount,
      },
      limits,
      features,
      percentages: {
        projects:
          limits.projects === -1
            ? 0
            : (basicUsage.projects / limits.projects) * 100,
        environments:
          limits.environments === -1
            ? 0
            : (basicUsage.environments / limits.environments) * 100,
        apiCalls:
          limits.apiCallsPerHour === -1
            ? 0
            : (apiCallCount / limits.apiCallsPerHour) * 100,
      },
    };
  }

  /**
   * Enforce new limits after a downgrade
   */
  private async enforceNewLimits(userId: string, newPlan: PlanType) {
    const newLimits = this.planLimits[newPlan];
    const usage = await this.getUserUsage(userId);

    // Check if user exceeds new project limit
    if (newLimits.projects !== -1 && usage.projects > newLimits.projects) {
      throw new AppError(
        "FORBIDDEN_PLAN_LIMIT",
        `Cannot downgrade to ${newPlan} plan. You have ${usage.projects} projects but the limit is ${newLimits.projects}. Please delete some projects first.`,
        403
      );
    }

    // Check if user exceeds new environment limit
    if (
      newLimits.environments !== -1 &&
      usage.environments > newLimits.environments
    ) {
      throw new AppError(
        "FORBIDDEN_PLAN_LIMIT",
        `Cannot downgrade to ${newPlan} plan. You have ${usage.environments} environments but the limit is ${newLimits.environments}. Please delete some environments first.`,
        403
      );
    }
  }
}

export default new BillingService();
