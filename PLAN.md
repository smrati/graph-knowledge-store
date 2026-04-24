# Graph Knowledge Store — Implementation Plan

A personal knowledge base web application: write markdown articles, store them with vector embeddings (Postgres + Pgvector), build a knowledge graph (Neo4j), and discover related articles through semantic similarity, graph traversal, or hybrid ranking.

---

## Configuration

All config via `.env` loaded through `pydantic-settings`. Switch LLM provider by changing env vars only — zero code changes.

```env
# LLM (OpenAI-compatible endpoint — works with Ollama, OpenAI, LiteLLM, etc.)
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_CHAT_MODEL=gemma2:9b-instruct-q4_K_M
LLM_EMBEDDING_MODEL=qwen3-embedding:0.6b
LLM_EMBEDDING_DIMENSIONS=1024

# Postgres + Pgvector
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=graphknowledge
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Neo4j (Phase 3)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password123
```

The `openai` Python package is used with a custom `base_url`, so it works identically with Ollama, OpenAI, or any compatible provider.

---

## Docker Compose

```yaml
services:
  postgres:
    image: postgres:16.9-with-vector
    environment:
      POSTGRES_DB: graphknowledge
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  neo4j:                          # Added in Phase 3
    image: neo4j:2025.11.2
    environment:
      NEO4J_AUTH: neo4j/password123
    ports:
      - "7474:7474"
      - "7687:7687"
    volumes:
      - neo4j_data:/data

volumes:
  postgres_data:
  neo4j_data:
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
│   ├── main.py                  # FastAPI app entrypoint
│   ├── config.py                # pydantic-settings (reads .env)
│   ├── database.py              # async SQLAlchemy engine/session
│   ├── models/
│   │   ├── __init__.py
│   │   ├── article.py           # Article ORM model
│   │   └── embedding.py         # ArticleEmbedding ORM model
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── article.py           # Pydantic request/response schemas
│   │   └── graph.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── router.py            # Aggregated router
│   │   ├── articles.py          # CRUD endpoints
│   │   ├── search.py            # Semantic search (Phase 1)
│   │   └── graph.py             # Graph endpoints (Phase 3)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── article_service.py   # CRUD business logic
│   │   ├── embedding_service.py # Embedding generation + chunking
│   │   ├── llm_service.py       # OpenAI-compatible client wrapper
│   │   ├── extraction_service.py# LLM topic/keyword/entity extraction (Phase 2)
│   │   ├── graph_service.py     # Neo4j sync + queries (Phase 3)
│   │   └── search_service.py    # Hybrid search (Phase 4)
│   └── graph/
│       ├── __init__.py
│       └── neo4j_client.py      # Neo4j driver management (Phase 3)
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/
│       │   └── client.ts        # Axios/fetch wrapper
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── ArticleEditor.tsx # Markdown editor + live preview
│       │   ├── ArticleList.tsx
│       │   ├── ArticleCard.tsx
│       │   ├── ArticleView.tsx
│       │   ├── SearchBar.tsx
│       │   ├── RelatedArticles.tsx
│       │   ├── TagBadge.tsx
│       │   └── GraphVisualization.tsx
│       ├── pages/
│       │   ├── HomePage.tsx
│       │   ├── EditorPage.tsx
│       │   ├── ArticlePage.tsx
│       │   ├── SearchPage.tsx
│       │   └── GraphPage.tsx
│       └── index.css
└── tests/
```

---

## Database Schema (Postgres)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE articles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(500) NOT NULL,
    content     TEXT NOT NULL,
    summary     TEXT,                                  -- Phase 2
    topics      JSONB DEFAULT '[]',                    -- Phase 2: ["topic1", "topic2"]
    keywords    JSONB DEFAULT '[]',                    -- Phase 2: ["kw1", "kw2"]
    entities    JSONB DEFAULT '[]',                    -- Phase 2: [{"name":"x","type":"Person"}]
    enrichment_status VARCHAR(20) DEFAULT 'pending',   -- Phase 2: pending/processing/completed/failed
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE article_embeddings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id  UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    chunk_text  TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding   VECTOR(1024) NOT NULL                  -- dimension matches LLM_EMBEDDING_DIMENSIONS
);

