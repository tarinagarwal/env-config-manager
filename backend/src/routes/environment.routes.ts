import { Router } from "express";
import environmentController from "../controllers/environment.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/authorization.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Environment operations within a project
router.post(
  "/projects/:projectId/environments",
  requirePermission("environment:create"),
  environmentController.createEnvironment
);

router.get(
  "/projects/:projectId/environments",
  requirePermission("environment:read"),
  environmentController.getEnvironments
);

// Individual environment operations
router.get(
  "/environments/:environmentId",
  requirePermission("environment:read"),
  environmentController.getEnvironment
);

router.delete(
  "/environments/:environmentId",
  requirePermission("environment:delete"),
  environmentController.deleteEnvironment
);

export default router;
