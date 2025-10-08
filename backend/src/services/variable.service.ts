import prisma from "../lib/prisma";
import { NotFoundError, ValidationError } from "../utils/errors";
import { encryptionService } from "./encryption.service";
import syncService from "./sync.service";

interface CreateVariableDto {
  key: string;
  value: string;
  isSecret: boolean;
}

interface UpdateVariableDto {
  value: string;
}

class VariableService {
  /**
   * Validate variable key format
   */
  private validateVariableKey(key: string): void {
    // Environment variable naming conventions:
    // - Must start with a letter or underscore
    // - Can contain letters, numbers, and underscores
    // - Typically uppercase but we'll allow mixed case
    const keyRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

    if (!keyRegex.test(key)) {
      throw new ValidationError(
        "Variable key must start with a letter or underscore and contain only letters, numbers, and underscores"
      );
    }
  }

  /**
   * Create a new variable
   */
  async createVariable(
    environmentId: string,
    userId: string,
    data: CreateVariableDto
  ) {
    this.validateVariableKey(data.key);

    // Check if variable key already exists in this environment
    const existing = await prisma.variable.findUnique({
      where: {
        environmentId_key: {
          environmentId,
          key: data.key,
        },
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ValidationError(
        `Variable with key '${data.key}' already exists in this environment`
      );
    }

    // Get environment to access projectId
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      select: { id: true, projectId: true },
    });

    if (!environment) {
      throw new NotFoundError("Environment");
    }

    let valueToStore = data.value;
    let encryptedDek: string | null = null;
    let iv: string | null = null;
    let authTag: string | null = null;

    // Encrypt if it's a secret
    if (data.isSecret) {
      // We need to create the variable first to get an ID for encryption context
      // So we'll use a temporary ID approach
      const tempVariable = await prisma.variable.create({
        data: {
          environmentId,
          key: data.key,
          value: "", // Temporary empty value
          isSecret: data.isSecret,
          createdBy: userId,
        },
      });

      const encryptionContext = {
        projectId: environment.projectId,
        environmentId,
        variableId: tempVariable.id,
      };

      const encrypted = await encryptionService.encrypt(
        data.value,
        encryptionContext
      );

      // Store encryption metadata (IV and authTag) along with encrypted DEK
      const encryptionMetadata = JSON.stringify({
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      });

      // Update with encrypted value
      const variable = await prisma.variable.update({
        where: { id: tempVariable.id },
        data: {
          value: encrypted.encryptedValue,
          encryptedDek: encryptionMetadata,
        },
      });

      // Create version history
      await prisma.variableVersion.create({
        data: {
          variableId: variable.id,
          value: encrypted.encryptedValue,
          encryptedDek: encryptionMetadata,
          changeType: "created",
          changedBy: userId,
        },
      });

      // Trigger sync for this environment
      await syncService
        .queueSyncForEnvironment(environmentId)
        .catch((error) => {
          console.error("Failed to queue sync:", error);
        });

      return variable;
    } else {
      // Create non-secret variable
      const variable = await prisma.variable.create({
        data: {
          environmentId,
          key: data.key,
          value: valueToStore,
          isSecret: data.isSecret,
          createdBy: userId,
        },
      });

      // Create version history
      await prisma.variableVersion.create({
        data: {
          variableId: variable.id,
          value: valueToStore,
          changeType: "created",
          changedBy: userId,
        },
      });

      // Trigger sync for this environment
      await syncService
        .queueSyncForEnvironment(environmentId)
        .catch((error) => {
          console.error("Failed to queue sync:", error);
        });

      return variable;
    }
  }

  /**
   * Decrypt a secret variable value
   */
  private async decryptVariableValue(
    variable: any,
    projectId: string
  ): Promise<string> {
    if (!variable.isSecret || !variable.encryptedDek) {
      return variable.value;
    }

    const encryptionContext = {
      projectId,
      environmentId: variable.environmentId,
      variableId: variable.id,
    };

    // Parse the encrypted DEK data to extract IV and authTag
    const dekData = JSON.parse(variable.encryptedDek);

    // The encrypted value is stored in the value field
    // We need to extract IV and authTag from the encryption metadata
    // For now, we'll store them in the encryptedDek JSON
    const decrypted = await encryptionService.decrypt(
      variable.value,
      variable.encryptedDek,
      dekData.iv || "",
      dekData.authTag || "",
      encryptionContext
    );

    return decrypted;
  }

  /**
   * Mask a secret variable value
   */
  private maskSecretValue(value: string): string {
    if (value.length <= 4) {
      return "****";
    }
    return "****" + value.slice(-4);
  }

