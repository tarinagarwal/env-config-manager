import passport from "passport";
import { samlService } from "../services/saml.service";

/**
 * Configure Passport strategies for enterprise authentication
 */
export function configurePassport() {
  // Configure SAML strategy if enabled
  if (samlService.isEnabled()) {
    try {
      const samlStrategy = samlService.createStrategy();
      passport.use("saml", samlStrategy);
      console.log("SAML authentication strategy configured");
    } catch (error) {
      console.error("Failed to configure SAML strategy:", error);
    }
  }

  // Serialize user for session (if using sessions)
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session (if using sessions)
  passport.deserializeUser((id: string, done) => {
    // In a real implementation, fetch user from database
    done(null, { id });
  });
}
