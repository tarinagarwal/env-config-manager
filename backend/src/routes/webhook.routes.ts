import { Router } from "express";
import webhookController from "../controllers/webhook.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// All webhook routes require authentication
router.use(authenticateToken);

// Create webhook for a project
router.post("/projects/:projectId/webhooks", webhookController.createWebhook);

// Get webhooks for a project
router.get("/projects/:projectId/webhooks", webhookController.getWebhooks);

// Update webhook
router.patch("/webhooks/:webhookId", webhookController.updateWebhook);

// Delete webhook
router.delete("/webhooks/:webhookId", webhookController.deleteWebhook);

export default router;
