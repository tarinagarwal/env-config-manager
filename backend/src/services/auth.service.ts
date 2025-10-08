import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import prisma from "../lib/prisma";
import redisClient from "../lib/redis";
import config from "../config";
import { AuthError, ValidationError } from "../utils/errors";
import {
  RegisterDto,
  LoginDto,
  AuthToken,
  TokenPayload,
  RefreshTokenPayload,
} from "../types/auth.types";

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_PREFIX = "refresh_token:";

class AuthService {
  async register(
    data: RegisterDto
  ): Promise<{ userId: string; email: string }> {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ValidationError("User with this email already exists");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        emailVerified: false, // Will be set to true after email verification
      },
    });

    // TODO: Send email verification (will be implemented when email service is added)
    console.log(`Email verification would be sent to: ${user.email}`);

    return {
      userId: user.id,
      email: user.email,
    };
  }

  async login(data: LoginDto): Promise<AuthToken> {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || !user.passwordHash) {
      throw new AuthError(
        "AUTH_INVALID_CREDENTIALS",
        "Invalid email or password",
        401
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      data.password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new AuthError(
        "AUTH_INVALID_CREDENTIALS",
        "Invalid email or password",
        401
      );
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      if (!data.twoFactorCode) {
        throw new AuthError(
          "AUTH_2FA_REQUIRED",
          "Two-factor authentication code required",
          401
        );
      }

      // Verify 2FA code
      const twoFactorService = (await import("./twoFactor.service")).default;
      const isValid = await twoFactorService.verifyLoginCode(
        user.id,
        data.twoFactorCode
      );

      if (!isValid) {
        throw new AuthError(
          "AUTH_INVALID_2FA_CODE",
          "Invalid two-factor authentication code",
          401
        );
      }
    }

    // Generate tokens
    return this.generateTokens(user.id, user.email);
  }

  async generateTokens(userId: string, email: string): Promise<AuthToken> {
    const tokenId = randomBytes(16).toString("hex");
    const secret = config.jwt.secret;

    // Generate access token
    // @ts-expect-error - JWT types have strict overload matching issues with string secrets
    const accessToken = jwt.sign({ userId, email }, secret, {
      expiresIn: config.jwt.accessExpiry,
    });

    // Generate refresh token
    // @ts-expect-error - JWT types have strict overload matching issues with string secrets
    const refreshToken = jwt.sign({ userId, email, tokenId }, secret, {
      expiresIn: config.jwt.refreshExpiry,
    });

    // Store refresh token in Redis
    const refreshExpiry = this.parseExpiry(config.jwt.refreshExpiry);
    await redisClient.setEx(
      `${REFRESH_TOKEN_PREFIX}${userId}:${tokenId}`,
      refreshExpiry,
      refreshToken
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiry(config.jwt.accessExpiry),
    };
  }

  async validateToken(token: string): Promise<TokenPayload> {
    try {
      const secret = config.jwt.secret;
      const payload = jwt.verify(token, secret) as TokenPayload;
      return payload;
    } catch (error) {
      throw new AuthError(
        "AUTH_INVALID_TOKEN",
        "Invalid or expired token",
        401
      );
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthToken> {
    try {
      const secret = config.jwt.secret;
      const payload = jwt.verify(refreshToken, secret) as RefreshTokenPayload;

      // Check if refresh token exists in Redis
      const storedToken = await redisClient.get(
        `${REFRESH_TOKEN_PREFIX}${payload.userId}:${payload.tokenId}`
      );

      if (!storedToken || storedToken !== refreshToken) {
        throw new AuthError("AUTH_INVALID_TOKEN", "Invalid refresh token", 401);
      }

      // Delete old refresh token
      await redisClient.del(
        `${REFRESH_TOKEN_PREFIX}${payload.userId}:${payload.tokenId}`
      );

      // Generate new tokens
      return this.generateTokens(payload.userId, payload.email);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        "AUTH_INVALID_TOKEN",
        "Invalid or expired token",
        401
      );
    }
  }

  async logout(userId: string, tokenId: string): Promise<void> {
    await redisClient.del(`${REFRESH_TOKEN_PREFIX}${userId}:${tokenId}`);
  }

  private parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 60 * 60;
      case "d":
        return value * 24 * 60 * 60;
      default:
        return 900; // Default 15 minutes
    }
  }
}

export default new AuthService();
