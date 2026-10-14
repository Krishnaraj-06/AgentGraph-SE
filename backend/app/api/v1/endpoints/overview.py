from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.postgres import get_db
from app.models.engineering import Project, Commit, PullRequest
from app.api.deps import get_workspace_member

router = APIRouter(prefix="/workspaces/{workspace_slug}/overview", tags=["overview"])


@router.get("")
async def get_overview(
    workspace_slug: str,
    db: AsyncSession = Depends(get_db),
    member_info: tuple = Depends(get_workspace_member),
):
    workspace, _ = member_info

    # All projects in workspace
    projects_result = await db.execute(
        select(Project).where(Project.workspace_id == workspace.id)
    )
    projects = projects_result.scalars().all()
    project_ids = [p.id for p in projects]
    project_name_map = {p.id: p.name for p in projects}

    if not project_ids:
        return {
            "total_commits": 0, "commits_7d": 0,
            "open_prs": 0, "merged_prs": 0,
            "total_projects": 0, "synced_projects": 0,
            "top_contributors": [], "recent_commits": [], "pr_breakdown": [],
        }

    since_7d = datetime.now(timezone.utc) - timedelta(days=7)

    # Total commits
    total_commits = await db.scalar(
        select(func.count()).where(Commit.project_id.in_(project_ids))
    ) or 0

    # Commits last 7 days
    commits_7d = await db.scalar(
        select(func.count()).where(
            Commit.project_id.in_(project_ids),
            Commit.committed_at >= since_7d,
        )
    ) or 0

    # PR counts
    open_prs = await db.scalar(
        select(func.count()).where(
            PullRequest.project_id.in_(project_ids),
            PullRequest.state == "open",
        )
    ) or 0

    merged_prs = await db.scalar(
        select(func.count()).where(
            PullRequest.project_id.in_(project_ids),
            PullRequest.state == "merged",
        )
    ) or 0

    # Top contributors
    contrib_result = await db.execute(
        select(Commit.author_name, func.count().label("commits"))
        .where(Commit.project_id.in_(project_ids))
        .group_by(Commit.author_name)
        .order_by(func.count().desc())
        .limit(5)
    )
    top_contributors = [
        {"name": row.author_name, "commits": row.commits}
        for row in contrib_result.fetchall()
    ]

    # Recent commits
    ranked_commits = (
        select(
            Commit.id.label("id"),
            func.row_number()
            .over(
                partition_by=(Commit.project_id, Commit.sha),
                order_by=(Commit.committed_at.desc(), Commit.id.desc()),
            )
            .label("row_number"),
        )
        .where(Commit.project_id.in_(project_ids))
        .subquery()
    )
    recent_result = await db.execute(
        select(Commit)
        .join(ranked_commits, Commit.id == ranked_commits.c.id)
        .where(ranked_commits.c.row_number == 1)
        .order_by(Commit.committed_at.desc(), Commit.id.desc())
        .limit(8)
    )
    recent_commits = [
        {
            "id": str(c.id),
            "sha": c.sha[:7],
            "message": c.message.split("\n")[0][:80],
            "author": c.author_name,
            "committed_at": c.committed_at.isoformat(),
            "project_name": project_name_map.get(c.project_id, ""),
        }
        for c in recent_result.scalars().all()
    ]

    # PR breakdown
    pr_breakdown_result = await db.execute(
        select(PullRequest.state, func.count().label("count"))
        .where(PullRequest.project_id.in_(project_ids))
        .group_by(PullRequest.state)
    )
    pr_breakdown = [
        {"state": row.state, "count": row.count}
        for row in pr_breakdown_result.fetchall()
    ]

    synced_projects = sum(1 for p in projects if p.synced_at is not None)

    return {
        "total_commits": total_commits,
        "commits_7d": commits_7d,
        "open_prs": open_prs,
        "merged_prs": merged_prs,
        "total_projects": len(projects),
        "synced_projects": synced_projects,
        "top_contributors": top_contributors,
        "recent_commits": recent_commits,
        "pr_breakdown": pr_breakdown,
    }
