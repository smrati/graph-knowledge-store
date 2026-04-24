# Database Schema

## Postgres (with Pgvector)

The Pgvector extension is enabled via Alembic migration. All migrations live in `alembic/versions/`.

### `articles` table

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | No | `gen_random_uuid()` | Primary key |
| `title` | VARCHAR(500) | No | — | Article title (auto-generated if omitted on create) |
| `content` | TEXT | No | — | Markdown content |
| `summary` | TEXT | Yes | — | LLM-generated 1-2 sentence summary |
| `topics` | JSONB | No | `[]` | Array of strings, e.g. `["AI", "Python"]` |
| `keywords` | JSONB | No | `[]` | Array of strings, e.g. `["neural network", "backpropagation"]` |
| `entities` | JSONB | No | `[]` | Array of objects, e.g. `[{"name": "PyTorch", "type": "Technology"}]` |
| `enrichment_status` | VARCHAR(20) | No | `"pending"` | One of: `pending`, `processing`, `completed`, `failed` |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp (auto-updated) |

#### Querying JSONB arrays

Filtering by topic or keyword uses case-insensitive matching:

```sql
-- Find all articles with topic "machine learning" (case-insensitive)
SELECT * FROM articles
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(articles.topics) elem
  WHERE LOWER(elem) = LOWER('Machine Learning')
);
```

### `article_embeddings` table

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | No | `gen_random_uuid()` | Primary key |
| `article_id` | UUID | No | — | Foreign key to `articles.id` (CASCADE delete) |
| `chunk_text` | TEXT | No | — | The text chunk that was embedded |
| `chunk_index` | INTEGER | No | — | Zero-based index of this chunk |
| `embedding` | VECTOR(dim) | Yes | — | Vector embedding (dimension from `LLM_EMBEDDING_DIMENSIONS` config, default 1024) |

The `embedding` column uses Pgvector's `VECTOR` type. The dimension is configurable via the `LLM_EMBEDDING_DIMENSIONS` environment variable.

**Changing the embedding dimension** requires dropping and recreating the `article_embeddings` table and re-embedding all articles.

### Entity types

The `entities` JSONB column stores objects with these type values:

| Type | Examples |
|------|----------|
| `Person` | "Alan Turing", "Guido van Rossum" |
| `Organization` | "OpenAI", "Google" |
| `Technology` | "Python", "PostgreSQL", "React" |
| `Place` | "San Francisco", "Silicon Valley" |
| `Concept` | "Machine Learning", "Microservices" |

## Neo4j Graph

### Node types

```cypher
(:Article {id: STRING, title: STRING})
(:Topic   {name: STRING})
(:Keyword {name: STRING})
(:Entity  {name: STRING, type: STRING})
```

### Relationships

```cypher
(:Article)-[:HAS_TOPIC]->(:Topic)
(:Article)-[:HAS_KEYWORD]->(:Keyword)
(:Article)-[:MENTIONS_ENTITY]->(:Entity)
```

### Constraints

```cypher
CREATE CONSTRAINT FOR (a:Article) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT FOR (t:Topic)   REQUIRE t.name IS UNIQUE;
CREATE CONSTRAINT FOR (k:Keyword) REQUIRE k.name IS UNIQUE;
```

These are created automatically on application startup via `neo4j_client.init_constraints()`.

### Example graph

For an article "Introduction to Neural Networks" with topics `["AI", "Deep Learning"]`, keywords `["backpropagation", "gradient descent"]`, and entity `{"name": "PyTorch", "type": "Technology"}`:

```
(Article: "Introduction to Neural Networks")
    -[:HAS_TOPIC]-> (Topic: "AI")
    -[:HAS_TOPIC]-> (Topic: "Deep Learning")
    -[:HAS_KEYWORD]-> (Keyword: "backpropagation")
    -[:HAS_KEYWORD]-> (Keyword: "gradient descent")
    -[:MENTIONS_ENTITY]-> (Entity: "PyTorch" / Technology)
```

If another article also has topic "AI", they share the same Topic node, creating a graph connection:

```
(Article A)-[:HAS_TOPIC]->(Topic: "AI")<-[:HAS_TOPIC]-(Article B)
```

This shared-node pattern is what powers the graph-based related articles feature.

### Data consistency

- **Postgres → Neo4j sync** happens in background tasks after article save
- Neo4j operations use `MERGE` (upsert) — safe to re-run
- On article update, old relationships are deleted before creating new ones
- On article delete, `DETACH DELETE` removes the Article node and all its relationships
- Topic/Keyword/Entity nodes persist even if only one article references them (they become orphans but don't cause issues)
