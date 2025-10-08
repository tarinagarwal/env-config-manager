import { Router } from "express";
import auditController from "../controllers/audit.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// All audit routes require authentication
router.use(authenticate);

// Query audit logs
router.get("/audit-logs", auditController.queryLogs);

// Export audit logs
router.get("/audit-logs/export", auditController.exportLogs);

// Get retention information
router.get("/audit-logs/retention", auditController.getRetentionInfo);

// Manually enforce retention
router.post("/audit-logs/retention/enforce", auditController.enforceRetention);

export default router;
