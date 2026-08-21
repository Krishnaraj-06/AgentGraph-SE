import json
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.ingestion.github_client import GitHubClient
from app.models.engineering import Project, Commit, PullRequest
from app.models.workspace import Integration
from app.core.logging import get_logger

logger = get_logger(__name__)


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    return datetime.fromisoformat(val.replace("Z", "+00:00"))


class GitHubIngestionService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def ingest(self, project: Project, token: str) -> dict:
        """
        Full ingestion for a project's linked GitHub repo.
        Returns a summary of what was ingested.
        """
        repo_full_name = project.github_repo_full_name
        if not repo_full_name:
            raise ValueError("Project has no GitHub repo linked")

        client = GitHubClient(token)
        summary = {"commits": 0, "pull_requests": 0, "skipped_commits": 0}

        try:
            # ── Commits ────────────────────────────────────────────────────
            logger.info("Ingesting commits for %s", repo_full_name)
            since = project.synced_at  # incremental sync
            raw_commits = await client.get_commits(repo_full_name, since=since)

            existing_shas = set()
            if raw_commits:
                result = await self._db.execute(
                    select(Commit.sha).where(Commit.project_id == project.id)
                )
                existing_shas = {r[0] for r in result.fetchall()}

            for rc in raw_commits:
                sha = rc["sha"]
                if sha in existing_shas:
                    summary["skipped_commits"] += 1
                    continue

                # Fetch detail for file stats (only for recent commits to avoid rate limits)
                additions, deletions, changed_files = 0, 0, []
                if summary["commits"] < 100:
                    try:
                        detail = await client.get_commit_detail(repo_full_name, sha)
                        additions = detail.get("stats", {}).get("additions", 0)
                        deletions = detail.get("stats", {}).get("deletions", 0)
                        changed_files = [f["filename"] for f in detail.get("files", [])]
                    except Exception:
                        pass

                commit_data = rc.get("commit", {})
                author = commit_data.get("author", {})
                commit = Commit(
                    project_id=project.id,
                    sha=sha,
                    message=commit_data.get("message", "")[:5000],
                    author_name=author.get("name", "Unknown"),
                    author_email=author.get("email", ""),
                    branch=None,  # enriched separately if needed
                    committed_at=_parse_dt(author.get("date")) or datetime.now(timezone.utc),
                    additions=additions,
                    deletions=deletions,
                    changed_files=json.dumps(changed_files) if changed_files else None,
                )
                self._db.add(commit)
                summary["commits"] += 1

            # ── Pull Requests ───────────────────────────────────────────────
            logger.info("Ingesting PRs for %s", repo_full_name)
            raw_prs = await client.get_pull_requests(repo_full_name, state="all")

            existing_pr_numbers: set[int] = set()
            if raw_prs:
                result = await self._db.execute(
                    select(PullRequest.number).where(PullRequest.project_id == project.id)
                )
                existing_pr_numbers = {r[0] for r in result.fetchall()}

            for rp in raw_prs:
                number = rp["number"]
                state = rp.get("state", "open")
                if rp.get("merged_at"):
                    state = "merged"

                if number in existing_pr_numbers:
                    # Update state for existing PRs (they may have been merged/closed)
                    await self._db.execute(
                        update(PullRequest)
                        .where(PullRequest.project_id == project.id, PullRequest.number == number)
                        .values(
                            state=state,
                            merged_at=_parse_dt(rp.get("merged_at")),
                            updated_at=_parse_dt(rp.get("updated_at")) or datetime.now(timezone.utc),
                        )
                    )
                    continue

                reviews = []
                try:
                    reviews = await client.get_pr_reviews(repo_full_name, number)
                except Exception:
                    pass

                pr = PullRequest(
                    project_id=project.id,
                    number=number,
                    title=rp.get("title", "")[:500],
                    body=(rp.get("body") or "")[:5000],
                    state=state,
                    author=rp.get("user", {}).get("login", "unknown"),
                    base_branch=rp.get("base", {}).get("ref", ""),
                    head_branch=rp.get("head", {}).get("ref", ""),
                    created_at=_parse_dt(rp.get("created_at")) or datetime.now(timezone.utc),
                    updated_at=_parse_dt(rp.get("updated_at")) or datetime.now(timezone.utc),
                    merged_at=_parse_dt(rp.get("merged_at")),
                    review_count=len(reviews),
                )
                self._db.add(pr)
                summary["pull_requests"] += 1

            # ── Mark sync time ──────────────────────────────────────────────
            await self._db.execute(
                update(Project)
                .where(Project.id == project.id)
                .values(synced_at=datetime.now(timezone.utc))
            )
            await self._db.flush()
            logger.info("Ingestion complete for %s: %s", repo_full_name, summary)

        finally:
            await client.close()

        return summary
