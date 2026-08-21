from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.postgres import get_db
from app.models.workspace import Workspace, WorkspaceMember
from app.models.engineering import Project
from app.schemas.project import ProjectCreateRequest, ProjectResponse
from app.api.deps import get_workspace_member

router = APIRouter(prefix="/workspaces/{workspace_slug}/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    workspace_slug: str,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    workspace, _ = member_info
    result = await db.execute(select(Project).where(Project.workspace_id == workspace.id))
    return result.scalars().all()


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    workspace_slug: str,
    body: ProjectCreateRequest,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    workspace, _ = member_info
    project = Project(workspace_id=workspace.id, **body.model_dump())
    db.add(project)
    await db.flush()
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    workspace_slug: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    workspace, _ = member_info
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.workspace_id == workspace.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
