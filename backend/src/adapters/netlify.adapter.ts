import { BasePlatformAdapter } from "./base.adapter";
import {
  PlatformCredentials,
  PlatformType,
  SyncResult,
  SyncVariable,
} from "../types/sync.types";

/**
 * Netlify platform adapter
 * Syncs environment variables to Netlify sites
 *
 * Required credentials:
 * - token: Netlify personal access token
 */
export class NetlifyAdapter extends BasePlatformAdapter {
  private readonly NETLIFY_API_BASE = "https://api.netlify.com/api/v1";
  private token: string | null = null;

  getPlatformType(): PlatformType {
    return "netlify";
  }

  protected async performAuthentication(
    credentials: PlatformCredentials
  ): Promise<boolean> {
    this.validateCredentials(credentials, ["token"]);

    this.token = credentials.token;

    // Test authentication by fetching user info
    try {
      const response = await fetch(`${this.NETLIFY_API_BASE}/user`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      throw new Error(
        `Netlify authentication failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  protected async performPushVariables(
    variables: SyncVariable[],
    targetResource: string
  ): Promise<SyncResult> {
    if (!this.token) {
      throw new Error("Not authenticated");
    }

    const siteId = targetResource;
    const errors: Array<{
      variableKey: string;
      message: string;
      code?: string;
    }> = [];

    try {
      // Get existing environment variables
      const existingVars = await this.getExistingVariables(siteId);

      // Netlify uses a different approach - we need to update all env vars at once
      // Build the complete env var object
      const envVars: Record<string, string> = { ...existingVars };

      // Update with new values
      for (const variable of variables) {
        envVars[variable.key] = variable.value;
      }

      // Update all environment variables
      const response = await fetch(`${this.NETLIFY_API_BASE}/sites/${siteId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          build_settings: {
            env: envVars,
          },
        }),
      });

      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to update environment variables: ${
            errorData.message || response.statusText
          }`
        );
      }

      return this.createSuccessResult(variables.length);
    } catch (error) {
      return this.createFailureResult([
        {
          variableKey: "all",
          message: error instanceof Error ? error.message : "Unknown error",
          code: "NETLIFY_API_ERROR",
        },
      ]);
    }
  }

  /**
   * Get existing environment variables from Netlify site
   */
  private async getExistingVariables(
    siteId: string
  ): Promise<Record<string, string>> {
    if (!this.token) {
      throw new Error("Not authenticated");
    }

    try {
      const response = await fetch(`${this.NETLIFY_API_BASE}/sites/${siteId}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch site: ${response.statusText}`);
      }

      const data: any = await response.json();
      return data.build_settings?.env || {};
    } catch (error) {
      // If we can't get existing vars, return empty object
      console.error("Failed to get existing variables:", error);
      return {};
    }
  }

  protected async performConnectionTest(): Promise<boolean> {
    if (!this.token) {
      return false;
    }

    try {
      const response = await fetch(`${this.NETLIFY_API_BASE}/user`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
