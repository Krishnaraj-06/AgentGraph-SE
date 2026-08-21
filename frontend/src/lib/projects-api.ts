import api from "@/lib/api";
import type { Project } from "@/types";

export const projectsApi = {
  list: async (workspaceSlug: string): Promise<Project[]> => {
    const res = await api.get(`/api/v1/workspaces/${workspaceSlug}/projects`);
    return res.data;
  },

  create: async (
    workspaceSlug: string,
    data: { name: string; description?: string; github_repo_full_name?: string }
  ): Promise<Project> => {
    const res = await api.post(`/api/v1/workspaces/${workspaceSlug}/projects`, data);
    return res.data;
  },

  get: async (workspaceSlug: string, projectId: string): Promise<Project> => {
    const res = await api.get(`/api/v1/workspaces/${workspaceSlug}/projects/${projectId}`);
    return res.data;
  },
};
