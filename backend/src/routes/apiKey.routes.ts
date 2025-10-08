import { Router } from "express";
import apiKeyController from "../controllers/apiKey.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// All API key routes require authentication
router.post("/", authenticate, apiKeyController.createApiKey);
router.get("/", authenticate, apiKeyController.listApiKeys);
router.delete("/:id", authenticate, apiKeyController.deleteApiKey);

export default router;
