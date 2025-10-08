/**
 * Platform types supported for synchronization
 */
export type PlatformType =
  | "vercel"
  | "aws-ssm"
  | "aws-secrets-manager"
  | "netlify"
  | "heroku";

/**
 * Variable to be synced to external platform
 */
export interface SyncVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

/**
 * Platform-specific credentials
 */
export interface PlatformCredentials {
  [key: string]: string;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  syncedCount: number;
  errors: SyncError[];
}

/**
 * Sync error details
 */
export interface SyncError {
  variableKey: string;
  message: string;
  code?: string;
}

/**
 * Platform connection configuration
 */
export interface PlatformConnectionConfig {
  id: string;
  projectId: string;
  platform: PlatformType;
  credentials: PlatformCredentials;
  targetResource: string;
  status: "connected" | "error";
}

/**
 * Platform adapter interface
 * All platform adapters must implement this interface
 */
export interface PlatformAdapter {
  /**
   * Authenticate with the platform using provided credentials
   * @param credentials Platform-specific credentials
   * @returns Promise that resolves to true if authentication succeeds
   * @throws Error if authentication fails
   */
  authenticate(credentials: PlatformCredentials): Promise<boolean>;

  /**
   * Push variables to the platform
   * @param variables Array of variables to sync
   * @param targetResource Platform-specific target (e.g., project ID, site ID)
   * @returns Promise that resolves to sync result
   */
  pushVariables(
    variables: SyncVariable[],
    targetResource: string
  ): Promise<SyncResult>;

  /**
   * Test the connection to the platform
   * @returns Promise that resolves to true if connection is successful
   */
  testConnection(): Promise<boolean>;

  /**
   * Get the platform type
   * @returns The platform type identifier
   */
  getPlatformType(): PlatformType;
}
