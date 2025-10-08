import { Router } from "express";
import variableController from "../controllers/variable.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/authorization.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Variable operations within an environment
router.post(
  "/environments/:environmentId/variables",
  requirePermission("variable:create"),
  variableController.createVariable
);

router.get(
  "/environments/:environmentId/variables",
  requirePermission("variable:read"),
  variableController.getVariables
);

// Individual variable operations
router.get(
  "/variables/:variableId",
  requirePermission("variable:read"),
  variableController.getVariable
);

router.patch(
  "/variables/:variableId",
  requirePermission("variable:update"),
  variableController.updateVariable
);

router.delete(
  "/variables/:variableId",
  requirePermission("variable:delete"),
  variableController.deleteVariable
);

// Bulk operations
router.post(
  "/variables/bulk/copy",
  requirePermission("variable:create"),
  variableController.bulkCopyVariables
);

router.post(
  "/variables/bulk/update",
  requirePermission("variable:update"),
  variableController.bulkUpdateVariables
);

// Version history
router.get(
  "/variables/:variableId/history",
  requirePermission("variable:read"),
  variableController.getVariableHistory
);

router.get(
  "/environments/:environmentId/history",
  requirePermission("variable:read"),
  variableController.getEnvironmentHistory
);

// Rollback
router.post(
  "/variables/:variableId/rollback/:versionId",
  requirePermission("variable:update"),
  variableController.rollbackVariable
);

export default router;
