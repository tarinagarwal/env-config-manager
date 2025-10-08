import { apiClient } from "./api";
import type { Project, ProjectMember, Role } from "../types";

export interface CreateProjectData {
  name: string;
  description?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
}

export interface AddMemberData {
  userId: string;
  role: Role;
}

export const projectService = {
  async getProjects(): Promise<Project[]> {
    return apiClient.get<Project[]>("/projects");
  },

  async getProject(id: string): Promise<Project> {
    return apiClient.get<Project>(`/projects/${id}`);
  },

  async createProject(data: CreateProjectData): Promise<Project> {
    return apiClient.post<Project>("/projects", data);
  },

  async updateProject(id: string, data: UpdateProjectData): Promise<Project> {
    return apiClient.patch<Project>(`/projects/${id}`, data);
  },

  async deleteProject(id: string): Promise<void> {
    return apiClient.delete<void>(`/projects/${id}`);
  },

  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`);
  },

  async addProjectMember(
    projectId: string,
    data: AddMemberData
  ): Promise<void> {
    return apiClient.post<void>(`/projects/${projectId}/members`, data);
  },

  async removeProjectMember(projectId: string, userId: string): Promise<void> {
    return apiClient.delete<void>(`/projects/${projectId}/members/${userId}`);
  },

  async updateMemberRole(
    projectId: string,
    userId: string,
    role: Role
  ): Promise<void> {
    return apiClient.patch<void>(`/projects/${projectId}/members/${userId}`, {
      role,
    });
  },
};
