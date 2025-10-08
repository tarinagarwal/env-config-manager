import crypto from "crypto";
import redis from "../lib/redis";

/**
 * Encryption context for additional security
 * Prevents ciphertext from being reused in different contexts
 */
export interface EncryptionContext {
  projectId: string;
  environmentId: string;
  variableId: string;
}

/**
 * Result of encryption operation
 */
export interface EncryptionResult {
  encryptedValue: string;
  encryptedDek: string;
  iv: string;
  authTag: string;
}

/**
 * Encryption Service
 * Implements envelope encryption pattern with AES-256-GCM
 *
 * Architecture:
 * - KEK (Key Encryption Key): Master key stored in environment variable
 * - DEK (Data Encryption Key): Generated per variable, encrypted with KEK
 * - Data is encrypted with DEK, DEK is encrypted with KEK
 * - Both encrypted data and encrypted DEK are stored together
 */
export class EncryptionService {
  private readonly ALGORITHM = "aes-256-gcm";
  private readonly KEY_LENGTH = 32; // 256 bits
  private readonly IV_LENGTH = 16; // 128 bits
  private readonly AUTH_TAG_LENGTH = 16; // 128 bits
  private readonly CACHE_TTL = 3600; // 1 hour in seconds

  /**
   * Get the master encryption key (KEK) from environment
   */
  private getKEK(): Buffer {
    const kekHex = process.env.ENCRYPTION_KEY;

    if (!kekHex) {
      throw new Error("ENCRYPTION_KEY not configured in environment variables");
    }

    // Convert hex string to buffer
    // In production, this should be a proper 256-bit key
    const kek = Buffer.from(kekHex, "hex");

    if (kek.length !== this.KEY_LENGTH) {
      throw new Error(
        `ENCRYPTION_KEY must be ${this.KEY_LENGTH} bytes (64 hex characters)`
      );
    }

    return kek;
  }

  /**
   * Generate a new Data Encryption Key (DEK)
   */
  private generateDEK(): Buffer {
    return crypto.randomBytes(this.KEY_LENGTH);
  }

