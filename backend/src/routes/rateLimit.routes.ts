import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { getRateLimitStatus } from "../controllers/rateLimit.controller";

const router = Router();

/**
 * GET /api/v1/rate-limit
 * Get current rate limit status
 */
router.get("/", authenticate, getRateLimitStatus);

export default router;
