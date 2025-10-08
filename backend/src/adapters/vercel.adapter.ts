import { BasePlatformAdapter } from "./base.adapter";
import {
  PlatformCredentials,
  PlatformType,
  SyncResult,
  SyncVariable,
} from "../types/sync.types";

/**
 * Vercel platform adapter
 * Syncs environment variables to Vercel projects
 *
 * Required credentials:
 * - token: Vercel API token
 * - teamId: (optional) Vercel team ID
 */
export class VercelAdapter extends BasePlatformAdapter {
  private readonly VERCEL_API_BASE = "https://api.vercel.com";
  private token: string | null = null;
  private teamId: string | null = null;

  getPlatformType(): PlatformType {
    return "vercel";
  }

  protected async performAuthentication(
    credentials: PlatformCredentials
  ): Promise<boolean> {
    this.validateCredentials(credentials, ["token"]);

    this.token = credentials.token;
    this.teamId = credentials.teamId || null;

    // Test authentication by fetching user info
    try {
      const response = await fetch(`${this.VERCEL_API_BASE}/v2/user`, {
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
        `Vercel authentication failed: ${
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

    const projectId = targetResource;
    const errors: Array<{
      variableKey: string;
      message: string;
      code?: string;
    }> = [];
    let syncedCount = 0;

    try {
      // Vercel requires environment variables to be created/updated individually
      // or in batch using the upsert endpoint
      for (const variable of variables) {
        try {
          await this.upsertVariable(projectId, variable);
          syncedCount++;
        } catch (error) {
          errors.push({
            variableKey: variable.key,
            message: error instanceof Error ? error.message : "Unknown error",
            code: "VERCEL_SYNC_ERROR",
          });
        }
      }

      return this.createPartialResult(syncedCount, errors);
    } catch (error) {
      return this.createFailureResult([
        {
          variableKey: "all",
          message: error instanceof Error ? error.message : "Unknown error",
          code: "VERCEL_API_ERROR",
        },
      ]);
    }
  }

  /**
   * Upsert a single environment variable in Vercel
   */
  private async upsertVariable(
    projectId: string,
    variable: SyncVariable
  ): Promise<void> {
    if (!this.token) {
      throw new Error("Not authenticated");
    }

    // Build query params
    const params = new URLSearchParams();
    if (this.teamId) {
      params.append("teamId", this.teamId);
    }

    const url = `${
      this.VERCEL_API_BASE
    }/v10/projects/${projectId}/env?${params.toString()}`;

    // Vercel API expects environment variables with target environments
    // For simplicity, we'll target all environments (production, preview, development)
    const payload = {
      key: variable.key,
      value: variable.value,
      type: variable.isSecret ? "encrypted" : "plain",
      target: ["production", "preview", "development"],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData: any = await response.json().catch(() => ({}));

      // If variable already exists, update it instead
      if (
        response.status === 409 ||
        errorData.error?.code === "ENV_ALREADY_EXISTS"
      ) {
        await this.updateExistingVariable(projectId, variable);
        return;
      }

      throw new Error(
        `Failed to create variable ${variable.key}: ${
          errorData.error?.message || response.statusText
        }`
      );
    }
  }

  /**
   * Update an existing environment variable in Vercel
   */
  private async updateExistingVariable(
    projectId: string,
    variable: SyncVariable
  ): Promise<void> {
    if (!this.token) {
      throw new Error("Not authenticated");
    }

    // First, get the existing variable ID
    const params = new URLSearchParams();
    if (this.teamId) {
      params.append("teamId", this.teamId);
    }

    const listUrl = `${
      this.VERCEL_API_BASE
    }/v9/projects/${projectId}/env?${params.toString()}`;

    const listResponse = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!listResponse.ok) {
      throw new Error(`Failed to list variables: ${listResponse.statusText}`);
    }

    const data: any = await listResponse.json();
    const existingVar = data.envs?.find((env: any) => env.key === variable.key);

    if (!existingVar) {
      throw new Error(`Variable ${variable.key} not found`);
    }

    // Update the variable
    const updateUrl = `${this.VERCEL_API_BASE}/v9/projects/${projectId}/env/${
      existingVar.id
    }?${params.toString()}`;

    const updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        value: variable.value,
        type: variable.isSecret ? "encrypted" : "plain",
      }),
    });

    if (!updateResponse.ok) {
      const errorData: any = await updateResponse.json().catch(() => ({}));
      throw new Error(
        `Failed to update variable ${variable.key}: ${
          errorData.error?.message || updateResponse.statusText
        }`
      );
    }
  }

  protected async performConnectionTest(): Promise<boolean> {
    if (!this.token) {
      return false;
    }

    try {
      const response = await fetch(`${this.VERCEL_API_BASE}/v2/user`, {
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
