# Development Guide

## Prerequisites

- Python 3.13+
- Node.js 22+ and npm
- Docker and Docker Compose
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Ollama with chat and embedding models pulled

## Local Development Setup

```bash
# 1. Clone
git clone <repo-url>
cd graph-knowledge-store

# 2. Configure
cp .env.example .env

# 3. Start databases
docker compose up -d

# 4. Install backend dependencies
uv sync

# 5. Run migrations
uv run alembic upgrade head

# 6. Install frontend dependencies
cd frontend && npm install && cd ..

# 7. Start backend (terminal 1)
uv run uvicorn app.main:app --reload

# 8. Start frontend (terminal 2)
cd frontend && npm run dev
```

Open http://localhost:5173.

## Project Conventions

### Backend

**File organization:**
- `app/api/` — route handlers only, no business logic
- `app/services/` — business logic, one responsibility per file
- `app/models/` — SQLAlchemy ORM models
- `app/schemas/` — Pydantic models for request/response validation
- `app/graph/` — Neo4j-specific client code

**Naming:**
- API files match their resource: `articles.py`, `search.py`, `graph.py`
- Service files match their domain: `article_service.py`, `embedding_service.py`
- ORM models use singular class names: `Article`, `ArticleEmbedding`
- Pydantic schemas use verb suffixes: `ArticleCreate`, `ArticleUpdate`, `ArticleResponse`

**Async patterns:**
- Postgres operations use `asyncpg` via SQLAlchemy async
- Neo4j operations are synchronous (Neo4j Python driver limitation)
- Background tasks use FastAPI's `BackgroundTasks`, not Celery
- Background tasks that need a database session create their own via `async_session_factory()`

**Error handling:**
- API layer returns HTTP errors (400, 404) via `HTTPException`
- Service layer does not raise HTTP exceptions
- Background tasks catch exceptions internally and log them
- Enrichment failures set `enrichment_status = "failed"` on the article

### Frontend

**File organization:**
- `src/api/` — HTTP client and TypeScript interfaces
- `src/components/` — reusable UI components
- `src/pages/` — top-level route components

**Conventions:**
- One component per file, default export
- TypeScript interfaces for all API data
- TailwindCSS utility classes for styling (no custom CSS files beyond `index.css`)
- Route definitions centralized in `App.tsx`

## Database Migrations

Alembic handles schema migrations with async support.

```bash
# Create a new migration (auto-detect changes)
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head

# Rollback one migration
uv run alembic downgrade -1

# See current state
uv run alembic current
```

The `alembic/env.py` is configured for async SQLAlchemy. It imports the `Base` metadata from `app/models/article.py` for autogenerate support.

When adding new models:
1. Create the model in `app/models/`
2. Import it in `app/models/__init__.py`
3. Run `alembic revision --autogenerate`
4. Review the generated migration
5. Run `alembic upgrade head`

## Adding a New Feature

Example: adding a "tags" feature to articles.

1. **Model** — Add a `tags` column to `Article` in `app/models/article.py`
2. **Migration** — `uv run alembic revision --autogenerate -m "add tags"`
3. **Schema** — Add `tags` to request/response schemas in `app/schemas/article.py`
4. **Service** — Update `article_service.py` if business logic changes
5. **API** — Update endpoint if the API contract changes
6. **Frontend** — Update TypeScript interfaces in `src/api/client.ts`, then update components

## Running Tests

Tests are not yet implemented. When adding tests:

```bash
# Backend tests (from project root)
uv run pytest tests/

# Frontend tests (from frontend/)
npm test
```

## Useful Commands

```bash
# Backend
uv run uvicorn app.main:app --reload          # Dev server with hot reload
uv run python -c "from app.config import settings; print(settings.postgres_url)"  # Check config

# Frontend
cd frontend
npm run dev          # Dev server
npm run build        # Production build
npx tsc --noEmit     # Type check only

# Docker
docker compose up -d                  # Start all services
docker compose up -d postgres         # Start only Postgres
docker compose down                   # Stop all services
docker compose down -v                # Stop and delete volumes (resets data)

# Database
uv run alembic upgrade head           # Apply all migrations
uv run alembic downgrade -1           # Rollback last migration

# Neo4j browser
# Open http://localhost:7474
# Connect with neo4j/password123
```

## Troubleshooting

### "Connection refused" on Postgres
```bash
docker compose up -d postgres
docker compose ps   # Check if healthy
```

### "Connection refused" on Neo4j
```bash
docker compose up -d neo4j
# Neo4j takes 10-20 seconds to start
docker compose logs neo4j
```

### "NameError: pgvector not defined" in migration
The migration file needs `import pgvector.sqlalchemy.vector` at the top. Auto-generated migrations include this, but verify after editing.

### Ollama not responding
```bash
ollama list                          # Check available models
ollama pull gemma2:9b-instruct-q4_K_M   # Pull chat model
ollama pull qwen3-embedding:0.6b        # Pull embedding model
```

### Frontend proxy not working
Verify `vite.config.ts` has the proxy config pointing to `http://localhost:8000`. The backend must be running on port 8000.
