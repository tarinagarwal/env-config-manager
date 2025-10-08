import { Request, Response, NextFunction } from "express";
import { ldapService } from "../services/ldap.service";
import { samlService } from "../services/saml.service";
import authService from "../services/auth.service";

class EnterpriseAuthController {
  /**
   * LDAP login endpoint
   */
  async ldapLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_INVALID_INPUT",
            message: "Username and password are required",
          },
        });
      }

      if (!ldapService.isEnabled()) {
        return res.status(400).json({
          error: {
            code: "LDAP_NOT_ENABLED",
            message: "LDAP authentication is not enabled",
          },
        });
      }

      // Authenticate against LDAP
      const ldapUser = await ldapService.authenticate(username, password);

      if (!ldapUser) {
        return res.status(401).json({
          error: {
            code: "AUTH_INVALID_CREDENTIALS",
            message: "Invalid username or password",
          },
        });
      }

      // Sync user to local database
      const user = await ldapService.syncUser(ldapUser);

      // Generate JWT tokens
      const tokens = await authService.generateTokens(user);

      res.json({
        message: "LDAP login successful",
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test LDAP connection
   */
  async testLdapConnection(req: Request, res: Response, next: NextFunction) {
    try {
      if (!ldapService.isEnabled()) {
        return res.status(400).json({
          error: {
            code: "LDAP_NOT_ENABLED",
            message: "LDAP authentication is not enabled",
          },
        });
      }

      const isConnected = await ldapService.testConnection();

      res.json({
        message: isConnected
          ? "LDAP connection successful"
          : "LDAP connection failed",
        data: { connected: isConnected },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * SAML metadata endpoint
   */
  async getSamlMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      if (!samlService.isEnabled()) {
        return res.status(400).json({
          error: {
            code: "SAML_NOT_ENABLED",
            message: "SAML authentication is not enabled",
          },
        });
      }

      const metadata = samlService.getMetadata();

      res.set("Content-Type", "text/xml");
      res.send(metadata);
    } catch (error) {
      next(error);
    }
  }

  /**
   * SAML configuration endpoint
   */
  async getSamlConfig(req: Request, res: Response, next: NextFunction) {
    try {
      if (!samlService.isEnabled()) {
        return res.status(400).json({
          error: {
            code: "SAML_NOT_ENABLED",
            message: "SAML authentication is not enabled",
          },
        });
      }

      const config = samlService.getConfig();

      res.json({
        message: "SAML configuration retrieved",
        data: config,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get enterprise authentication status
   */
  async getEnterpriseAuthStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const status = {
        ldap: {
          enabled: ldapService.isEnabled(),
        },
        saml: {
          enabled: samlService.isEnabled(),
        },
      };

      res.json({
        message: "Enterprise authentication status",
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new EnterpriseAuthController();
