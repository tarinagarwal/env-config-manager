import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
    mutations: {
      retry: false,
    },
  },
});

// Query keys for consistent cache management
export const queryKeys = {
  // Auth
  currentUser: ["currentUser"] as const,

  // Projects
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  projectMembers: (projectId: string) =>
    ["projects", projectId, "members"] as const,

  // Environments
  environments: (projectId: string) =>
    ["projects", projectId, "environments"] as const,
  environment: (id: string) => ["environments", id] as const,

  // Variables
  variables: (environmentId: string) =>
    ["environments", environmentId, "variables"] as const,
  variable: (id: string) => ["variables", id] as const,
  variableHistory: (variableId: string) =>
    ["variables", variableId, "history"] as const,

  // Platform Connections
  connections: (projectId: string) =>
    ["projects", projectId, "connections"] as const,
  connection: (id: string) => ["connections", id] as const,
  syncStatus: (connectionId: string) =>
    ["connections", connectionId, "sync-status"] as const,

  // Audit Logs
  auditLogs: (filters?: any) => ["audit-logs", filters] as const,

  // Subscription
  subscription: ["subscription"] as const,
};
