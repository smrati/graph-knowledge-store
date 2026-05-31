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
| Phase 5 | UX & Features (dark mode, pagination, quiz, backup/restore) | Done |
| Phase 6 | LLM Observability (call logging, monitoring dashboard) | Done |

---

## Configuration

All config via `.env` loaded through `pydantic-settings`. Switch LLM provider by changing env vars only — zero code changes.

```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_CHAT_MODEL=gemma4:e4b-it-q8_0
LLM_EMBEDDING_MODEL=qwen3-embedding:0.6b
LLM_EMBEDDING_DIMENSIONS=1024
LLM_NUM_CTX=32000
LLM_QUIZ_NUM_CTX=8000
# Optional: set if embedding model runs on a different server
# LLM_EMBEDDING_BASE_URL=http://localhost:11434/v1
# LLM_EMBEDDING_API_KEY=ollama

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
├── docker/
│   └── postgres.Dockerfile
├── Makefile
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
│   │   ├── bookmark.py
│   │   ├── chat.py
│   │   ├── embedding.py
│   │   ├── flashcard.py
│   │   ├── llm_call_log.py
│   │   └── quiz_attempt.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── article.py
│   │   ├── bookmark.py
│   │   ├── graph.py
│   │   ├── llm_log.py
│   │   └── quiz.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── article_service.py
│   │   ├── bookmark_service.py
│   │   ├── embedding_service.py
│   │   ├── extraction_service.py
│   │   ├── flashcard_service.py
│   │   ├── graph_service.py
│   │   ├── llm_observability.py
│   │   ├── llm_service.py
│   │   ├── quiz_service.py
│   │   ├── rag_service.py
│   │   ├── search_service.py
│   │   └── spaced_rep.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── articles.py
│   │   ├── bookmarks.py
│   │   ├── flashcards.py
│   │   ├── graph.py
│   │   ├── llm.py
│   │   ├── llm_logs.py
│   │   ├── quiz.py
│   │   ├── rag.py
│   │   ├── router.py
│   │   ├── search.py
│   │   └── upload.py
│   └── graph/
│       ├── __init__.py
│       └── neo4j_client.py
├── uploads/                        # User-uploaded images (gitignored)
├── scripts/
│   ├── backup.sh
│   ├── restore.sh
│   └── rebuild_graph.py
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
│       │   ├── RelatedArticles.tsx
│       │   ├── PaginationControls.tsx
│       │   ├── QuizRunner.tsx
│       │   └── ScrollButtons.tsx
│       ├── pages/
│       │   ├── HomePage.tsx
│       │   ├── BookmarksPage.tsx
│       │   ├── EditorPage.tsx
│       │   ├── ArticlePage.tsx
│       │   ├── SearchPage.tsx
│       │   ├── GraphPage.tsx
│       │   ├── QuizPage.tsx
│       │   ├── StudyPage.tsx
│       │   ├── ChatPage.tsx
│       │   └── LLMDashboardPage.tsx
│       └── ...
└── docs/
    ├── architecture.md
    ├── api-reference.md
    ├── backup-and-restore.md
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
    manual_topics   JSONB DEFAULT '[]',
    manual_keywords JSONB DEFAULT '[]',
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

CREATE TABLE llm_call_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation       VARCHAR(100) NOT NULL,
    model           VARCHAR(200) NOT NULL,
    input_text      TEXT,
    output_text     TEXT,
    duration_ms     FLOAT,
    prompt_tokens   INTEGER,
    completion_tokens INTEGER,
    total_tokens    INTEGER,
    is_error        BOOLEAN DEFAULT FALSE,
    error_message   TEXT,
    article_id      UUID REFERENCES articles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
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
| `GET` | `/api/articles` | List articles (paginated `?page=&limit=`, filterable by `?topic=` or `?keyword=`) |
| `GET` | `/api/articles/index` | Lightweight index (id, title, summary, topics, keywords) for client-side search |
| `GET` | `/api/articles/{id}` | Get article with metadata |
| `PUT` | `/api/articles/{id}` | Update article (re-enriches if content changed) |
| `POST` | `/api/articles/{id}/regenerate` | Regenerate title + metadata via LLM |
| `PATCH` | `/api/articles/{id}/tags` | Add/remove manual topics and keywords |
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

### Quiz

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/quiz/generate` | Generate quiz from articles matching selected topics/keywords |
| `POST` | `/api/quiz/generate/article/{id}` | Generate quiz for single article |
| `POST` | `/api/quiz/generate/weak` | Generate quiz targeting weak-area flashcards |
| `GET` | `/api/quiz/status/{quiz_id}` | Poll quiz generation status |
| `POST` | `/api/quiz/{quiz_id}/submit` | Submit quiz answers and score |

