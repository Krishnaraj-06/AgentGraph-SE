"""
Neo4j graph schema definitions and node/relationship types.
"""

from enum import Enum


class NodeLabel(str, Enum):
    """Node types in the knowledge graph."""
    DEVELOPER = "Developer"
    COMMIT = "Commit"
    PULL_REQUEST = "PullRequest"
    FILE = "File"
    PROJECT = "Project"
    BRANCH = "Branch"


class RelationType(str, Enum):
    """Relationship types in the knowledge graph."""
    AUTHORED = "AUTHORED"
    MODIFIED = "MODIFIED"
    REVIEWED = "REVIEWED"
    CREATED_PR = "CREATED_PR"
    MERGED_PR = "MERGED_PR"
    BELONGS_TO = "BELONGS_TO"
    TARGETS_BRANCH = "TARGETS_BRANCH"
    FROM_BRANCH = "FROM_BRANCH"
    INCLUDES_COMMIT = "INCLUDES_COMMIT"
    CHANGED_IN = "CHANGED_IN"
    WORKED_WITH = "WORKED_WITH"  # Developer collaboration


# Cypher query templates
CYPHER_TEMPLATES = {
    "create_project": """
        MERGE (p:Project {id: $project_id})
        SET p.name = $name,
            p.github_repo = $github_repo,
            p.created_at = datetime($created_at),
            p.updated_at = datetime()
        RETURN p
    """,
    
    "create_developer": """
        MERGE (d:Developer {email: $email})
        SET d.name = $name,
            d.updated_at = datetime()
        RETURN d
    """,
    
    "create_commit": """
        MERGE (c:Commit {sha: $sha})
        SET c.message = $message,
            c.committed_at = datetime($committed_at),
            c.additions = $additions,
            c.deletions = $deletions,
            c.project_id = $project_id,
            c.updated_at = datetime()
        RETURN c
    """,
    
    "create_file": """
        MERGE (f:File {path: $path, project_id: $project_id})
        SET f.updated_at = datetime()
        RETURN f
    """,
    
    "create_branch": """
        MERGE (b:Branch {name: $name, project_id: $project_id})
        SET b.updated_at = datetime()
        RETURN b
    """,
    
    "create_pull_request": """
        MERGE (pr:PullRequest {number: $number, project_id: $project_id})
        SET pr.title = $title,
            pr.state = $state,
            pr.created_at = datetime($created_at),
            pr.merged_at = CASE WHEN $merged_at IS NOT NULL THEN datetime($merged_at) ELSE null END,
            pr.updated_at = datetime()
        RETURN pr
    """,
    
    "link_commit_to_project": """
        MATCH (c:Commit {sha: $sha})
        MATCH (p:Project {id: $project_id})
        MERGE (c)-[:BELONGS_TO]->(p)
    """,
    
    "link_developer_authored_commit": """
        MATCH (d:Developer {email: $email})
        MATCH (c:Commit {sha: $sha})
        MERGE (d)-[:AUTHORED {timestamp: datetime($timestamp)}]->(c)
    """,
    
    "link_commit_modified_file": """
        MATCH (c:Commit {sha: $sha})
        MATCH (f:File {path: $path, project_id: $project_id})
        MERGE (c)-[:MODIFIED]->(f)
    """,
    
    "link_developer_created_pr": """
        MATCH (d:Developer {email: $author_email})
        MATCH (pr:PullRequest {number: $pr_number, project_id: $project_id})
        MERGE (d)-[:CREATED_PR {timestamp: datetime($timestamp)}]->(pr)
    """,
    
    "link_pr_to_branches": """
        MATCH (pr:PullRequest {number: $pr_number, project_id: $project_id})
        MATCH (base:Branch {name: $base_branch, project_id: $project_id})
        MATCH (head:Branch {name: $head_branch, project_id: $project_id})
        MERGE (pr)-[:TARGETS_BRANCH]->(base)
        MERGE (pr)-[:FROM_BRANCH]->(head)
    """,
    
    "link_pr_to_project": """
        MATCH (pr:PullRequest {number: $pr_number, project_id: $project_id})
        MATCH (p:Project {id: $project_id})
        MERGE (pr)-[:BELONGS_TO]->(p)
    """,
    
    "create_collaboration_edge": """
        MATCH (d1:Developer {email: $dev1_email})
        MATCH (d2:Developer {email: $dev2_email})
        WHERE d1 <> d2
        MERGE (d1)-[w:WORKED_WITH]-(d2)
        ON CREATE SET w.count = 1, w.first_interaction = datetime($timestamp)
        ON MATCH SET w.count = w.count + 1, w.last_interaction = datetime($timestamp)
    """,
}
