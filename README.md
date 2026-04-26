# Graph Knowledge Store

A personal knowledge base web application. Write markdown articles, automatically extract topics/keywords/entities using LLMs, store embeddings in Postgres with Pgvector, build a knowledge graph in Neo4j, and discover related articles through semantic similarity, graph traversal, or hybrid ranking.

## Prerequisites

- **Python 3.13+**
- **Node.js 22+** and npm
- **Docker** (for Postgres + Pgvector and Neo4j)
- **Ollama** running locally with chat and embedding models pulled
- **uv** (Python package manager)

## Quick Start

### 1. Clone and configure

```bash
cp .env.example .env
```

Edit `.env` if needed. Defaults assume Ollama on `localhost:11434` with models `gemma4:e4b-it-q8_0` (chat) and `qwen3-embedding:0.6b` (embeddings).

### 2. Start databases

```bash
docker compose build postgres   # Build Postgres image with pgvector (once)
docker compose up -d
```

This starts:
- **Postgres 16.9 with Pgvector** on `localhost:5432`
- **Neo4j 2025.11.2** on `localhost:7474` (browser) and `localhost:7687` (bolt)

### 3. Setup backend

```bash
# Install Python dependencies
uv sync

# Run database migrations
uv run alembic upgrade head
```

### 4. Setup frontend

```bash
cd frontend
npm install
```

### 5. Start the application

Open two terminals:

```bash
# Terminal 1 — Backend (from project root)
uv run uvicorn app.main:app --reload

# Terminal 2 — Frontend (from project root)
cd frontend && npm run dev
```

Open **http://localhost:5173** in your browser.

### 6. Verify everything works

```bash
curl http://localhost:8000/api/health
# {"status":"ok"}
```

## Switching LLM Providers

The entire LLM configuration is in `.env`. To switch from Ollama to OpenAI or any OpenAI-compatible API:

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_CHAT_MODEL=gpt-4o-mini
LLM_EMBEDDING_MODEL=text-embedding-3-small
LLM_EMBEDDING_DIMENSIONS=1536
```

**No code changes required.** The app uses the `openai` Python SDK with a custom `base_url`.

## Project Structure

```
graph-knowledge-store/
├── app/                        # FastAPI backend
│   ├── main.py                 # App entrypoint, CORS, lifespan
│   ├── config.py               # Settings from .env (pydantic-settings)
│   ├── database.py             # Async SQLAlchemy engine
│   ├── api/                    # REST endpoints
│   ├── models/                 # SQLAlchemy ORM models
│   ├── schemas/                # Pydantic request/response schemas
│   ├── services/               # Business logic layer
│   └── graph/                  # Neo4j client
├── frontend/                   # React + TypeScript frontend
│   └── src/
│       ├── api/                # HTTP client
│       ├── components/         # UI components (MUI)
│       ├── pages/              # Route pages
│       │   └── LLMDashboardPage.tsx  # LLM monitoring dashboard
│       └── theme.ts            # Material Design theme (light + dark)
├── docker/                       # Dockerfiles
│   └── postgres.Dockerfile       # Postgres + pgvector (cross-platform)
├── scripts/                    # Backup, restore, rebuild utilities
│   ├── backup.sh               # Postgres backup with compression
│   ├── restore.sh              # Interactive database restore
│   └── rebuild_graph.py        # Rebuild Neo4j from Postgres
├── alembic/                    # Database migrations
├── docs/                       # Documentation
├── docker-compose.yml          # Postgres + Neo4j
├── Makefile                    # backup, restore, rebuild-graph targets
├── .env.example                # Configuration template
└── PLAN.md                     # Implementation plan
```

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/articles` | Create article (title auto-generated if omitted) |
| `GET` | `/api/articles` | List articles (paginated, filterable by `?topic=` or `?keyword=`) |
| `GET` | `/api/articles/index` | Lightweight article index for client-side search |
| `GET` | `/api/articles/{id}` | Get article |
| `PUT` | `/api/articles/{id}` | Update article |
| `DELETE` | `/api/articles/{id}` | Delete article |
| `GET` | `/api/search?q=...&mode=semantic\|hybrid` | Search articles |
| `GET` | `/api/graph/full` | Full knowledge graph |
| `GET` | `/api/graph/article/{id}/neighbors` | Related articles via graph |
| `GET` | `/api/graph/article/{id}/subgraph` | Subgraph for visualization |
| `GET` | `/api/graph/stats` | Graph statistics |
| `POST` | `/api/quiz/generate` | Generate quiz from filtered articles |
| `GET` | `/api/llm-logs/stats` | LLM call aggregate stats |
| `GET` | `/api/llm-logs` | Paginated LLM call log |
| `GET` | `/api/health` | Health check |

## Features

- **Markdown editor** with live preview, LaTeX math rendering (KaTeX), and table support
- **Auto-generated titles** via LLM when title is omitted
- **LLM enrichment** — automatic topic, keyword, entity extraction, and summary generation
- **Semantic search** — vector similarity search with instant type-ahead via fuse.js
- **Hybrid search** — combines vector similarity with graph-based relationship scores
- **Knowledge graph** — interactive force-directed visualization with zoom, pan, and drag
- **Clickable topics/keywords** — filter articles by clicking topic or keyword chips
- **Related articles** — graph-based related article suggestions
- **Material Design UI** — MUI component library with light/dark mode toggle
- **Quiz system** — AI-generated quizzes (MCQ, short answer, flashcards) for active recall
- **LLM observability** — dashboard monitoring all LLM calls with latency, token usage, error tracking, and per-operation breakdown
- **Collapsible sidebar** — expand/collapse with state persisted in localStorage
- **Pagination** — user-controllable page size (10–100) across all article lists
- **Copy code** — one-click copy button on fenced code blocks in rendered markdown
- **Scroll buttons** — floating button to scroll to top/bottom of any page
- **Backup & restore** — shell scripts for Postgres backup with auto-cleanup

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Data Flow](docs/data-flow.md)
- [Database Schema](docs/database-schema.md)
- [API Reference](docs/api-reference.md)
- [Configuration Guide](docs/configuration.md)
- [Development Guide](docs/development.md)

## Backup & Restore

```bash
make backup              # Create timestamped backup (keeps last 10)
make list-backups        # Show available backups
make restore             # Restore interactively (shows menu)
make rebuild-graph       # Rebuild Neo4j from Postgres after restore
```
