import asyncio
from datetime import datetime, timezone
from typing import Any
import httpx
from app.core.logging import get_logger

logger = get_logger(__name__)

GITHUB_API = "https://api.github.com"
HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


class GitHubClient:
    def __init__(self, token: str):
        self._token = token
        self._http = httpx.AsyncClient(
            base_url=GITHUB_API,
            headers={**HEADERS, "Authorization": f"Bearer {token}"},
            timeout=30,
        )

    async def close(self):
        await self._http.aclose()

    async def _get(self, path: str, params: dict | None = None) -> Any:
        r = await self._http.get(path, params=params)
        if r.status_code == 401:
            raise ValueError("Invalid GitHub token")
        if r.status_code == 403:
            reset = r.headers.get("X-RateLimit-Reset")
            raise ValueError(f"GitHub rate limit exceeded. Resets at {reset}")
        if r.status_code == 404:
            raise ValueError(f"Repository not found: {path}")
        if r.status_code == 409:
            # Empty repository — no commits yet
            return []
        r.raise_for_status()
        return r.json()

    async def _get_paginated(self, path: str, params: dict | None = None, max_pages: int = 10) -> list:
        results = []
        p = {**(params or {}), "per_page": 100, "page": 1}
        for _ in range(max_pages):
            data = await self._get(path, params=p)
            if not data:
                break
            results.extend(data)
            if len(data) < 100:
                break
            p["page"] += 1
            await asyncio.sleep(0.1)  # be polite to GitHub API
        return results

    async def get_authenticated_user(self) -> dict:
        return await self._get("/user")

    async def list_repos(self) -> list[dict]:
        """List all repos accessible to the token (user + org)."""
        return await self._get_paginated("/user/repos", {"type": "all", "sort": "updated"})

    async def get_repo(self, full_name: str) -> dict:
        return await self._get(f"/repos/{full_name}")

    async def get_commits(self, full_name: str, branch: str = "HEAD", since: datetime | None = None) -> list[dict]:
        params: dict = {"sha": branch, "per_page": 100}
        if since:
            params["since"] = since.isoformat()
        return await self._get_paginated(f"/repos/{full_name}/commits", params)

    async def get_commit_detail(self, full_name: str, sha: str) -> dict:
        return await self._get(f"/repos/{full_name}/commits/{sha}")

    async def get_pull_requests(self, full_name: str, state: str = "all") -> list[dict]:
        return await self._get_paginated(f"/repos/{full_name}/pulls", {"state": state, "sort": "updated"})

    async def get_pr_reviews(self, full_name: str, pr_number: int) -> list[dict]:
        return await self._get(f"/repos/{full_name}/pulls/{pr_number}/reviews")

    async def get_branches(self, full_name: str) -> list[dict]:
        return await self._get_paginated(f"/repos/{full_name}/branches")

    async def get_contributors(self, full_name: str) -> list[dict]:
        return await self._get_paginated(f"/repos/{full_name}/contributors")

    async def get_releases(self, full_name: str) -> list[dict]:
        return await self._get_paginated(f"/repos/{full_name}/releases")
