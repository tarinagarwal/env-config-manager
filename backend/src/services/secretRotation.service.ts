import prisma from "../lib/prisma";
import { NotFoundError, ValidationError } from "../utils/errors";

interface RotationConfig {
  rotationEnabled: boolean;
  rotationIntervalDays: number;
}

class SecretRotationService {
  /**
   * Enable rotation for a variable
   */
  async enableRotation(
    variableId: string,
    rotationIntervalDays: number
  ): Promise<void> {
    if (rotationIntervalDays < 1) {
      throw new ValidationError("Rotation interval must be at least 1 day");
    }

    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
    });

    if (!variable || variable.deletedAt) {
      throw new NotFoundError("Variable");
    }

    if (!variable.isSecret) {
      throw new ValidationError(
        "Only secret variables can have rotation enabled"
      );
    }

    // Calculate next rotation date
    const nextRotationAt = this.calculateNextRotationDate(rotationIntervalDays);

    await prisma.variable.update({
      where: { id: variableId },
      data: {
        rotationEnabled: true,
        rotationIntervalDays,
        nextRotationAt,
      },
    });
  }

  /**
   * Disable rotation for a variable
   */
  async disableRotation(variableId: string): Promise<void> {
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
    });

    if (!variable || variable.deletedAt) {
      throw new NotFoundError("Variable");
    }

    await prisma.variable.update({
      where: { id: variableId },
      data: {
        rotationEnabled: false,
        rotationIntervalDays: null,
        nextRotationAt: null,
      },
    });
  }

  /**
   * Update rotation interval for a variable
   */
  async updateRotationInterval(
    variableId: string,
    rotationIntervalDays: number
  ): Promise<void> {
    if (rotationIntervalDays < 1) {
      throw new ValidationError("Rotation interval must be at least 1 day");
    }

    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
    });

    if (!variable || variable.deletedAt) {
      throw new NotFoundError("Variable");
    }

    if (!variable.rotationEnabled) {
      throw new ValidationError(
        "Rotation must be enabled before updating interval"
      );
    }

    // Calculate new next rotation date based on last update
    const nextRotationAt = this.calculateNextRotationDate(
      rotationIntervalDays,
      variable.updatedAt
    );

    await prisma.variable.update({
      where: { id: variableId },
      data: {
        rotationIntervalDays,
        nextRotationAt,
      },
    });
  }

  /**
   * Get rotation configuration for a variable
   */
  async getRotationConfig(variableId: string): Promise<RotationConfig | null> {
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      select: {
        rotationEnabled: true,
        rotationIntervalDays: true,
        nextRotationAt: true,
      },
    });

    if (!variable) {
      throw new NotFoundError("Variable");
    }

    if (!variable.rotationEnabled) {
      return null;
    }

    return {
      rotationEnabled: variable.rotationEnabled,
      rotationIntervalDays: variable.rotationIntervalDays!,
    };
  }

  /**
   * Calculate next rotation date
   */
  private calculateNextRotationDate(
    intervalDays: number,
    fromDate: Date = new Date()
  ): Date {
    const nextDate = new Date(fromDate);
    nextDate.setDate(nextDate.getDate() + intervalDays);
    return nextDate;
  }

  /**
   * Get all variables due for rotation
   */
  async getVariablesDueForRotation(): Promise<any[]> {
    const now = new Date();

    const variables = await prisma.variable.findMany({
      where: {
        rotationEnabled: true,
        nextRotationAt: {
          lte: now,
        },
        deletedAt: null,
      },
      include: {
        environment: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                ownerId: true,
              },
            },
          },
        },
      },
    });

    return variables;
  }

  /**
   * Update next rotation date after rotation
   */
  async updateNextRotationDate(variableId: string): Promise<void> {
    const variable = await prisma.variable.findUnique({
      where: { id: variableId },
      select: {
        rotationEnabled: true,
        rotationIntervalDays: true,
      },
    });

    if (
      !variable ||
      !variable.rotationEnabled ||
      !variable.rotationIntervalDays
    ) {
      return;
    }

    const nextRotationAt = this.calculateNextRotationDate(
      variable.rotationIntervalDays
    );

    await prisma.variable.update({
      where: { id: variableId },
      data: {
        nextRotationAt,
      },
    });
  }
}

export default new SecretRotationService();
