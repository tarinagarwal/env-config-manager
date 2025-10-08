import prisma from "../lib/prisma";
import { NotFoundError, ForbiddenError } from "../utils/errors";

interface CreateProjectDto {
  name: string;
  description?: string;
}

interface UpdateProjectDto {
  name?: string;
  description?: string;
}

class ProjectService {
  /**
   * Create a new project
   */
  async createProject(userId: string, data: CreateProjectDto) {
    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        ownerId: userId,
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return project;
  }

  /**
   * Get all projects for a user (owned + member of)
   */
  async getUserProjects(userId: string) {
    // Get owned projects
    const ownedProjects = await prisma.project.findMany({
      where: { ownerId: userId },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
          },
        },
        _count: {
          select: {
            environments: true,
            members: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get projects where user is a member
    const memberProjects = await prisma.projectMember.findMany({
      where: { userId },
      include: {
        project: {
          include: {
            owner: {
              select: {
                id: true,
                email: true,
              },
            },
            _count: {
              select: {
                environments: true,
                members: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Combine and format results
    const projects = [
      ...ownedProjects.map((p: any) => ({
        ...p,
        role: "owner" as const,
        environmentCount: p._count.environments,
        memberCount: p._count.members + 1, // +1 for owner
      })),
      ...memberProjects.map((m: any) => ({
        ...m.project,
        role: m.role,
        environmentCount: m.project._count.environments,
        memberCount: m.project._count.members + 1, // +1 for owner
      })),
    ];

    return projects;
  }

  /**
   * Get a single project by ID
   */
  async getProjectById(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
          },
        },
        _count: {
          select: {
            environments: true,
            members: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundError("Project");
    }

    return {
      ...project,
      environmentCount: project._count.environments,
      memberCount: project._count.members + 1, // +1 for owner
    };
  }

  /**
   * Update a project
   */
  async updateProject(projectId: string, data: UpdateProjectDto) {
    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return project;
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: string) {
    await prisma.project.delete({
      where: { id: projectId },
    });
  }

  /**
   * Count projects owned by a user
   */
  async countUserProjects(userId: string): Promise<number> {
    return await prisma.project.count({
      where: { ownerId: userId },
    });
  }
}

export default new ProjectService();
