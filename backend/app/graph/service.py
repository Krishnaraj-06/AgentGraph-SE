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

GRAPH_WRITE_BATCH_SIZE = 500


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
        
        # 2. Load and process commits in bounded Neo4j writes.
        commits_result = await self._db.execute(
            select(Commit).where(Commit.project_id == project_id)
        )
        commits = commits_result.scalars().all()

        developers_seen = set()
        files_seen = set()
        project_id_str = str(project.id)
        for offset in range(0, len(commits), GRAPH_WRITE_BATCH_SIZE):
            commit_batch = commits[offset:offset + GRAPH_WRITE_BATCH_SIZE]
            commit_nodes = []
            developer_nodes = {}
            file_nodes = {}
            authored_edges = []
            project_edges = []
            file_edges = []

            for commit in commit_batch:
                commit_nodes.append(
                    {
                        "sha": commit.sha,
                        "message": commit.message[:500],
                        "committed_at": commit.committed_at.isoformat(),
                        "additions": commit.additions,
                        "deletions": commit.deletions,
                        "project_id": project_id_str,
                    }
                )
                authored_edges.append(
                    {
                        "email": commit.author_email,
                        "sha": commit.sha,
                        "timestamp": commit.committed_at.isoformat(),
                    }
                )
                project_edges.append({"sha": commit.sha, "project_id": project_id_str})
                stats["commits"] += 1
                stats["relationships"] += 2

                if commit.author_email not in developers_seen:
                    developers_seen.add(commit.author_email)
                    developer_nodes[commit.author_email] = {
                        "email": commit.author_email,
                        "name": commit.author_name,
                    }
                    stats["developers"] += 1

                if not commit.changed_files:
                    continue
                try:
                    file_paths = json.loads(commit.changed_files)
                except json.JSONDecodeError:
                    continue
                if not isinstance(file_paths, list):
                    continue

                for path in file_paths:
                    if not isinstance(path, str):
                        continue
                    file_key = (path, project_id_str)
                    if file_key not in files_seen:
                        files_seen.add(file_key)
                        file_nodes[file_key] = {
                            "path": path,
                            "project_id": project_id_str,
                        }
                        stats["files"] += 1
                    file_edges.append(
                        {
                            "sha": commit.sha,
                            "path": path,
                            "project_id": project_id_str,
                        }
                    )
                    stats["relationships"] += 1

            await self._run_batched(
                """
                UNWIND $rows AS row
                MERGE (c:Commit {sha: row.sha})
                SET c.message = row.message,
                    c.committed_at = datetime(row.committed_at),
                    c.additions = row.additions,
                    c.deletions = row.deletions,
                    c.project_id = row.project_id,
                    c.updated_at = datetime()
                """,
                commit_nodes,
            )
            await self._run_batched(
                """
                UNWIND $rows AS row
                MERGE (d:Developer {email: row.email})
                SET d.name = row.name, d.updated_at = datetime()
                """,
                list(developer_nodes.values()),
            )
            await self._run_batched(
                """
                UNWIND $rows AS row
                MERGE (f:File {path: row.path, project_id: row.project_id})
                SET f.updated_at = datetime()
                """,
                list(file_nodes.values()),
            )
            await self._run_batched(
                """
                UNWIND $rows AS row
                MATCH (d:Developer {email: row.email})
                MATCH (c:Commit {sha: row.sha})
                MERGE (d)-[:AUTHORED {timestamp: datetime(row.timestamp)}]->(c)
                """,
                authored_edges,
            )
            await self._run_batched(
                """
                UNWIND $rows AS row
                MATCH (c:Commit {sha: row.sha})
                MATCH (p:Project {id: row.project_id})
                MERGE (c)-[:BELONGS_TO]->(p)
                """,
                project_edges,
            )
            await self._run_batched(
                """
                UNWIND $rows AS row
                MATCH (c:Commit {sha: row.sha})
                MATCH (f:File {path: row.path, project_id: row.project_id})
                MERGE (c)-[:MODIFIED]->(f)
                """,
                file_edges,
            )

        # 3. Load and process pull requests in bounded Neo4j writes.
        prs_result = await self._db.execute(
            select(PullRequest).where(PullRequest.project_id == project_id)
        )
        prs = prs_result.scalars().all()

        branches_seen = set()
        for offset in range(0, len(prs), GRAPH_WRITE_BATCH_SIZE):
            pr_batch = prs[offset:offset + GRAPH_WRITE_BATCH_SIZE]
            pr_nodes = []
            pr_developers = {}
            branch_nodes = {}
            created_pr_edges = []
            project_pr_edges = []
            branch_edges = []

            for pr in pr_batch:
                pr_nodes.append(
                    {
                        "number": pr.number,
                        "project_id": project_id_str,
                        "title": pr.title,
                        "state": pr.state,
                        "created_at": pr.created_at.isoformat(),
                        "merged_at": pr.merged_at.isoformat() if pr.merged_at else None,
                    }
                )
                author_email = f"{pr.author}@github.local"
                if author_email not in developers_seen:
                    developers_seen.add(author_email)
                    pr_developers[author_email] = {
                        "email": author_email,
                        "name": pr.author,
                    }
                    stats["developers"] += 1

                created_pr_edges.append(
                    {
                        "author_email": author_email,
                        "number": pr.number,
                        "project_id": project_id_str,
                        "timestamp": pr.created_at.isoformat(),
                    }
                )
                project_pr_edges.append(
                    {"number": pr.number, "project_id": project_id_str}
                )
                stats["pull_requests"] += 1
                stats["relationships"] += 2

                for branch_name in [pr.base_branch, pr.head_branch]:
                    if branch_name:
                        branch_key = (branch_name, project_id_str)
                        if branch_key not in branches_seen:
                            branches_seen.add(branch_key)
                            branch_nodes[branch_key] = {
                                "name": branch_name,
                                "project_id": project_id_str,
                            }
                            stats["branches"] += 1

                if pr.base_branch and pr.head_branch:
                    branch_edges.append(
                        {
                            "number": pr.number,
                            "project_id": project_id_str,
                            "base_branch": pr.base_branch,
                            "head_branch": pr.head_branch,
                        }
                    )
                    stats["relationships"] += 2

            await self._run_batched(
                """
                UNWIND $rows AS row
                MERGE (pr:PullRequest {number: row.number, project_id: row.project_id})
                SET pr.title = row.title,
                    pr.state = row.state,
                    pr.created_at = datetime(row.created_at),
                    pr.merged_at = CASE
                        WHEN row.merged_at IS NOT NULL THEN datetime(row.merged_at)
                        ELSE null
                    END,
                    pr.updated_at = datetime()
                """,
                pr_nodes,
            )
            await self._run_batched(
                """
                UNWIND $rows AS row
                MERGE (d:Developer {email: row.email})
                SET d.name = row.name, d.updated_at = datetime()
                """,
                list(pr_developers.values()),
            )
            await self._run_batched(
                """
                UNWIND $rows AS row
                MERGE (b:Branch {name: row.name, project_id: row.project_id})
                SET b.updated_at = datetime()
                """,
                list(branch_nodes.values()),
            )
            await self._run_batched(
                """
                UNWIND $rows AS row
                MATCH (d:Developer {email: row.author_email})
                MATCH (pr:PullRequest {number: row.number, project_id: row.project_id})
                MERGE (d)-[:CREATED_PR {timestamp: datetime(row.timestamp)}]->(pr)
                """,
                created_pr_edges,
            )
            await self._run_batched(
                """
                UNWIND $rows AS row
                MATCH (pr:PullRequest {number: row.number, project_id: row.project_id})
                MATCH (p:Project {id: row.project_id})
                MERGE (pr)-[:BELONGS_TO]->(p)
                """,
                project_pr_edges,
            )
            await self._run_batched(
                """
                UNWIND $rows AS row
                MATCH (pr:PullRequest {number: row.number, project_id: row.project_id})
                MATCH (base:Branch {name: row.base_branch, project_id: row.project_id})
                MATCH (head:Branch {name: row.head_branch, project_id: row.project_id})
                MERGE (pr)-[:TARGETS_BRANCH]->(base)
                MERGE (pr)-[:FROM_BRANCH]->(head)
                """,
                branch_edges,
            )

        # 4. Create collaboration edges between developers who worked on same files.
        await self._create_collaboration_edges(commits, str(project.id))
        stats["relationships"] += 1  # approximate — actual count varies
        
        logger.info("Graph construction complete for project %s: %s", project_id, stats)
        return stats

    async def _run_batched(
        self,
        cypher: str,
        rows: list[dict[str, Any]],
    ) -> None:
        for offset in range(0, len(rows), GRAPH_WRITE_BATCH_SIZE):
            await run_query(
                cypher,
                {"rows": rows[offset:offset + GRAPH_WRITE_BATCH_SIZE]},
            )
    
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
        
        collaboration_rows = [
            {
                "dev1_email": dev1_email,
                "dev2_email": dev2_email,
                "timestamp": datetime.now().isoformat(),
            }
            for dev1_email, dev2_email in collaborations
        ]
        await self._run_batched(
            """
            UNWIND $rows AS row
            MATCH (d1:Developer {email: row.dev1_email})
            MATCH (d2:Developer {email: row.dev2_email})
            WHERE d1 <> d2
            MERGE (d1)-[w:WORKED_WITH]-(d2)
            ON CREATE SET w.count = 1, w.first_interaction = datetime(row.timestamp)
            ON MATCH SET w.count = w.count + 1,
                         w.last_interaction = datetime(row.timestamp)
            """,
            collaboration_rows,
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
