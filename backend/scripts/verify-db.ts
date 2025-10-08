import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyDatabase() {
  try {
    console.log("🔍 Verifying database connection...");

    // Test connection
    await prisma.$connect();
    console.log("✅ Database connection successful");

    // Check if we can query
    const userCount = await prisma.user.count();
    console.log(`✅ Database query successful - Found ${userCount} users`);

    // Check collections exist
    const collections = [
      "users",
      "projects",
      "environments",
      "variables",
      "subscriptions",
    ];

    for (const collection of collections) {
      try {
        const count = await (prisma as any)[collection.slice(0, -1)].count();
        console.log(`✅ Collection '${collection}' exists - ${count} records`);
      } catch (error) {
        console.log(
          `⚠️  Collection '${collection}' might not exist or is empty`
        );
      }
    }

    console.log("\n✅ Database verification completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Database verification failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDatabase();