  /**
   * Get all variables for an environment
   */
  async getVariables(
    environmentId: string,
    includeDeleted: boolean = false,
    revealSecrets: boolean = false
  ) {
    const where: any = { environmentId };

    if (!includeDeleted) {
      where.deletedAt = null;
    }

    const variables = await prisma.variable.findMany({
      where,
      include: {
        environment: {
          select: {
            projectId: true,
          },
        },
      },
      orderBy: { key: "asc" },
    });

    // Process variables to mask/decrypt secrets
    const processedVariables = await Promise.all(
      variables.map(async (variable: any) => {
        if (variable.isSecret) {
          if (revealSecrets) {
            // Decrypt the value
            try {
              const decryptedValue = await this.decryptVariableValue(
                variable,
                variable.environment.projectId
              );
              return {
                ...variable,
                value: decryptedValue,
                environment: undefined, // Remove environment from response
              };
            } catch (error) {
              console.error(
                `Failed to decrypt variable ${variable.id}:`,
                error
              );
              return {
                ...variable,
                value: this.maskSecretValue(variable.value),
                environment: undefined,
              };
            }
          } else {
            // Mask the value
            return {
              ...variable,
              value: this.maskSecretValue(variable.value),
              environment: undefined,
            };
          }
        }
        return {
          ...variable,
          environment: undefined,
        };
      })
    );

    return processedVariables;
  }

