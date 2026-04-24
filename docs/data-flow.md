# Data Flow

## Article Create

```
User writes markdown in browser
        │
        ▼  POST /api/articles {title, content}
┌───────────────┐
│  FastAPI       │  Synchronous
│  article_svc   │──────────▶ Save to Postgres (enrichment_status="pending")
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
PUT /api/articles/{id} {title?, content?}
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
         <-[:HAS_TOPIC|HAS_KEYWORD|MENTS_ENTITY]-(other:Article)
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

## Graph Neighbor Query

```
GET /api/graph/article/{id}/neighbors
        │
        ▼
MATCH (a:Article {id})-[:HAS_TOPIC|HAS_KEYWORD|MENTS_ENTITY]->(n)
      <-[:HAS_TOPIC|HAS_KEYWORD|MENTS_ENTITY]-(other:Article)
RETURN other, count(n) AS shared_nodes
ORDER BY shared_nodes DESC
```

This finds articles connected through shared Topic, Keyword, or Entity nodes. More shared nodes = stronger relationship.

## Source of Truth

**Postgres** is the single source of truth. Neo4j holds derived data that is fully rebuildable:

```
Postgres articles + LLM extraction → Neo4j nodes + relationships
```

If Neo4j data is lost or corrupted, it can be rebuilt by re-running enrichment on all articles.
