import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  projectService,
  CreateProjectData,
  UpdateProjectData,
  AddMemberData,
} from "../services/project.service";
import { queryKeys } from "../lib/queryClient";
import type { Role } from "../types";

export const useProjects = () => {
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => projectService.getProjects(),
  });

  return {
    projects: projectsQuery.data,
    isLoading: projectsQuery.isLoading,
    error: projectsQuery.error,
    refetch: projectsQuery.refetch,
  };
};

export const useProject = (id: string) => {
  const projectQuery = useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => projectService.getProject(id),
    enabled: !!id,
  });

  return {
    project: projectQuery.data,
    isLoading: projectQuery.isLoading,
    error: projectQuery.error,
    refetch: projectQuery.refetch,
  };
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (data: CreateProjectData) => projectService.createProject(data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      navigate(`/projects/${project.id}`);
    },
  });

  return {
    createProject: mutation.mutate,
    createProjectAsync: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
};

export const useUpdateProject = (id: string) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: UpdateProjectData) =>
      projectService.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  return {
    updateProject: mutation.mutate,
    updateProjectAsync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error,
  };
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (id: string) => projectService.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      navigate("/projects");
    },
  });

  return {
    deleteProject: mutation.mutate,
    deleteProjectAsync: mutation.mutateAsync,
    isDeleting: mutation.isPending,
    error: mutation.error,
  };
};

export const useProjectMembers = (projectId: string) => {
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => projectService.getProjectMembers(projectId),
    enabled: !!projectId,
  });

  const addMemberMutation = useMutation({
    mutationFn: (data: AddMemberData) =>
      projectService.addProjectMember(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectMembers(projectId),
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      projectService.removeProjectMember(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectMembers(projectId),
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      projectService.updateMemberRole(projectId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectMembers(projectId),
      });
    },
  });

  return {
    members: membersQuery.data,
    isLoading: membersQuery.isLoading,
    error: membersQuery.error,

    addMember: addMemberMutation.mutate,
    isAddingMember: addMemberMutation.isPending,
    addMemberError: addMemberMutation.error,

    removeMember: removeMemberMutation.mutate,
    isRemovingMember: removeMemberMutation.isPending,

    updateRole: updateRoleMutation.mutate,
    isUpdatingRole: updateRoleMutation.isPending,
  };
};
