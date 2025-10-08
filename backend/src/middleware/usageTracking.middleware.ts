import { Request, Response, NextFunction } from "express";
import billingService from "../services/billing.service";

/**
 * Middleware to track API calls for authenticated users
 */
export const trackApiUsage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Only track for authenticated users
  if (req.user && req.user.id) {
    try {
      // Track the API call asynchronously (don't wait for it)
      billingService.trackApiCall(req.user.id).catch((error) => {
        console.error("Error tracking API call:", error);
      });
    } catch (error) {
      // Don't block the request if tracking fails
      console.error("Error in usage tracking middleware:", error);
    }
  }

  next();
};

/**
 * Middleware to check API rate limits for authenticated users
 */
export const checkApiRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Only check for authenticated users
  if (req.user && req.user.id) {
    try {
      await billingService.requireApiRateLimit(req.user.id);
    } catch (error) {
      return next(error);
    }
  }

  next();
};
