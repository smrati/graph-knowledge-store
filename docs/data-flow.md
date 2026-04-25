# Data Flow

## Article Create

```
User writes markdown in browser
        │
        ▼  POST /api/articles {title?, content, fix_equations?}
┌───────────────┐
│  FastAPI       │  Synchronous
│  article_svc   │──────────▶ If no title: generate_title() via LLM
│                │──────────▶ If fix_equations: normalize_markdown_equations()
│                │──────────▶ Save to Postgres (enrichment_status="pending")
└───────┬───────┘             Return 201 immediately
        │
        │  Background Task (_enrich_article)
        │
        ├─ 1. Set enrichment_status = "processing"
        │
        ├─ 2. LLM Extraction (extraction_service)
        │     Send content to chat model
        │     Parse JSON: topics, keywords, entities, summary
        │     Store in Postgres (enrichment_status="completed")
        │
        ├─ 3. Embedding (embedding_service)
        │     Chunk text (paragraphs, 100-1000 chars, 50 char overlap)
        │     Embed each chunk via embedding model
        │     Store vectors in article_embeddings (pgvector)
        │
        └─ 4. Graph Sync (graph_service)
              MERGE Article node in Neo4j
              DELETE old relationships
              MERGE Topic/Keyword/Entity nodes
              CREATE HAS_TOPIC/HAS_KEYWORD/MENTIONS_ENTITY edges
```

The user gets an immediate response after step 1. Steps 2-4 run in the background. The frontend can poll or the user can refresh to see enrichment results.

## Article Update

```
PUT /api/articles/{id} {title?, content?, fix_equations?}
        │
        ▼
Update Postgres (only changed fields)
        │
        ▼  If content changed:
Background Task (_enrich_article)
    → Same pipeline as create:
      re-extract → re-embed → re-sync graph
```

Only content changes trigger re-enrichment. Title-only changes just update Postgres.

## Article Delete

```
DELETE /api/articles/{id}
        │
        ├─▶ Neo4j: DETACH DELETE Article node (removes node + all relationships)
        │
        └─▶ Postgres: DELETE FROM articles WHERE id=?
              CASCADE automatically deletes all article_embeddings rows
```

Neo4j cleanup happens first, then Postgres. Orphaned Topic/Keyword/Entity nodes remain in Neo4j (they may be shared by other articles).

## Semantic Search

```
GET /api/search?q=machine+learning&mode=semantic
        │
        ▼
1. Embed query string via embedding model
        │
        ▼
2. SQL cosine distance query:
   SELECT article_id, MAX(1 - (embedding <=> query_vector)) AS score
   FROM article_embeddings
   GROUP BY article_id
   ORDER BY score DESC
   LIMIT 10
        │
        ▼
3. Join with articles table for metadata
        │
        ▼
4. Return ranked results with scores
```

Search operates on **chunks**, not whole articles. An article with multiple chunks returns its best-matching chunk score. This handles long articles better than embedding the full text.

## Hybrid Search

```
GET /api/search?q=...&mode=hybrid&alpha=0.5
        │
        ▼
1. Run semantic search with 3x limit (broader candidate pool)
        │
        ▼
2. For each candidate article, query Neo4j neighbors:
   MATCH (a)-[:HAS_TOPIC|HAS_KEYWORD|MENTIONS_ENTITY]->(n)
         <-[:HAS_TOPIC|HAS_KEYWORD|MENTIONS_ENTITY]-(other:Article)
   Count shared nodes → graph_score
        │
        ▼
3. Normalize graph scores to [0, 1]
        │
        ▼
4. Combine:
   hybrid_score = alpha * vector_score + (1-alpha) * graph_score
        │
        ▼
5. Sort by hybrid_score, return top N
```

The `alpha` parameter (0.0 to 1.0, default 0.5) controls the balance:
- `alpha=1.0` — pure semantic search (ignores graph)
- `alpha=0.0` — pure graph search (ignores semantics)
- `alpha=0.5` — equal weight (default)

## Client-Side Type-Ahead Search