  /**
   * Encrypt the DEK with the KEK
   */
  private encryptDEK(dek: Buffer): {
    encryptedDek: string;
    iv: string;
    authTag: string;
  } {
    const kek = this.getKEK();
    const iv = crypto.randomBytes(this.IV_LENGTH);

    const cipher = crypto.createCipheriv(this.ALGORITHM, kek, iv);

    const encryptedDek = Buffer.concat([cipher.update(dek), cipher.final()]);

    const authTag = cipher.getAuthTag();

    return {
      encryptedDek: encryptedDek.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  /**
   * Decrypt the DEK with the KEK
   */
  private decryptDEK(
    encryptedDek: string,
    iv: string,
    authTag: string
  ): Buffer {
    const kek = this.getKEK();

    const decipher = crypto.createDecipheriv(
      this.ALGORITHM,
      kek,
      Buffer.from(iv, "base64")
    );

    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    const dek = Buffer.concat([
      decipher.update(Buffer.from(encryptedDek, "base64")),
      decipher.final(),
    ]);

    return dek;
  }

  /**
   * Create encryption context string for additional authenticated data
   */
  private createContextString(context: EncryptionContext): string {
    return `${context.projectId}:${context.environmentId}:${context.variableId}`;
  }

  /**
   * Cache DEK for performance (encrypted DEK is cached, not plaintext)
   */
  private async cacheDEK(
    variableId: string,
    encryptedDek: string,
    iv: string,
    authTag: string
  ): Promise<void> {
    try {
      const cacheKey = `dek:${variableId}`;
      const cacheValue = JSON.stringify({ encryptedDek, iv, authTag });
      await redis.setEx(cacheKey, this.CACHE_TTL, cacheValue);
    } catch (error) {
      // Cache failure shouldn't break encryption
      console.error("Failed to cache DEK:", error);
    }
  }

  /**
   * Retrieve cached DEK
   */
  private async getCachedDEK(
    variableId: string
  ): Promise<{ encryptedDek: string; iv: string; authTag: string } | null> {
    try {
      const cacheKey = `dek:${variableId}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error("Failed to retrieve cached DEK:", error);
    }

    return null;
  }

  /**
   * Encrypt a value using envelope encryption
   *
   * @param plaintext - The value to encrypt
   * @param context - Encryption context for additional security
   * @returns Encryption result with encrypted value and encrypted DEK
   */
  async encrypt(
    plaintext: string,
    context: EncryptionContext
  ): Promise<EncryptionResult> {
    // Generate a new DEK for this value
    const dek = this.generateDEK();

    // Encrypt the DEK with the KEK
    const {
      encryptedDek,
      iv: dekIv,
      authTag: dekAuthTag,
    } = this.encryptDEK(dek);

    // Create IV for data encryption
    const dataIv = crypto.randomBytes(this.IV_LENGTH);

    // Create cipher for data encryption
    const cipher = crypto.createCipheriv(this.ALGORITHM, dek, dataIv);

    // Add encryption context as additional authenticated data (AAD)
    const contextString = this.createContextString(context);
    cipher.setAAD(Buffer.from(contextString, "utf8"));

    // Encrypt the plaintext
    const encryptedValue = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const dataAuthTag = cipher.getAuthTag();

    // Cache the encrypted DEK for performance
    await this.cacheDEK(context.variableId, encryptedDek, dekIv, dekAuthTag);

    return {
      encryptedValue: encryptedValue.toString("base64"),
      encryptedDek: JSON.stringify({
        encryptedDek,
        iv: dekIv,
        authTag: dekAuthTag,
      }),
      iv: dataIv.toString("base64"),
      authTag: dataAuthTag.toString("base64"),
    };
  }

  /**
   * Decrypt a value using envelope encryption
   *
   * @param encryptedValue - The encrypted value
   * @param encryptedDekData - The encrypted DEK data (JSON string)
   * @param iv - Initialization vector for data decryption
   * @param authTag - Authentication tag for data decryption
   * @param context - Encryption context (must match encryption context)
   * @returns Decrypted plaintext
   */
  async decrypt(
    encryptedValue: string,
    encryptedDekData: string,
    iv: string,
    authTag: string,
    context: EncryptionContext
  ): Promise<string> {
    // Parse encrypted DEK data
    const {
      encryptedDek,
      iv: dekIv,
      authTag: dekAuthTag,
    } = JSON.parse(encryptedDekData);

    // Try to get DEK from cache first
    let dekData = await this.getCachedDEK(context.variableId);

    if (!dekData || dekData.encryptedDek !== encryptedDek) {
      // Cache miss or different DEK, use provided data
      dekData = { encryptedDek, iv: dekIv, authTag: dekAuthTag };

      // Update cache
      await this.cacheDEK(context.variableId, encryptedDek, dekIv, dekAuthTag);
    }

    // Decrypt the DEK with the KEK
    const dek = this.decryptDEK(
      dekData.encryptedDek,
      dekData.iv,
      dekData.authTag
    );

    // Create decipher for data decryption
    const decipher = crypto.createDecipheriv(
      this.ALGORITHM,
      dek,
      Buffer.from(iv, "base64")
    );

    // Set authentication tag
    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    // Add encryption context as additional authenticated data (AAD)
    const contextString = this.createContextString(context);
    decipher.setAAD(Buffer.from(contextString, "utf8"));

    // Decrypt the value
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  }

  /**
   * Re-encrypt data with a new DEK (for key rotation)
   *
   * @param encryptedValue - Current encrypted value
   * @param encryptedDekData - Current encrypted DEK data
   * @param iv - Current IV
   * @param authTag - Current auth tag
   * @param context - Encryption context
   * @returns New encryption result with new DEK
   */
  async rotateKey(
    encryptedValue: string,
    encryptedDekData: string,
    iv: string,
    authTag: string,
    context: EncryptionContext
  ): Promise<EncryptionResult> {
    // First decrypt with old key
    const plaintext = await this.decrypt(
      encryptedValue,
      encryptedDekData,
      iv,
      authTag,
      context
    );

    // Then encrypt with new key
    return await this.encrypt(plaintext, context);
  }

  /**
   * Generate a new master encryption key (KEK)
   * This should be called during initial setup
   *
   * @returns Hex-encoded 256-bit key
   */
  static generateMasterKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Invalidate cached DEK for a variable
   */
  async invalidateDEKCache(variableId: string): Promise<void> {
    try {
      const cacheKey = `dek:${variableId}`;
      await redis.del(cacheKey);
    } catch (error) {
      console.error("Failed to invalidate DEK cache:", error);
    }
  }
}

export const encryptionService = new EncryptionService();
