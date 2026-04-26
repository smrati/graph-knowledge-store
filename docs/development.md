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
docker compose build postgres   # Build Postgres + pgvector image (once, per machine)
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
- API files match their resource: `articles.py`, `search.py`, `graph.py`, `quiz.py`
- Service files match their domain: `article_service.py`, `embedding_service.py`, `quiz_service.py`
- ORM models use singular class names: `Article`, `ArticleEmbedding`
- Pydantic schemas use verb suffixes: `ArticleCreate`, `ArticleUpdate`, `ArticleResponse`

**Async patterns:**
- Postgres operations use `asyncpg` via SQLAlchemy async
- Neo4j operations are synchronous (Neo4j Python driver limitation)
- All Neo4j calls from async handlers run in `ThreadPoolExecutor`
- Quiz generation (LLM calls) also runs in `ThreadPoolExecutor`
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
- `src/theme.ts` — MUI Material Design theme (light + dark)

**Conventions:**
- One component per file, default export
- TypeScript interfaces for all API data
- MUI components for UI elements (Card, Button, Chip, TextField, etc.)
- TailwindCSS utility classes for layout (flex, gap, grid) — coexists with MUI
- Route definitions centralized in `App.tsx`
- All API calls go through the centralized `api` client in `src/api/client.ts`
- Snackbar notifications via `notistack` for user feedback
- Dark mode context via `useThemeMode()` from `MaterialThemeProvider`

**Material Design theme:**
- Dual themes in `src/theme.ts` — light (indigo/teal) and dark (lighter variants with enhanced contrast)
- `MaterialThemeProvider` wraps the app with `ThemeProvider`, `CssBaseline`, `SnackbarProvider`, and dark mode context
- Sidebar navigation uses MUI `Drawer` (collapsible) with `ListItemButton` (active state highlighted)
- Dark mode toggled via icon button in sidebar, persisted in localStorage

**Dark mode implementation:**
- `useThemeMode()` hook returns `{ dark, toggleTheme }`
- `document.documentElement.classList.toggle("dark-mode", dark)` for CSS-based dark overrides
- MUI components auto-adapt via theme palette
- Custom CSS uses `.dark-mode` class prefix for non-MUI elements (inline code, markdown preview, code blocks)
- Graph visualization uses lighter node colors and adjusted label backgrounds in dark mode

**Pagination:**
- `PaginationControls` component: page size dropdown (10/25/50/100), range display, MUI Pagination
- Backend enforces `limit` ge=10, le=100
- Default page size: 10

**Quiz:**
- `QuizPage` — multi-select topics/keywords with fuse.js type-ahead, quiz type picker, question count slider
- `QuizRunner` — handles MCQ (click options, green/red feedback), Short Answer (text input, model answer, self-score), Flashcard (flip card, Got It/Missed It)
- `ChipInput` — reusable multi-select with fuse.js type-ahead, selected items as dismissible chips

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

## Backup & Restore

```bash
make backup              # Create timestamped backup (auto-cleanup, keeps last 10)
make list-backups        # Show available backups
make restore             # Restore interactively (picks from menu)
make rebuild-graph       # Rebuild Neo4j + embeddings from Postgres
make rebuild-graph-only  # Rebuild Neo4j only
make rebuild-embeddings  # Rebuild embeddings only
```

Backups contain Postgres dump + `.env` config. Neo4j is not backed up (fully rebuildable).

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
docker compose build postgres          # Build Postgres + pgvector image
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

# Backup & Restore
make backup                          # Create backup
make list-backups                    # List available backups
make restore                         # Restore from backup
make rebuild-graph                   # Rebuild Neo4j from Postgres
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
ollama pull gemma4:e4b-it-q8_0       # Pull chat model
ollama pull qwen3-embedding:0.6b     # Pull embedding model
```

### Frontend proxy not working
Verify `vite.config.ts` has the proxy config pointing to `http://localhost:8000`. The backend must be running on port 8000.

### Neo4j graph not showing data
Articles must be enriched first (enrichment_status = "completed") before graph nodes appear. If Neo4j was down during enrichment, re-save the article to trigger re-enrichment.

### Quiz generation returns 500
The LLM may have returned invalid JSON. Check backend logs for the raw LLM output. Try with fewer questions or a different chat model. The quiz service logs the first 500 chars of unparseable output.

### Dark mode text hard to read
The dark theme uses enhanced contrast colors (`#eceff1` primary, `#b0bec5` secondary). If custom components have hardcoded colors, use MUI theme colors (`color="text.secondary"`) or add `.dark-mode` CSS overrides in `index.css`.

### LLM Monitor dashboard not loading data
Verify the migration was applied (`uv run alembic upgrade head`) and the backend was restarted. Check browser console for 404 errors — the endpoints are at `/api/llm-logs/stats` and `/api/llm-logs`. Token counts may show as estimated (not exact) when using Ollama since it doesn't always return usage data.

### LLM call logs showing estimated tokens
When the LLM API doesn't return `usage` data (common with Ollama embedding endpoints), the system estimates tokens at ~4 chars/token. This is a rough approximation for trend analysis. Exact token counts are recorded when available (e.g., OpenAI API).
