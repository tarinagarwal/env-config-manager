import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import prisma from "../lib/prisma";
import redisClient from "../lib/redis";
import { AuthError, NotFoundError } from "../utils/errors";

const RESET_TOKEN_PREFIX = "password_reset:";
const RESET_TOKEN_EXPIRY = 3600; // 1 hour in seconds
const SALT_ROUNDS = 12;

class PasswordResetService {
  async requestPasswordReset(email: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists for security
      console.log(`Password reset requested for non-existent email: ${email}`);
      return "If the email exists, a reset link has been sent";
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString("hex");

    // Store token in Redis with expiry
    await redisClient.setEx(
      `${RESET_TOKEN_PREFIX}${resetToken}`,
      RESET_TOKEN_EXPIRY,
      user.id
    );

    // TODO: Send email with reset link (will be implemented when email service is added)
    console.log(`Password reset token for ${email}: ${resetToken}`);
    console.log(
      `Reset link: ${process.env.CORS_ORIGIN}/reset-password?token=${resetToken}`
    );

    return "If the email exists, a reset link has been sent";
  }

  async validateResetToken(token: string): Promise<string> {
    const userId = await redisClient.get(`${RESET_TOKEN_PREFIX}${token}`);

    if (!userId) {
      throw new AuthError(
        "AUTH_INVALID_RESET_TOKEN",
        "Invalid or expired reset token",
        400
      );
    }

    return userId;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Validate token and get user ID
    const userId = await this.validateResetToken(token);

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update user password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Delete the reset token
    await redisClient.del(`${RESET_TOKEN_PREFIX}${token}`);

    console.log(`Password reset successful for user: ${userId}`);
  }
}

export default new PasswordResetService();