  /**
   * Get a single variable by ID
   */
  async getVariableById(variableId: string, revealSecret: boolean = false) {
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      include: {
        environment: {
          select: {
            id: true,
            name: true,
            projectId: true,
          },
        },
      },
    });

    if (!variable || variable.deletedAt) {
      throw new NotFoundError("Variable");
    }

    // Process secret masking/decryption
    if (variable.isSecret) {
      if (revealSecret) {
        try {
          const decryptedValue = await this.decryptVariableValue(
            variable,
            variable.environment.projectId
          );
          return {
            ...variable,
            value: decryptedValue,
          };
        } catch (error) {
          console.error(`Failed to decrypt variable ${variable.id}:`, error);
          return {
            ...variable,
            value: this.maskSecretValue(variable.value),
          };
        }
      } else {
        return {
          ...variable,
          value: this.maskSecretValue(variable.value),
        };
      }
    }

    return variable;
  }

  /**
   * Update a variable value
   */
  async updateVariable(
    variableId: string,
    userId: string,
    data: UpdateVariableDto
  ) {
    // Get the raw variable data without masking
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      include: {
        environment: {
          select: {
            id: true,
            name: true,
            projectId: true,
          },
        },
      },
    });

    if (!variable || variable.deletedAt) {
      throw new NotFoundError("Variable");
    }

    let valueToStore = data.value;
    let encryptedDek: string | null = null;

    // Encrypt if it's a secret
    if (variable.isSecret) {
      const encryptionContext = {
        projectId: variable.environment.projectId,
        environmentId: variable.environmentId,
        variableId: variable.id,
      };

      const encrypted = await encryptionService.encrypt(
        data.value,
        encryptionContext
      );

      valueToStore = encrypted.encryptedValue;

      // Store encryption metadata (IV and authTag) along with encrypted DEK
      encryptedDek = JSON.stringify({
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      });
    }

    // Update variable
    const updated = await prisma.variable.update({
      where: { id: variableId },
      data: {
        value: valueToStore,
        ...(encryptedDek && { encryptedDek }),
        updatedAt: new Date(),
      },
    });

    // Create version history
    await prisma.variableVersion.create({
      data: {
        variableId: variable.id,
        value: valueToStore,
        encryptedDek,
        changeType: "updated",
        changedBy: userId,
      },
    });

    // Trigger sync for this environment
    await syncService
      .queueSyncForEnvironment(variable.environmentId)
      .catch((error) => {
        console.error("Failed to queue sync:", error);
      });

    return updated;
  }

  /**
   * Delete a variable (soft delete)
   */
  async deleteVariable(variableId: string, userId: string) {
    // Get the raw variable data
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
    });

    if (!variable || variable.deletedAt) {
      throw new NotFoundError("Variable");
    }

    // Soft delete
    const deleted = await prisma.variable.update({
      where: { id: variableId },
      data: {
        deletedAt: new Date(),
      },
    });

    // Create version history
    await prisma.variableVersion.create({
      data: {
        variableId: variable.id,
        value: variable.value,
        encryptedDek: variable.encryptedDek,
        changeType: "deleted",
        changedBy: userId,
      },
    });

    // Trigger sync for this environment
    await syncService
      .queueSyncForEnvironment(variable.environmentId)
      .catch((error) => {
        console.error("Failed to queue sync:", error);
      });

    return deleted;
  }

  /**
   * Bulk copy variables from one environment to another
   */
  async bulkCopyVariables(
    sourceEnvironmentId: string,
    targetEnvironmentId: string,
    userId: string,
    variableIds?: string[]
  ) {
    // Get source environment with project info
    const sourceEnv = await prisma.environment.findUnique({
      where: { id: sourceEnvironmentId },
      select: { id: true, projectId: true },
    });

    if (!sourceEnv) {
      throw new NotFoundError("Source environment");
    }

    // Get target environment with project info
    const targetEnv = await prisma.environment.findUnique({
      where: { id: targetEnvironmentId },
      select: { id: true, projectId: true },
    });

    if (!targetEnv) {
      throw new NotFoundError("Target environment");
    }

    // Get variables to copy
    const where: any = {
      environmentId: sourceEnvironmentId,
      deletedAt: null,
    };

    if (variableIds && variableIds.length > 0) {
      where.id = { in: variableIds };
    }

    const variablesToCopy = await prisma.variable.findMany({
      where,
    });

    if (variablesToCopy.length === 0) {
      return { copiedCount: 0, skippedCount: 0, variables: [] };
    }

    const copiedVariables = [];
    let skippedCount = 0;

    for (const sourceVar of variablesToCopy) {
      // Check if variable with same key already exists in target
      const existing = await prisma.variable.findUnique({
        where: {
          environmentId_key: {
            environmentId: targetEnvironmentId,
            key: sourceVar.key,
          },
          deletedAt: null,
        },
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      let valueToStore = sourceVar.value;
      let encryptedDek = sourceVar.encryptedDek;

      // If it's a secret and we're copying to a different project, re-encrypt
      if (sourceVar.isSecret && sourceEnv.projectId !== targetEnv.projectId) {
        // Decrypt from source
        const decrypted = await this.decryptVariableValue(
          sourceVar,
          sourceEnv.projectId
        );

        // Create temporary variable to get ID for encryption context
        const tempVar = await prisma.variable.create({
          data: {
            environmentId: targetEnvironmentId,
            key: sourceVar.key,
            value: "",
            isSecret: sourceVar.isSecret,
            createdBy: userId,
          },
        });

        // Encrypt for target
        const encryptionContext = {
          projectId: targetEnv.projectId,
          environmentId: targetEnvironmentId,
          variableId: tempVar.id,
        };

        const encrypted = await encryptionService.encrypt(
          decrypted,
          encryptionContext
        );

        valueToStore = encrypted.encryptedValue;
        encryptedDek = JSON.stringify({
          encryptedDek: encrypted.encryptedDek,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
        });

        // Update with encrypted value
        const copiedVar = await prisma.variable.update({
          where: { id: tempVar.id },
          data: {
            value: valueToStore,
            encryptedDek,
          },
        });

        // Create version history
        await prisma.variableVersion.create({
          data: {
            variableId: copiedVar.id,
            value: valueToStore,
            encryptedDek,
            changeType: "created",
            changedBy: userId,
          },
        });

        copiedVariables.push(copiedVar);
      } else {
        // Create new variable in target environment
        const copiedVar = await prisma.variable.create({
          data: {
            environmentId: targetEnvironmentId,
            key: sourceVar.key,
            value: valueToStore,
            encryptedDek,
            isSecret: sourceVar.isSecret,
            createdBy: userId,
          },
        });

        // Create version history
        await prisma.variableVersion.create({
          data: {
            variableId: copiedVar.id,
            value: valueToStore,
            encryptedDek,
            changeType: "created",
            changedBy: userId,
          },
        });

        copiedVariables.push(copiedVar);
      }
    }

    return {
      copiedCount: copiedVariables.length,
      skippedCount,
      variables: copiedVariables,
    };
  }

  /**
   * Bulk update variables
   */
  async bulkUpdateVariables(
    updates: Array<{ variableId: string; value: string }>,
    userId: string
  ) {
    const results = {
      successCount: 0,
      failedCount: 0,
      errors: [] as Array<{ variableId: string; error: string }>,
    };

    for (const update of updates) {
      try {
        await this.updateVariable(update.variableId, userId, {
          value: update.value,
        });
        results.successCount++;
      } catch (error) {
        results.failedCount++;
        results.errors.push({
          variableId: update.variableId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  /**
   * Get version history for a specific variable
   */
  async getVariableHistory(
    variableId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      userId?: string;
    },
    revealSecrets: boolean = false
  ) {
    // Get the variable to check if it exists and get project info
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      include: {
        environment: {
          select: {
            projectId: true,
          },
        },
      },
    });

    if (!variable) {
      throw new NotFoundError("Variable");
    }

    // Build where clause with filters
    const where: any = { variableId };

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    if (filters?.userId) {
      where.changedBy = filters.userId;
    }

    const versions = await prisma.variableVersion.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Process versions to mask/decrypt secrets
    const processedVersions = await Promise.all(
      versions.map(async (version: any) => {
        if (variable.isSecret) {
          if (revealSecrets) {
            // Decrypt the value
            try {
              if (version.encryptedDek) {
                const dekData = JSON.parse(version.encryptedDek);
                const encryptionContext = {
                  projectId: variable.environment.projectId,
                  environmentId: variable.environmentId,
                  variableId: variable.id,
                };

                const decrypted = await encryptionService.decrypt(
                  version.value,
                  version.encryptedDek,
                  dekData.iv || "",
                  dekData.authTag || "",
                  encryptionContext
                );

                return {
                  ...version,
                  value: decrypted,
                };
              }
            } catch (error) {
              console.error(`Failed to decrypt version ${version.id}:`, error);
              return {
                ...version,
                value: this.maskSecretValue(version.value),
              };
            }
          } else {
            // Mask the value
            return {
              ...version,
              value: this.maskSecretValue(version.value),
            };
          }
        }
        return version;
      })
    );

    return processedVersions;
  }

  /**
   * Get version history for all variables in an environment
   */
  async getEnvironmentHistory(
    environmentId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      userId?: string;
      variableKey?: string;
    },
    revealSecrets: boolean = false
  ) {
    // Get environment with project info
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      select: { id: true, projectId: true },
    });

    if (!environment) {
      throw new NotFoundError("Environment");
    }

    // Get all variables in the environment (including deleted)
    const variables = await prisma.variable.findMany({
      where: { environmentId },
      select: { id: true, key: true, isSecret: true },
    });

    if (variables.length === 0) {
      return [];
    }

    const variableIds = variables.map((v: { id: string }) => v.id);

    // Build where clause with filters
    const where: any = {
      variableId: { in: variableIds },
    };

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    if (filters?.userId) {
      where.changedBy = filters.userId;
    }

    // Get all versions
    const versions = await prisma.variableVersion.findMany({
      where,
      include: {
        variable: {
          select: {
            id: true,
            key: true,
            isSecret: true,
            environmentId: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter by variable key if specified
    let filteredVersions = versions;
    if (filters?.variableKey) {
      filteredVersions = versions.filter(
        (v: any) => v.variable.key === filters.variableKey
      );
    }

    // Process versions to mask/decrypt secrets
    const processedVersions = await Promise.all(
      filteredVersions.map(async (version: any) => {
        if (version.variable.isSecret) {
          if (revealSecrets) {
            // Decrypt the value
            try {
              if (version.encryptedDek) {
                const dekData = JSON.parse(version.encryptedDek);
                const encryptionContext = {
                  projectId: environment.projectId,
                  environmentId: version.variable.environmentId,
                  variableId: version.variable.id,
                };

                const decrypted = await encryptionService.decrypt(
                  version.value,
                  version.encryptedDek,
                  dekData.iv || "",
                  dekData.authTag || "",
                  encryptionContext
                );

                return {
                  ...version,
                  value: decrypted,
                };
              }
            } catch (error) {
              console.error(`Failed to decrypt version ${version.id}:`, error);
              return {
                ...version,
                value: this.maskSecretValue(version.value),
              };
            }
          } else {
            // Mask the value
            return {
              ...version,
              value: this.maskSecretValue(version.value),
            };
          }
        }
        return version;
      })
    );

    return processedVersions;
  }

  /**
   * Rollback a variable to a previous version
   */
  async rollbackVariable(
    variableId: string,
    versionId: string,
    userId: string
  ) {
    // Get the variable
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      include: {
        environment: {
          select: {
            projectId: true,
          },
        },
      },
    });

    if (!variable) {
      throw new NotFoundError("Variable");
    }

    // Get the version to rollback to
    const version = await prisma.variableVersion.findUnique({
      where: { id: versionId },
    });

    if (!version || version.variableId !== variableId) {
      throw new NotFoundError("Version");
    }

    // Update the variable with the version's value
    const updated = await prisma.variable.update({
      where: { id: variableId },
      data: {
        value: version.value,
        encryptedDek: version.encryptedDek,
        deletedAt: null, // Restore if it was deleted
        updatedAt: new Date(),
      },
    });

    // Create a new version entry for the rollback
    await prisma.variableVersion.create({
      data: {
        variableId: variable.id,
        value: version.value,
        encryptedDek: version.encryptedDek,
        changeType: "rollback",
        changedBy: userId,
      },
    });

    return updated;
  }
}

export default new VariableService();
