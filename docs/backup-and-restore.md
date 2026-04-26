# Backup & Restore

This guide covers backing up your knowledge base, restoring from a backup, and rebuilding the Neo4j graph after a restore.

## Key Concept

**Postgres is the source of truth.** Neo4j is never backed up — it is fully rebuildable from Postgres data using the LLM enrichment pipeline. This keeps backups small and avoids Neo4j consistency issues.

---

## Quick Reference

| Command | What it does |
|---|---|
| `make backup` | Create a timestamped backup |
| `make restore` | Interactively restore from a backup |
| `make restore-YYYYMMDD_HHMMSS` | Restore a specific backup directly |
| `make list-backups` | List all available backups |
| `make rebuild-graph` | Rebuild Neo4j graph + embeddings from Postgres |
| `make rebuild-graph-only` | Rebuild only the Neo4j graph |
| `make rebuild-embeddings` | Re-generate only vector embeddings |

---

## 1. Backing Up

```bash
make backup
```

This runs `scripts/backup.sh`, which performs four steps:

1. **Dumps the Postgres database** — full `pg_dump` with `--clean --if-exists` so the restore can overwrite an existing database without conflicts.
2. **Copies the `.env` file** — captures your configuration (LLM endpoint, database credentials, model names) alongside the data.
3. **Compresses everything** into a single tarball at `backups/backup_YYYYMMDD_HHMMSS.tar.gz`.
4. **Prunes old backups** — retains the most recent 10 backups, deletes the rest.

Example output:

```
=== Knowledge Store Backup ===
Timestamp: 20260426_143000
Postgres container: graph-knowledge-store-postgres-1
[1/4] Dumping Postgres database...
  -> Dumped 245760 bytes
[2/4] Copying environment config...
[3/4] Compressing backup...
  -> Saved to backups/backup_20260426_143000.tar.gz (28K)
[4/4] Cleaning up old backups...
  -> 3 backups retained (max 10)

=== Backup complete ===
File: backups/backup_20260426_143000.tar.gz
```

### What gets backed up

| Included | Not included |
|---|---|
| All Postgres data (articles, quiz attempts, embeddings) | Neo4j graph data |
| `.env` configuration | `backups/` directory itself |
| Alembic migration history | Docker volumes |

### Scheduling automatic backups

To run daily backups via cron:

```bash
crontab -e
```

Add a line like:

```
0 2 * * * cd /path/to/graph-knowledge-store && make backup >> /var/log/kb-backup.log 2>&1
```

---

## 2. Restoring from a Backup

### Interactive restore (recommended)

```bash
make restore
```

This lists all available backups and prompts you to pick one:

```
Available backups:

  [1] backup_20260426_143000.tar.gz (28K)
  [2] backup_20260425_020000.tar.gz (24K)
  [3] backup_20260424_020000.tar.gz (22K)

Enter backup number to restore [1-3]:
```

### Direct restore

```bash
# Using the Make shorthand (filename without extension prefix):
make restore-20260426_143000

# Or specify the full path:
bash scripts/restore.sh backups/backup_20260426_143000.tar.gz
```

### What happens during restore

The restore script (`scripts/restore.sh`) performs six steps:

1. **Extracts the tarball** — validates that `postgres_backup.sql` exists inside.
2. **Restores `.env`** — if the backup included an `.env` file, it replaces the current one. Otherwise, keeps the existing config.
3. **Resets Postgres** — stops all containers, deletes the Postgres data volume, starts a fresh Postgres container, and waits for it to be ready (up to 30 seconds).
4. **Loads the SQL dump** — creates the pgvector extension, filters out `DROP EXTENSION` statements (to avoid connection crashes), and pipes the SQL into `psql` to recreate all tables and data.
5. **Runs Alembic migrations** — applies any new migrations that may have been added since the backup was taken, bringing the schema to the latest version.
6. **Starts all services** — brings Neo4j and any other containers back online.

