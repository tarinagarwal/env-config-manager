import passwordResetService from "../passwordReset.service";
import prisma from "../../lib/prisma";
import redisClient from "../../lib/redis";
import bcrypt from "bcrypt";
import { AuthError } from "../../utils/errors";

jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
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

describe("PasswordResetService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("requestPasswordReset", () => {
    it("should successfully request password reset for existing user", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

      const result = await passwordResetService.requestPasswordReset(
        "test@example.com"
      );

      expect(result).toBe("If the email exists, a reset link has been sent");
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
      expect(redisClient.setEx).toHaveBeenCalled();
    });

    it("should not reveal if user does not exist", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await passwordResetService.requestPasswordReset(
        "nonexistent@example.com"
      );

      expect(result).toBe("If the email exists, a reset link has been sent");
      expect(redisClient.setEx).not.toHaveBeenCalled();
    });
  });

  describe("validateResetToken", () => {
    it("should successfully validate a valid token", async () => {
      (redisClient.get as jest.Mock).mockResolvedValue("user-123");

      const result = await passwordResetService.validateResetToken(
        "valid-token"
      );

      expect(result).toBe("user-123");
      expect(redisClient.get).toHaveBeenCalledWith(
        "password_reset:valid-token"
      );
    });

    it("should throw error for invalid token", async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);

      await expect(
        passwordResetService.validateResetToken("invalid-token")
      ).rejects.toThrow(AuthError);
    });
  });

  describe("resetPassword", () => {
    it("should successfully reset password", async () => {
      (redisClient.get as jest.Mock).mockResolvedValue("user-123");
      (bcrypt.hash as jest.Mock).mockResolvedValue("new-hashed-password");
      (prisma.user.update as jest.Mock).mockResolvedValue({
        id: "user-123",
        passwordHash: "new-hashed-password",
      });
      (redisClient.del as jest.Mock).mockResolvedValue(1);

      await passwordResetService.resetPassword("valid-token", "NewPassword123");

      expect(bcrypt.hash).toHaveBeenCalledWith("NewPassword123", 12);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { passwordHash: "new-hashed-password" },
      });
      expect(redisClient.del).toHaveBeenCalledWith(
        "password_reset:valid-token"
      );
    });

    it("should throw error for invalid token", async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);

      await expect(
        passwordResetService.resetPassword("invalid-token", "NewPassword123")
      ).rejects.toThrow(AuthError);
    });
  });
});
