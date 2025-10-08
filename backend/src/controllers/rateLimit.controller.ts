import { Request, Response, NextFunction } from "express";
import { getRateLimitInfo } from "../middleware/rateLimit.middleware";
import billingService from "../services/billing.service";

/**
 * Get current rate limit status for the authenticated user
 */
export const getRateLimitStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;

    const [rateLimitInfo, plan] = await Promise.all([
      getRateLimitInfo(userId),
      billingService.getUserPlan(userId),
    ]);

    res.json({
      plan,
      rateLimit: rateLimitInfo,
    });
  } catch (error) {
    next(error);
  }
};
