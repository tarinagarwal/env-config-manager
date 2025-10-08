import authService from "../auth.service";
import prisma from "../../lib/prisma";
import redisClient from "../../lib/redis";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AuthError, ValidationError } from "../../utils/errors";

// Mock dependencies
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("../../lib/redis", () => ({
  __esModule: true,
  default: {
    setEx: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock("bcrypt");
jest.mock("jsonwebtoken");

describe("AuthService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("should successfully register a new user", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        passwordHash: "hashed-password",
        emailVerified: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.register({
        email: "test@example.com",
        password: "Password123",
      });

      expect(result).toEqual({
        userId: "user-123",
        email: "test@example.com",
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith("Password123", 12);
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it("should throw error if user already exists", async () => {
      const existingUser = {
        id: "user-123",
        email: "test@example.com",
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser);

      await expect(
        authService.register({
          email: "test@example.com",
          password: "Password123",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("login", () => {
    it("should successfully login with valid credentials", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        passwordHash: "hashed-password",
        twoFactorEnabled: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue("mock-token");
      (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

      const result = await authService.login({
        email: "test@example.com",
        password: "Password123",
      });

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result).toHaveProperty("expiresIn");
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        "Password123",
        "hashed-password"
      );
    });

    it("should throw error for invalid email", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.login({
          email: "nonexistent@example.com",
          password: "Password123",
        })
      ).rejects.toThrow(AuthError);
    });

    it("should throw error for invalid password", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        passwordHash: "hashed-password",
        twoFactorEnabled: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login({
          email: "test@example.com",
          password: "WrongPassword",
        })
      ).rejects.toThrow(AuthError);
    });

    it("should require 2FA code when 2FA is enabled", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        passwordHash: "hashed-password",
        twoFactorEnabled: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        authService.login({
          email: "test@example.com",
          password: "Password123",
        })
      ).rejects.toThrow(AuthError);
    });
  });

  describe("validateToken", () => {
    it("should successfully validate a valid token", async () => {
      const mockPayload = {
        userId: "user-123",
        email: "test@example.com",
        iat: Date.now(),
        exp: Date.now() + 3600,
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const result = await authService.validateToken("valid-token");

      expect(result).toEqual(mockPayload);
      expect(jwt.verify).toHaveBeenCalled();
    });

    it("should throw error for invalid token", async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid token");
      });

      await expect(authService.validateToken("invalid-token")).rejects.toThrow(
        AuthError
      );
    });
  });

  describe("refreshToken", () => {
    it("should successfully refresh tokens", async () => {
      const mockPayload = {
        userId: "user-123",
        email: "test@example.com",
        tokenId: "token-123",
        iat: Date.now(),
        exp: Date.now() + 3600,
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      (redisClient.get as jest.Mock).mockResolvedValue("old-refresh-token");
      (redisClient.del as jest.Mock).mockResolvedValue(1);
      (jwt.sign as jest.Mock).mockReturnValue("new-token");
      (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

      const result = await authService.refreshToken("old-refresh-token");

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(redisClient.del).toHaveBeenCalled();
    });

    it("should throw error for invalid refresh token", async () => {
      const mockPayload = {
        userId: "user-123",
        email: "test@example.com",
        tokenId: "token-123",
        iat: Date.now(),
        exp: Date.now() + 3600,
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      (redisClient.get as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.refreshToken("invalid-refresh-token")
      ).rejects.toThrow(AuthError);
    });
  });

  describe("logout", () => {
    it("should successfully logout user", async () => {
      (redisClient.del as jest.Mock).mockResolvedValue(1);

      await authService.logout("user-123", "token-123");

      expect(redisClient.del).toHaveBeenCalledWith(
        "refresh_token:user-123:token-123"
      );
    });
  });
});
