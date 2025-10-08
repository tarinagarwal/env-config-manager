import { Router } from "express";
import passport from "passport";
import enterpriseController from "../controllers/enterprise.controller";
import { samlService } from "../services/saml.service";
import authService from "../services/auth.service";

const router = Router();

// LDAP routes
router.post("/ldap/login", enterpriseController.ldapLogin);
router.get("/ldap/test", enterpriseController.testLdapConnection);

// SAML routes
router.get("/saml/metadata", enterpriseController.getSamlMetadata);
router.get("/saml/config", enterpriseController.getSamlConfig);

// SAML SSO initiation
router.get("/saml/login", (req, res, next) => {
  if (!samlService.isEnabled()) {
    return res.status(400).json({
      error: {
        code: "SAML_NOT_ENABLED",
        message: "SAML authentication is not enabled",
      },
    });
  }

  passport.authenticate("saml", {
    failureRedirect: "/login",
    failureFlash: true,
  })(req, res, next);
});

// SAML callback (assertion consumer service)
router.post("/saml/callback", (req, res, next) => {
  if (!samlService.isEnabled()) {
    return res.status(400).json({
      error: {
        code: "SAML_NOT_ENABLED",
        message: "SAML authentication is not enabled",
      },
    });
  }

  passport.authenticate("saml", async (err: any, user: any, info: any) => {
    if (err) {
      return res.status(500).json({
        error: {
          code: "SAML_AUTH_ERROR",
          message: "SAML authentication failed",
          details: err.message,
        },
      });
    }

    if (!user) {
      return res.status(401).json({
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "SAML authentication failed",
          details: info,
        },
      });
    }

    try {
      // Generate JWT tokens
      const tokens = await authService.generateTokens(user);

      // Redirect to frontend with tokens
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";
      res.redirect(
        `${frontendUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`
      );
    } catch (error: any) {
      res.status(500).json({
        error: {
          code: "TOKEN_GENERATION_ERROR",
          message: "Failed to generate authentication tokens",
          details: error.message,
        },
      });
    }
  })(req, res, next);
});

// Enterprise auth status
router.get("/status", enterpriseController.getEnterpriseAuthStatus);

export default router;
