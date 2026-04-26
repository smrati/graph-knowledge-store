#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"

source "$PROJECT_DIR/.env" 2>/dev/null || true

PG_CONTAINER="graph-knowledge-store-postgres-1"
PG_USER="${POSTGRES_USER:-postgres}"
PG_DB="${POSTGRES_DB:-graphknowledge}"
PG_PASSWORD="${POSTGRES_PASSWORD:-postgres}"

echo "=== Knowledge Store Restore ==="

if [ $# -ge 1 ]; then
    BACKUP_FILE="$1"
else
    echo ""
    echo "Available backups:"
    echo ""
    i=1
    while IFS= read -r f; do
        SIZE=$(du -h "$f" | cut -f1)
        NAME=$(basename "$f")
        echo "  [$i] $NAME ($SIZE)"
        i=$((i + 1))
    done < <(ls -1t "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null)

    if [ $i -eq 1 ]; then
        echo "  (no backups found)"
        exit 1
    fi

    echo ""
    read -rp "Enter backup number to restore [1-$((i-1))]: " CHOICE

    BACKUP_FILE=$(ls -1t "$BACKUP_DIR"/backup_*.tar.gz | sed -n "${CHOICE}p")

    if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
        echo "ERROR: Invalid selection"
        exit 1
    fi
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo ""
echo "WARNING: This will DELETE the current database and restore from:"
echo "  $(basename "$BACKUP_FILE")"
echo ""
read -rp "Are you sure? [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Cancelled."
    exit 0
fi

WORK_DIR=$(mktemp -d)
echo ""
echo "[1/6] Extracting backup..."
tar -xzf "$BACKUP_FILE" -C "$WORK_DIR"

if [ ! -f "$WORK_DIR/postgres_backup.sql" ]; then
    echo "ERROR: postgres_backup.sql not found in backup archive"
    rm -rf "$WORK_DIR"
    exit 1
fi
echo "  -> Extracted $(du -h "$WORK_DIR/postgres_backup.sql" | cut -f1)"

if [ -f "$WORK_DIR/env_backup" ]; then
    echo "[2/6] Restoring .env config..."
    cp "$WORK_DIR/env_backup" "$PROJECT_DIR/.env"
    source "$PROJECT_DIR/.env"
    PG_USER="${POSTGRES_USER:-postgres}"
    PG_DB="${POSTGRES_DB:-graphknowledge}"
    PG_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
    echo "  -> .env restored"
else
    echo "[2/6] No .env in backup, keeping current"
fi

echo "[3/6] Restarting Postgres with fresh data..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" down
docker volume rm graph-knowledge-store_postgres_data 2>/dev/null || true
docker compose -f "$PROJECT_DIR/docker-compose.yml" up -d postgres

echo "  -> Waiting for Postgres to be ready..."
PG_READY=false
for i in $(seq 1 30); do
    if docker exec "$(docker ps --filter "ancestor=postgres:16.9-with-vector" --format '{{.Names}}' | head -1)" pg_isready -U "$PG_USER" &>/dev/null; then
        PG_READY=true
        break
    fi
    sleep 1
done
if [ "$PG_READY" = true ]; then
    sleep 3
fi

PG_CONTAINER=$(docker ps --filter "ancestor=postgres:16.9-with-vector" --format '{{.Names}}' | head -1)
if [ -z "$PG_CONTAINER" ]; then
    echo "ERROR: Postgres container failed to start"
    rm -rf "$WORK_DIR"
    exit 1
fi

echo "[4/6] Restoring database..."
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null
grep -v 'DROP EXTENSION' "$WORK_DIR/postgres_backup.sql" | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB"
echo "  -> Database restored"

echo "[5/6] Running Alembic migrations..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" up -d neo4j
cd "$PROJECT_DIR" && .venv/bin/alembic upgrade head 2>/dev/null || python -m alembic upgrade head 2>/dev/null || echo "  -> Alembic skipped (run manually if needed)"

echo "[6/6] Starting all services..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" up -d

rm -rf "$WORK_DIR"

echo ""
echo "=== Restore complete ==="
echo ""
echo "Postgres database restored successfully."
echo "To rebuild the Neo4j knowledge graph, run:"
echo "  make rebuild-graph"