CREATE INDEX idx_embeddings_vector ON article_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## Neo4j Graph Schema (Phase 3)

```cypher
-- Constraints
CREATE CONSTRAINT FOR (a:Article) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT FOR (t:Topic)   REQUIRE t.name IS UNIQUE;
CREATE CONSTRAINT FOR (k:Keyword) REQUIRE k.name IS UNIQUE;

-- Node types
(:Article  {id: uuid, title: string})
(:Topic    {name: string})
(:Keyword  {name: string})
(:Entity   {name: string, type: string})

-- Relationships
(:Article)-[:HAS_TOPIC]->(:Topic)
(:Article)-[:HAS_KEYWORD]->(:Keyword)
(:Article)-[:MENTIONS_ENTITY]->(:Entity)
(:Article)-[:SIMILAR_TO {score: float}]->(:Article)   -- computed from shared attributes
```

**Why separate Topic/Keyword nodes instead of flat properties?** Traversal. `MATCH (a1:Article)-[:HAS_TOPIC]->(t:Topic)<-[:HAS_TOPIC]-(a2:Article) RETURN a2` finds all articles sharing a topic. Flat properties require full scans.

---

## API Endpoints

### Articles (Phase 1)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/articles` | Create article → embed → background extraction |
| `GET` | `/api/articles` | List articles (paginated, `?page=1&limit=20`) |
| `GET` | `/api/articles/{id}` | Get article with metadata + related articles |
| `PUT` | `/api/articles/{id}` | Update article → re-embed if content changed |
| `DELETE` | `/api/articles/{id}` | Delete article + embeddings + graph nodes |

### Search (Phase 1)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search?q=...&limit=10` | Semantic search via vector similarity |

### Graph (Phase 3)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/graph/article/{id}/neighbors` | Related articles via graph traversal |
| `GET` | `/api/graph/article/{id}/subgraph` | Subgraph for visualization |
| `GET` | `/api/graph/stats` | Node/relationship counts |

### Hybrid Search (Phase 4)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search?q=...&mode=hybrid&alpha=0.5` | Combined vector + graph ranking |

---

## Data Flow

### Article Create / Update
```
User submits markdown
       │
       ▼
┌──────────────┐
│  Save to      │  ← synchronous
│  Postgres     │
└──────┬───────┘
       │  (background tasks)
       ├──────────────────┐
       ▼                  ▼
┌──────────────┐   ┌──────────────┐
│  Chunk text   │   │  LLM extract │  ← Phase 2
│  → Embed each │   │  topics/kw/  │
│  → Store in   │   │  entities    │
│  article_     │   └──────┬───────┘
│  embeddings   │          │
└──────────────┘          ▼
                   ┌──────────────┐
                   │  Sync to     │  ← Phase 3
                   │  Neo4j graph │
                   │  (upsert     │
                   │  nodes+edges)│
                   └──────────────┘
```

### Article Delete
```
DELETE /api/articles/{id}
       │
       ├── Delete from articles (CASCADE deletes article_embeddings)
       └── Delete Article node + relationships from Neo4j
```

**Source of truth**: Postgres. Neo4j is fully rebuildable from Postgres data + LLM extraction.

---

## Embedding Chunking Strategy

```
article.content
    │
    ▼  Split by double-newlines (paragraphs)
    │
    ▼  Merge paragraphs < 100 chars with neighbors
    │
    ▼  Split paragraphs > 1000 chars at sentence boundaries
    │
    ▼  50-char overlap between chunks
    │
    ▼  Embed each chunk → article_embeddings rows
```

Search: embed query → cosine similarity against chunks → group by article_id → rank by best chunk score.

---

## LLM Extraction Prompt (Phase 2)

Sent to the configured `LLM_CHAT_MODEL` on every article save/update:

