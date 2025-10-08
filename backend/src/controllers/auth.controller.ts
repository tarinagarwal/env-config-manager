import { Request, Response, NextFunction } from "express";
import authService from "../services/auth.service";
import twoFactorService from "../services/twoFactor.service";
import passwordResetService from "../services/passwordReset.service";
import {
  validate,
  registerSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
} from "../utils/validation";
import { RegisterDto, LoginDto } from "../types/auth.types";

class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data = validate<RegisterDto>(registerSchema, req.body);
      const result = await authService.register(data);

      res.status(201).json({
        message: "User registered successfully. Please verify your email.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const data = validate<LoginDto>(loginSchema, req.body);
      const tokens = await authService.login(data);

      res.json({
        message: "Login successful",
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "Refresh token is required",
          },
        });
      }

      const tokens = await authService.refreshToken(refreshToken);

      res.json({
        message: "Token refreshed successfully",
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "Refresh token is required",
          },
        });
      }

      // Decode token to get userId and tokenId
      const payload = await authService.validateToken(refreshToken);
      const tokenPayload = payload as any;

      await authService.logout(tokenPayload.userId, tokenPayload.tokenId);

      res.json({
        message: "Logout successful",
      });
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        data: req.user,
      });
    } catch (error) {
      next(error);
    }
  }

  async enable2FA(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            code: "AUTH_MISSING_TOKEN",
            message: "Authentication required",
          },
        });
      }

      const result = await twoFactorService.enable2FA(req.user.userId);

      res.json({
        message: "Two-factor authentication setup initiated",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async verify2FA(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            code: "AUTH_MISSING_TOKEN",
            message: "Authentication required",
          },
        });
      }

      const { code } = req.body;

      if (!code) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "Verification code is required",
          },
        });
      }

      await twoFactorService.verify2FA(req.user.userId, code);

      res.json({
        message: "Two-factor authentication enabled successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async disable2FA(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            code: "AUTH_MISSING_TOKEN",
            message: "Authentication required",
          },
        });
      }

      const { code } = req.body;

      if (!code) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "Verification code is required",
          },
        });
      }

      await twoFactorService.disable2FA(req.user.userId, code);

      res.json({
        message: "Two-factor authentication disabled successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async requestPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const data = validate(passwordResetRequestSchema, req.body);
      const message = await passwordResetService.requestPasswordReset(
        data.email
      );

      res.json({
        message,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const data = validate(passwordResetSchema, req.body);
      await passwordResetService.resetPassword(data.token, data.newPassword);

      res.json({
        message: "Password reset successful",
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();
