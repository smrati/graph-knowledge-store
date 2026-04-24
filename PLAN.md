# Graph Knowledge Store — Implementation Plan

A personal knowledge base web application: write markdown articles, store them with vector embeddings (Postgres + Pgvector), build a knowledge graph (Neo4j), and discover related articles through semantic similarity, graph traversal, or hybrid ranking.

---

## Implementation Status

All phases are **complete**.

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Foundation (Postgres, CRUD, semantic search, React frontend) | Done |
| Phase 2 | LLM Enrichment (topic/keyword/entity extraction, summary) | Done |
| Phase 3 | Graph Layer (Neo4j, graph visualization, related articles) | Done |
| Phase 4 | Polish (hybrid search, MUI Material Design, type-ahead, interactive graph) | Done |

---

## Configuration

All config via `.env` loaded through `pydantic-settings`. Switch LLM provider by changing env vars only — zero code changes.

```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_CHAT_MODEL=gemma2:9b-instruct-q4_K_M
LLM_EMBEDDING_MODEL=qwen3-embedding:0.6b
LLM_EMBEDDING_DIMENSIONS=1024

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=graphknowledge
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password123
```

---

## Project Structure

```
graph-knowledge-store/
├── docker-compose.yml
├── .env.example
├── pyproject.toml
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── article.py
│   │   └── embedding.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── article.py
│   │   └── graph.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── router.py
│   │   ├── articles.py
│   │   ├── search.py
│   │   └── graph.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── article_service.py
│   │   ├── embedding_service.py
│   │   ├── llm_service.py
│   │   ├── extraction_service.py
│   │   ├── graph_service.py
│   │   └── search_service.py
│   └── graph/
│       ├── __init__.py
│       └── neo4j_client.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── theme.ts
│       ├── api/
│       │   └── client.ts
│       ├── components/
│       │   ├── MaterialThemeProvider.tsx
│       │   ├── Layout.tsx
│       │   ├── ArticleCard.tsx
│       │   ├── ArticleEditor.tsx
│       │   ├── ArticleView.tsx
│       │   ├── MarkdownPreview.tsx
│       │   └── RelatedArticles.tsx
│       └── pages/
│           ├── HomePage.tsx
│           ├── EditorPage.tsx
│           ├── ArticlePage.tsx
│           ├── SearchPage.tsx
│           └── GraphPage.tsx
└── docs/
    ├── architecture.md
    ├── api-reference.md
    ├── configuration.md
    ├── data-flow.md
    ├── database-schema.md
    └── development.md
```

---

## Database Schema (Postgres)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE articles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(500) NOT NULL,
    content     TEXT NOT NULL,
    summary     TEXT,
    topics      JSONB DEFAULT '[]',
    keywords    JSONB DEFAULT '[]',
    entities    JSONB DEFAULT '[]',
    enrichment_status VARCHAR(20) DEFAULT 'pending',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE article_embeddings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id  UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    chunk_text  TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding   VECTOR(1024) NOT NULL
);

CREATE INDEX idx_embeddings_vector ON article_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## Neo4j Graph Schema

```cypher
CREATE CONSTRAINT FOR (a:Article) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT FOR (t:Topic)   REQUIRE t.name IS UNIQUE;
CREATE CONSTRAINT FOR (k:Keyword) REQUIRE k.name IS UNIQUE;

(:Article  {id: uuid, title: string})
(:Topic    {name: string})
(:Keyword  {name: string})
(:Entity   {name: string, type: string})

(:Article)-[:HAS_TOPIC]->(:Topic)
(:Article)-[:HAS_KEYWORD]->(:Keyword)
(:Article)-[:MENTIONS_ENTITY]->(:Entity)
```

---

## API Endpoints

### Articles

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/articles` | Create article (title auto-generated if omitted, optional `fix_equations`) |
| `GET` | `/api/articles` | List articles (paginated, filterable by `?topic=` or `?keyword=`) |
| `GET` | `/api/articles/index` | Lightweight index for client-side search |
| `GET` | `/api/articles/{id}` | Get article with metadata |
| `PUT` | `/api/articles/{id}` | Update article (re-enriches if content changed) |
| `DELETE` | `/api/articles/{id}` | Delete article + embeddings + graph nodes |

### Search

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search?q=...&mode=semantic` | Semantic search via vector similarity |
| `GET` | `/api/search?q=...&mode=hybrid&alpha=0.5` | Combined vector + graph ranking |

### Graph

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/graph/full` | Full knowledge graph (all nodes + edges) |
| `GET` | `/api/graph/article/{id}/neighbors` | Related articles via graph traversal |
| `GET` | `/api/graph/article/{id}/subgraph?depth=2` | Subgraph for visualization |
| `GET` | `/api/graph/stats` | Node/relationship counts |

---

## Frontend Stack

| Concern | Choice |
|---------|--------|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| UI library | MUI (Material UI) |
| Icons | @mui/icons-material |
| Routing | react-router-dom v7 |
| Layout styling | TailwindCSS v4 (coexists with MUI) |
| Markdown editor | `@uiw/react-md-editor` |
| Markdown rendering | `react-markdown` + `remark-gfm` + `rehype-katex` |
| Graph visualization | `react-force-graph-2d` |
| Client-side search | `fuse.js` |
| Notifications | `notistack` |
| HTTP client | native `fetch` (centralized in `client.ts`) |

---

## Key Features Implemented

- **Auto-generated titles** via LLM when title is omitted on create
- **LLM-powered equation normalization** (opt-in via `fix_equations` flag)
- **Background enrichment pipeline** — LLM extraction → embedding → graph sync
- **Semantic search** with chunked embeddings and cosine similarity
- **Hybrid search** combining vector similarity with graph relationship scores
- **Interactive knowledge graph** — force-directed layout, draggable nodes, zoom/pan, click to explore
- **Type-ahead search** — instant client-side fuzzy matching via fuse.js
- **Clickable topic/keyword chips** — filter articles by clicking chips on article detail or card
- **Material Design UI** — MUI components, theme, snackbar notifications, confirmation dialogs
- **Full network view** — entire graph renders on page load, click article node to zoom into subgraph
