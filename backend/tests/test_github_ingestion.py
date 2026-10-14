import asyncio
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.ingestion.github_ingestion import GitHubIngestionService
from app.models.engineering import Project


@pytest.mark.asyncio
async def test_commit_details_are_fetched_with_bounded_concurrency():
    active_requests = 0
    peak_requests = 0

    async def get_detail(repo_full_name: str, sha: str) -> dict:
        nonlocal active_requests, peak_requests
        assert repo_full_name == "owner/repo"
        active_requests += 1
        peak_requests = max(peak_requests, active_requests)
        await asyncio.sleep(0.01)
        active_requests -= 1
        return {"sha": sha}

    client = SimpleNamespace(get_commit_detail=AsyncMock(side_effect=get_detail))
    commits = [{"sha": str(index)} for index in range(25)]

    details = await GitHubIngestionService(None)._get_commit_details(
        client,
        "owner/repo",
        commits,
    )

    assert details == [{"sha": str(index)} for index in range(25)]
    assert 1 < peak_requests <= 10


@pytest.mark.asyncio
async def test_ingest_skips_duplicate_shas_in_github_response(monkeypatch):
    sha_one = "a" * 40
    sha_two = "b" * 40
    commit_time = datetime.now(timezone.utc).isoformat()
    raw_commits = [
        {
            "sha": sha_one,
            "commit": {
                "message": "first commit",
                "author": {"name": "Developer", "email": "dev@example.com", "date": commit_time},
            },
        },
        {
            "sha": sha_one,
            "commit": {
                "message": "duplicate commit",
                "author": {"name": "Developer", "email": "dev@example.com", "date": commit_time},
            },
        },
        {
            "sha": sha_two,
            "commit": {
                "message": "second commit",
                "author": {"name": "Developer", "email": "dev@example.com", "date": commit_time},
            },
        },
    ]
    client = SimpleNamespace(
        get_commits=AsyncMock(return_value=raw_commits),
        get_commit_detail=AsyncMock(return_value={"stats": {}, "files": []}),
        get_pull_requests=AsyncMock(return_value=[]),
        close=AsyncMock(),
    )
    monkeypatch.setattr(
        "app.ingestion.github_ingestion.GitHubClient",
        Mock(return_value=client),
    )

    db = SimpleNamespace(
        execute=AsyncMock(side_effect=[SimpleNamespace(fetchall=lambda: []), None]),
        flush=AsyncMock(),
        add=Mock(),
    )
    project = Project(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        name="Test project",
        github_repo_full_name="owner/repo",
    )

    summary = await GitHubIngestionService(db).ingest(project, "test-token")

    assert summary["commits"] == 2
    assert summary["skipped_commits"] == 1
    assert [call.args[0].sha for call in db.add.call_args_list] == [sha_one, sha_two]
    assert client.get_commit_detail.await_count == 2
    client.close.assert_awaited_once()
