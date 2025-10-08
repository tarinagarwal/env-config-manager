import { Request, Response, NextFunction } from "express";
import { licenseService } from "../services/license.service";

/**
 * Middleware to check if a feature is enabled in the license
 */
export function requireFeature(feature: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!licenseService.hasFeature(feature)) {
      return res.status(403).json({
        error: {
          code: "FEATURE_NOT_LICENSED",
          message: `This feature requires an enterprise license with '${feature}' enabled`,
        },
      });
    }

    next();
  };
}

/**
 * Middleware to check license limits
 */
export function checkLicenseLimit(type: "users" | "projects") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would need to be implemented based on actual usage
      // For now, just pass through
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to add license info to response
 */
export function addLicenseInfo(
  req: Request,
  res: Response,
  next: NextFunction
) {
  res.locals.licenseInfo = licenseService.getLicenseInfo();
  next();
}
