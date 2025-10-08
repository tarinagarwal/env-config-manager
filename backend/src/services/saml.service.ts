import {
  Strategy as SamlStrategy,
  Profile,
  VerifiedCallback,
} from "passport-saml";
import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";

interface SAMLConfig {
  entryPoint: string;
  issuer: string;
  callbackUrl: string;
  cert: string;
  identifierFormat?: string;
}

interface SAMLUser {
  nameID: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

export class SAMLService {
  private config: SAMLConfig;
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.ENABLE_SAML === "true";
    this.config = {
      entryPoint: process.env.SAML_ENTRY_POINT || "",
      issuer: process.env.SAML_ISSUER || "env-config-manager",
      callbackUrl:
        process.env.SAML_CALLBACK_URL ||
        `${process.env.FRONTEND_URL}/auth/saml/callback`,
      cert: process.env.SAML_CERT || "",
      identifierFormat: process.env.SAML_IDENTIFIER_FORMAT,
    };
  }

  isEnabled(): boolean {
    return this.enabled && !!this.config.entryPoint && !!this.config.cert;
  }

  /**
   * Create SAML strategy for Passport
   */
  createStrategy(): SamlStrategy {
    if (!this.isEnabled()) {
      throw new Error("SAML authentication is not enabled");
    }

    return new SamlStrategy(
      {
        entryPoint: this.config.entryPoint,
        issuer: this.config.issuer,
        callbackUrl: this.config.callbackUrl,
        cert: this.config.cert,
        identifierFormat: this.config.identifierFormat,
        // Additional SAML options
        acceptedClockSkewMs: 5000,
        disableRequestedAuthnContext: true,
      },
      async (profile: Profile, done: VerifiedCallback) => {
        try {
          const samlUser = this.extractUserFromProfile(profile);
          const user = await this.syncUser(samlUser);
          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      }
    );
  }

  /**
   * Extract user information from SAML profile
   */
  private extractUserFromProfile(profile: Profile): SAMLUser {
    // SAML attributes can vary by IdP, adjust as needed
    const email =
      profile.email ||
      profile[
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
      ] ||
      profile.nameID;

    const firstName =
      profile.firstName ||
      profile[
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
      ] ||
      profile.givenName;

    const lastName =
      profile.lastName ||
      profile[
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
      ] ||
      profile.surname;

    const displayName =
      profile.displayName ||
      profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] ||
      `${firstName} ${lastName}`.trim();

    return {
      nameID: profile.nameID || email,
      email,
      firstName,
      lastName,
      displayName,
    };
  }

  /**
   * Sync SAML user to local database
   */
  async syncUser(samlUser: SAMLUser): Promise<any> {
    if (!samlUser.email) {
      throw new Error("Email is required for SAML authentication");
    }

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email: samlUser.email },
    });

    if (!user) {
      // Create new user
      // Generate a random password hash (won't be used for SAML users)
      const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);

      user = await prisma.user.create({
        data: {
          email: samlUser.email,
          passwordHash: randomPassword,
          emailVerified: true, // SAML users are pre-verified
          oauthProvider: "saml",
          oauthId: samlUser.nameID,
        },
      });
    } else if (user.oauthProvider !== "saml") {
      // Update existing user to link with SAML
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          oauthProvider: "saml",
          oauthId: samlUser.nameID,
        },
      });
    }

    return user;
  }

  /**
   * Get SAML metadata for IdP configuration
   */
  getMetadata(): string {
    if (!this.isEnabled()) {
      throw new Error("SAML authentication is not enabled");
    }

    const strategy = this.createStrategy();
    return strategy.generateServiceProviderMetadata(
      null, // decryptionCert
      null // signingCert
    );
  }

  /**
   * Get SAML configuration for display
   */
  getConfig(): Partial<SAMLConfig> {
    return {
      issuer: this.config.issuer,
      callbackUrl: this.config.callbackUrl,
      identifierFormat: this.config.identifierFormat,
    };
  }
}

export const samlService = new SAMLService();
