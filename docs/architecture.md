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
- No business logic

**Service Layer** (`app/services/`)
- `article_service.py` — CRUD operations, orchestrates enrichment pipeline
- `llm_service.py` — generic LLM client (chat + embed) via OpenAI SDK
- `extraction_service.py` — structured metadata extraction from article content
- `embedding_service.py` — text chunking, embedding generation, vector similarity search
- `graph_service.py` — Neo4j CRUD, neighbor queries, subgraph extraction
- `search_service.py` — hybrid search combining vector + graph scores

**Data Layer**
- `app/models/` — SQLAlchemy ORM models (Article, ArticleEmbedding)
- `app/graph/neo4j_client.py` — Neo4j driver lifecycle, constraint initialization
- `app/database.py` — async SQLAlchemy engine and session factory
- `app/config.py` — centralized configuration via pydantic-settings

### Key Design Decisions

1. **Async SQLAlchemy**: All Postgres operations use `asyncpg` driver with `AsyncSession` for non-blocking I/O. Neo4j operations are synchronous (the Python driver doesn't support async natively).

2. **Background Tasks**: Article enrichment (LLM extraction + embedding + graph sync) runs in FastAPI `BackgroundTasks`, not Celery. This keeps the stack simple for a single-user app. The article is saved synchronously and returned immediately; enrichment happens after the response is sent.

3. **Source of Truth**: Postgres is the authoritative data store. Neo4j holds derived data (relationships) that can be fully rebuilt from Postgres + LLM extraction.

4. **OpenAI-Compatible Abstraction**: The `llm_service.py` uses the `openai` Python package with a configurable `base_url`. This means the same code works with Ollama, OpenAI, LiteLLM, or any provider that exposes an OpenAI-compatible API. Switching providers requires only `.env` changes.

5. **Pgvector over Dedicated Vector DB**: Using Pgvector inside Postgres avoids running a separate vector database service. For a personal knowledge base with hundreds to low thousands of articles, this is performant and operationally simpler.

## Frontend Architecture (React)

The frontend is a single-page application built with:

| Technology | Purpose |
|-----------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite 8 | Build tool + dev server |
| TailwindCSS 4 | Utility-first styling |
| react-router-dom v7 | Client-side routing |
| @uiw/react-md-editor | Markdown editor with preview |
| react-markdown + remark-gfm | Markdown rendering |
| lucide-react | Icons |

### Component Hierarchy

```
App.tsx (BrowserRouter)
└── Layout.tsx (sidebar nav + Outlet)
    ├── HomePage.tsx
    │   └── ArticleCard.tsx (repeated)
    ├── EditorPage.tsx
    │   └── ArticleEditor.tsx
    ├── ArticlePage.tsx
    │   └── ArticleView.tsx
    │       ├── MarkdownPreview.tsx
    │       └── RelatedArticles.tsx
    ├── SearchPage.tsx
    └── GraphPage.tsx
```

### API Proxy

During development, Vite proxies `/api` requests to `http://localhost:8000` (configured in `vite.config.ts`). This avoids CORS issues in development. The backend also has CORS middleware configured for `http://localhost:5173`.

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
```
