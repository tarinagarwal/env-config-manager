import prisma from "../lib/prisma";
import auditService from "./audit.service";

class AuditRetentionService {
  /**
   * Run retention policy enforcement for all users
   * This should be called periodically (e.g., daily via cron job)
   */
  async enforceRetentionPolicies(): Promise<void> {
    try {
      console.log("Starting audit log retention enforcement...");

      // Get all users with their subscriptions
      const users = await prisma.user.findMany({
        include: {
          subscription: true,
        },
      });

      let totalDeleted = 0;

      for (const user of users) {
        const plan = user.subscription?.plan || "free";
        const deleted = await auditService.enforceRetention(user.id, plan);
        totalDeleted += deleted;
      }

      console.log(
        `Audit log retention enforcement complete. Deleted ${totalDeleted} old logs.`
      );
    } catch (error) {
      console.error("Failed to enforce audit log retention:", error);
    }
  }

  /**
   * Enforce retention for a specific user
   */
  async enforceRetentionForUser(userId: string): Promise<number> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscription: true,
        },
      });

      if (!user) {
        return 0;
      }

      const plan = user.subscription?.plan || "free";
      return await auditService.enforceRetention(userId, plan);
    } catch (error) {
      console.error(`Failed to enforce retention for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Get retention information for a user
   */
  async getRetentionInfo(userId: string): Promise<{
    plan: string;
    retentionDays: number;
    oldestLog: Date | null;
    totalLogs: number;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
      },
    });

    const plan = user?.subscription?.plan || "free";
    const retentionDays = this.getRetentionDays(plan);

    const logs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: 1,
    });

    const totalLogs = await prisma.auditLog.count({
      where: { userId },
    });

    return {
      plan,
      retentionDays,
      oldestLog: logs[0]?.createdAt || null,
      totalLogs,
    };
  }

  /**
   * Get retention days based on subscription plan
   */
  private getRetentionDays(plan: string): number {
    switch (plan) {
      case "enterprise":
        return 730; // 2 years
      case "team":
        return 90; // 90 days
      case "pro":
        return 30; // 30 days
      case "free":
      default:
        return 30; // 30 days
    }
  }
}

export default new AuditRetentionService();
