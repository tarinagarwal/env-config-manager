import { randomBytes, createHash } from "crypto";
import prisma from "../lib/prisma";
import { ValidationError, AuthError } from "../utils/errors";

export interface CreateApiKeyDto {
  name: string;
  scopes?: string[];
  expiresInDays?: number;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key: string; // Only returned on creation
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

class ApiKeyService {
  /**
   * Generate a secure API key
   * Format: ecm_live_<32 random bytes in hex>
   */
  private generateApiKey(): string {
    const randomPart = randomBytes(32).toString("hex");
    return `ecm_live_${randomPart}`;
  }

  /**
   * Hash an API key for storage
   * Uses SHA-256 for fast verification
   */
  private hashApiKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  /**
   * Create a new API key for a user
   */
  async createApiKey(
    userId: string,
    data: CreateApiKeyDto
  ): Promise<ApiKeyResponse> {
    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError("API key name is required");
    }

    if (data.name.length > 100) {
      throw new ValidationError(
        "API key name must be less than 100 characters"
      );
    }

    // Validate scopes
    const validScopes = [
      "projects:read",
      "projects:write",
      "environments:read",
      "environments:write",
      "variables:read",
      "variables:write",
      "sync:trigger",
      "audit:read",
    ];

    const scopes = data.scopes || ["projects:read", "variables:read"];

    for (const scope of scopes) {
      if (!validScopes.includes(scope)) {
        throw new ValidationError(`Invalid scope: ${scope}`);
      }
    }

    // Generate API key
    const apiKey = this.generateApiKey();
    const keyHash = this.hashApiKey(apiKey);

    // Calculate expiration date
    let expiresAt: Date | null = null;
    if (data.expiresInDays && data.expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);
    }

    // Store in database
    const apiKeyRecord = await prisma.apiKey.create({
      data: {
        userId,
        name: data.name.trim(),
        keyHash,
        scopes: scopes,
        expiresAt,
      },
    });

    return {
      id: apiKeyRecord.id,
      name: apiKeyRecord.name,
      key: apiKey, // Only returned on creation
      scopes: apiKeyRecord.scopes as string[],
      expiresAt: apiKeyRecord.expiresAt,
      createdAt: apiKeyRecord.createdAt,
    };
  }

  /**
   * Validate an API key and return user info
   */
  async validateApiKey(
    key: string
  ): Promise<{ userId: string; scopes: string[] }> {
    // Validate key format
    if (!key.startsWith("ecm_live_")) {
      throw new AuthError(
        "AUTH_INVALID_API_KEY",
        "Invalid API key format",
        401
      );
    }

    const keyHash = this.hashApiKey(key);

    // Find API key in database
    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: {
        keyHash,
      },
      include: {
        user: true,
      },
    });

    if (!apiKeyRecord) {
      throw new AuthError("AUTH_INVALID_API_KEY", "Invalid API key", 401);
    }

    // Check if key is expired
    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      throw new AuthError("AUTH_EXPIRED_API_KEY", "API key has expired", 401);
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      userId: apiKeyRecord.userId,
      scopes: (apiKeyRecord.scopes as string[]) || [],
    };
  }

  /**
   * List all API keys for a user
   */
  async listApiKeys(userId: string): Promise<ApiKeyListItem[]> {
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return apiKeys.map((key) => ({
      id: key.id,
      name: key.name,
      scopes: (key.scopes as string[]) || [],
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
    }));
  }

  /**
   * Delete an API key
   */
  async deleteApiKey(userId: string, keyId: string): Promise<void> {
    // Verify the key belongs to the user
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        userId,
      },
    });

    if (!apiKey) {
      throw new ValidationError("API key not found");
    }

    await prisma.apiKey.delete({
      where: { id: keyId },
    });
  }

  /**
   * Check if a user has a specific scope
   */
  hasScope(userScopes: string[], requiredScope: string): boolean {
    return userScopes.includes(requiredScope);
  }
}

export default new ApiKeyService();
