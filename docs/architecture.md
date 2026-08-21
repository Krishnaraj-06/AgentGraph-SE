# Architecture Decision Records

## ADR-001: Provider-Agnostic LLM Abstraction

**Decision:** All LLM calls go through `BaseLLMProvider` in `app/core/llm.py`.

**Rationale:** The research goal requires comparing OpenAI, Anthropic, Bedrock, and Ollama.
No agent or service imports a provider SDK directly. Switching providers requires only
changing `LLM_PROVIDER` in `.env`.

---

## ADR-002: Three-Database Architecture

**Decision:** PostgreSQL + Neo4j + Qdrant, each with a distinct responsibility.

| Store | Responsibility |
|---|---|
| PostgreSQL | Normalized structured data — users, workspaces, projects, commits, PRs, Jira issues |
| Neo4j | Engineering relationships — the Knowledge Graph |
| Qdrant | Semantic embeddings — RAG retrieval over commit messages, PR descriptions, issue text |

**Rationale:** Each store is used for what it is best at. The graph enables relationship
traversal that SQL cannot express efficiently. Vectors enable semantic search that neither
SQL nor graph can provide.

---

## ADR-003: Workspace-Based Multi-Tenancy

**Decision:** All data is scoped to a `Workspace`. Users belong to workspaces via
`WorkspaceMember`. The MVP supports one workspace per deployment but the schema is
multi-tenant-ready.

---

## ADR-004: Next.js App Router

**Decision:** Use Next.js 15 App Router with route groups `(auth)` and `(dashboard)`.

**Rationale:** Server components for layout, client components only where interactivity
is required. Clean separation of auth and dashboard flows.

---

## ADR-005: Agent Architecture (Planned)

Three specialized agents coordinated by an orchestrator:

- `RepositoryAgent` — GitHub-side reasoning (commits, PRs, reviews, contributors)
- `SprintAgent` — Jira-side reasoning (tasks, sprints, priorities, blockers)
- `RiskReasoningAgent` — Cross-source synthesis (risk, impact, recommendations)

Agents will be implemented using LangGraph. Each agent has access to:
- PostgreSQL tools (structured queries)
- Neo4j tools (graph traversal)
- Qdrant tools (semantic retrieval)
