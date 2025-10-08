import prisma from "../lib/prisma";
import { NotFoundError, ValidationError } from "../utils/errors";

interface CreateEnvironmentDto {
  name: string;
}

class EnvironmentService {
  /**
   * Create a new environment
   */
  async createEnvironment(projectId: string, data: CreateEnvironmentDto) {
    // Check if environment name already exists in this project
    const existing = await prisma.environment.findUnique({
      where: {
        projectId_name: {
          projectId,
          name: data.name,
        },
      },
    });

    if (existing) {
      throw new ValidationError(
        `Environment with name '${data.name}' already exists in this project`
      );
    }

    const environment = await prisma.environment.create({
      data: {
        projectId,
        name: data.name,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            variables: true,
          },
        },
      },
    });

    return {
      ...environment,
      variableCount: environment._count.variables,
    };
  }

  /**
   * Get all environments for a project
   */
  async getEnvironments(projectId: string) {
    const environments = await prisma.environment.findMany({
      where: { projectId },
      include: {
        _count: {
          select: {
            variables: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return environments.map((env: any) => ({
      ...env,
      variableCount: env._count.variables,
    }));
  }

  /**
   * Get a single environment by ID
   */
  async getEnvironmentById(environmentId: string) {
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            variables: true,
          },
        },
      },
    });

    if (!environment) {
      throw new NotFoundError("Environment");
    }

    return {
      ...environment,
      variableCount: environment._count.variables,
    };
  }

  /**
   * Delete an environment
   */
  async deleteEnvironment(environmentId: string) {
    await prisma.environment.delete({
      where: { id: environmentId },
    });
  }

  /**
   * Count environments in a project
   */
  async countProjectEnvironments(projectId: string): Promise<number> {
    return await prisma.environment.count({
      where: { projectId },
    });
  }

  /**
   * Count total environments for a user across all projects
   */
  async countUserEnvironments(userId: string): Promise<number> {
    return await prisma.environment.count({
      where: {
        project: {
          ownerId: userId,
        },
      },
    });
  }
}

export default new EnvironmentService();
