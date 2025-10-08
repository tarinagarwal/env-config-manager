import { Router } from "express";
import rotationController from "../controllers/rotation.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// All rotation routes require authentication
router.use(authenticate);

// Enable rotation for a variable
router.post(
  "/variables/:variableId/rotation/enable",
  rotationController.enableRotation
);

// Disable rotation for a variable
router.post(
  "/variables/:variableId/rotation/disable",
  rotationController.disableRotation
);

// Update rotation interval
router.patch(
  "/variables/:variableId/rotation/interval",
  rotationController.updateRotationInterval
);

// Get rotation configuration
router.get(
  "/variables/:variableId/rotation",
  rotationController.getRotationConfig
);

// Trigger manual notification
router.post(
  "/variables/:variableId/rotation/notify",
  rotationController.triggerNotification
);

// Execute rotation for a variable
router.post(
  "/variables/:variableId/rotation/execute",
  rotationController.executeRotation
);

// Get rotation history for a variable
router.get(
  "/variables/:variableId/rotation/history",
  rotationController.getRotationHistory
);

// Get rotation statistics
router.get("/rotation/stats", rotationController.getRotationStats);

// Get failure statistics
router.get("/rotation/failures/stats", rotationController.getFailureStats);

// Get pending retries
router.get("/rotation/retries", rotationController.getPendingRetries);

// Process pending retries manually
router.post(
  "/rotation/retries/process",
  rotationController.processPendingRetries
);

export default router;
