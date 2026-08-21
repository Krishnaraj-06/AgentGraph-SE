import uuid
from datetime import datetime
from pydantic import BaseModel


class ProjectCreateRequest(BaseModel):
    name: str
    description: str | None = None
    github_repo_full_name: str | None = None
    jira_project_key: str | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    description: str | None
    github_repo_full_name: str | None
    jira_project_key: str | None
    created_at: datetime
    synced_at: datetime | None

    model_config = {"from_attributes": True}


class IntegrationResponse(BaseModel):
    id: uuid.UUID
    provider: str
    external_id: str | None
    is_active: bool
    created_at: datetime
    synced_at: datetime | None

    model_config = {"from_attributes": True}


class HealthResponse(BaseModel):
    status: str
    version: str
    services: dict[str, str]
