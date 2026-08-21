import uuid
from datetime import datetime
from pydantic import BaseModel


class GitHubConnectRequest(BaseModel):
    token: str  # Personal Access Token


class GitHubRepoItem(BaseModel):
    full_name: str
    name: str
    description: str | None
    private: bool
    default_branch: str
    stars: int
    updated_at: str | None


class GitHubConnectResponse(BaseModel):
    integration_id: uuid.UUID
    github_username: str
    repos: list[GitHubRepoItem]


class GitHubLinkRepoRequest(BaseModel):
    project_id: uuid.UUID
    repo_full_name: str


class SyncStatusResponse(BaseModel):
    project_id: uuid.UUID
    repo_full_name: str | None
    synced_at: datetime | None
    commit_count: int
    pr_count: int


class SyncTriggerResponse(BaseModel):
    project_id: uuid.UUID
    commits_ingested: int
    prs_ingested: int
    skipped_commits: int
    synced_at: datetime
