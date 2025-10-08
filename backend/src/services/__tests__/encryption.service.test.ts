import { encryptionService, EncryptionContext } from "../encryption.service";
import crypto from "crypto";

// Mock Redis
jest.mock("../../lib/redis", () => ({
  default: {
    setEx: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

describe("EncryptionService", () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    // Set a test encryption key (64 hex characters = 32 bytes)
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  });

  afterAll(() => {
    // Restore original environment
    process.env.ENCRYPTION_KEY = originalEnv;
  });

  const mockContext: EncryptionContext = {
    projectId: "project-123",
    environmentId: "env-456",
    variableId: "var-789",
  };

  describe("encrypt and decrypt", () => {
    it("should encrypt and decrypt a value successfully", async () => {
      const plaintext = "my-secret-api-key";

      // Encrypt
      const encrypted = await encryptionService.encrypt(plaintext, mockContext);

      expect(encrypted.encryptedValue).toBeDefined();
      expect(encrypted.encryptedDek).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();

      // Decrypt
      const decrypted = await encryptionService.decrypt(
        encrypted.encryptedValue,
        encrypted.encryptedDek,
        encrypted.iv,
        encrypted.authTag,
        mockContext
      );

      expect(decrypted).toBe(plaintext);
    });

    it("should handle empty strings", async () => {
      const plaintext = "";

      const encrypted = await encryptionService.encrypt(plaintext, mockContext);
      const decrypted = await encryptionService.decrypt(
        encrypted.encryptedValue,
        encrypted.encryptedDek,
        encrypted.iv,
        encrypted.authTag,
        mockContext
      );

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long strings", async () => {
      const plaintext = "a".repeat(10000);

      const encrypted = await encryptionService.encrypt(plaintext, mockContext);
      const decrypted = await encryptionService.decrypt(
        encrypted.encryptedValue,
        encrypted.encryptedDek,
        encrypted.iv,
        encrypted.authTag,
        mockContext
      );

      expect(decrypted).toBe(plaintext);
    });

    it("should handle special characters and unicode", async () => {
      const plaintext = '🔐 Secret: {"key": "value", "emoji": "🚀"}';

      const encrypted = await encryptionService.encrypt(plaintext, mockContext);
      const decrypted = await encryptionService.decrypt(
        encrypted.encryptedValue,
        encrypted.encryptedDek,
        encrypted.iv,
        encrypted.authTag,
        mockContext
      );

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("envelope encryption pattern", () => {
    it("should generate different DEKs for each encryption", async () => {
      const plaintext = "same-value";

      const encrypted1 = await encryptionService.encrypt(
        plaintext,
        mockContext
      );
      const encrypted2 = await encryptionService.encrypt(
        plaintext,
        mockContext
      );

      // Different DEKs should be generated
      expect(encrypted1.encryptedDek).not.toBe(encrypted2.encryptedDek);

      // Different encrypted values due to different DEKs and IVs
      expect(encrypted1.encryptedValue).not.toBe(encrypted2.encryptedValue);

      // Both should decrypt to the same plaintext
      const decrypted1 = await encryptionService.decrypt(
        encrypted1.encryptedValue,
        encrypted1.encryptedDek,
        encrypted1.iv,
        encrypted1.authTag,
        mockContext
      );
      const decrypted2 = await encryptionService.decrypt(
        encrypted2.encryptedValue,
        encrypted2.encryptedDek,
        encrypted2.iv,
        encrypted2.authTag,
        mockContext
      );

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it("should store encrypted DEK as JSON", async () => {
      const plaintext = "test-value";

      const encrypted = await encryptionService.encrypt(plaintext, mockContext);

      // Verify encrypted DEK is valid JSON
      const dekData = JSON.parse(encrypted.encryptedDek);
      expect(dekData).toHaveProperty("encryptedDek");
      expect(dekData).toHaveProperty("iv");
      expect(dekData).toHaveProperty("authTag");
    });
  });

  describe("encryption context validation", () => {
    it("should fail decryption with wrong context", async () => {
      const plaintext = "secret-value";

      const encrypted = await encryptionService.encrypt(plaintext, mockContext);

      // Try to decrypt with different context
      const wrongContext: EncryptionContext = {
        projectId: "different-project",
        environmentId: "different-env",
        variableId: "different-var",
      };

      await expect(
        encryptionService.decrypt(
          encrypted.encryptedValue,
          encrypted.encryptedDek,
          encrypted.iv,
          encrypted.authTag,
          wrongContext
        )
      ).rejects.toThrow();
    });

    it("should fail decryption with partially wrong context", async () => {
      const plaintext = "secret-value";

      const encrypted = await encryptionService.encrypt(plaintext, mockContext);

      // Try to decrypt with one field different
      const wrongContext: EncryptionContext = {
        ...mockContext,
        projectId: "different-project",
      };

      await expect(
        encryptionService.decrypt(
          encrypted.encryptedValue,
          encrypted.encryptedDek,
          encrypted.iv,
          encrypted.authTag,
          wrongContext
        )
      ).rejects.toThrow();
    });

    it("should succeed with correct context", async () => {
      const plaintext = "secret-value";

      const encrypted = await encryptionService.encrypt(plaintext, mockContext);

      // Decrypt with same context
      const decrypted = await encryptionService.decrypt(
        encrypted.encryptedValue,
        encrypted.encryptedDek,
        encrypted.iv,
        encrypted.authTag,
        mockContext
      );

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("key rotation", () => {
    it("should re-encrypt data with new DEK", async () => {
      const plaintext = "secret-to-rotate";

      // Initial encryption
      const encrypted1 = await encryptionService.encrypt(
        plaintext,
        mockContext
      );

      // Rotate key
      const encrypted2 = await encryptionService.rotateKey(
        encrypted1.encryptedValue,
        encrypted1.encryptedDek,
        encrypted1.iv,
        encrypted1.authTag,
        mockContext
      );

      // New encryption should have different DEK
      expect(encrypted2.encryptedDek).not.toBe(encrypted1.encryptedDek);
      expect(encrypted2.encryptedValue).not.toBe(encrypted1.encryptedValue);

      // Both should decrypt to same plaintext
      const decrypted1 = await encryptionService.decrypt(
        encrypted1.encryptedValue,
        encrypted1.encryptedDek,
        encrypted1.iv,
        encrypted1.authTag,
        mockContext
      );
      const decrypted2 = await encryptionService.decrypt(
        encrypted2.encryptedValue,
        encrypted2.encryptedDek,
        encrypted2.iv,
        encrypted2.authTag,
        mockContext
      );

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it("should maintain data integrity during rotation", async () => {
      const plaintext = "important-secret-data-🔐";

      const encrypted1 = await encryptionService.encrypt(
        plaintext,
        mockContext
      );
      const encrypted2 = await encryptionService.rotateKey(
        encrypted1.encryptedValue,
        encrypted1.encryptedDek,
        encrypted1.iv,
        encrypted1.authTag,
        mockContext
      );

      const decrypted = await encryptionService.decrypt(
        encrypted2.encryptedValue,
        encrypted2.encryptedDek,
        encrypted2.iv,
        encrypted2.authTag,
        mockContext
      );

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("error handling", () => {
    it("should throw error if ENCRYPTION_KEY is not set", async () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;

      await expect(
        encryptionService.encrypt("test", mockContext)
      ).rejects.toThrow("ENCRYPTION_KEY not configured");

      process.env.ENCRYPTION_KEY = originalKey;
    });

    it("should throw error if ENCRYPTION_KEY has wrong length", async () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = "tooshort";

      await expect(
        encryptionService.encrypt("test", mockContext)
      ).rejects.toThrow("ENCRYPTION_KEY must be 32 bytes");

      process.env.ENCRYPTION_KEY = originalKey;
    });

    it("should throw error with tampered encrypted value", async () => {
      const plaintext = "secret";
      const encrypted = await encryptionService.encrypt(plaintext, mockContext);

      // Tamper with encrypted value
      const tamperedValue = encrypted.encryptedValue.slice(0, -4) + "XXXX";

      await expect(
        encryptionService.decrypt(
          tamperedValue,
          encrypted.encryptedDek,
          encrypted.iv,
          encrypted.authTag,
          mockContext
        )
      ).rejects.toThrow();
    });

    it("should throw error with tampered auth tag", async () => {
      const plaintext = "secret";
      const encrypted = await encryptionService.encrypt(plaintext, mockContext);

      // Tamper with auth tag
      const tamperedAuthTag = encrypted.authTag.slice(0, -4) + "XXXX";

      await expect(
        encryptionService.decrypt(
          encrypted.encryptedValue,
          encrypted.encryptedDek,
          encrypted.iv,
          tamperedAuthTag,
          mockContext
        )
      ).rejects.toThrow();
    });

    it("should throw error with tampered encrypted DEK", async () => {
      const plaintext = "secret";
      const encrypted = await encryptionService.encrypt(plaintext, mockContext);

      // Tamper with encrypted DEK
      const dekData = JSON.parse(encrypted.encryptedDek);
      dekData.encryptedDek = dekData.encryptedDek.slice(0, -4) + "XXXX";
      const tamperedDek = JSON.stringify(dekData);

      await expect(
        encryptionService.decrypt(
          encrypted.encryptedValue,
          tamperedDek,
          encrypted.iv,
          encrypted.authTag,
          mockContext
        )
      ).rejects.toThrow();
    });
  });

  describe("master key generation", () => {
    it("should generate a valid 256-bit key", () => {
      const { EncryptionService } = require("../encryption.service");
      const key = EncryptionService.generateMasterKey();

      // Should be 64 hex characters (32 bytes)
      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
    });

    it("should generate different keys each time", () => {
      const { EncryptionService } = require("../encryption.service");
      const key1 = EncryptionService.generateMasterKey();
      const key2 = EncryptionService.generateMasterKey();

      expect(key1).not.toBe(key2);
    });
  });
});