```
User types in search/graph/quiz input
        │
        ▼  On page load: GET /api/articles/index
Build fuse.js index (title, summary, topics, keywords)
        │
        ▼  On keystroke (150ms debounce, min 2 chars):
fuse.search(query, {limit: 8})
        │
        ▼
Display "Quick Matches" instantly (< 10ms)
        │
        ▼  On form submit (explicit):
GET /api/search?q=...&mode=semantic|hybrid
        │
        ▼
Display "Semantic Results" from server
```

Type-ahead uses the lightweight `/api/articles/index` endpoint (no content, no pagination) and runs entirely client-side via fuse.js. The full semantic search only fires on explicit submit.

## Graph Visualization

```
User visits /graph page
        │
        ▼  On load:
GET /api/graph/full → render full network
GET /api/graph/stats → show node counts
GET /api/articles/index → build fuse.js for article search
        │
        ▼  User types in search → fuse.js suggestions
        │
        ▼  User selects article (or clicks node):
GET /api/graph/article/{id}/subgraph?depth=2
        │
        ▼
Render zoomed subgraph neighborhood
        │
        ▼  User clicks "Clear":
GET /api/graph/full → back to full network
```

The graph uses `react-force-graph-2d` with force-directed layout, draggable nodes, zoom, and pan. Node colors adapt to dark mode (lighter pastel variants on dark background).

## Topic/Keyword Filtering

```
User clicks topic/keyword chip on article detail or card
        │
        ▼  Navigate to /?topic=X or /?keyword=Y
        │
        ▼
GET /api/articles?topic=X  (case-insensitive JSONB match)
        │
        ▼
Display filtered article list with dismissible filter chip
and "Take Quiz" button
```

## Quiz Generation

```
User selects topics + keywords on Quiz page (multi-select with fuse.js type-ahead)
        │
        ▼  POST /api/quiz/generate {topics, keywords, quiz_type, num_questions}
        │
        ▼  Backend:
1. Fetch matching articles (OR logic across all topics/keywords)
2. Build prompt: summaries + metadata from ALL articles
                   + full content from SAMPLED subset (max 6)
3. Cap prompt at 8000 chars
4. Send to LLM → parse JSON response
        │
        ▼  Frontend:
QuizRunner renders based on quiz_type:
  - MCQ: 4 options, green/red feedback, explanation, auto-advance
  - Short Answer: text input → model answer + key points → self-score
  - Flashcard: click to flip → "Got It" / "Missed It" self-rating
        │
        ▼
Score card at end with "Try Again" button
```

## Graph Neighbor Query

```
GET /api/graph/article/{id}/neighbors
        │
        ▼
MATCH (a:Article {id})-[:HAS_TOPIC|HAS_KEYWORD|MENTIONS_ENTITY]->(n)
      <-[:HAS_TOPIC|HAS_KEYWORD|MENTIONS_ENTITY]-(other:Article)
WITH other, count(DISTINCT n) AS shared_nodes,
     collect(DISTINCT ...label)[0] AS connection_type
RETURN other, shared_nodes, connection_type
ORDER BY shared_nodes DESC
```

Results are deduplicated: each neighbor article appears exactly once, even if connected through multiple shared nodes of different types.

## Source of Truth

**Postgres** is the single source of truth. Neo4j holds derived data that is fully rebuildable:

```
Postgres articles + LLM extraction → Neo4j nodes + relationships
```

If Neo4j data is lost or corrupted, it can be rebuilt by running:
```bash
make rebuild-graph          # rebuild graph + embeddings
make rebuild-graph-only     # rebuild graph only
make rebuild-embeddings     # rebuild embeddings only
```

## Backup & Restore

```
make backup
        │
        ▼
1. pg_dump from Postgres container → postgres_backup.sql
2. Copy .env → env_backup
3. Compress to backups/backup_YYYYMMDD_HHMMSS.tar.gz
4. Auto-cleanup: keep last 10 backups

make restore
        │
        ▼
1. List available backups (interactive menu)
2. User confirms restore
3. docker compose down + delete Postgres volume
4. docker compose up -d (fresh Postgres)
5. Restore SQL dump into new database
6. Run alembic upgrade head
7. Print: "Run make rebuild-graph to rebuild Neo4j"
```
