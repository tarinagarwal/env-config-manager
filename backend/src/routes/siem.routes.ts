import { Router } from "express";
import siemController from "../controllers/siem.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// All SIEM routes require authentication
router.use(authenticate);

// SIEM webhook management
router.post("/siem/webhooks", siemController.createWebhook);
router.get("/siem/webhooks", siemController.getWebhooks);
router.delete("/siem/webhooks/:id", siemController.deleteWebhook);
router.post("/siem/webhooks/test", siemController.testWebhook);

// SIEM audit log streaming
router.get("/siem/audit-stream", siemController.streamAuditLogs);

export default router;
