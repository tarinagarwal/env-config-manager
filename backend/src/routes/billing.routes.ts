import { Router } from "express";
import billingController from "../controllers/billing.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// Get available plans (public endpoint)
router.get("/plans", billingController.getAvailablePlans);

// All other billing routes require authentication
router.use(authenticate);

// Get current subscription
router.get("/subscription", billingController.getSubscription);

// Create subscription
router.post("/subscription", billingController.createSubscription);

// Update subscription
router.patch("/subscription", billingController.updateSubscription);

// Cancel subscription
router.delete("/subscription", billingController.cancelSubscription);

// Get usage and limits
router.get("/usage", billingController.getUsageAndLimits);

// Get comprehensive usage statistics
router.get("/stats", billingController.getUsageStats);

// Check limit for a specific resource
router.get("/limits/:resourceType", billingController.checkLimit);

export default router;
