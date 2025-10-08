import { BasePlatformAdapter } from "./base.adapter";
import {
  PlatformCredentials,
  PlatformType,
  SyncResult,
  SyncVariable,
} from "../types/sync.types";
import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  SecretsManagerClient,
  CreateSecretCommand,
  UpdateSecretCommand,
  DescribeSecretCommand,
} from "@aws-sdk/client-secrets-manager";

/**
 * AWS platform adapter
 * Syncs environment variables to AWS Parameter Store and Secrets Manager
 *
 * Required credentials:
 * - accessKeyId: AWS access key ID
 * - secretAccessKey: AWS secret access key
 * - region: AWS region
 * - service: Target service ('ssm' or 'secrets-manager')
 */
export class AWSAdapter extends BasePlatformAdapter {
  private ssmClient: SSMClient | null = null;
  private secretsClient: SecretsManagerClient | null = null;
  private service: "ssm" | "secrets-manager" = "ssm";

  getPlatformType(): PlatformType {
    return this.service === "ssm" ? "aws-ssm" : "aws-secrets-manager";
  }

  protected async performAuthentication(
    credentials: PlatformCredentials
  ): Promise<boolean> {
    this.validateCredentials(credentials, [
      "accessKeyId",
      "secretAccessKey",
      "region",
      "service",
    ]);

    const { accessKeyId, secretAccessKey, region, service } = credentials;

    if (service !== "ssm" && service !== "secrets-manager") {
      throw new Error("Invalid service. Must be 'ssm' or 'secrets-manager'");
    }

    this.service = service as "ssm" | "secrets-manager";

    const config = {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    if (this.service === "ssm") {
      this.ssmClient = new SSMClient(config);
    } else {
      this.secretsClient = new SecretsManagerClient(config);
    }

    // Test authentication by making a simple API call
    try {
      if (this.service === "ssm" && this.ssmClient) {
        // Try to get a non-existent parameter to test credentials
        await this.ssmClient
          .send(new GetParameterCommand({ Name: "/test-auth-check" }))
          .catch((error) => {
            // ParameterNotFound is expected and means auth worked
            if (error.name === "ParameterNotFound") {
              return;
            }
            throw error;
          });
      } else if (this.service === "secrets-manager" && this.secretsClient) {
        // Try to describe a non-existent secret to test credentials
        await this.secretsClient
          .send(new DescribeSecretCommand({ SecretId: "test-auth-check" }))
          .catch((error) => {
            // ResourceNotFoundException is expected and means auth worked
            if (error.name === "ResourceNotFoundException") {
              return;
            }
            throw error;
          });
      }

      return true;
    } catch (error) {
      throw new Error(
        `AWS authentication failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  protected async performPushVariables(
    variables: SyncVariable[],
    targetResource: string
  ): Promise<SyncResult> {
    if (this.service === "ssm") {
      return await this.pushToSSM(variables, targetResource);
    } else {
      return await this.pushToSecretsManager(variables, targetResource);
    }
  }

  /**
   * Push variables to AWS Systems Manager Parameter Store
   */
  private async pushToSSM(
    variables: SyncVariable[],
    pathPrefix: string
  ): Promise<SyncResult> {
    if (!this.ssmClient) {
      throw new Error("SSM client not initialized");
    }

    const errors: Array<{
      variableKey: string;
      message: string;
      code?: string;
    }> = [];
    let syncedCount = 0;

    for (const variable of variables) {
      try {
        // Construct parameter name with path prefix
        const parameterName = pathPrefix.endsWith("/")
          ? `${pathPrefix}${variable.key}`
          : `${pathPrefix}/${variable.key}`;

        const command = new PutParameterCommand({
          Name: parameterName,
          Value: variable.value,
          Type: variable.isSecret ? "SecureString" : "String",
          Overwrite: true,
          Description: `Synced from Environment Configuration Manager`,
        });

        await this.ssmClient.send(command);
        syncedCount++;
      } catch (error) {
        errors.push({
          variableKey: variable.key,
          message: error instanceof Error ? error.message : "Unknown error",
          code: "AWS_SSM_ERROR",
        });
      }
    }

    return this.createPartialResult(syncedCount, errors);
  }

  /**
   * Push variables to AWS Secrets Manager
   */
  private async pushToSecretsManager(
    variables: SyncVariable[],
    secretNamePrefix: string
  ): Promise<SyncResult> {
    if (!this.secretsClient) {
      throw new Error("Secrets Manager client not initialized");
    }

    const errors: Array<{
      variableKey: string;
      message: string;
      code?: string;
    }> = [];
    let syncedCount = 0;

    for (const variable of variables) {
      try {
        // Construct secret name with prefix
        const secretName = secretNamePrefix.endsWith("/")
          ? `${secretNamePrefix}${variable.key}`
          : `${secretNamePrefix}/${variable.key}`;

        // Try to create the secret first
        try {
          const createCommand = new CreateSecretCommand({
            Name: secretName,
            SecretString: variable.value,
            Description: `Synced from Environment Configuration Manager`,
          });

          await this.secretsClient.send(createCommand);
          syncedCount++;
        } catch (error: any) {
          // If secret already exists, update it
          if (error.name === "ResourceExistsException") {
            const updateCommand = new UpdateSecretCommand({
              SecretId: secretName,
              SecretString: variable.value,
            });

            await this.secretsClient.send(updateCommand);
            syncedCount++;
          } else {
            throw error;
          }
        }
      } catch (error) {
        errors.push({
          variableKey: variable.key,
          message: error instanceof Error ? error.message : "Unknown error",
          code: "AWS_SECRETS_MANAGER_ERROR",
        });
      }
    }

    return this.createPartialResult(syncedCount, errors);
  }

  protected async performConnectionTest(): Promise<boolean> {
    try {
      if (this.service === "ssm" && this.ssmClient) {
        await this.ssmClient
          .send(new GetParameterCommand({ Name: "/test-connection" }))
          .catch((error) => {
            if (error.name === "ParameterNotFound") {
              return;
            }
            throw error;
          });
        return true;
      } else if (this.service === "secrets-manager" && this.secretsClient) {
        await this.secretsClient
          .send(new DescribeSecretCommand({ SecretId: "test-connection" }))
          .catch((error) => {
            if (error.name === "ResourceNotFoundException") {
              return;
            }
            throw error;
          });
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }
}
