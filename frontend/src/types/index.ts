export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  github_repo_full_name: string | null;
  jira_project_key: string | null;
  created_at: string;
  synced_at: string | null;
}

export interface Integration {
  id: string;
  provider: "github" | "jira";
  external_id: string | null;
  is_active: boolean;
  created_at: string;
  synced_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface ApiError {
  detail: string | { msg: string; type: string }[];
}

export type ServiceStatus = "ok" | "degraded" | "error";

export interface HealthResponse {
  status: ServiceStatus;
  version: string;
  services: Record<string, string>;
}
