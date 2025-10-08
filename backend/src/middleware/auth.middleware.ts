import { Request, Response, NextFunction } from "express";
import authService from "../services/auth.service";
import apiKeyService from "../services/apiKey.service";
import { AuthError } from "../utils/errors";
import { TokenPayload } from "../types/auth.types";

// Extend Express Request type to include user and scopes
declare global {
  namespace Express {
    interface User extends TokenPayload {
      scopes?: string[];
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthError(
        "AUTH_MISSING_TOKEN",
        "No authentication token provided",
        401
      );
    }

    const token = authHeader.substring(7);

    // Check if it's an API key (starts with ecm_live_)
    if (token.startsWith("ecm_live_")) {
      const { userId, scopes } = await apiKeyService.validateApiKey(token);

      // Get user email for consistency with JWT auth
      const prisma = (await import("../lib/prisma")).default;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (!user) {
        throw new AuthError("AUTH_INVALID_API_KEY", "User not found", 401);
      }

      req.user = {
        userId,
        email: user.email,
        scopes,
      };
    } else {
      // JWT token authentication
      const payload = await authService.validateToken(token);
      req.user = payload;
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user has required scope (for API key authentication)
 */
export const requireScope = (requiredScope: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // If user has scopes (API key auth), check them
      if (req.user?.scopes) {
        if (!apiKeyService.hasScope(req.user.scopes, requiredScope)) {
          throw new AuthError(
            "FORBIDDEN_INSUFFICIENT_PERMISSIONS",
            `Missing required scope: ${requiredScope}`,
            403
          );
        }
      }
      // If no scopes (JWT auth), allow all operations
      next();
    } catch (error) {
      next(error);
    }
  };
};
