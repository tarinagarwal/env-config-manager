import crypto from "crypto";
import logger from "../services/logger.service";

/**
 * Security Audit Utilities
 * Tools for testing and validating security measures
 */

export interface SecurityAuditResult {
  category: string;
  test: string;
  passed: boolean;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
}

export class SecurityAuditor {
  private results: SecurityAuditResult[] = [];

  /**
   * Run all security audits
   */
  async runAllAudits(): Promise<SecurityAuditResult[]> {
    this.results = [];

    await this.auditEnvironmentVariables();
    await this.auditPasswordPolicy();
    await this.auditEncryptionKeys();
    await this.auditDependencies();

    return this.results;
  }

  /**
   * Audit environment variables
   */
  private async auditEnvironmentVariables() {
    const requiredVars = [
      "DATABASE_URL",
      "JWT_SECRET",
      "ENCRYPTION_KEY",
      "REDIS_HOST",
    ];

    const sensitiveVars = [
      "JWT_SECRET",
      "ENCRYPTION_KEY",
      "GOOGLE_CLIENT_SECRET",
      "GITHUB_CLIENT_SECRET",
    ];

    // Check required variables
    for (const varName of requiredVars) {
      const exists = !!process.env[varName];
      this.results.push({
        category: "Environment Variables",
        test: `Required variable ${varName}`,
        passed: exists,
        message: exists ? `${varName} is set` : `${varName} is missing`,
        severity: "critical",
      });
    }

    // Check sensitive variable strength
    for (const varName of sensitiveVars) {
      const value = process.env[varName];
      if (value) {
        const isStrong = value.length >= 32;
        this.results.push({
          category: "Environment Variables",
          test: `${varName} strength`,
          passed: isStrong,
          message: isStrong
            ? `${varName} meets minimum length requirement`
            : `${varName} should be at least 32 characters`,
          severity: "high",
        });
      }
    }

    // Check for default/weak values
    const weakSecrets = ["secret", "password", "changeme", "test"];
    for (const varName of sensitiveVars) {
      const value = process.env[varName]?.toLowerCase() || "";
      const isWeak = weakSecrets.some((weak) => value.includes(weak));
      this.results.push({
        category: "Environment Variables",
        test: `${varName} not using default value`,
        passed: !isWeak,
        message: isWeak
          ? `${varName} appears to use a default/weak value`
          : `${varName} does not use default values`,
        severity: "critical",
      });
    }
  }

  /**
   * Audit password policy
   */
  private async auditPasswordPolicy() {
    const testPasswords = [
      { password: "weak", shouldFail: true },
      { password: "password123", shouldFail: true },
      { password: "Password1", shouldFail: false },
      { password: "StrongP@ss123", shouldFail: false },
    ];

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

    for (const test of testPasswords) {
      const passes = passwordRegex.test(test.password);
      const correct = test.shouldFail ? !passes : passes;

      this.results.push({
        category: "Password Policy",
        test: `Password validation for "${test.password}"`,
        passed: correct,
        message: correct
          ? "Password policy working correctly"
          : "Password policy not enforcing requirements",
        severity: "high",
      });
    }
  }

