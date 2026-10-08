"""
Graph API endpoints — trigger graph construction and query the knowledge graph.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.postgres import get_db
from app.models.engineering import Project
from app.graph.service import GraphConstructionService
from app.api.deps import get_workspace_member

router = APIRouter(prefix="/workspaces/{workspace_slug}/graph", tags=["graph"])


@router.post("/build/{project_id}")
async def build_graph(
    workspace_slug: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    """
    Build knowledge graph for a project from its GitHub data.
    """
    workspace, _ = member_info
    
    # Verify project belongs to workspace
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.workspace_id == workspace.id,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.synced_at:
        raise HTTPException(
            status_code=400,
            detail="Project has no synced data. Run GitHub sync first.",
        )
    
    service = GraphConstructionService(db)
    try:
        stats = await service.build_project_graph(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph construction failed: {str(e)}")
    
    return {
        "project_id": project_id,
        "status": "success",
        "stats": stats,
    }


@router.post("/rebuild/{project_id}")
async def rebuild_graph(
    workspace_slug: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    """
    Delete and rebuild knowledge graph for a project.
    """
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
    
    service = GraphConstructionService(db)
    try:
        stats = await service.rebuild_project_graph(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph rebuild failed: {str(e)}")
    
    return {
        "project_id": project_id,
        "status": "rebuilt",
        "stats": stats,
    }


@router.get("/{project_id}")
async def get_graph(
    workspace_slug: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    """Return the persisted graph for a project in the current workspace."""
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

    service = GraphConstructionService(db)
    try:
        graph = await service.get_project_graph(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph retrieval failed: {str(e)}")

    return {"project_id": project_id, **graph}


@router.delete("/{project_id}")
async def delete_graph(
    workspace_slug: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    """
    Delete all graph data for a project.
    """
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
    
    service = GraphConstructionService(db)
    try:
        await service.delete_project_graph(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph deletion failed: {str(e)}")
    
    return {
        "project_id": project_id,
        "status": "deleted",
    }
