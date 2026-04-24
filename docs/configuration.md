# Configuration Guide

All configuration is managed through environment variables, loaded from a `.env` file in the project root. The `app/config.py` module uses `pydantic-settings` to read and validate these values.

## Setup

```bash
cp .env.example .env
# Edit .env with your settings
```

## Environment Variables

### LLM Configuration

These control which LLM provider and models the application uses.

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible API base URL |
| `LLM_API_KEY` | `ollama` | API key (unused by Ollama, required by OpenAI) |
| `LLM_CHAT_MODEL` | `gemma2:9b-instruct-q4_K_M` | Model for chat completions (metadata extraction) |
| `LLM_EMBEDDING_MODEL` | `qwen3-embedding:0.6b` | Model for text embeddings |
| `LLM_EMBEDDING_DIMENSIONS` | `1024` | Vector dimension of the embedding model output |

### Postgres Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `localhost` | Postgres host |
| `POSTGRES_PORT` | `5432` | Postgres port |
| `POSTGRES_DB` | `graphknowledge` | Database name |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | `postgres` | Database password |

### Neo4j Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j bolt URI |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `password123` | Neo4j password |

## Switching LLM Providers

### Ollama (default)

```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_CHAT_MODEL=gemma2:9b-instruct-q4_K_M
LLM_EMBEDDING_MODEL=qwen3-embedding:0.6b
LLM_EMBEDDING_DIMENSIONS=1024
```

### OpenAI

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-your-key-here
LLM_CHAT_MODEL=gpt-4o-mini
LLM_EMBEDDING_MODEL=text-embedding-3-small
LLM_EMBEDDING_DIMENSIONS=1536
```

### Any OpenAI-Compatible Provider

Works with any service that implements the OpenAI API format (LiteLLM, Together AI, Groq, Azure OpenAI, etc.):

```env
LLM_BASE_URL=https://your-provider.com/v1
LLM_API_KEY=your-api-key
LLM_CHAT_MODEL=model-name
LLM_EMBEDDING_MODEL=embedding-model-name
LLM_EMBEDDING_DIMENSIONS=1024
```

**Important:** If you change `LLM_EMBEDDING_MODEL` or `LLM_EMBEDDING_DIMENSIONS`, you must re-embed all existing articles. The vector dimension is baked into the database schema. Run:

```bash
# Drop and recreate embeddings table, then re-embed
uv run alembic downgrade base
uv run alembic upgrade head
# Then trigger re-enrichment for each article via PUT /api/articles/{id}
```

## How Configuration Works

The `app/config.py` module defines a `Settings` class:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    llm_base_url: str = "http://localhost:11434/v1"
    ...
```

- Environment variables take precedence over `.env` file values
- All settings have sensible defaults for local development
- Computed properties like `postgres_url` build connection strings from individual settings
- The `settings` singleton is imported by other modules

The LLM client (`app/services/llm_service.py`) creates an `openai.OpenAI` client with the configured `base_url` and `api_key`, so the same code works with any compatible provider.

## Docker Compose

The `docker-compose.yml` defines two services. Their credentials must match your `.env`:

```yaml
services:
  postgres:
    image: postgres:16.9-with-vector
    environment:
      POSTGRES_DB: graphknowledge    # matches POSTGRES_DB
      POSTGRES_USER: postgres        # matches POSTGRES_USER
      POSTGRES_PASSWORD: postgres    # matches POSTGRES_PASSWORD
    ports:
      - "5432:5432"                  # matches POSTGRES_PORT

  neo4j:
    image: neo4j:2025.11.2
    environment:
      NEO4J_AUTH: neo4j/password123  # format: NEO4J_USER/NEO4J_PASSWORD
    ports:
      - "7474:7474"                  # Neo4j browser UI
      - "7687:7687"                  # matches NEO4J_URI bolt port
```

If you change credentials in `.env`, update `docker-compose.yml` to match (or vice versa).