```
Analyze this article and extract structured metadata.

Return ONLY valid JSON:
{
  "topics": ["topic1", "topic2"],        // max 5 broad themes
  "keywords": ["kw1", "kw2"],            // max 10 important terms
  "entities": [                           // named entities
    {"name": "Python", "type": "Technology"},
    {"name": "Ada Lovelace", "type": "Person"}
  ],
  "summary": "1-2 sentence summary"
}

Article:
---
{article.content}
```

---

## Hybrid Ranking (Phase 4)

```
final_score = alpha * vector_score + (1 - alpha) * graph_score
```

- `vector_score`: cosine similarity between query embedding and article chunks
- `graph_score`: based on shared topics/keywords/entities with seed articles found via vector search, weighted by Jaccard similarity
- `alpha`: configurable per request (default 0.5)

---

## Python Dependencies (`pyproject.toml`)

```toml
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "pgvector>=0.3",
    "neo4j>=5.0",                    # Phase 3
    "openai>=1.0",                   # works with Ollama's /v1 endpoint
    "pydantic-settings>=2.0",
    "python-dotenv>=1.0",
]
```

---

## Frontend Stack

| Concern | Choice |
|---------|--------|
| Framework | React 19 + TypeScript |
| Build tool | Vite 6 |
| Routing | react-router-dom v7 |
| Styling | TailwindCSS v4 |
| Markdown editor | `@uiw/react-md-editor` |
| Markdown rendering | `react-markdown` + `remark-gfm` |
| Graph visualization | `react-force-graph-2d` (Phase 3) |
| HTTP client | native `fetch` (wrapped) |
| Icons | `lucide-react` |

---

## Phase-by-Phase Implementation Order

### Phase 1 — Foundation
1. `docker-compose.yml` (Postgres only)
2. `app/config.py` — settings from `.env`
3. `app/database.py` — async engine + session
4. `app/models/` — Article + ArticleEmbedding SQLAlchemy models
5. `alembic/` setup + initial migration
6. `app/services/llm_service.py` — OpenAI-compatible client
7. `app/services/embedding_service.py` — chunk + embed
8. `app/services/article_service.py` — CRUD + background embedding
9. `app/api/articles.py` — REST endpoints
10. `app/api/search.py` — semantic search endpoint
11. `app/main.py` — wire it all up
12. Frontend: Vite + React scaffold
13. Frontend: Layout, HomePage, EditorPage, ArticlePage, SearchPage
14. Test end-to-end: create article → embed → search

### Phase 2 — LLM Enrichment
1. `app/services/extraction_service.py` — LLM extraction prompt + parsing
2. Update `article_service.py` — background extraction on save
3. Update article model — add topics/keywords/entities/summary columns + migration
4. Update API schemas — include enrichment data in responses
5. Frontend: TagBadge component for topics/keywords
6. Frontend: show enrichment status indicator
7. Test: create article → verify extraction populates metadata

### Phase 3 — Graph Layer
1. Update `docker-compose.yml` — add Neo4j service
2. `app/graph/neo4j_client.py` — connection + session management
3. `app/services/graph_service.py` — sync articles → graph
4. Integrate graph sync into article lifecycle (create/update/delete)
5. `app/api/graph.py` — neighbor/subgraph/stats endpoints
6. `GET /api/articles/{id}` — include graph-based related articles
7. Frontend: GraphVisualization component (force-directed graph)
8. Frontend: GraphPage, RelatedArticles sidebar
9. Test: create articles → verify Neo4j nodes/edges → verify graph queries

### Phase 4 — Hybrid Ranking + Polish
1. `app/services/search_service.py` — hybrid scoring implementation
2. `GET /api/search` — add `mode` and `alpha` parameters
3. Frontend: search page with mode toggle (semantic/graph/hybrid)
4. Frontend: interactive graph exploration (click node → navigate to article)
5. Frontend: dashboard with stats
6. Polish: loading states, error handling, responsive layout
7. Full integration test
