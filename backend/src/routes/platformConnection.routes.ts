import { Router } from "express";
import platformConnectionController from "../controllers/platformConnection.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create a new platform connection
router.post(
  "/projects/:projectId/connections",
  platformConnectionController.createConnection
);

// Get all connections for a project
router.get(
  "/projects/:projectId/connections",
  platformConnectionController.getConnections
);

// Get a single connection by ID
router.get(
  "/connections/:connectionId",
  platformConnectionController.getConnectionById
);

// Delete a platform connection
router.delete(
  "/connections/:connectionId",
  platformConnectionController.deleteConnection
);

// Test a platform connection
router.post(
  "/connections/:connectionId/test",
  platformConnectionController.testConnection
);

export default router;
