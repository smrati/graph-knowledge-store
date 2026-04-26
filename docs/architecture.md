# Architecture Overview

## High-Level Design

Graph Knowledge Store is a single-user knowledge base with dual storage: **Postgres with Pgvector** for structured data and vector search, **Neo4j** for relationship graph traversal. An LLM (via any OpenAI-compatible endpoint) automatically enriches articles with metadata on save.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│   FastAPI    │────▶│   Postgres   │
│  React SPA   │◀────│  Backend     │     │  + Pgvector  │
└──────────────┘     └──────┬───────┘     └──────────────┘
                             │
                      ┌──────┴───────┐
                      │              │
               ┌──────▼──────┐ ┌─────▼──────┐
               │   Neo4j     │ │  LLM API   │
               │  Graph DB   │ │  (Ollama)  │
               └─────────────┘ └────────────┘
```

## Backend Architecture (FastAPI)

The backend follows a layered architecture:

```
API Layer (app/api/)
    → routes HTTP requests, validates input
    ↓
Service Layer (app/services/)
    → business logic, background tasks
    ↓
Data Layer (app/models/, app/graph/)
    → ORM models, Neo4j client
```

### Layer Responsibilities

**API Layer** (`app/api/`)
- HTTP request/response handling
- Input validation via Pydantic schemas
- UUID validation and error responses
- Background task delegation for enrichment
- Wraps synchronous Neo4j and LLM calls in `ThreadPoolExecutor` to avoid blocking the async event loop

**Service Layer** (`app/services/`)
- `article_service.py` — CRUD operations, orchestrates enrichment pipeline, case-insensitive JSONB filtering
- `llm_service.py` — generic LLM client (chat + embed) via OpenAI SDK, includes `generate_title()` and `normalize_markdown_equations()`. Supports separate endpoints for chat and embedding models via `LLM_EMBEDDING_BASE_URL` / `LLM_EMBEDDING_API_KEY`.
- `extraction_service.py` — structured metadata extraction from article content
- `embedding_service.py` — text chunking, embedding generation, vector similarity search
- `graph_service.py` — Neo4j CRUD, deduplicated neighbor queries, subgraph extraction, full graph retrieval
- `search_service.py` — hybrid search combining vector + graph scores
- `quiz_service.py` — quiz generation (MCQ, short answer, flashcards) with summaries + sampling for context efficiency
- `llm_observability.py` — sync DB logger for LLM calls; estimates tokens (~4 chars/token) when API doesn't provide usage; extracts usage with `getattr` fallbacks for Ollama compatibility

**Data Layer**
- `app/models/` — SQLAlchemy ORM models (Article, ArticleEmbedding, LLMCallLog)
- `app/graph/neo4j_client.py` — Neo4j driver lifecycle, constraint initialization
- `app/database.py` — async SQLAlchemy engine and session factory
- `app/config.py` — centralized configuration via pydantic-settings

### Key Design Decisions

1. **Async SQLAlchemy**: All Postgres operations use `asyncpg` driver with `AsyncSession` for non-blocking I/O. Neo4j operations are synchronous (the Python driver doesn't support async natively) and run in `ThreadPoolExecutor`.

2. **Background Tasks**: Article enrichment (LLM extraction + embedding + graph sync) runs in FastAPI `BackgroundTasks`, not Celery. This keeps the stack simple for a single-user app. The article is saved synchronously and returned immediately; enrichment happens after the response is sent.

3. **Source of Truth**: Postgres is the authoritative data store. Neo4j holds derived data (relationships) that can be fully rebuilt from Postgres + LLM extraction via `scripts/rebuild_graph.py`.

4. **OpenAI-Compatible Abstraction**: The `llm_service.py` uses the `openai` Python package with a configurable `base_url`. This means the same code works with Ollama, OpenAI, LiteLLM, or any provider that exposes an OpenAI-compatible API. Chat and embedding models can run on separate servers by setting `LLM_EMBEDDING_BASE_URL` and `LLM_EMBEDDING_API_KEY`. Switching providers requires only `.env` changes.

5. **Pgvector over Dedicated Vector DB**: Using Pgvector inside Postgres avoids running a separate vector database service. For a personal knowledge base with hundreds to low thousands of articles, this is performant and operationally simpler.

6. **Equation Normalization Opt-In**: LLM-powered LaTeX delimiter fixing is controlled by a `fix_equations` flag (default false) to save compute on articles without math.

7. **Quiz Context Efficiency**: Quiz generation uses summaries + metadata from all matching articles, plus full content from a sampled subset (max 6 articles). Total prompt capped at 8000 chars to avoid exhausting LLM context windows.

8. **LLM Observability via Sync DB**: LLM call logging uses a synchronous SQLAlchemy session (via `psycopg2-binary` + `settings.postgres_sync_url`) rather than the async engine. This is acceptable because LLM calls already take 1-10 seconds — the one INSERT for logging is negligible. Token counts are estimated at ~4 chars/token when the API (e.g., Ollama) doesn't return usage data. Logs are kept indefinitely (no auto-cleanup).

## Frontend Architecture (React)

The frontend is a single-page application built with:

| Technology | Purpose |
|-----------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite 8 | Build tool + dev server |
| MUI (Material UI) | Material Design component library |
| @mui/icons-material | Material Design icons |
| TailwindCSS 4 | Utility-first layout (coexists with MUI) |
| react-router-dom v7 | Client-side routing |
| @uiw/react-md-editor | Markdown editor with preview |
| react-markdown + remark-gfm | Markdown rendering |
| react-force-graph-2d | Interactive force-directed graph visualization |
| fuse.js | Client-side fuzzy search for type-ahead |
| notistack | Material snackbar notifications |

### Component Hierarchy

```
App.tsx (BrowserRouter)
└── MaterialThemeProvider.tsx (MUI ThemeProvider + CssBaseline + SnackbarProvider + dark mode context)
    └── Layout.tsx (MUI Drawer sidebar — collapsible, dark mode toggle, Quiz nav item)
        ├── HomePage.tsx (reads ?topic / ?keyword URL params, "Take Quiz" button on filtered view)
        │   ├── ArticleCard.tsx (MUI Card + clickable Chip topics + delete dialog)
        │   └── PaginationControls.tsx (page size selector + page navigation)
        ├── EditorPage.tsx
        │   └── ArticleEditor.tsx (MUI TextField, Checkbox, Alert, dark mode for md-editor)
        ├── ArticlePage.tsx
        │   └── ArticleView.tsx (clickable topic/keyword Chips, delete dialog)
        │       ├── MarkdownPreview.tsx (copy code button, dark mode prose-invert)
        │       └── RelatedArticles.tsx (MUI List + ListItemButton, deduplicated)
        ├── SearchPage.tsx (fuse.js type-ahead + semantic/hybrid search + pagination)
        ├── GraphPage.tsx (full network + zoom-to-subgraph, dark mode aware colors)
        ├── QuizPage.tsx (multi-select topics/keywords, quiz type picker, question count slider)
        │   └── QuizRunner.tsx (MCQ / Short Answer / Flashcard modes, score card)
        ├── LLMDashboardPage.tsx (summary cards, per-operation table, errors table, paginated call log)
        └── ScrollButtons.tsx (floating FAB — scroll to top/bottom)
