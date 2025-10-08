import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import config from "../config";
import prisma from "../lib/prisma";
import authService from "./auth.service";
import { AuthToken } from "../types/auth.types";

class OAuthService {
  initializePassport() {
    // Google OAuth Strategy
    if (
      config.oauth.google.clientId &&
      config.oauth.google.clientSecret &&
      config.oauth.google.callbackUrl
    ) {
      passport.use(
        new GoogleStrategy(
          {
            clientID: config.oauth.google.clientId,
            clientSecret: config.oauth.google.clientSecret,
            callbackURL: config.oauth.google.callbackUrl,
          },
          async (accessToken, refreshToken, profile, done) => {
            try {
              const result = await this.handleOAuthLogin(
                "google",
                profile.id,
                profile.emails?.[0]?.value || ""
              );
              done(null, result);
            } catch (error) {
              done(error as Error);
            }
          }
        )
      );
    }

    // GitHub OAuth Strategy
    if (
      config.oauth.github.clientId &&
      config.oauth.github.clientSecret &&
      config.oauth.github.callbackUrl
    ) {
      passport.use(
        new GitHubStrategy(
          {
            clientID: config.oauth.github.clientId,
            clientSecret: config.oauth.github.clientSecret,
            callbackURL: config.oauth.github.callbackUrl,
          },
          async (
            accessToken: string,
            refreshToken: string,
            profile: any,
            done: any
          ) => {
            try {
              const result = await this.handleOAuthLogin(
                "github",
                profile.id,
                profile.emails?.[0]?.value || profile.username + "@github.local"
              );
              done(null, result);
            } catch (error) {
              done(error as Error);
            }
          }
        )
      );
    }
  }

  async handleOAuthLogin(
    provider: string,
    oauthId: string,
    email: string
  ): Promise<AuthToken> {
    // Check if user exists with this OAuth provider
    let user = await prisma.user.findFirst({
      where: {
        oauthProvider: provider,
        oauthId: oauthId,
      },
    });

    if (!user) {
      // Check if user exists with this email
      user = await prisma.user.findUnique({
        where: { email },
      });

      if (user) {
        // Link OAuth account to existing user
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            oauthProvider: provider,
            oauthId: oauthId,
          },
        });
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            email,
            oauthProvider: provider,
            oauthId: oauthId,
            emailVerified: true, // OAuth emails are pre-verified
          },
        });
      }
    }

    // Generate tokens
    return authService.generateTokens(user.id, user.email);
  }
}

export default new OAuthService();
