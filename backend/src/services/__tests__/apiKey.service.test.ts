import apiKeyService from "../apiKey.service";
import prisma from "../../lib/prisma";
import { ValidationError, AuthError } from "../../utils/errors";
import { createHash } from "crypto";

// Mock dependencies
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    apiKey: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

describe("ApiKeyService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createApiKey", () => {
    it("should successfully create an API key", async () => {
      const mockApiKey = {
        id: "key-123",
        userId: "user-123",
        name: "Test API Key",
        keyHash: "hashed-key",
        scopes: ["projects:read", "variables:read"],
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
      };

      (prisma.apiKey.create as jest.Mock).mockResolvedValue(mockApiKey);

      const result = await apiKeyService.createApiKey("user-123", {
        name: "Test API Key",
        scopes: ["projects:read", "variables:read"],
      });

      expect(result).toHaveProperty("id", "key-123");
      expect(result).toHaveProperty("name", "Test API Key");
      expect(result).toHaveProperty("key");
      expect(result.key).toMatch(/^ecm_live_/);
      expect(result.scopes).toEqual(["projects:read", "variables:read"]);
      expect(prisma.apiKey.create).toHaveBeenCalled();
    });

    it("should create API key with default scopes if none provided", async () => {
      const mockApiKey = {
        id: "key-123",
        userId: "user-123",
        name: "Test API Key",
        keyHash: "hashed-key",
        scopes: ["projects:read", "variables:read"],
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
      };

      (prisma.apiKey.create as jest.Mock).mockResolvedValue(mockApiKey);

      const result = await apiKeyService.createApiKey("user-123", {
        name: "Test API Key",
      });

      expect(result.scopes).toEqual(["projects:read", "variables:read"]);
    });

    it("should create API key with expiration date", async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const mockApiKey = {
        id: "key-123",
        userId: "user-123",
        name: "Test API Key",
        keyHash: "hashed-key",
        scopes: ["projects:read"],
        expiresAt,
        lastUsedAt: null,
        createdAt: new Date(),
      };

      (prisma.apiKey.create as jest.Mock).mockResolvedValue(mockApiKey);

      const result = await apiKeyService.createApiKey("user-123", {
        name: "Test API Key",
        expiresInDays: 30,
      });

      expect(result.expiresAt).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("should throw error for empty name", async () => {
      await expect(
        apiKeyService.createApiKey("user-123", {
          name: "",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should throw error for name too long", async () => {
      await expect(
        apiKeyService.createApiKey("user-123", {
          name: "a".repeat(101),
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should throw error for invalid scope", async () => {
      await expect(
        apiKeyService.createApiKey("user-123", {
          name: "Test API Key",
          scopes: ["invalid:scope"],
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("validateApiKey", () => {
    it("should successfully validate a valid API key", async () => {
      const apiKey = "ecm_live_" + "a".repeat(64);
      const keyHash = createHash("sha256").update(apiKey).digest("hex");

      const mockApiKey = {
        id: "key-123",
        userId: "user-123",
        keyHash,
        scopes: ["projects:read", "variables:read"],
        expiresAt: null,
        user: {
          id: "user-123",
          email: "test@example.com",
        },
      };

      (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(mockApiKey);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue(mockApiKey);

      const result = await apiKeyService.validateApiKey(apiKey);

      expect(result).toEqual({
        userId: "user-123",
        scopes: ["projects:read", "variables:read"],
      });
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: "key-123" },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it("should throw error for invalid key format", async () => {
      await expect(
        apiKeyService.validateApiKey("invalid-key-format")
      ).rejects.toThrow(AuthError);
    });

    it("should throw error for non-existent key", async () => {
      const apiKey = "ecm_live_" + "a".repeat(64);

      (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(apiKeyService.validateApiKey(apiKey)).rejects.toThrow(
        AuthError
      );
    });

    it("should throw error for expired key", async () => {
      const apiKey = "ecm_live_" + "a".repeat(64);
      const keyHash = createHash("sha256").update(apiKey).digest("hex");

      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);

      const mockApiKey = {
        id: "key-123",
        userId: "user-123",
        keyHash,
        scopes: ["projects:read"],
        expiresAt: expiredDate,
        user: {
          id: "user-123",
          email: "test@example.com",
        },
      };

      (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(mockApiKey);

      await expect(apiKeyService.validateApiKey(apiKey)).rejects.toThrow(
        AuthError
      );
    });
  });

  describe("listApiKeys", () => {
    it("should successfully list all API keys for a user", async () => {
      const mockApiKeys = [
        {
          id: "key-1",
          name: "API Key 1",
          scopes: ["projects:read"],
          lastUsedAt: new Date(),
          expiresAt: null,
          createdAt: new Date(),
        },
        {
          id: "key-2",
          name: "API Key 2",
          scopes: ["projects:read", "variables:read"],
          lastUsedAt: null,
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      ];

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue(mockApiKeys);

      const result = await apiKeyService.listApiKeys("user-123");

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("id", "key-1");
      expect(result[0]).toHaveProperty("name", "API Key 1");
      expect(result[0]).not.toHaveProperty("keyHash");
      expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        orderBy: { createdAt: "desc" },
      });
    });

    it("should return empty array if user has no API keys", async () => {
      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([]);

      const result = await apiKeyService.listApiKeys("user-123");

      expect(result).toEqual([]);
    });
  });

  describe("deleteApiKey", () => {
    it("should successfully delete an API key", async () => {
      const mockApiKey = {
        id: "key-123",
        userId: "user-123",
        name: "Test API Key",
      };

      (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(mockApiKey);
      (prisma.apiKey.delete as jest.Mock).mockResolvedValue(mockApiKey);

      await apiKeyService.deleteApiKey("user-123", "key-123");

      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: {
          id: "key-123",
          userId: "user-123",
        },
      });
      expect(prisma.apiKey.delete).toHaveBeenCalledWith({
        where: { id: "key-123" },
      });
    });

    it("should throw error if API key not found", async () => {
      (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        apiKeyService.deleteApiKey("user-123", "key-123")
      ).rejects.toThrow(ValidationError);
    });

    it("should throw error if API key belongs to different user", async () => {
      (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        apiKeyService.deleteApiKey("user-123", "key-456")
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("hasScope", () => {
    it("should return true if user has required scope", () => {
      const userScopes = ["projects:read", "variables:read"];
      const result = apiKeyService.hasScope(userScopes, "projects:read");

      expect(result).toBe(true);
    });

    it("should return false if user does not have required scope", () => {
      const userScopes = ["projects:read"];
      const result = apiKeyService.hasScope(userScopes, "variables:write");

      expect(result).toBe(false);
    });
  });
});
