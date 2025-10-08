import { Router } from "express";
import passport from "passport";
import authController from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { AuthToken } from "../types/auth.types";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authenticate, authController.me);

// 2FA routes
router.post("/2fa/enable", authenticate, authController.enable2FA);
router.post("/2fa/verify", authenticate, authController.verify2FA);
router.post("/2fa/disable", authenticate, authController.disable2FA);

// Password reset routes
router.post("/password-reset/request", authController.requestPasswordReset);
router.post("/password-reset/confirm", authController.resetPassword);

// Google OAuth
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    const tokens = req.user as AuthToken;
    // Redirect to frontend with tokens
    res.redirect(
      `${process.env.CORS_ORIGIN}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`
    );
  }
);

// GitHub OAuth
router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"], session: false })
);

router.get(
  "/github/callback",
  passport.authenticate("github", { session: false }),
  (req, res) => {
    const tokens = req.user as AuthToken;
    // Redirect to frontend with tokens
    res.redirect(
      `${process.env.CORS_ORIGIN}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`
    );
  }
);

export default router;
