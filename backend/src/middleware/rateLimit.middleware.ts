import { Request, Response, NextFunction } from "express";
import redisClient from "../lib/redis";
import billingService from "../services/billing.service";
import { AppError } from "../utils/errors";

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Rate limiting middleware using sliding window algorithm with Redis
 *
 * This middleware enforces tier-based rate limits per user per hour.
 * It uses Redis sorted sets to implement a sliding window algorithm.
 */
export const rateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Skip rate limiting for health check and public endpoints
    if (
      req.path === "/health" ||
      req.path.includes("/auth/login") ||
      req.path.includes("/auth/register")
    ) {
      return next();
    }

    // Require authentication for rate limiting
    if (!req.user?.userId) {
      return next();
    }

    const userId = req.user.userId;
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour in milliseconds

    // Get user's rate limit based on their plan
    const plan = await billingService.getUserPlan(userId);
    const limits = await billingService.getUserLimits(userId);
    const rateLimit = limits.apiCallsPerHour;

    // Redis key for this user's rate limit window
    const key = `ratelimit:${userId}`;

    // Use Redis sorted set with timestamps as scores
    // Remove old entries outside the sliding window
    const windowStart = now - windowMs;
    await redisClient.zRemRangeByScore(key, 0, windowStart);

    // Count requests in current window
    const requestCount = await redisClient.zCard(key);

    // Check if limit exceeded
    if (requestCount >= rateLimit) {
      // Get the oldest request timestamp to calculate reset time
      const oldestRequests = await redisClient.zRangeWithScores(key, 0, 0);

      let resetTime = now + windowMs;
      if (oldestRequests.length > 0) {
        const oldestTimestamp = oldestRequests[0].score;
        resetTime = oldestTimestamp + windowMs;
      }

      const retryAfter = Math.ceil((resetTime - now) / 1000); // seconds

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", rateLimit.toString());
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader(
        "X-RateLimit-Reset",
        Math.ceil(resetTime / 1000).toString()
      );
      res.setHeader("Retry-After", retryAfter.toString());

      throw new AppError(
        "RATE_LIMIT_EXCEEDED",
        `Rate limit exceeded. You have reached the maximum of ${rateLimit} requests per hour for your ${plan} plan. Please try again in ${retryAfter} seconds.`,
        429
      );
    }

    // Add current request to the sorted set
    const requestId = `${now}:${Math.random()}`;
    await redisClient.zAdd(key, {
      score: now,
      value: requestId,
    });

    // Set expiration on the key (cleanup after window + buffer)
    await redisClient.expire(key, Math.ceil(windowMs / 1000) + 60);

    // Calculate remaining requests
    const remaining = rateLimit - (requestCount + 1);

    // Calculate reset time (end of current window)
    const resetTime = now + windowMs;

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", rateLimit.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(resetTime / 1000).toString());

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Get rate limit info for a user without incrementing the counter
 */
export const getRateLimitInfo = async (
  userId: string
): Promise<RateLimitInfo> => {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour

  const limits = await billingService.getUserLimits(userId);
  const rateLimit = limits.apiCallsPerHour;

  const key = `ratelimit:${userId}`;

  // Remove old entries
  const windowStart = now - windowMs;
  await redisClient.zRemRangeByScore(key, 0, windowStart);

  // Count current requests
  const requestCount = await redisClient.zCard(key);
  const remaining = Math.max(0, rateLimit - requestCount);

  // Calculate reset time
  const resetTime = now + windowMs;

  return {
    limit: rateLimit,
    remaining,
    reset: Math.ceil(resetTime / 1000),
  };
};
