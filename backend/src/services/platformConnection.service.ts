import prisma from "../lib/prisma";
import { NotFoundError, ValidationError } from "../utils/errors";
import { encryptionService } from "./encryption.service";
import { PlatformType, PlatformCredentials } from "../types/sync.types";
import { VercelAdapter } from "../adapters/vercel.adapter";
import { AWSAdapter } from "../adapters/aws.adapter";
import { NetlifyAdapter } from "../adapters/netlify.adapter";
import { BasePlatformAdapter } from "../adapters/base.adapter";

interface CreateConnectionDto {
  platform: PlatformType;
  credentials: PlatformCredentials;
  targetResource: string;
}

class PlatformConnectionService {
  /**
   * Get the appropriate adapter for a platform type
   */
  private getAdapter(platform: PlatformType): BasePlatformAdapter {
    switch (platform) {
      case "vercel":
        return new VercelAdapter();
      case "aws-ssm":
      case "aws-secrets-manager":
        return new AWSAdapter();
      case "netlify":
        return new NetlifyAdapter();
      default:
        throw new ValidationError(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Create a new platform connection
   */
  async createConnection(projectId: string, data: CreateConnectionDto) {
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundError("Project");
    }

    // Get adapter and test authentication
    const adapter = this.getAdapter(data.platform);

    try {
      await adapter.authenticate(data.credentials);
    } catch (error) {
      throw new ValidationError(
        `Failed to authenticate with ${data.platform}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    // Test connection
    const connectionOk = await adapter.testConnection();
    if (!connectionOk) {
      throw new ValidationError(`Connection test failed for ${data.platform}`);
    }

    // Encrypt credentials
    // We'll use a temporary connection ID for encryption context
    const tempConnection = await prisma.platformConnection.create({
      data: {
        projectId,
        platform: data.platform,
        credentials: "", // Temporary empty value
        encryptedDek: "",
        targetResource: data.targetResource,
        status: "connected",
      },
    });

    const encryptionContext = {
      projectId,
      environmentId: "platform-connection",
      variableId: tempConnection.id,
    };

    const encrypted = await encryptionService.encrypt(
      JSON.stringify(data.credentials),
      encryptionContext
    );

    // Store encryption metadata
    const encryptionMetadata = JSON.stringify({
      encryptedDek: encrypted.encryptedDek,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    });

    // Update with encrypted credentials
    const connection = await prisma.platformConnection.update({
      where: { id: tempConnection.id },
      data: {
        credentials: encrypted.encryptedValue,
        encryptedDek: encryptionMetadata,
      },
    });

    return connection;
  }

  /**
   * Get all connections for a project
   */
  async getConnections(projectId: string) {
    const connections = await prisma.platformConnection.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    // Don't return encrypted credentials in the response
    return connections.map((conn) => ({
      id: conn.id,
      projectId: conn.projectId,
      platform: conn.platform,
      targetResource: conn.targetResource,
      lastSyncAt: conn.lastSyncAt,
      status: conn.status,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    }));
  }

  /**
   * Get a single connection by ID
   */
  async getConnectionById(connectionId: string) {
    const connection = await prisma.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundError("Platform connection");
    }

    // Don't return encrypted credentials
    return {
      id: connection.id,
      projectId: connection.projectId,
      platform: connection.platform,
      targetResource: connection.targetResource,
      lastSyncAt: connection.lastSyncAt,
      status: connection.status,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  /**
   * Decrypt connection credentials
   */
  async decryptCredentials(connectionId: string): Promise<PlatformCredentials> {
    const connection = await prisma.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundError("Platform connection");
    }

    const encryptionContext = {
      projectId: connection.projectId,
      environmentId: "platform-connection",
      variableId: connection.id,
    };

    const dekData = JSON.parse(connection.encryptedDek);

    const decrypted = await encryptionService.decrypt(
      connection.credentials,
      connection.encryptedDek,
      dekData.iv || "",
      dekData.authTag || "",
      encryptionContext
    );

    return JSON.parse(decrypted);
  }

  /**
   * Delete a platform connection
   */
  async deleteConnection(connectionId: string) {
    const connection = await prisma.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundError("Platform connection");
    }

    // Delete all sync logs for this connection
    await prisma.syncLog.deleteMany({
      where: { connectionId },
    });

    // Delete the connection
    await prisma.platformConnection.delete({
      where: { id: connectionId },
    });

    return { message: "Connection deleted successfully" };
  }

  /**
   * Update connection status
   */
  async updateConnectionStatus(
    connectionId: string,
    status: "connected" | "error"
  ) {
    const connection = await prisma.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundError("Platform connection");
    }

    return await prisma.platformConnection.update({
      where: { id: connectionId },
      data: { status },
    });
  }

  /**
   * Update last sync timestamp
   */
  async updateLastSync(connectionId: string) {
    return await prisma.platformConnection.update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date() },
    });
  }

  /**
   * Test a connection
   */
  async testConnection(connectionId: string): Promise<boolean> {
    const connection = await prisma.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundError("Platform connection");
    }

    try {
      // Decrypt credentials
      const credentials = await this.decryptCredentials(connectionId);

      // Get adapter and test
      const adapter = this.getAdapter(connection.platform as PlatformType);
      await adapter.authenticate(credentials);
      const result = await adapter.testConnection();

      // Update status based on test result
      await this.updateConnectionStatus(
        connectionId,
        result ? "connected" : "error"
      );

      return result;
    } catch (error) {
      // Update status to error
      await this.updateConnectionStatus(connectionId, "error");
      return false;
    }
  }
}

export default new PlatformConnectionService();
