import { Request, Response, NextFunction } from "express";
import billingService from "../services/billing.service";

class BillingController {
  /**
   * Create a subscription
   */
  async createSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { plan } = req.body;

      if (!plan) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "Plan is required",
          },
        });
      }

      const subscription = await billingService.createSubscription(
        userId,
        plan
      );

      res.status(201).json(subscription);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current subscription
   */
  async getSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const subscription = await billingService.getSubscription(userId);

      res.json(subscription);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update subscription plan
   */
  async updateSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { plan } = req.body;

      if (!plan) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "Plan is required",
          },
        });
      }

      const result = await billingService.updateSubscription(userId, plan);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const subscription = await billingService.cancelSubscription(userId);

      res.json(subscription);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get usage and limits
   */
  async getUsageAndLimits(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const [usage, limits, plan] = await Promise.all([
        billingService.getUserUsage(userId),
        billingService.getUserLimits(userId),
        billingService.getUserPlan(userId),
      ]);

      res.json({
        plan,
        usage,
        limits,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check limit for a specific resource
   */
  async checkLimit(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { resourceType } = req.params;

      if (!["projects", "environments", "api_calls"].includes(resourceType)) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message:
              "Invalid resource type. Must be one of: projects, environments, api_calls",
          },
        });
      }

      const limitCheck = await billingService.checkLimit(
        userId,
        resourceType as any
      );

      res.json(limitCheck);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get comprehensive usage statistics
   */
  async getUsageStats(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const stats = await billingService.getUsageStats(userId);

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all available plans with their features and limits
   */
  async getAvailablePlans(req: Request, res: Response, next: NextFunction) {
    try {
      const plans = [
        {
          name: "free",
          displayName: "Free",
          price: 0,
          limits: {
            projects: 1,
            environments: 3,
            apiCallsPerHour: 100,
          },
          features: {
            rbac: false,
            secretRotation: false,
            auditLogRetentionDays: 30,
            siemIntegration: false,
            customEncryptionKeys: false,
            onPremiseDeployment: false,
            prioritySupport: false,
          },
        },
        {
          name: "pro",
          displayName: "Pro",
          price: 29,
          limits: {
            projects: 5,
            environments: -1,
            apiCallsPerHour: 1000,
          },
          features: {
            rbac: false,
            secretRotation: false,
            auditLogRetentionDays: 30,
            siemIntegration: false,
            customEncryptionKeys: false,
            onPremiseDeployment: false,
            prioritySupport: false,
          },
        },
        {
          name: "team",
          displayName: "Team",
          price: 99,
          limits: {
            projects: -1,
            environments: -1,
            apiCallsPerHour: 5000,
          },
          features: {
            rbac: true,
            secretRotation: false,
            auditLogRetentionDays: 90,
            siemIntegration: false,
            customEncryptionKeys: false,
            onPremiseDeployment: false,
            prioritySupport: true,
          },
        },
        {
          name: "enterprise",
          displayName: "Enterprise",
          price: null, // Contact for pricing
          limits: {
            projects: -1,
            environments: -1,
            apiCallsPerHour: 50000,
          },
          features: {
            rbac: true,
            secretRotation: true,
            auditLogRetentionDays: 730,
            siemIntegration: true,
            customEncryptionKeys: true,
            onPremiseDeployment: true,
            prioritySupport: true,
          },
        },
      ];

      res.json({ plans });
    } catch (error) {
      next(error);
    }
  }
}

export default new BillingController();
