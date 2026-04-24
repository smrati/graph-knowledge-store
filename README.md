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

Edit `.env` if needed. Defaults assume Ollama on `localhost:11434` with models `gemma2:9b-instruct-q4_K_M` (chat) and `qwen3-embedding:0.6b` (embeddings).

### 2. Start databases

```bash
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
│       ├── components/         # UI components
│       └── pages/              # Route pages
├── alembic/                    # Database migrations
├── docs/                       # Documentation
├── docker-compose.yml          # Postgres + Neo4j
├── .env.example                # Configuration template
└── PLAN.md                     # Implementation plan
```

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/articles` | Create article |
| `GET` | `/api/articles` | List articles (paginated) |
| `GET` | `/api/articles/{id}` | Get article |
| `PUT` | `/api/articles/{id}` | Update article |
| `DELETE` | `/api/articles/{id}` | Delete article |
| `GET` | `/api/search?q=...&mode=semantic\|hybrid` | Search articles |
| `GET` | `/api/graph/article/{id}/neighbors` | Related articles via graph |
| `GET` | `/api/graph/article/{id}/subgraph` | Subgraph for visualization |
| `GET` | `/api/graph/stats` | Graph statistics |
| `GET` | `/api/health` | Health check |

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Data Flow](docs/data-flow.md)
- [Database Schema](docs/database-schema.md)
- [API Reference](docs/api-reference.md)
- [Configuration Guide](docs/configuration.md)
- [Development Guide](docs/development.md)
