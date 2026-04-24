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
| `limit` | integer | 20 | Results per page (max 100) |
| `topic` | string | — | Filter by topic (case-insensitive) |
| `keyword` | string | — | Filter by keyword (case-insensitive) |

Filtering uses case-insensitive matching against the JSONB arrays.

**Examples:**
```
GET /api/articles?page=2&limit=10
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
  "limit": 20
}
```

Note: `content` is not included in list responses.

---

### `GET /api/articles/index`

Returns a lightweight index of all articles for client-side search. Only includes `id`, `title`, `summary`, `keywords` — no content or pagination.

**Response:**
```json
{
  "articles": [
    {
      "id": "...",
      "title": "...",
      "summary": "...",
      "keywords": ["kw1", "kw2"]
    }
  ]
}
```

Used by fuse.js on the Search and Graph pages for instant type-ahead suggestions.

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

Delete an article and all associated data (embeddings, graph nodes/relationships).

**Response:** 204 No Content

**Errors:**
- `400` — Invalid UUID format
- `404` — Article not found

---

## Search

### `GET /api/search`

Search articles by semantic similarity or hybrid (semantic + graph) ranking.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | *required* | Search query |
| `limit` | integer | 10 | Max results (1-50) |
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

Find articles related to the given article through shared topics, keywords, or entities.

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

`shared_nodes` — number of shared Topic/Keyword/Entity nodes (higher = more related).
`connection_type` — the most common node label shared between the two articles.

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

## Graph API Notes

All graph endpoints wrap synchronous Neo4j calls in `ThreadPoolExecutor` to avoid blocking the FastAPI async event loop.
