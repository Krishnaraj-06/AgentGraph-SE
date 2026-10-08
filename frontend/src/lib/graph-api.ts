import api from "./api";

export interface GraphBuildResponse {
  project_id: string;
  status: string;
  stats: {
    projects: number;
    developers: number;
    commits: number;
    files: number;
    branches: number;
    pull_requests: number;
    relationships: number;
  };
}

export interface GraphNode {
  id: string;
  label: string;
  title: string;
}

export interface GraphRelationship {
  source: string;
  type: string;
  target: string;
}

export interface ProjectGraph {
  project_id: string;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export const graphApi = {
  async getGraph(workspaceSlug: string, projectId: string): Promise<ProjectGraph> {
    const { data } = await api.get<ProjectGraph>(
      `/api/v1/workspaces/${workspaceSlug}/graph/${projectId}`
    );
    return data;
  },

  async buildGraph(workspaceSlug: string, projectId: string): Promise<GraphBuildResponse> {
    const { data } = await api.post(
      `/api/v1/workspaces/${workspaceSlug}/graph/build/${projectId}`
    );
    return data;
  },

  async rebuildGraph(workspaceSlug: string, projectId: string): Promise<GraphBuildResponse> {
    const { data } = await api.post(
      `/api/v1/workspaces/${workspaceSlug}/graph/rebuild/${projectId}`
    );
    return data;
  },

  async deleteGraph(workspaceSlug: string, projectId: string): Promise<void> {
    await api.delete(`/api/v1/workspaces/${workspaceSlug}/graph/${projectId}`);
  },
};
