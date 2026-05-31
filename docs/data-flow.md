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

## Article Regenerate

```
POST /api/articles/{id}/regenerate
        │
        ▼
1. Re-generate title via LLM (generate_title)
        │
        ▼
2. Set enrichment_status = "pending"
        │
        ▼
3. Background Task (_enrich_article)
    → Same pipeline as create:
      re-extract → re-embed → re-sync graph
```

Useful when you've edited an article and want fresh metadata. The frontend auto-polls every 3s while enrichment is pending/processing to show updated tags when complete.

## Article Delete

```
DELETE /api/articles/{id}
        │
        ├─▶ Neo4j: DETACH DELETE Article node (removes node + all relationships)
        │
        └─▶ Postgres: DELETE FROM articles WHERE id=?
              CASCADE automatically deletes all article_embeddings rows
```

Neo4j cleanup happens first, then Postgres. Orphaned Topic/Keyword/Entity nodes remain in Neo4j (they may be shared by other articles). Bookmarks and flashcards are cascade-deleted.

## Image Upload

```
User pastes image in markdown editor
        │
        ▼  POST /api/upload (multipart/form-data)
        │
        ├─ Validate: type (JPEG/PNG/GIF/WebP/SVG), size (max 10MB)
        │
        ├─ Generate UUID filename, save to uploads/
        │
        └─ Return {url: "/uploads/abc123.png"}
                │
                ▼
Insert markdown image syntax at cursor: ![...](/uploads/abc123.png)
```

Images are stored locally in `uploads/` with UUID filenames. The `uploads/` directory is included in backups.

## Bookmarks

```
User clicks bookmark toggle on ArticleView or ArticleCard
        │
        ▼  POST /api/bookmarks/{article_id}
        │
        ├─ If not bookmarked: INSERT into bookmarks table
        └─ If already bookmarked: DELETE from bookmarks table
        │
        ▼
Return {bookmarked: true|false}
```

The homepage fetches all bookmark IDs on load (`GET /api/bookmarks/ids`) for efficient highlight state on article cards.

## Manual Tags

```
User adds/removes topic or keyword chip on ArticleView
        │
        ▼  PATCH /api/articles/{id}/tags
     {add_topics: [...], remove_topics: [...], add_keywords: [...], remove_keywords: [...]}
        │
        ▼
Update manual_topics / manual_keywords arrays
Merge into topics / keywords arrays
Sync updated tags to Neo4j graph
```

Manual tags are preserved across re-enrichment. When enrichment re-runs, LLM-extracted tags are merged with manual tags.

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
2. Create QuizAttempt (status="generating")
3. Async task: build prompt, send to LLM, parse JSON response
        │
        ▼  Frontend:
Poll GET /api/quiz/status/{quiz_id} until status="completed"
QuizRunner renders based on quiz_type:
  - MCQ: 4 options, green/red feedback, explanation, auto-advance
  - Short Answer: text input → model answer + key points → self-score
  - Flashcard: click to flip → "Got It" / "Missed It" self-rating
        │
        ▼
Score card at end with "Try Again" button
```

Quiz generation is now asynchronous — the API returns a `quiz_id` immediately, and the frontend polls for completion. Article-specific and weak-area quizzes are also available.

## Flashcard Study (Spaced Repetition)

```
Article enriched → if flashcard_auto_generate=true:
        │
        ▼  Background: generate_flashcards_for_article()
    LLM generates N flashcards (front/back/hint)
    Deduplicates against existing cards
        │
        ▼
User visits Study page
        │
        ├─ GET /api/study/stats → dashboard cards
        ├─ GET /api/study/due → due cards for review
        ├─ GET /api/study/new → new cards (daily limit)
        ├─ GET /api/study/decks → per-article deck list
        │
        ▼  User reviews card:
POST /api/study/review/{card_id} {rating: 1-4}
        │
        ▼  SM-2 Algorithm (spaced_rep.py):
Rating 1 (Again) → relearning step, lapse++
Rating 2 (Hard) → ease decrease, small interval bump
Rating 3 (Good) → normal interval scheduling
Rating 4 (Easy) → ease increase, bonus multiplier
```

The SM-2 scheduler uses configurable learning/relearning steps, graduating intervals, and ease factors from `.env`.

## RAG Chat

```
User asks question on Chat page
        │
        ▼  POST /api/rag/ask/stream {query, session_id?}
        │
        ▼  Backend:
1. Embed query → search similar articles (top 5)
2. Build context from article content (capped at 3000 chars each)
3. Load chat history (if session_id provided, max 20 messages)
4. Stream LLM response (SSE chunks)
        │
        ▼  Frontend:
Render streaming chunks in real-time
Show source articles with relevance scores
Save messages to chat session
```

Chat sessions persist full conversation history. History is trimmed to the last 20 messages / 20,000 chars to stay within LLM context limits.

## LLM Call Logging

Every LLM call (chat, generate_title, normalize_markdown_equations, embed) is logged automatically:

```
LLM function called (e.g., chat, embed, generate_title)
        │
        ▼  Start timer
        │
        ▼  Call LLM API
        │
        ▼  Stop timer, measure duration_ms
        │
        ├─ Extract usage from API response (prompt_tokens, completion_tokens)
        │  OR estimate tokens: len(text) / 4 if API doesn't provide usage
        │
        ▼  INSERT into llm_call_logs (sync SQLAlchemy session):
           - operation, model, input_text, output_text
           - duration_ms, prompt_tokens, completion_tokens, total_tokens
           - is_error, error_message, article_id (if applicable)
        │
        ▼  Dashboard:
GET /api/llm-logs/stats   → aggregate counts, latency, tokens by operation
GET /api/llm-logs         → paginated log entries (filterable by operation, is_error)
```

Token estimation uses ~4 chars/token when the API (e.g., Ollama) doesn't return usage data. The logging uses a sync DB session (`psycopg2-binary`) to avoid interfering with the async engine. Logs are kept indefinitely.

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
3. Copy uploads/ → uploads/ (pasted/uploaded images)
4. Compress to backups/backup_YYYYMMDD_HHMMSS.tar.gz
5. Auto-cleanup: keep last 10 backups

make restore
        │
        ▼
1. List available backups (interactive menu)
2. User confirms restore
3. Extract tarball
4. Restore .env if present
5. Restore uploads/ directory (image files)
6. docker compose down + delete Postgres volume
7. docker compose up -d (fresh Postgres)
8. Create pgvector extension, filter DROP EXTENSION, restore SQL dump
9. Run alembic upgrade head
10. Start all services
```
