import crypto from "crypto";

interface LicenseData {
  customerId: string;
  customerName: string;
  plan: "enterprise";
  features: string[];
  maxUsers?: number;
  maxProjects?: number;
  issuedAt: string;
  expiresAt?: string;
  version: string;
}

interface LicenseValidationResult {
  valid: boolean;
  data?: LicenseData;
  error?: string;
}

export class LicenseService {
  private licenseKey: string;
  private publicKey: string;
  private cachedLicense: LicenseData | null = null;

  constructor() {
    this.licenseKey = process.env.LICENSE_KEY || "";
    // In production, this would be your actual public key for verification
    this.publicKey = process.env.LICENSE_PUBLIC_KEY || "";
  }

  /**
   * Validate license key on startup
   */
  async validateOnStartup(): Promise<boolean> {
    if (!this.licenseKey) {
      console.warn("No license key provided. Running in community mode.");
      return false;
    }

    const result = await this.validate(this.licenseKey);

    if (!result.valid) {
      console.error("License validation failed:", result.error);
      throw new Error(`Invalid license: ${result.error}`);
    }

    this.cachedLicense = result.data!;
    console.log("License validated successfully:", {
      customer: result.data!.customerName,
      plan: result.data!.plan,
      expiresAt: result.data!.expiresAt || "Never",
    });

    return true;
  }

  /**
   * Validate license key
   */
  async validate(licenseKey: string): Promise<LicenseValidationResult> {
    try {
      // License format: BASE64(JSON_DATA).BASE64(SIGNATURE)
      const parts = licenseKey.split(".");
      if (parts.length !== 2) {
        return {
          valid: false,
          error: "Invalid license format",
        };
      }

      const [dataB64, signatureB64] = parts;

      // Decode data
      const dataJson = Buffer.from(dataB64, "base64").toString("utf-8");
      const data: LicenseData = JSON.parse(dataJson);

      // Verify signature (if public key is provided)
      if (this.publicKey) {
        const signature = Buffer.from(signatureB64, "base64");
        const verifier = crypto.createVerify("RSA-SHA256");
        verifier.update(dataB64);

        const isValid = verifier.verify(this.publicKey, signature);
        if (!isValid) {
          return {
            valid: false,
            error: "Invalid license signature",
          };
        }
      }

      // Check expiration
      if (data.expiresAt) {
        const expiresAt = new Date(data.expiresAt);
        if (expiresAt < new Date()) {
          return {
            valid: false,
            error: "License has expired",
          };
        }
      }

      // Check version compatibility
      if (data.version && !this.isVersionCompatible(data.version)) {
        return {
          valid: false,
          error:
            "License version is not compatible with this application version",
        };
      }

      return {
        valid: true,
        data,
      };
    } catch (error: any) {
      return {
        valid: false,
        error: `License validation error: ${error.message}`,
      };
    }
  }

  /**
   * Check if license version is compatible
   */
  private isVersionCompatible(licenseVersion: string): boolean {
    // Simple version check - in production, implement proper semver comparison
    const appVersion = process.env.APP_VERSION || "1.0.0";
    const [licenseMajor] = licenseVersion.split(".");
    const [appMajor] = appVersion.split(".");

    return licenseMajor === appMajor;
  }

  /**
   * Get cached license data
   */
  getLicenseData(): LicenseData | null {
    return this.cachedLicense;
  }

  /**
   * Check if a feature is enabled in the license
   */
  hasFeature(feature: string): boolean {
    if (!this.cachedLicense) {
      return false;
    }

    return this.cachedLicense.features.includes(feature);
  }

  /**
   * Check if license allows certain limits
   */
  checkLimit(type: "users" | "projects", current: number): boolean {
    if (!this.cachedLicense) {
      return false;
    }

    if (type === "users" && this.cachedLicense.maxUsers) {
      return current < this.cachedLicense.maxUsers;
    }

    if (type === "projects" && this.cachedLicense.maxProjects) {
      return current < this.cachedLicense.maxProjects;
    }

    // No limit specified means unlimited
    return true;
  }

  /**
   * Get license info for display
   */
  getLicenseInfo(): any {
    if (!this.cachedLicense) {
      return {
        plan: "community",
        features: ["basic"],
      };
    }

    return {
      customer: this.cachedLicense.customerName,
      plan: this.cachedLicense.plan,
      features: this.cachedLicense.features,
      maxUsers: this.cachedLicense.maxUsers || "Unlimited",
      maxProjects: this.cachedLicense.maxProjects || "Unlimited",
      expiresAt: this.cachedLicense.expiresAt || "Never",
    };
  }

  /**
   * Generate a license key (for license server/admin tool)
   * This should only be used by the license generation service
   */
  static async generateLicense(
    data: LicenseData,
    privateKey: string
  ): Promise<string> {
    // Encode data
    const dataJson = JSON.stringify(data);
    const dataB64 = Buffer.from(dataJson).toString("base64");

    // Sign data
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(dataB64);
    const signature = signer.sign(privateKey);
    const signatureB64 = signature.toString("base64");

    // Combine
    return `${dataB64}.${signatureB64}`;
  }
}

export const licenseService = new LicenseService();
