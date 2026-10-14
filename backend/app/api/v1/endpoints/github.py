import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.sql import text

from app.db.postgres import get_db
from app.models.workspace import User, Integration
from app.models.engineering import Project, Commit, PullRequest
from app.ingestion.github_client import GitHubClient
from app.ingestion.github_ingestion import GitHubIngestionService
from app.schemas.github import (
    GitHubConnectRequest,
    GitHubConnectResponse,
    GitHubRepoItem,
    GitHubLinkRepoRequest,
    SyncStatusResponse,
    SyncTriggerResponse,
)
from app.api.deps import get_current_user, get_workspace_member

router = APIRouter(prefix="/workspaces/{workspace_slug}/github", tags=["github"])


@router.post("/connect", response_model=GitHubConnectResponse)
async def connect_github(
    workspace_slug: str,
    body: GitHubConnectRequest,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    """Save a GitHub PAT and return the list of accessible repos."""
    workspace, _ = member_info

    client = GitHubClient(body.token)
    try:
        gh_user = await client.get_authenticated_user()
        raw_repos = await client.list_repos()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()

    # Upsert integration
    result = await db.execute(
        select(Integration).where(
            Integration.workspace_id == workspace.id,
            Integration.provider == "github",
        )
    )
    integration = result.scalar_one_or_none()
    if integration:
        integration.access_token = body.token
        integration.external_id = gh_user.get("login")
        integration.is_active = True
    else:
        integration = Integration(
            workspace_id=workspace.id,
            provider="github",
            external_id=gh_user.get("login"),
            access_token=body.token,
            is_active=True,
        )
        db.add(integration)

    await db.flush()

    repos = [
        GitHubRepoItem(
            full_name=r["full_name"],
            name=r["name"],
            description=r.get("description"),
            private=r.get("private", False),
            default_branch=r.get("default_branch", "main"),
            stars=r.get("stargazers_count", 0),
            updated_at=r.get("updated_at"),
        )
        for r in raw_repos[:100]  # cap at 100 for response size
    ]

    return GitHubConnectResponse(
        integration_id=integration.id,
        github_username=gh_user.get("login", ""),
        repos=repos,
    )


@router.get("/status")
async def github_status(
    workspace_slug: str,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    """Check if GitHub is connected for this workspace."""
    workspace, _ = member_info
    result = await db.execute(
        select(Integration).where(
            Integration.workspace_id == workspace.id,
            Integration.provider == "github",
            Integration.is_active == True,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        return {"connected": False}
    return {"connected": True, "github_username": integration.external_id}


@router.post("/link-repo")
async def link_repo(
    workspace_slug: str,
    body: GitHubLinkRepoRequest,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    """Link a GitHub repo to an existing project."""
    workspace, _ = member_info

    result = await db.execute(
        select(Project).where(
            Project.id == body.project_id,
            Project.workspace_id == workspace.id,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Clean repo name - handle both "owner/repo" and full GitHub URLs
    repo_name = body.repo_full_name.strip()
    
    # If it's a full GitHub URL, extract owner/repo
    if "github.com/" in repo_name:
        import re
        match = re.search(r"github\.com/([^/]+/[^/\?#]+)", repo_name)
        if match:
            repo_name = match.group(1)
    
    # Remove trailing .git if present
    repo_name = repo_name.rstrip("/").removesuffix(".git")

    project.github_repo_full_name = repo_name
    await db.flush()
    return {"project_id": project.id, "repo_full_name": repo_name}


@router.post("/sync/{project_id}", response_model=SyncTriggerResponse)
async def trigger_sync(
    workspace_slug: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    """Trigger GitHub data ingestion for a project."""
    # Prevent overlapping syncs from inserting the same commits and PRs.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:project_id, 0))"),
        {"project_id": project_id},
    )

    workspace, _ = member_info

    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.workspace_id == workspace.id,
        ).execution_options(populate_existing=True)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.github_repo_full_name:
        raise HTTPException(status_code=400, detail="No GitHub repo linked to this project")

    # Get integration token
    result = await db.execute(
        select(Integration).where(
            Integration.workspace_id == workspace.id,
            Integration.provider == "github",
            Integration.is_active == True,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration or not integration.access_token:
        raise HTTPException(status_code=400, detail="GitHub not connected for this workspace")

    service = GitHubIngestionService(db)
    try:
        summary = await service.ingest(project, integration.access_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

    return SyncTriggerResponse(
        project_id=project.id,
        commits_ingested=summary["commits"],
        prs_ingested=summary["pull_requests"],
        skipped_commits=summary["skipped_commits"],
        synced_at=datetime.now(timezone.utc),
    )


@router.get("/sync-status/{project_id}", response_model=SyncStatusResponse)
async def sync_status(
    workspace_slug: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    """Get sync status and ingestion counts for a project."""
    workspace, _ = member_info

    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.workspace_id == workspace.id,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    commit_count = await db.scalar(
        select(func.count()).where(Commit.project_id == project.id)
    )
    pr_count = await db.scalar(
        select(func.count()).where(PullRequest.project_id == project.id)
    )

    return SyncStatusResponse(
        project_id=project.id,
        repo_full_name=project.github_repo_full_name,
        synced_at=project.synced_at,
        commit_count=commit_count or 0,
        pr_count=pr_count or 0,
    )