```

### Theme

The app supports **light and dark modes** (`frontend/src/theme.ts`):

**Light theme:**
- Primary: indigo (`#5c6bc0`), Secondary: teal (`#26a69a`)
- Background: `#f5f5f5` / `#ffffff`

**Dark theme:**
- Primary: lighter indigo (`#7986cb`), Secondary: lighter teal (`#4db6ac`)
- Background: `#121212` / `#1e1e1e`
- Drawer: `#1a1a2e`
- Text: `#eceff1` (primary), `#b0bec5` (secondary), `#78909c` (disabled)
- Enhanced contrast: cards get subtle borders, chip outlines use `rgba(255,255,255,0.15)`

Dark mode is toggled via the sidebar icon button, persisted in `localStorage("knowledge-store-theme")`, and respects OS `prefers-color-scheme` as default.

### Collapsible Sidebar

The sidebar collapses to icon-only mode (60px) via the chevron button. State persists in `localStorage("sidebar-collapsed")`. Collapsed items show tooltips on hover.

### Pagination

A reusable `PaginationControls` component provides:
- "1–10 of 42" range display
- Per-page dropdown: 10, 25, 50, 100 (configurable)
- MUI Pagination navigation
- Used on HomePage and SearchPage

### API Proxy

During development, Vite proxies `/api` requests to `http://localhost:8000` (configured in `vite.config.ts`). This avoids CORS issues in development. The backend also has CORS middleware configured for `http://localhost:5173`.

### Client-Side Search

Fuse.js is used for instant type-ahead search without server round-trips:
- Search page: fuzzy matches on title (60%), summary (25%), keywords (15%)
- Graph page: fuzzy matches on title (80%), keywords (20%)
- Quiz page: fuzzy matches on topics and keywords for multi-select
- The `/api/articles/index` endpoint provides lightweight article data (id, title, summary, topics, keywords) for building the client-side index

## Dependency Graph

```
article_service
    ├── extraction_service (LLM metadata extraction)
    │       └── llm_service (chat completions)
    ├── embedding_service (chunking + vector storage + search)
    │       └── llm_service (embeddings)
    ├── graph_service (Neo4j operations)
    │       └── neo4j_client (driver management)
    └── search_service (hybrid ranking)
        ├── embedding_service (vector search)
        └── graph_service (neighbor scores)

quiz_service
    ├── article_service (fetch filtered articles)
    └── llm_service (quiz question generation)

llm_service
    └── llm_observability (logs every LLM call — sync DB INSERT with token estimation)
```
