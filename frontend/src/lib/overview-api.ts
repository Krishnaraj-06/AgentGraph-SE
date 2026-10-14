import api from "@/lib/api";

export interface OverviewStats {
  total_commits: number;
  commits_7d: number;
  open_prs: number;
  merged_prs: number;
  total_projects: number;
  synced_projects: number;
  top_contributors: { name: string; commits: number }[];
  recent_commits: {
    id: string;
    sha: string;
    message: string;
    author: string;
    committed_at: string;
    project_name: string;
  }[];
  pr_breakdown: { state: string; count: number }[];
}

export const overviewApi = {
  getStats: async (workspaceSlug: string): Promise<OverviewStats> => {
    const res = await api.get(`/api/v1/workspaces/${workspaceSlug}/overview`);
    return res.data;
  },
};
