import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clean existing data (optional - comment out if you want to preserve data)
  console.log('🧹 Cleaning existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.syncLog.deleteMany();
  await prisma.variableVersion.deleteMany();
  await prisma.variable.deleteMany();
  await prisma.environment.deleteMany();
  await prisma.platformConnection.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();

  // Create test users
  console.log('👤 Creating users...');
  const passwordHash = await bcrypt.hash('password123', 12);

  const user1 = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      passwordHash,
      emailVerified: true,
      twoFactorEnabled: false,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'developer@example.com',
      passwordHash,
      emailVerified: true,
      twoFactorEnabled: false,
    },
  });

  const user3 = await prisma.user.create({
    data: {
      email: 'viewer@example.com',
      passwordHash,
      emailVerified: true,
      twoFactorEnabled: false,
    },
  });

  console.log(`✅ Created ${3} users`);

  // Create subscriptions
  console.log('💳 Creating subscriptions...');
  await prisma.subscription.create({
    data: {
      userId: user1.id,
      plan: 'team',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  await prisma.subscription.create({
    data: {
      userId: user2.id,
      plan: 'pro',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.subscription.create({
    data: {
      userId: user3.id,
      plan: 'free',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`✅ Created ${3} subscriptions`);

  // Create projects
  console.log('📁 Creating projects...');
  const project1 = await prisma.project.create({
    data: {
      name: 'E-Commerce Platform',
      description: 'Main e-commerce application with microservices',
      ownerId: user1.id,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Mobile App Backend',
      description: 'REST API for mobile applications',
      ownerId: user1.id,
    },
  });

  const project3 = await prisma.project.create({
    data: {
      name: 'Analytics Dashboard',
      description: 'Real-time analytics and reporting',
      ownerId: user2.id,
    },
  });

  console.log(`✅ Created ${3} projects`);

  // Create project members
  console.log('👥 Creating project members...');
  await prisma.projectMember.create({
    data: {
      projectId: project1.id,
      userId: user2.id,
      role: 'developer',
    },
  });

  await prisma.projectMember.create({
    data: {
      projectId: project1.id,
      userId: user3.id,
      role: 'viewer',
    },
  });

  await prisma.projectMember.create({
    data: {
      projectId: project2.id,
      userId: user2.id,
      role: 'admin',
    },
  });

  console.log(`✅ Created ${3} project members`);

  // Create environments
  console.log('🌍 Creating environments...');
  const env1Dev = await prisma.environment.create({
    data: {
      projectId: project1.id,
      name: 'development',
    },
  });

  const env1Staging = await prisma.environment.create({
    data: {
      projectId: project1.id,
      name: 'staging',
    },
  });

  const env1Prod = await prisma.environment.create({
    data: {
      projectId: project1.id,
      name: 'production',
    },
  });

  const env2Dev = await prisma.environment.create({
    data: {
      projectId: project2.id,
      name: 'development',
    },
  });

  const env2Prod = await prisma.environment.create({
    data: {
      projectId: project2.id,
      name: 'production',
    },
  });

  const env3Dev = await prisma.environment.create({
    data: {
      projectId: project3.id,
      name: 'development',
    },
  });

  console.log(`✅ Created ${6} environments`);

  // Create variables
  console.log('🔐 Creating variables...');
  const variables = await prisma.variable.createMany({
    data: [
      // Development environment variables
      {
        environmentId: env1Dev.id,
        key: 'DATABASE_URL',
        value: 'postgresql://localhost:5432/ecommerce_dev',
        isSecret: true,
        createdBy: user1.id,
      },
      {
        environmentId: env1Dev.id,
        key: 'API_KEY',
        value: 'dev_api_key_12345',
        isSecret: true,
        createdBy: user1.id,
      },
      {
        environmentId: env1Dev.id,
        key: 'NODE_ENV',
        value: 'development',
        isSecret: false,
        createdBy: user1.id,
      },
      {
        environmentId: env1Dev.id,
        key: 'PORT',
        value: '3000',
        isSecret: false,
        createdBy: user1.id,
      },
      // Staging environment variables
      {
        environmentId: env1Staging.id,
        key: 'DATABASE_URL',
        value: 'postgresql://staging-db:5432/ecommerce_staging',
        isSecret: true,
        createdBy: user1.id,
      },
      {
        environmentId: env1Staging.id,
        key: 'API_KEY',
        value: 'staging_api_key_67890',
        isSecret: true,
        createdBy: user1.id,
      },
      {
        environmentId: env1Staging.id,
        key: 'NODE_ENV',
        value: 'staging',
        isSecret: false,
        createdBy: user1.id,
      },
      // Production environment variables
      {
        environmentId: env1Prod.id,
        key: 'DATABASE_URL',
        value: 'postgresql://prod-db:5432/ecommerce_prod',
        isSecret: true,
        createdBy: user1.id,
      },
      {
        environmentId: env1Prod.id,
        key: 'API_KEY',
        value: 'prod_api_key_secure_xyz',
        isSecret: true,
        rotationEnabled: true,
        rotationIntervalDays: 90,
        nextRotationAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        createdBy: user1.id,
      },
      {
        environmentId: env1Prod.id,
        key: 'NODE_ENV',
        value: 'production',
        isSecret: false,
        createdBy: user1.id,
      },
      {
        environmentId: env1Prod.id,
        key: 'REDIS_URL',
        value: 'redis://prod-redis:6379',
        isSecret: true,
        createdBy: user1.id,
      },
      // Project 2 variables
      {
        environmentId: env2Dev.id,
        key: 'JWT_SECRET',
        value: 'dev_jwt_secret_key',
        isSecret: true,
        createdBy: user1.id,
      },
      {
        environmentId: env2Dev.id,
        key: 'AWS_REGION',
        value: 'us-east-1',
        isSecret: false,
        createdBy: user1.id,
      },
      {
        environmentId: env2Prod.id,
        key: 'JWT_SECRET',
        value: 'prod_jwt_secret_key_secure',
        isSecret: true,
        rotationEnabled: true,
        rotationIntervalDays: 30,
        nextRotationAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdBy: user1.id,
      },
      // Project 3 variables
      {
        environmentId: env3Dev.id,
        key: 'ANALYTICS_API_KEY',
        value: 'analytics_dev_key',
        isSecret: true,
        createdBy: user2.id,
      },
      {
        environmentId: env3Dev.id,
        key: 'LOG_LEVEL',
        value: 'debug',
        isSecret: false,
        createdBy: user2.id,
      },
    ],
  });

  console.log(`✅ Created ${variables.count} variables`);

  // Create some variable versions (history)
  console.log('📜 Creating variable versions...');
  const allVariables = await prisma.variable.findMany({
    take: 3,
  });

  for (const variable of allVariables) {
    await prisma.variableVersion.create({
      data: {
        variableId: variable.id,
        value: variable.value,
        changeType: 'created',
        changedBy: variable.createdBy,
      },
    });
  }

  console.log(`✅ Created ${allVariables.length} variable versions`);

  // Create API keys
  console.log('🔑 Creating API keys...');
  const apiKeyHash = await bcrypt.hash('test_api_key_12345', 12);

  await prisma.apiKey.create({
    data: {
      userId: user1.id,
      name: 'Development API Key',
      keyHash: apiKeyHash,
      scopes: ['read:projects', 'write:projects', 'read:variables', 'write:variables'],
    },
  });

  await prisma.apiKey.create({
    data: {
      userId: user2.id,
      name: 'CI/CD Pipeline Key',
      keyHash: apiKeyHash,
      scopes: ['read:variables'],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });

  console.log(`✅ Created ${2} API keys`);

  // Create platform connections
  console.log('🔌 Creating platform connections...');
  await prisma.platformConnection.create({
    data: {
      projectId: project1.id,
      platform: 'vercel',
      credentials: 'encrypted_vercel_token',
      encryptedDek: 'encrypted_dek_for_vercel',
      targetResource: 'prj_vercel123',
      lastSyncAt: new Date(),
      status: 'connected',
    },
  });

  await prisma.platformConnection.create({
    data: {
      projectId: project2.id,
      platform: 'aws-ssm',
      credentials: 'encrypted_aws_credentials',
      encryptedDek: 'encrypted_dek_for_aws',
      targetResource: '/app/mobile-backend',
      status: 'connected',
    },
  });

  console.log(`✅ Created ${2} platform connections`);

  // Create audit logs
  console.log('📋 Creating audit logs...');
  await prisma.auditLog.createMany({
    data: [
      {
        userId: user1.id,
        action: 'project.created',
        resourceType: 'project',
        resourceId: project1.id,
        metadata: { projectName: 'E-Commerce Platform' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        severity: 'info',
      },
      {
        userId: user1.id,
        action: 'variable.created',
        resourceType: 'variable',
        resourceId: allVariables[0]?.id,
        metadata: { key: 'DATABASE_URL', isSecret: true },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        severity: 'info',
      },
      {
        userId: user2.id,
        action: 'variable.viewed',
        resourceType: 'variable',
        resourceId: allVariables[0]?.id,
        metadata: { key: 'DATABASE_URL' },
        ipAddress: '192.168.1.5',
        userAgent: 'Mozilla/5.0',
        severity: 'info',
      },
      {
        userId: null,
        action: 'auth.failed_login',
        resourceType: 'user',
        resourceId: null,
        metadata: { email: 'attacker@example.com', reason: 'invalid_password' },
        ipAddress: '10.0.0.1',
        userAgent: 'curl/7.68.0',
        severity: 'warning',
      },
    ],
  });

  console.log(`✅ Created ${4} audit logs`);

  console.log('✨ Database seeding completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   - Users: 3`);
  console.log(`   - Projects: 3`);
  console.log(`   - Environments: 6`);
  console.log(`   - Variables: ${variables.count}`);
  console.log(`   - API Keys: 2`);
  console.log(`   - Platform Connections: 2`);
  console.log(`   - Audit Logs: 4`);
  console.log('\n🔐 Test credentials:');
  console.log(`   - admin@example.com / password123`);
  console.log(`   - developer@example.com / password123`);
  console.log(`   - viewer@example.com / password123`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
