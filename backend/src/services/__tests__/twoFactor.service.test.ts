import twoFactorService from "../twoFactor.service";
import prisma from "../../lib/prisma";
import { authenticator } from "otplib";
import { AuthError, NotFoundError } from "../../utils/errors";

jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("otplib", () => ({
  authenticator: {
    generateSecret: jest.fn(),
    keyuri: jest.fn(),
    verify: jest.fn(),
  },
}));

jest.mock("qrcode", () => ({
  toDataURL: jest.fn().mockResolvedValue("data:image/png;base64,mock-qr-code"),
}));

describe("TwoFactorService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("enable2FA", () => {
    it("should successfully enable 2FA for user", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        twoFactorEnabled: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (authenticator.generateSecret as jest.Mock).mockReturnValue(
        "mock-secret"
      );
      (authenticator.keyuri as jest.Mock).mockReturnValue(
        "otpauth://totp/test"
      );
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        twoFactorSecret: "mock-secret",
      });

      const result = await twoFactorService.enable2FA("user-123");

      expect(result).toHaveProperty("secret");
      expect(result).toHaveProperty("qrCode");
      expect(result).toHaveProperty("backupCodes");
      expect(result.backupCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it("should throw error if user not found", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(twoFactorService.enable2FA("user-123")).rejects.toThrow(
        NotFoundError
      );
    });

    it("should throw error if 2FA already enabled", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        twoFactorEnabled: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(twoFactorService.enable2FA("user-123")).rejects.toThrow(
        AuthError
      );
    });
  });

  describe("verify2FA", () => {
    it("should successfully verify 2FA code", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        twoFactorSecret: "mock-secret",
        twoFactorEnabled: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (authenticator.verify as jest.Mock).mockReturnValue(true);
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        twoFactorEnabled: true,
      });

      const result = await twoFactorService.verify2FA("user-123", "123456");

      expect(result).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { twoFactorEnabled: true },
      });
    });

    it("should throw error for invalid code", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        twoFactorSecret: "mock-secret",
        twoFactorEnabled: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (authenticator.verify as jest.Mock).mockReturnValue(false);

      await expect(
        twoFactorService.verify2FA("user-123", "wrong-code")
      ).rejects.toThrow(AuthError);
    });
  });

  describe("disable2FA", () => {
    it("should successfully disable 2FA", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        twoFactorSecret: "mock-secret",
        twoFactorEnabled: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (authenticator.verify as jest.Mock).mockReturnValue(true);
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      await twoFactorService.disable2FA("user-123", "123456");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      });
    });

    it("should throw error if 2FA not enabled", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        twoFactorEnabled: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        twoFactorService.disable2FA("user-123", "123456")
      ).rejects.toThrow(AuthError);
    });
  });

  describe("verifyLoginCode", () => {
    it("should return true for valid login code", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        twoFactorSecret: "mock-secret",
        twoFactorEnabled: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (authenticator.verify as jest.Mock).mockReturnValue(true);

      const result = await twoFactorService.verifyLoginCode(
        "user-123",
        "123456"
      );

      expect(result).toBe(true);
    });

    it("should return false for invalid user", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await twoFactorService.verifyLoginCode(
        "user-123",
        "123456"
      );

      expect(result).toBe(false);
    });
  });
});
