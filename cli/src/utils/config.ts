import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Config } from "../types";

const CONFIG_DIR = path.join(os.homedir(), ".env-config-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

interface StoredConfig {
  apiUrl?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readStoredConfig(): StoredConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return {};
  }
}

function writeStoredConfig(config: StoredConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getConfig(): Config {
  // Support environment variables for CI/CD non-interactive mode
  const envApiKey = process.env.ENV_CONFIG_API_KEY;
  const envAccessToken = process.env.ENV_CONFIG_ACCESS_TOKEN;
  const envApiUrl = process.env.ENV_CONFIG_API_URL;

  const stored = readStoredConfig();

  return {
    apiUrl: envApiUrl || stored.apiUrl || "http://localhost:3000/api/v1",
    apiKey: envApiKey || stored.apiKey,
    accessToken: envAccessToken || stored.accessToken,
    refreshToken: stored.refreshToken,
  };
}

export function setApiKey(apiKey: string): void {
  const stored = readStoredConfig();
  stored.apiKey = apiKey;
  // Clear tokens when setting API key
  delete stored.accessToken;
  delete stored.refreshToken;
  writeStoredConfig(stored);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  const stored = readStoredConfig();
  stored.accessToken = accessToken;
  stored.refreshToken = refreshToken;
  // Clear API key when setting tokens
  delete stored.apiKey;
  writeStoredConfig(stored);
}

export function clearAuth(): void {
  const stored = readStoredConfig();
  delete stored.apiKey;
  delete stored.accessToken;
  delete stored.refreshToken;
  writeStoredConfig(stored);
}

export function isAuthenticated(): boolean {
  const cfg = getConfig();
  return !!(cfg.apiKey || cfg.accessToken);
}

export function getAuthHeader(): string | null {
  const cfg = getConfig();

  if (cfg.apiKey) {
    return `Bearer ${cfg.apiKey}`;
  }

  if (cfg.accessToken) {
    return `Bearer ${cfg.accessToken}`;
  }

  return null;
}
