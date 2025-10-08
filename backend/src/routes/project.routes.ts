import { Router } from "express";
import projectController from "../controllers/project.controller";
import { authenticate, requireScope } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/authorization.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Project CRUD operations
router.post(
  "/",
  requireScope("projects:write"),
  projectController.createProject
);
router.get("/", requireScope("projects:read"), projectController.getProjects);
router.get(
  "/:projectId",
  requireScope("projects:read"),
  requirePermission("project:read"),
  projectController.getProject
);
router.patch(
  "/:projectId",
  requireScope("projects:write"),
  requirePermission("project:update"),
  projectController.updateProject
);
router.delete(
  "/:projectId",
  requireScope("projects:write"),
  requirePermission("project:delete"),
  projectController.deleteProject
);

// Get user's role in project
router.get("/:projectId/role", projectController.getUserRole);

// Get project members (requires read permission)
router.get(
  "/:projectId/members",
  requirePermission("project:read"),
  projectController.getMembers
);

// Add project member (requires manage_members permission)
router.post(
  "/:projectId/members",
  requirePermission("project:manage_members"),
  projectController.addMember
);

// Update member role (requires manage_members permission)
router.patch(
  "/:projectId/members/:userId",
  requirePermission("project:manage_members"),
  projectController.updateMemberRole
);

// Remove project member (requires manage_members permission)
router.delete(
  "/:projectId/members/:userId",
  requirePermission("project:manage_members"),
  projectController.removeMember
);

export default router;
