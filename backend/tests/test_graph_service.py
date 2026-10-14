import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.graph.service import GRAPH_WRITE_BATCH_SIZE, GraphConstructionService


@pytest.mark.asyncio
async def test_large_commit_graph_uses_bounded_batched_writes(monkeypatch):
    project_id = uuid.uuid4()
    project = SimpleNamespace(
        id=project_id,
        name="Large project",
        github_repo_full_name="owner/repo",
        created_at=datetime.now(timezone.utc),
    )
    commits = [
        SimpleNamespace(
            sha=f"{index:040x}",
            message=f"commit {index}",
            committed_at=datetime.now(timezone.utc),
            additions=1,
            deletions=0,
            project_id=project_id,
            author_email=f"developer{index}@example.com",
            author_name=f"Developer {index}",
            changed_files=None,
        )
        for index in range(GRAPH_WRITE_BATCH_SIZE + 1)
    ]

    def result_for(rows):
        return SimpleNamespace(
            scalar_one_or_none=lambda: rows[0] if rows else None,
            scalars=lambda: SimpleNamespace(all=lambda: rows),
        )

    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                result_for([project]),
                result_for(commits),
                result_for([]),
            ]
        )
    )
    run_query = AsyncMock(return_value=[])
    monkeypatch.setattr("app.graph.service.run_query", run_query)

    stats = await GraphConstructionService(db).build_project_graph(str(project_id))

    assert stats["commits"] == GRAPH_WRITE_BATCH_SIZE + 1
    assert stats["developers"] == GRAPH_WRITE_BATCH_SIZE + 1
    assert stats["relationships"] == 2 * (GRAPH_WRITE_BATCH_SIZE + 1) + 1

    batched_calls = [
        call for call in run_query.await_args_list
        if "UNWIND $rows AS row" in call.args[0]
    ]
    assert batched_calls
    assert all(
        0 < len(call.args[1]["rows"]) <= GRAPH_WRITE_BATCH_SIZE
        for call in batched_calls
    )
