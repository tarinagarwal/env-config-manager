import { authenticator } from "otplib";
import QRCode from "qrcode";
import prisma from "../lib/prisma";
import { AuthError, NotFoundError } from "../utils/errors";

interface TwoFactorSecret {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

class TwoFactorService {
  async enable2FA(userId: string): Promise<TwoFactorSecret> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.twoFactorEnabled) {
      throw new AuthError(
        "AUTH_2FA_ALREADY_ENABLED",
        "Two-factor authentication is already enabled",
        400
      );
    }

    // Generate secret
    const secret = authenticator.generateSecret();

    // Generate OTP auth URL
    const otpauthUrl = authenticator.keyuri(
      user.email,
      "Env Config Manager",
      secret
    );

    // Generate QR code
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Store secret temporarily (will be confirmed when user verifies)
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: secret,
      },
    });

    return {
      secret,
      qrCode,
      backupCodes,
    };
  }

  async verify2FA(userId: string, code: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.twoFactorSecret) {
      throw new NotFoundError("User or 2FA secret");
    }

    // Verify the code
    const isValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw new AuthError(
        "AUTH_INVALID_2FA_CODE",
        "Invalid two-factor authentication code",
        401
      );
    }

    // Enable 2FA if not already enabled
    if (!user.twoFactorEnabled) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
        },
      });
    }

    return true;
  }

  async disable2FA(userId: string, code: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User");
    }

    if (!user.twoFactorEnabled) {
      throw new AuthError(
        "AUTH_2FA_NOT_ENABLED",
        "Two-factor authentication is not enabled",
        400
      );
    }

    // Verify the code before disabling
    const isValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret!,
    });

    if (!isValid) {
      throw new AuthError(
        "AUTH_INVALID_2FA_CODE",
        "Invalid two-factor authentication code",
        401
      );
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });
  }

  async verifyLoginCode(userId: string, code: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.twoFactorSecret || !user.twoFactorEnabled) {
      return false;
    }

    return authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    });
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }
}

export default new TwoFactorService();
