# API Reference

Base URL: `http://localhost:8000`

All endpoints accept and return `application/json`.

## Health Check

### `GET /api/health`

Returns application health status.

**Response:**
```json
{
  "status": "ok"
}
```

---

## Articles

### `POST /api/articles`

Create a new article. Triggers background enrichment (LLM extraction, embedding, graph sync).

**Request Body:**
```json
{
  "title": "Introduction to Neural Networks",
  "content": "# Neural Networks\n\nA neural network is...",
  "fix_equations": false
}
```

- `title` is optional — if omitted, auto-generated via LLM
- `fix_equations` is optional (default false) — runs LLM-powered LaTeX delimiter normalization

**Response** (201 Created):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Introduction to Neural Networks",
  "content": "# Neural Networks\n\nA neural network is...",
  "summary": null,
  "topics": [],
  "keywords": [],
  "entities": [],
  "enrichment_status": "pending",
  "created_at": "2026-04-24T00:00:00Z",
  "updated_at": "2026-04-24T00:00:00Z"
}
```

`enrichment_status` starts as `"pending"` and transitions to `"processing"` → `"completed"` (or `"failed"`) in the background.

---

### `GET /api/articles`

List articles paginated, ordered by most recently updated. Supports optional filtering by topic or keyword.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `limit` | integer | 10 | Results per page (min 10, max 100) |
| `topic` | string | — | Filter by topic (case-insensitive) |
| `keyword` | string | — | Filter by keyword (case-insensitive) |

Filtering uses case-insensitive matching against the JSONB arrays.

**Examples:**
```
GET /api/articles?page=2&limit=25
GET /api/articles?topic=machine+learning
GET /api/articles?keyword=backpropagation
```

**Response:**
```json
{
  "articles": [
    {
      "id": "...",
      "title": "...",
      "summary": "...",
      "topics": ["AI", "Python"],
      "enrichment_status": "completed",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 10
}
```

Note: `content` is not included in list responses.

---

### `GET /api/articles/index`

Returns a lightweight index of all articles for client-side search. Includes `id`, `title`, `summary`, `topics`, `keywords` — no content or pagination.

**Response:**
```json
{
  "articles": [
    {
      "id": "...",
      "title": "...",
      "summary": "...",
      "topics": ["AI", "Deep Learning"],
      "keywords": ["kw1", "kw2"]
    }
  ]
}
```

Used by fuse.js on the Search, Graph, and Quiz pages for instant type-ahead suggestions.

---

### `GET /api/articles/{id}`

Get a single article with full content and metadata.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `id` | UUID | Article ID |

**Response:** Full `ArticleResponse` including `content`, `summary`, `topics`, `keywords`, `entities`.

**Errors:**
- `400` — Invalid UUID format
- `404` — Article not found

---

### `PUT /api/articles/{id}`

Update an article. If `content` changes, triggers background re-enrichment.

**Request Body:**
```json
{
  "title": "Updated Title",
  "content": "Updated content...",
  "fix_equations": true
}
```

Both `title` and `content` are optional. Only provided fields are updated.

**Response:** Updated `ArticleResponse`.

---

### `DELETE /api/articles/{id}`

Delete an article and all associated data (embeddings, graph nodes/relationships, bookmarks, flashcards).

**Response:** 204 No Content

**Errors:**
- `400` — Invalid UUID format
- `404` — Article not found

---

### `POST /api/articles/{id}/regenerate`

Regenerate an article's title and re-trigger the full enrichment pipeline (topics, keywords, entities, summary, embeddings, graph sync) via LLM. Useful when you've edited content and want fresh metadata.

**Response:** Updated `ArticleResponse` with `enrichment_status: "pending"`. Enrichment runs in the background.

**Errors:**
- `400` — Invalid UUID format
- `404` — Article not found

---

### `PATCH /api/articles/{id}/tags`

Add or remove manual topics and keywords on an article. Manual tags are preserved across re-enrichment.

**Request Body:**
```json
{
  "add_topics": ["machine learning"],
  "remove_topics": [],
  "add_keywords": ["neural network"],
  "remove_keywords": ["old keyword"]
}
```

All fields are optional. Only provided fields are applied.

**Response:** Updated `ArticleResponse`.

---

## Image Upload

### `POST /api/upload`

Upload an image file. Used by the markdown editor's paste handler. Returns a URL that can be embedded in markdown.

**Request:** `multipart/form-data` with a `file` field.

**Constraints:**
- Allowed types: JPEG, PNG, GIF, WebP, SVG
- Max size: configurable via `UPLOAD_MAX_SIZE_MB` (default 10MB)

**Response:**
```json
{
  "url": "/uploads/abc123.png",
  "filename": "abc123.png"
}
```

Images are served statically at `/uploads/{filename}`.

---

## Bookmarks

### `POST /api/bookmarks/{article_id}`

Toggle bookmark on an article. Creates a bookmark if none exists, deletes it if already bookmarked.

**Response:**
```json
{
  "bookmarked": true
}
```

---

### `GET /api/bookmarks`

List bookmarked articles, ordered by most recently bookmarked.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 10 | Results per page (max 100) |

**Response:**
```json
{
  "articles": [
    {
      "id": "...",
      "title": "...",
      "summary": "...",
      "topics": ["AI"],
      "enrichment_status": "completed",
      "created_at": "...",
      "updated_at": "...",
      "bookmarked_at": "..."
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 10
}
```

---

### `GET /api/bookmarks/ids`

Get the set of all bookmarked article IDs. Used by the frontend for efficient bookmark state lookup.

**Response:**
```json
{
  "ids": ["uuid1", "uuid2"]
}
```

---

## Search

### `GET /api/search`

Search articles by semantic similarity or hybrid (semantic + graph) ranking.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | *required* | Search query |
| `limit` | integer | 10 | Max results (1-100) |
| `mode` | string | `"semantic"` | `"semantic"` or `"hybrid"` |
| `alpha` | float | 0.5 | Weight for semantic vs graph (0.0-1.0, only for hybrid mode) |

**Semantic mode** embeds the query and finds articles with the most similar content using cosine similarity.

**Hybrid mode** combines semantic similarity with graph-based relationship scores:
```
hybrid_score = alpha × vector_score + (1 - alpha) × graph_score
```
- `alpha=1.0` — pure semantic
- `alpha=0.0` — pure graph
- `alpha=0.5` — balanced (default)

**Response:**
```json
{
  "results": [
    {
      "article": {
        "id": "...",
        "title": "...",
        "summary": "...",
        "topics": [...],
        "enrichment_status": "completed",
        "created_at": "...",
        "updated_at": "..."
      },
      "score": 0.87
    }
  ],
  "query": "machine learning"
}
```

`score` ranges from 0.0 to 1.0. Higher is more relevant.

---

## Graph

### `GET /api/graph/full`

Get the entire knowledge graph (all nodes and edges).

**Response:**
```json
{
  "nodes": [
    {"id": "...", "label": "Article", "title": "..."},
    {"id": "AI", "label": "Topic", "name": "AI"}
  ],
  "edges": [
    {"source": "...", "target": "AI", "type": "HAS_TOPIC"}
  ]
}
```

Used by the Graph page to render the full network on load.

---

### `GET /api/graph/article/{id}/neighbors`

Find articles related to the given article through shared topics, keywords, or entities. Results are deduplicated using `count(DISTINCT n)` and `collect(DISTINCT ...)`.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | 10 | Max neighbor results |

**Response:**
```json
{
  "article_id": "...",
  "neighbors": [
    {
      "id": "...",
      "title": "Related Article",
      "shared_nodes": 3,
      "connection_type": "Topic"
    }
  ]
}
```

`shared_nodes` — number of distinct shared Topic/Keyword/Entity nodes (higher = more related). Each neighbor appears only once even if connected through multiple shared nodes.

---

### `GET /api/graph/article/{id}/subgraph`

Get the subgraph surrounding an article for visualization. Traversal depth is configurable.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `depth` | integer | 2 | Traversal depth (1-3, clamped) |

**Response:**
```json
{
  "article_id": "...",
  "subgraph": {
    "nodes": [
      {"id": "...", "label": "Article", "title": "..."},
      {"id": "AI", "label": "Topic", "name": "AI"},
      {"id": "Python", "label": "Entity", "name": "Python", "type": "Technology"}
    ],
    "edges": [
      {"source": "...", "target": "AI", "type": "HAS_TOPIC"},
      {"source": "...", "target": "Python", "type": "MENTIONS_ENTITY"}
    ]
  }
}
```

Node labels: `Article`, `Topic`, `Keyword`, `Entity`.

---

### `GET /api/graph/stats`

Get counts of nodes in the graph.

**Response:**
```json
{
  "articles": 42,
  "topics": 15,
  "keywords": 87,
  "entities": 31
}
```

---

## Quiz

### `POST /api/quiz/generate`

Generate a quiz from articles matching selected topics and/or keywords. Uses OR logic — articles matching any filter qualify. Generation runs asynchronously.

**Request Body:**
```json
{
  "topics": ["machine learning", "neural networks"],
  "keywords": ["backpropagation"],
  "quiz_type": "mcq",
  "num_questions": 5
}
```

**Fields:**
- `topics` — list of topics (at least one topic or keyword required)
- `keywords` — list of keywords
- `quiz_type` — one of: `"mcq"`, `"short_answer"`, `"flashcard"`
- `num_questions` — number of questions (1-15)

**Response:**
```json
{
  "quiz_id": "...",
  "status": "generating"
}
```

Poll `GET /api/quiz/status/{quiz_id}` for completion.

---

### `POST /api/quiz/generate/article/{article_id}`

Generate a quiz from a single article's content.

**Request Body:**
```json
{
  "quiz_type": "mcq",
  "num_questions": 10
}
```

---

### `POST /api/quiz/generate/weak`

Generate a quiz targeting weak areas based on flashcard review history (lapsed cards, low ratings).

**Request Body:**
```json
{
  "quiz_type": "mcq",
  "num_questions": 5
}
```

---

### `GET /api/quiz/status/{quiz_id}`

Poll quiz generation status.

**Response:**
```json
{
  "quiz_id": "...",
  "status": "completed",
  "progress": 10,
  "total": 10,
  "quiz_type": "mcq",
  "topics": [...],
  "keywords": [...],
  "article_count": 5,
  "questions": [...],
  "error": null
}
```

---

### `GET /api/quiz/{quiz_id}`

Get a completed quiz with questions and answers.

---

### `POST /api/quiz/{quiz_id}/submit`

Submit quiz answers.

**Request Body:**
```json
{
  "answers": [...],
  "score": 8,
  "total": 10
}
```

---

### `GET /api/quiz/history/list`

List past quiz attempts.

---

### `GET /api/quiz/active/now`

Get the current active (in-progress) quiz, if any.

---

## Study / Flashcards

### `GET /api/study/stats`

Get spaced repetition statistics: total cards, new/learning/review counts, reviews today, retention rate, streak.

---

### `GET /api/study/due`

Get flashcards that are due for review now.

---

### `GET /api/study/new`

Get new (unstudied) flashcards, respecting the daily new card limit.

---

### `POST /api/study/review/{card_id}`

Submit a flashcard review rating. Updates card scheduling via SM-2 algorithm.

**Request Body:**
```json
{
  "rating": 3
}
```

Rating: 1=Again, 2=Hard, 3=Good, 4=Easy.

---

### `GET /api/study/decks`

List all flashcard decks (one per article) with counts for new/learning/review/due.

---

### `GET /api/study/deck/{article_id}`

Get all flashcards for a specific article.

---

### `POST /api/study/generate/{article_id}`

Regenerate flashcards for an article (deletes existing and creates new ones).

---

### `POST /api/study/generate-more/{article_id}`

Generate additional flashcards for an article without deleting existing ones.

**Query Parameters:** `n=5` (number of additional cards)

---

### `POST /api/study/generate-all-missing`

Generate flashcards for all articles that don't have any yet.

---

## RAG Chat

### `POST /api/rag/ask`

Ask a question about your knowledge base. Retrieves relevant articles via semantic search and generates an answer using LLM.

**Request Body:**
```json
{
  "query": "What is backpropagation?",
  "session_id": "optional-session-uuid"
}
```

**Response:**
```json
{
  "answer": "Backpropagation is...",
  "sources": [
    {"id": "...", "title": "Neural Networks 101", "score": 0.87}
  ]
}
```

---

### `POST /api/rag/ask/stream`

Same as `/ask` but returns a streaming response (Server-Sent Events).

**Response format:** `text/event-stream` with `data: {...}` lines for chunks, sources, and `[DONE]`.

---

### `POST /api/rag/sessions`

Create a new chat session.

---

### `GET /api/rag/sessions`

List chat sessions, ordered by most recently updated.

---

### `GET /api/rag/sessions/{session_id}/messages`

Get all messages in a chat session.

---

### `DELETE /api/rag/sessions/{session_id}`

Delete a chat session and all its messages.

---

## LLM Logs

### `GET /api/llm-logs/stats`

Get aggregate statistics for all LLM calls.

**Response:**
```json
{
  "total_calls": 150,
  "total_errors": 3,
  "total_prompt_tokens": 45000,
  "total_completion_tokens": 12000,
  "total_tokens": 57000,
  "avg_duration_ms": 2340.5,
  "operations": [
    {
      "operation": "chat",
      "call_count": 80,
      "error_count": 1,
      "avg_duration_ms": 3100.2,
      "total_prompt_tokens": 30000,
      "total_completion_tokens": 10000,
      "total_tokens": 40000
    },
    {
      "operation": "embed",
      "call_count": 50,
      "error_count": 0,
      "avg_duration_ms": 800.1,
      "total_prompt_tokens": 12000,
      "total_completion_tokens": 0,
      "total_tokens": 12000
    }
  ]
}
```

---

### `GET /api/llm-logs`

Paginated list of LLM call log entries.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `limit` | integer | 20 | Results per page (max 100) |
| `operation` | string | — | Filter by operation name |
| `is_error` | boolean | — | Filter to errors only |

**Response:**
```json
{
  "logs": [
    {
      "id": "...",
      "operation": "chat",
      "model": "gemma4:e4b-it-q8_0",
      "input_text": "Extract topics...",
      "output_text": "{\"topics\": [...]}",
      "duration_ms": 3100.5,
      "prompt_tokens": 850,
      "completion_tokens": 200,
      "total_tokens": 1050,
      "is_error": false,
      "error_message": null,
      "article_id": "...",
      "created_at": "2026-04-27T10:30:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

`input_text` and `output_text` are truncated to 500 chars in the response.

---

### `GET /api/llm-logs/operations`

List all distinct operation names for filtering.

**Response:**
```json
{
  "operations": ["chat", "embed", "generate_title", "normalize_markdown_equations"]
}
```

---

## Graph API Notes

All graph endpoints wrap synchronous Neo4j calls in `ThreadPoolExecutor` to avoid blocking the FastAPI async event loop.
