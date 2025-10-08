import {
  PlatformAdapter,
  PlatformCredentials,
  PlatformType,
  SyncResult,
  SyncVariable,
} from "../types/sync.types";

/**
 * Base adapter class with common functionality
 * Platform-specific adapters should extend this class
 */
export abstract class BasePlatformAdapter implements PlatformAdapter {
  protected credentials: PlatformCredentials | null = null;
  protected isAuthenticated: boolean = false;

  /**
   * Authenticate with the platform
   */
  async authenticate(credentials: PlatformCredentials): Promise<boolean> {
    this.credentials = credentials;
    const result = await this.performAuthentication(credentials);
    this.isAuthenticated = result;
    return result;
  }

  /**
   * Platform-specific authentication logic
   * Must be implemented by subclasses
   */
  protected abstract performAuthentication(
    credentials: PlatformCredentials
  ): Promise<boolean>;

  /**
   * Push variables to the platform
   */
  async pushVariables(
    variables: SyncVariable[],
    targetResource: string
  ): Promise<SyncResult> {
    if (!this.isAuthenticated || !this.credentials) {
      throw new Error("Not authenticated. Call authenticate() first.");
    }

    return await this.performPushVariables(variables, targetResource);
  }

  /**
   * Platform-specific variable push logic
   * Must be implemented by subclasses
   */
  protected abstract performPushVariables(
    variables: SyncVariable[],
    targetResource: string
  ): Promise<SyncResult>;

  /**
   * Test the connection to the platform
   */
  async testConnection(): Promise<boolean> {
    if (!this.isAuthenticated || !this.credentials) {
      return false;
    }

    return await this.performConnectionTest();
  }

  /**
   * Platform-specific connection test logic
   * Must be implemented by subclasses
   */
  protected abstract performConnectionTest(): Promise<boolean>;

  /**
   * Get the platform type
   */
  abstract getPlatformType(): PlatformType;

  /**
   * Validate required credentials
   */
  protected validateCredentials(
    credentials: PlatformCredentials,
    requiredFields: string[]
  ): void {
    const missing = requiredFields.filter((field) => !credentials[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required credentials: ${missing.join(", ")}`);
    }
  }

  /**
   * Create a successful sync result
   */
  protected createSuccessResult(syncedCount: number): SyncResult {
    return {
      success: true,
      syncedCount,
      errors: [],
    };
  }

  /**
   * Create a failed sync result
   */
  protected createFailureResult(
    errors: Array<{ variableKey: string; message: string; code?: string }>
  ): SyncResult {
    return {
      success: false,
      syncedCount: 0,
      errors,
    };
  }

  /**
   * Create a partial sync result (some succeeded, some failed)
   */
  protected createPartialResult(
    syncedCount: number,
    errors: Array<{ variableKey: string; message: string; code?: string }>
  ): SyncResult {
    return {
      success: errors.length === 0,
      syncedCount,
      errors,
    };
  }
}
