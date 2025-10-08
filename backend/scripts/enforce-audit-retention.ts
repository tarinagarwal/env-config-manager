import auditRetentionService from "../src/services/auditRetention.service";
import prisma from "../src/lib/prisma";

/**
 * Script to enforce audit log retention policies
 * Run this script periodically (e.g., daily via cron job)
 */
async function main() {
  try {
    console.log("Enforcing audit log retention policies...");
    await auditRetentionService.enforceRetentionPolicies();
    console.log("Done!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
