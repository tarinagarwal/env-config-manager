import { Router } from "express";
import syncController from "../controllers/sync.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Manually trigger sync for a connection
router.post("/connections/:connectionId/sync", syncController.triggerSync);

// Get sync status for a connection
router.get(
  "/connections/:connectionId/sync-status",
  syncController.getSyncStatus
);

// Get sync logs for an environment
router.get(
  "/environments/:environmentId/sync-logs",
  syncController.getSyncLogs
);

export default router;
