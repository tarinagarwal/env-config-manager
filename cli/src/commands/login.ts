import { Command } from "commander";
import chalk from "chalk";
import { exec } from "child_process";
import { setApiKey, setTokens, getConfig } from "../utils/config";
import { getApiClient, handleApiError } from "../utils/api";
import { AuthResponse } from "../types";

export const loginCommand = new Command("login")
  .description("Authenticate with the Environment Configuration Manager")
  .option("--api-key <key>", "Login with API key")
  .option("--oauth", "Login with OAuth (opens browser)")
  .action(async (options) => {
    try {
      if (options.apiKey) {
        await loginWithApiKey(options.apiKey);
      } else if (options.oauth) {
        await loginWithOAuth();
      } else {
        console.log(chalk.yellow("Please specify authentication method:"));
        console.log(chalk.white("  --api-key <key>  Login with API key"));
        console.log(chalk.white("  --oauth          Login with OAuth"));
        process.exit(1);
      }
    } catch (error) {
      handleApiError(error);
    }
  });

async function loginWithApiKey(apiKey: string): Promise<void> {
  console.log(chalk.blue("Validating API key..."));

  // Temporarily set the API key to test it
  setApiKey(apiKey);

  try {
    const client = getApiClient();
    // Test the API key by making a request
    await client.get("/auth/me");

    console.log(chalk.green("✓ Successfully authenticated with API key"));
  } catch (error) {
    // Clear the invalid API key
    setApiKey("");
    throw error;
  }
}

async function loginWithOAuth(): Promise<void> {
  const config = getConfig();
  const client = getApiClient();

  console.log(chalk.blue("Initiating OAuth login..."));

  try {
    // Request OAuth URL from backend
    const response = await client.post("/auth/cli/oauth/init", {
      provider: "google", // Default to Google, could be made configurable
    });

    const { authUrl, deviceCode } = response.data;

    console.log(chalk.yellow("Opening browser for authentication..."));
    console.log(chalk.gray(`If browser doesn't open, visit: ${authUrl}`));

    // Open browser (cross-platform)
    const command =
      process.platform === "win32"
        ? `start ${authUrl}`
        : process.platform === "darwin"
        ? `open ${authUrl}`
        : `xdg-open ${authUrl}`;
    exec(command);

    // Poll for completion
    console.log(chalk.blue("Waiting for authentication..."));

    const tokens = await pollForTokens(deviceCode);

    setTokens(tokens.accessToken, tokens.refreshToken);

    console.log(chalk.green("✓ Successfully authenticated with OAuth"));
  } catch (error) {
    handleApiError(error);
  }
}

async function pollForTokens(deviceCode: string): Promise<AuthResponse> {
  const client = getApiClient();
  const maxAttempts = 60; // 5 minutes with 5 second intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await client.post<AuthResponse>("/auth/cli/oauth/poll", {
        deviceCode,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 428) {
        // Pending - continue polling
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;
        continue;
      }

      throw error;
    }
  }

  throw new Error("Authentication timeout. Please try again.");
}
