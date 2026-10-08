"""
Graph construction service — builds Neo4j knowledge graph from Postgres data.
"""

import json
from datetime import datetime
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.neo4j import get_neo4j_driver, run_query
from app.models.engineering import Project, Commit, PullRequest
from app.graph.schema import CYPHER_TEMPLATES, NodeLabel, RelationType
from app.core.logging import get_logger

logger = get_logger(__name__)


class GraphConstructionService:
    """Builds and updates the Neo4j knowledge graph from relational data."""
    
    def __init__(self, db: AsyncSession):
        self._db = db

    async def get_project_graph(self, project_id: str) -> dict[str, Any]:
        """Return the persisted graph nodes and relationships for one project."""
        node_rows = await run_query(
            """
            MATCH (p:Project {id: $project_id})
            OPTIONAL MATCH (n)
            WHERE n.id = $project_id OR n.project_id = $project_id
            RETURN DISTINCT labels(n) AS labels,
                   properties(n) AS properties,
                   elementId(n) AS id
            """,
            {"project_id": project_id},
        )
        developer_rows = await run_query(
            """
            MATCH (d:Developer)-[]-(n)
            WHERE n.id = $project_id OR n.project_id = $project_id
            RETURN DISTINCT labels(d) AS labels,
                   properties(d) AS properties,
                   elementId(d) AS id
            """,
            {"project_id": project_id},
        )

        nodes_by_id: dict[str, dict[str, str]] = {}
        for row in [*node_rows, *developer_rows]:
            node_id = row["id"]
            if node_id is None:
                continue

            labels = row["labels"] or ["Node"]
            label = labels[0]
            properties = row["properties"] or {}
            title = next(
                (
                    str(properties[key])
                    for key in ("name", "message", "title", "path", "email", "sha")
                    if properties.get(key)
                ),
                label,
            )
            if label == "PullRequest" and not properties.get("title"):
                title = f"Pull request #{properties.get('number', '')}".strip()
            elif label == "Commit":
                title = title.splitlines()[0][:80]

            nodes_by_id[node_id] = {
                "id": node_id,
                "label": label,
                "title": title,
            }

        relationships = await run_query(
            """
            MATCH (source)-[r]->(target)
            WHERE elementId(source) IN $node_ids
              AND elementId(target) IN $node_ids
            RETURN elementId(source) AS source,
                   type(r) AS type,
                   elementId(target) AS target
            """,
            {"node_ids": list(nodes_by_id)},
        )
        return {
            "nodes": list(nodes_by_id.values()),
            "relationships": relationships,
        }

    async def build_project_graph(self, project_id: str) -> dict[str, int]:
        """
        Build complete graph for a project from Postgres data.
        Returns counts of nodes and relationships created.
        """
        logger.info("Building graph for project %s", project_id)
        
        # Load project
        result = await self._db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise ValueError(f"Project {project_id} not found")
        
        stats = {
            "projects": 0,
            "developers": 0,
            "commits": 0,
            "files": 0,
            "branches": 0,
            "pull_requests": 0,
            "relationships": 0,
        }
        
        # 1. Create project node
        await self._create_project_node(project)
        stats["projects"] = 1
        
        # 2. Load and process commits
        commits_result = await self._db.execute(
            select(Commit).where(Commit.project_id == project_id)
        )
        commits = commits_result.scalars().all()
        
        developers_seen = set()
        files_seen = set()
        
        for commit in commits:
            # Create commit node
            await self._create_commit_node(commit)
            stats["commits"] += 1
            
            # Create developer node (if new)
            dev_key = commit.author_email
            if dev_key not in developers_seen:
                await self._create_developer_node(
                    email=commit.author_email,
                    name=commit.author_name,
                )
                developers_seen.add(dev_key)
                stats["developers"] += 1
            
            # Link developer -> commit
            await self._link_developer_authored_commit(
                email=commit.author_email,
                sha=commit.sha,
                timestamp=commit.committed_at,
            )
            stats["relationships"] += 1
            
            # Link commit -> project
            await self._link_commit_to_project(commit.sha, str(project.id))
            stats["relationships"] += 1
            
            # Process changed files
            if commit.changed_files:
                try:
                    file_paths = json.loads(commit.changed_files)
                    for path in file_paths:
                        file_key = (path, str(project.id))
                        if file_key not in files_seen:
                            await self._create_file_node(path, str(project.id))
                            files_seen.add(file_key)
                            stats["files"] += 1
                        
                        # Link commit -> file
                        await self._link_commit_modified_file(
                            sha=commit.sha,
                            path=path,
                            project_id=str(project.id),
                        )
                        stats["relationships"] += 1
                except json.JSONDecodeError:
                    pass
        
        # 3. Load and process pull requests
        prs_result = await self._db.execute(
            select(PullRequest).where(PullRequest.project_id == project_id)
        )
        prs = prs_result.scalars().all()
        
        branches_seen = set()
        
        for pr in prs:
            # Create PR node
            await self._create_pull_request_node(pr)
            stats["pull_requests"] += 1
            
            # Create author developer node (if new)
            # Note: PR author is GitHub username, not email — we'll use a synthetic email
            author_email = f"{pr.author}@github.local"
            if author_email not in developers_seen:
                await self._create_developer_node(
                    email=author_email,
                    name=pr.author,
                )
                developers_seen.add(author_email)
                stats["developers"] += 1
            
            # Link developer -> PR
            await self._link_developer_created_pr(
                author_email=author_email,
                pr_number=pr.number,
                project_id=str(project.id),
                timestamp=pr.created_at,
            )
            stats["relationships"] += 1
            
            # Link PR -> project
            await self._link_pr_to_project(pr.number, str(project.id))
            stats["relationships"] += 1
            
            # Create branch nodes
            for branch_name in [pr.base_branch, pr.head_branch]:
                if branch_name:
                    branch_key = (branch_name, str(project.id))
                    if branch_key not in branches_seen:
                        await self._create_branch_node(branch_name, str(project.id))
                        branches_seen.add(branch_key)
                        stats["branches"] += 1
            
            # Link PR -> branches
            if pr.base_branch and pr.head_branch:
                await self._link_pr_to_branches(
                    pr_number=pr.number,
                    project_id=str(project.id),
                    base_branch=pr.base_branch,
                    head_branch=pr.head_branch,
                )
                stats["relationships"] += 2  # two edges
        
        # 4. Create collaboration edges between developers who worked on same files
        await self._create_collaboration_edges(commits, str(project.id))
        stats["relationships"] += 1  # approximate — actual count varies
        
        logger.info("Graph construction complete for project %s: %s", project_id, stats)
        return stats
    
    async def _create_project_node(self, project: Project):
        await run_query(
            CYPHER_TEMPLATES["create_project"],
            {
                "project_id": str(project.id),
                "name": project.name,
                "github_repo": project.github_repo_full_name or "",
                "created_at": project.created_at.isoformat(),
            },
        )
    
    async def _create_developer_node(self, email: str, name: str):
        await run_query(
            CYPHER_TEMPLATES["create_developer"],
            {"email": email, "name": name},
        )
    
    async def _create_commit_node(self, commit: Commit):
        await run_query(
            CYPHER_TEMPLATES["create_commit"],
            {
                "sha": commit.sha,
                "message": commit.message[:500],  # truncate for graph storage
                "committed_at": commit.committed_at.isoformat(),
                "additions": commit.additions,
                "deletions": commit.deletions,
                "project_id": str(commit.project_id),
            },
        )
    
    async def _create_file_node(self, path: str, project_id: str):
        await run_query(
            CYPHER_TEMPLATES["create_file"],
            {"path": path, "project_id": project_id},
        )
    
    async def _create_branch_node(self, name: str, project_id: str):
        await run_query(
            CYPHER_TEMPLATES["create_branch"],
            {"name": name, "project_id": project_id},
        )
    
    async def _create_pull_request_node(self, pr: PullRequest):
        await run_query(
            CYPHER_TEMPLATES["create_pull_request"],
            {
                "number": pr.number,
                "project_id": str(pr.project_id),
                "title": pr.title,
                "state": pr.state,
                "created_at": pr.created_at.isoformat(),
                "merged_at": pr.merged_at.isoformat() if pr.merged_at else None,
            },
        )
    
    async def _link_commit_to_project(self, sha: str, project_id: str):
        await run_query(
            CYPHER_TEMPLATES["link_commit_to_project"],
            {"sha": sha, "project_id": project_id},
        )
    
    async def _link_developer_authored_commit(self, email: str, sha: str, timestamp: datetime):
        await run_query(
            CYPHER_TEMPLATES["link_developer_authored_commit"],
            {"email": email, "sha": sha, "timestamp": timestamp.isoformat()},
        )
    
    async def _link_commit_modified_file(self, sha: str, path: str, project_id: str):
        await run_query(
            CYPHER_TEMPLATES["link_commit_modified_file"],
            {"sha": sha, "path": path, "project_id": project_id},
        )
    
    async def _link_developer_created_pr(
        self, author_email: str, pr_number: int, project_id: str, timestamp: datetime
    ):
        await run_query(
            CYPHER_TEMPLATES["link_developer_created_pr"],
            {
                "author_email": author_email,
                "pr_number": pr_number,
                "project_id": project_id,
                "timestamp": timestamp.isoformat(),
            },
        )
    
    async def _link_pr_to_project(self, pr_number: int, project_id: str):
        await run_query(
            CYPHER_TEMPLATES["link_pr_to_project"],
            {"pr_number": pr_number, "project_id": project_id},
        )
    
    async def _link_pr_to_branches(
        self, pr_number: int, project_id: str, base_branch: str, head_branch: str
    ):
        await run_query(
            CYPHER_TEMPLATES["link_pr_to_branches"],
            {
                "pr_number": pr_number,
                "project_id": project_id,
                "base_branch": base_branch,
                "head_branch": head_branch,
            },
        )
    
    async def _create_collaboration_edges(self, commits: list[Commit], project_id: str):
        """
        Create WORKED_WITH edges between developers who modified the same files.
        """
        # Build file -> developers map
        file_to_devs: dict[str, set[str]] = {}
        
        for commit in commits:
            if not commit.changed_files:
                continue
            try:
                file_paths = json.loads(commit.changed_files)
                for path in file_paths:
                    if path not in file_to_devs:
                        file_to_devs[path] = set()
                    file_to_devs[path].add(commit.author_email)
            except json.JSONDecodeError:
                pass
        
        # Create edges for each pair of developers who worked on same file
        collaborations = set()
        for path, devs in file_to_devs.items():
            dev_list = list(devs)
            for i, dev1 in enumerate(dev_list):
                for dev2 in dev_list[i + 1:]:
                    pair = tuple(sorted([dev1, dev2]))
                    collaborations.add(pair)
        
        for dev1_email, dev2_email in collaborations:
            await run_query(
                CYPHER_TEMPLATES["create_collaboration_edge"],
                {
                    "dev1_email": dev1_email,
                    "dev2_email": dev2_email,
                    "timestamp": datetime.now().isoformat(),
                },
            )
    
    async def delete_project_graph(self, project_id: str):
        """
        Delete all graph nodes and relationships for a project.
        """
        logger.info("Deleting graph for project %s", project_id)
        
        # Delete all nodes belonging to project (relationships cascade)
        await run_query(
            """
            MATCH (n)
            WHERE n.project_id = $project_id OR n.id = $project_id
            DETACH DELETE n
            """,
            {"project_id": project_id},
        )
        
        logger.info("Graph deleted for project %s", project_id)
    
    async def rebuild_project_graph(self, project_id: str) -> dict[str, int]:
        """
        Delete existing graph and rebuild from scratch.
        """
        await self.delete_project_graph(project_id)
        return await self.build_project_graph(project_id)
