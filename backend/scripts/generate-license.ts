#!/usr/bin/env tsx

/**
 * License Key Generation Utility
 *
 * This script generates license keys for enterprise customers.
 *
 * Usage:
 *   npm run generate-license -- --customer "Acme Corp" --email "admin@acme.com" --expires "2025-12-31"
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

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

// Parse command line arguments
function parseArgs(): any {
  const args = process.argv.slice(2);
  const parsed: any = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace("--", "");
    const value = args[i + 1];
    parsed[key] = value;
  }

  return parsed;
}

// Generate RSA key pair if not exists
function ensureKeyPair(): { privateKey: string; publicKey: string } {
  const keysDir = path.join(__dirname, "../keys");
  const privateKeyPath = path.join(keysDir, "license-private.pem");
  const publicKeyPath = path.join(keysDir, "license-public.pem");

  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    return {
      privateKey: fs.readFileSync(privateKeyPath, "utf-8"),
      publicKey: fs.readFileSync(publicKeyPath, "utf-8"),
    };
  }

  console.log("Generating new RSA key pair...");
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  fs.writeFileSync(privateKeyPath, privateKey);
  fs.writeFileSync(publicKeyPath, publicKey);

  console.log("Key pair generated and saved to:", keysDir);

  return { privateKey, publicKey };
}

// Generate license key
async function generateLicense(
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

// Main function
async function main() {
  const args = parseArgs();

  if (!args.customer) {
    console.error("Error: --customer is required");
    console.log("\nUsage:");
    console.log(
      '  npm run generate-license -- --customer "Acme Corp" --email "admin@acme.com" [options]'
    );
    console.log("\nOptions:");
    console.log("  --customer <name>       Customer name (required)");
    console.log("  --email <email>         Customer email (required)");
    console.log(
      "  --expires <date>        Expiration date (YYYY-MM-DD) (optional)"
    );
    console.log(
      "  --max-users <number>    Maximum users (optional, default: unlimited)"
    );
    console.log(
      "  --max-projects <number> Maximum projects (optional, default: unlimited)"
    );
    process.exit(1);
  }

  // Ensure key pair exists
  const { privateKey, publicKey } = ensureKeyPair();

  // Generate customer ID
  const customerId = crypto.randomBytes(16).toString("hex");

  // Build license data
  const licenseData: LicenseData = {
    customerId,
    customerName: args.customer,
    plan: "enterprise",
    features: [
      "ldap",
      "saml",
      "audit-retention-extended",
      "siem-integration",
      "custom-encryption-keys",
      "on-premise-deployment",
      "priority-support",
    ],
    issuedAt: new Date().toISOString(),
    version: "1.0.0",
  };

  if (args.expires) {
    licenseData.expiresAt = new Date(args.expires).toISOString();
  }

  if (args["max-users"]) {
    licenseData.maxUsers = parseInt(args["max-users"], 10);
  }

  if (args["max-projects"]) {
    licenseData.maxProjects = parseInt(args["max-projects"], 10);
  }

  // Generate license key
  const licenseKey = await generateLicense(licenseData, privateKey);

  // Output results
  console.log("\n=== License Generated Successfully ===\n");
  console.log("Customer:", licenseData.customerName);
  console.log("Customer ID:", licenseData.customerId);
  console.log("Plan:", licenseData.plan);
  console.log("Features:", licenseData.features.join(", "));
  console.log("Issued At:", licenseData.issuedAt);
  console.log("Expires At:", licenseData.expiresAt || "Never");
  console.log("Max Users:", licenseData.maxUsers || "Unlimited");
  console.log("Max Projects:", licenseData.maxProjects || "Unlimited");
  console.log("\n=== License Key ===\n");
  console.log(licenseKey);
  console.log("\n=== Public Key (for verification) ===\n");
  console.log(publicKey);
  console.log("\nAdd this to your .env file:");
  console.log(`LICENSE_KEY="${licenseKey}"`);
  console.log(`LICENSE_PUBLIC_KEY="${publicKey.replace(/\n/g, "\\n")}"`);
}

main().catch(console.error);
