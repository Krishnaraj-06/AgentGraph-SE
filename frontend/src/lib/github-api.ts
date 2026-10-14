import api from "@/lib/api";

export interface GitHubRepo {
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  stars: number;
  updated_at: string | null;
}

export interface GitHubConnectResponse {
  integration_id: string;
  github_username: string;
  repos: GitHubRepo[];
}

export interface SyncStatus {
  project_id: string;
  repo_full_name: string | null;
  synced_at: string | null;
  commit_count: number;
  pr_count: number;
}

export interface SyncResult {
  project_id: string;
  commits_ingested: number;
  prs_ingested: number;
  skipped_commits: number;
  synced_at: string;
}

export const githubApi = {
  connect: async (workspaceSlug: string, token: string): Promise<GitHubConnectResponse> => {
    const res = await api.post(`/api/v1/workspaces/${workspaceSlug}/github/connect`, { token });
    return res.data;
  },

  status: async (workspaceSlug: string): Promise<{ connected: boolean; github_username?: string }> => {
    const res = await api.get(`/api/v1/workspaces/${workspaceSlug}/github/status`);
    return res.data;
  },

  linkRepo: async (workspaceSlug: string, projectId: string, repoFullName: string) => {
    const res = await api.post(`/api/v1/workspaces/${workspaceSlug}/github/link-repo`, {
      project_id: projectId,
      repo_full_name: repoFullName,
    });
    return res.data;
  },

  triggerSync: async (workspaceSlug: string, projectId: string): Promise<SyncResult> => {
    const res = await api.post(
      `/api/v1/workspaces/${workspaceSlug}/github/sync/${projectId}`,
      undefined,
      { timeout: 180_000 }
    );
    return res.data;
  },

  syncStatus: async (workspaceSlug: string, projectId: string): Promise<SyncStatus> => {
    const res = await api.get(`/api/v1/workspaces/${workspaceSlug}/github/sync-status/${projectId}`);
    return res.data;
  },
};
