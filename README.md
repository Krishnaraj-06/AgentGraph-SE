# AgentGraph-SE

**A Multi-Agent Knowledge Graph Framework for AI-Driven Software Engineering Intelligence**

---

## Overview

AgentGraph-SE is an AI-powered Software Engineering Intelligence Platform that connects GitHub and Jira to create a unified understanding of a software project's engineering lifecycle.

It uses an Engineering Knowledge Graph, Multi-Agent AI reasoning, and Retrieval-Augmented Generation to provide explainable, evidence-based engineering insights.

---

## Architecture

```
GitHub + Jira
     ↓
Data Ingestion & Normalization
     ↓
PostgreSQL (structured) + Neo4j (graph) + Qdrant (vectors)
     ↓
Multi-Agent AI (Repository Agent, Sprint Agent, Risk Agent)
     ↓
AI Copilot + Intelligence Dashboard
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, Tailwind CSS, Framer Motion |
| Backend | Python 3.12, FastAPI, SQLAlchemy async |
| Structured DB | PostgreSQL 16 |
| Knowledge Graph | Neo4j 5 |
| Vector DB | Qdrant |
| Cache | Redis 7 |
| LLM (primary) | OpenAI GPT-4o (provider-agnostic) |
| Agent Orchestration | LangGraph (planned) |
| Deployment | Docker / Docker Compose / AWS |

---

## Getting Started

### Prerequisites

- Docker Desktop
- Node.js 20+
- Python 3.12+

### 1. Clone and configure

```bash
git clone <repo>
cd AgentGraph-SE
cp .env.example .env
# Edit .env — set SECRET_KEY, POSTGRES_PASSWORD, NEO4J_PASSWORD, OPENAI_API_KEY
```

### 2. Start all services

```bash
docker compose up -d
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs (development only)
- Neo4j Browser: http://localhost:7474
- Qdrant Dashboard: http://localhost:6333/dashboard

### 3. Local backend development (without Docker)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload
```

### 4. Local frontend development

```bash
cd frontend
npm install
npm run dev
```

---

## Project Structure

```
AgentGraph-SE/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # REST endpoints
│   │   ├── core/               # Config, security, LLM abstraction
│   │   ├── db/                 # PostgreSQL, Neo4j, Qdrant clients
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── agents/             # Multi-agent system (planned)
│   │   ├── graph/              # Knowledge graph operations (planned)
│   │   └── ingestion/          # GitHub/Jira ingestion (planned)
│   └── tests/
├── frontend/
│   └── src/
│       ├── app/                # Next.js App Router pages
│       ├── components/         # UI components
│       ├── lib/                # API client, store, utilities
│       └── types/              # TypeScript types
├── infra/
│   ├── nginx/
│   └── postgres/
├── docs/
├── docker-compose.yml
└── .env.example
```

---

## LLM Provider Configuration

Switch providers by setting `LLM_PROVIDER` in `.env`:

| Value | Provider |
|---|---|
| `openai` | OpenAI GPT-4o (default) |
| `anthropic` | Anthropic Claude |
| `ollama` | Local Ollama |
| `bedrock` | AWS Bedrock |

---

## Roadmap

- [x] Project scaffold — all services running
- [ ] GitHub ingestion pipeline
- [ ] Jira ingestion pipeline
- [ ] Knowledge Graph construction
- [ ] Vector embedding pipeline
- [ ] Repository Agent
- [ ] Sprint/Project Agent
- [ ] Risk & Reasoning Agent
- [ ] AI Copilot (live)
- [ ] Engineering Timeline
- [ ] Dependency Impact Analysis
- [ ] What-If Analysis