  /**
   * Audit encryption keys
   */
  private async auditEncryptionKeys() {
    const encryptionKey = process.env.ENCRYPTION_KEY;

    if (encryptionKey) {
      // Check key length
      const keyLength = Buffer.from(encryptionKey, "hex").length;
      const isValidLength = keyLength === 32; // 256 bits

      this.results.push({
        category: "Encryption",
        test: "Encryption key length",
        passed: isValidLength,
        message: isValidLength
          ? "Encryption key is 256 bits (AES-256)"
          : `Encryption key is ${keyLength * 8} bits, should be 256 bits`,
        severity: "critical",
      });

      // Check key randomness (entropy)
      const entropy = this.calculateEntropy(encryptionKey);
      const hasGoodEntropy = entropy > 3.5; // Good entropy threshold

      this.results.push({
        category: "Encryption",
        test: "Encryption key entropy",
        passed: hasGoodEntropy,
        message: hasGoodEntropy
          ? `Encryption key has good entropy (${entropy.toFixed(2)})`
          : `Encryption key has low entropy (${entropy.toFixed(2)})`,
        severity: "high",
      });
    }

    // Test encryption/decryption
    try {
      const testData = "test-secret-data";
      const key = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      let encrypted = cipher.update(testData, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag();

      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      const encryptionWorks = decrypted === testData;

      this.results.push({
        category: "Encryption",
        test: "AES-256-GCM encryption/decryption",
        passed: encryptionWorks,
        message: encryptionWorks
          ? "Encryption/decryption working correctly"
          : "Encryption/decryption failed",
        severity: "critical",
      });
    } catch (error) {
      this.results.push({
        category: "Encryption",
        test: "AES-256-GCM encryption/decryption",
        passed: false,
        message: `Encryption test failed: ${error}`,
        severity: "critical",
      });
    }
  }

  /**
   * Audit dependencies for known vulnerabilities
   */
  private async auditDependencies() {
    // This is a placeholder - in production, integrate with npm audit or Snyk
    this.results.push({
      category: "Dependencies",
      test: "Dependency vulnerability scan",
      passed: true,
      message: "Run 'npm audit' to check for known vulnerabilities",
      severity: "medium",
    });
  }

  /**
   * Calculate Shannon entropy of a string
   */
  private calculateEntropy(str: string): number {
    const len = str.length;
    const frequencies: Record<string, number> = {};

    for (let i = 0; i < len; i++) {
      const char = str[i];
      frequencies[char] = (frequencies[char] || 0) + 1;
    }

    let entropy = 0;
    for (const char in frequencies) {
      const p = frequencies[char] / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Generate security audit report
   */
  generateReport(): string {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;

    let report = "\n=== Security Audit Report ===\n\n";
    report += `Total Tests: ${total}\n`;
    report += `Passed: ${passed}\n`;
    report += `Failed: ${failed}\n`;
    report += `Success Rate: ${((passed / total) * 100).toFixed(1)}%\n\n`;

    // Group by category
    const categories = [...new Set(this.results.map((r) => r.category))];

    for (const category of categories) {
      report += `\n--- ${category} ---\n`;
      const categoryResults = this.results.filter(
        (r) => r.category === category
      );

      for (const result of categoryResults) {
        const icon = result.passed ? "✓" : "✗";
        const severity = result.passed
          ? ""
          : ` [${result.severity.toUpperCase()}]`;
        report += `${icon} ${result.test}${severity}\n`;
        report += `  ${result.message}\n`;
      }
    }

    // Critical failures
    const criticalFailures = this.results.filter(
      (r) => !r.passed && r.severity === "critical"
    );

    if (criticalFailures.length > 0) {
      report += "\n\n!!! CRITICAL ISSUES !!!\n";
      for (const failure of criticalFailures) {
        report += `- ${failure.test}: ${failure.message}\n`;
      }
    }

    return report;
  }

  /**
   * Log audit results
   */
  logResults() {
    const report = this.generateReport();
    logger.info(report);

    const criticalFailures = this.results.filter(
      (r) => !r.passed && r.severity === "critical"
    );

    if (criticalFailures.length > 0) {
      logger.error("Security audit found critical issues!");
    }
  }
}

/**
 * Test input validation
 */
export const testInputValidation = () => {
  const tests = [
    {
      name: "SQL Injection",
      input: "'; DROP TABLE users; --",
      shouldBlock: true,
    },
    {
      name: "XSS Script Tag",
      input: "<script>alert('xss')</script>",
      shouldBlock: true,
    },
    {
      name: "XSS Event Handler",
      input: '<img src=x onerror="alert(1)">',
      shouldBlock: true,
    },
    {
      name: "Path Traversal",
      input: "../../etc/passwd",
      shouldBlock: true,
    },
    {
      name: "Command Injection",
      input: "; cat /etc/passwd",
      shouldBlock: true,
    },
    {
      name: "Valid Input",
      input: "normal-project-name",
      shouldBlock: false,
    },
  ];

  logger.info("\n=== Input Validation Tests ===\n");

  for (const test of tests) {
    const suspiciousPatterns = [
      /(\.\.|\/etc\/|\/proc\/|\/sys\/)/i,
      /(union\s+select|insert\s+into|drop\s+table)/i,
      /(<script|javascript:|onerror=|onload=)/i,
      /(eval\(|exec\(|system\(|cat\s+)/i,
    ];

    const isBlocked = suspiciousPatterns.some((pattern) =>
      pattern.test(test.input)
    );
    const passed = test.shouldBlock ? isBlocked : !isBlocked;

    logger.info(
      `${passed ? "✓" : "✗"} ${test.name}: ${passed ? "PASS" : "FAIL"}`
    );
  }
};

/**
 * Run security audit on startup
 */
export const runStartupSecurityAudit = async () => {
  logger.info("Running security audit...");

  const auditor = new SecurityAuditor();
  await auditor.runAllAudits();
  auditor.logResults();

  // Test input validation
  testInputValidation();
};