You will see a confirmation prompt before any destructive action:

```
WARNING: This will DELETE the current database and restore from:
  backup_20260426_143000.tar.gz

Are you sure? [y/N]:
```

### Post-restore: rebuild the graph

After a restore, the Neo4j graph is empty. You must rebuild it:

```bash
make rebuild-graph
```

See section 3 below for details.

---

## 3. Rebuilding the Neo4j Knowledge Graph

Since Neo4j is never backed up, it must be rebuilt from Postgres after any restore. The rebuild tool re-runs the LLM enrichment pipeline on every article.

```bash
# Rebuild everything (Neo4j graph + vector embeddings):
make rebuild-graph

# Rebuild only the Neo4j graph (skip embeddings):
make rebuild-graph-only

# Re-generate only vector embeddings (skip Neo4j):
make rebuild-embeddings
```

This runs `scripts/rebuild_graph.py`, which:

1. **Reads all articles** from Postgres (id, title, content).
2. **Clears the Neo4j graph** — runs `MATCH (n) DETACH DELETE n` to start fresh.
3. **Processes each article sequentially:**
   - Sends article content to the LLM to extract topics, keywords, entities, and summary.
   - Creates/updates the article node in Neo4j with links to Topic, Keyword, and Entity nodes.
   - Updates the article's metadata columns in Postgres.
   - Chunks the article text and generates vector embeddings via the embedding model.
4. **Logs progress** with success/failure counts.

Example output:

```
==================================================
Knowledge Store — Rebuild Tool
==================================================

  [x] Rebuild Neo4j knowledge graph
  [x] Re-generate vector embeddings

Found 42 articles to process.

Clearing Neo4j graph...

Processing 42 articles...

2026-04-26 14:35:01 [INFO] [1/42] Processed: Introduction to Graph Databases
2026-04-26 14:35:04 [INFO] [2/42] Processed: Vector Search Fundamentals
...

==================================================
Done! 41 succeeded, 1 failed out of 42 articles.
==================================================
```

### Important notes

- **This is slow.** Each article requires one or more LLM calls. With 40+ articles and a local Ollama model, expect several minutes to an hour depending on hardware.
- **Requires the LLM to be running.** The rebuild calls the same LLM endpoint configured in `.env`. Make sure Ollama (or your configured endpoint) is accessible.
- **Failed articles are logged but don't stop the process.** Check the output for any failures and re-run if needed.
- **The Postgres data is not modified** (except updating metadata columns like topics/keywords/entities on each article, which is part of normal enrichment).

---

## 4. Full Disaster Recovery Workflow

If you lose everything and need to rebuild from scratch:

```bash
# 1. Make sure Docker containers are running
docker compose up -d

# 2. Restore from your most recent backup
make restore

# 3. Rebuild the Neo4j graph and embeddings
make rebuild-graph
```

That's it. Postgres holds all articles and quiz data. Neo4j and embeddings are derived entirely from Postgres + LLM.

---

## 5. What Gets Rebuilt vs. What Doesn't

| Data | Backed up? | Rebuildable? |
|---|---|---|
| Articles (content, metadata) | Yes (Postgres) | N/A — restored directly |
| Quiz attempts | Yes (Postgres) | N/A — restored directly |
| Vector embeddings | Yes (Postgres) | Yes — `make rebuild-embeddings` |
| Neo4j graph (topics, keywords, entities, relationships) | No | Yes — `make rebuild-graph-only` |
| `.env` configuration | Yes (in tarball) | No — must recreate manually if backup is missing |

---

## 6. File Locations

| Path | Description |
|---|---|
| `scripts/backup.sh` | Backup script |
| `scripts/restore.sh` | Restore script |
| `scripts/rebuild_graph.py` | Graph/embedding rebuild script |
| `backups/` | Directory holding backup tarballs (gitignored) |
| `backups/backup_*.tar.gz` | Individual backup archives |
| `Makefile` | Convenience targets for all commands |