### Bookmarks

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/bookmarks/{article_id}` | Toggle bookmark on/off |
| `GET` | `/api/bookmarks` | List bookmarked articles (paginated) |
| `GET` | `/api/bookmarks/ids` | Get all bookmarked article IDs |

### Study / Flashcards

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/study/stats` | Spaced repetition statistics |
| `GET` | `/api/study/due` | Get due flashcards |
| `GET` | `/api/study/new` | Get new flashcards (daily limit) |
| `POST` | `/api/study/review/{card_id}` | Submit flashcard review (1-4 rating) |
| `GET` | `/api/study/decks` | List flashcard decks per article |
| `POST` | `/api/study/generate/{article_id}` | Generate flashcards for article |
| `POST` | `/api/study/generate-more/{article_id}` | Generate additional flashcards |
| `POST` | `/api/study/generate-all-missing` | Generate for all articles without flashcards |

### RAG Chat

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/rag/ask` | Ask question with RAG retrieval |
| `POST` | `/api/rag/ask/stream` | Streaming RAG answer (SSE) |
| `POST` | `/api/rag/sessions` | Create chat session |
| `GET` | `/api/rag/sessions` | List chat sessions |
| `GET` | `/api/rag/sessions/{id}/messages` | Get session messages |
| `DELETE` | `/api/rag/sessions/{id}` | Delete chat session |

### Upload

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload` | Upload image (JPEG/PNG/GIF/WebP/SVG) |

### LLM Logs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/llm-logs/stats` | Aggregate stats (call counts, token usage, latency by operation) |
| `GET` | `/api/llm-logs` | Paginated LLM call log (filterable by `?operation=`, `?is_error=`) |
| `GET` | `/api/llm-logs/operations` | List distinct operation names |

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
- **Regenerate metadata** — re-run title generation + full enrichment on existing articles
- **Manual tags** — add/remove topics and keywords that persist across re-enrichment
- **LLM-powered equation normalization** (opt-in via `fix_equations` flag)
- **Image paste upload** — paste images directly in the markdown editor, stored locally in uploads/
- **Background enrichment pipeline** — LLM extraction → embedding → graph sync → flashcard generation
- **Semantic search** with chunked embeddings and cosine similarity
- **Hybrid search** combining vector similarity with graph relationship scores
- **Interactive knowledge graph** — force-directed layout, draggable nodes, zoom/pan, click to explore
- **Type-ahead search** — instant client-side fuzzy matching via fuse.js
- **Clickable topic/keyword chips** — filter articles by clicking chips on article detail or card
- **Material Design UI** — MUI components, theme, snackbar notifications, confirmation dialogs
- **Full network view** — entire graph renders on page load, click article node to zoom into subgraph
- **Dark mode** — light/dark theme toggle in sidebar, persisted in localStorage, respects OS preference
- **Collapsible sidebar** — expand/collapse with localStorage persistence
- **Pagination** — user-controllable page size (10–100) on HomePage and SearchPage
- **Copy code button** — one-click copy on fenced code blocks in rendered markdown
- **Scroll to top/bottom** — floating FAB button adapts based on scroll position
- **Bookmarks** — save articles for quick access with dedicated bookmarks page
- **Quiz system** — MCQ, short answer, and flashcard quizzes (async generation, article-specific, weak-area targeting)
- **Spaced repetition** — SM-2 flashcard scheduling with per-article decks, study stats, daily limits
- **RAG chat** — ask questions about your knowledge base with streaming answers and source citations
- **LLM observability** — dashboard monitoring all LLM calls with latency, token usage, error tracking, and per-operation breakdown
- **Backup & restore** — `make backup` / `make restore` with auto-cleanup, includes uploaded images, Neo4j rebuildable via `make rebuild-graph`
