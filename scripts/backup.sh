#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"
KEEP_LAST=10

source "$PROJECT_DIR/.env" 2>/dev/null || true

PG_CONTAINER="graph-knowledge-store-postgres-1"
PG_USER="${POSTGRES_USER:-postgres}"
PG_DB="${POSTGRES_DB:-graphknowledge}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="backup_${TIMESTAMP}"
WORK_DIR=$(mktemp -d)

echo "=== Knowledge Store Backup ==="
echo "Timestamp: $TIMESTAMP"

if ! docker ps --format '{{.Names}}' | grep -q "$PG_CONTAINER"; then
    PG_CONTAINER=$(docker ps --filter "ancestor=postgres:16.9-with-vector" --format '{{.Names}}' | head -1)
fi

if [ -z "$PG_CONTAINER" ]; then
    echo "ERROR: Postgres container not found. Is Docker running?"
    exit 1
fi

echo "Postgres container: $PG_CONTAINER"

echo "[1/4] Dumping Postgres database..."
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" "$PG_DB" --clean --if-exists > "$WORK_DIR/postgres_backup.sql"
echo "  -> Dumped $(wc -c < "$WORK_DIR/postgres_backup.sql") bytes"

echo "[2/5] Copying environment config..."
cp "$PROJECT_DIR/.env" "$WORK_DIR/env_backup" 2>/dev/null || echo "  -> No .env file found, skipping"

UPLOADS_DIR="$PROJECT_DIR/uploads"
if [ -d "$UPLOADS_DIR" ] && [ "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
    echo "[3/5] Including uploaded images..."
    cp -r "$UPLOADS_DIR" "$WORK_DIR/uploads"
    UPLOADED_COUNT=$(ls -1 "$WORK_DIR/uploads" | wc -l)
    echo "  -> $UPLOADED_COUNT file(s) from uploads/"
else
    echo "[3/5] No uploaded images found, skipping"
fi

echo "[4/5] Compressing backup..."
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" -C "$WORK_DIR" .
echo "  -> Saved to backups/${BACKUP_NAME}.tar.gz ($(du -h "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" | cut -f1))"

echo "[5/5] Cleaning up old backups..."
ls -1t "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | tail -n +$((KEEP_LAST + 1)) | xargs -r rm
REMAINING=$(ls -1 "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | wc -l)
echo "  -> $REMAINING backups retained (max $KEEP_LAST)"

rm -rf "$WORK_DIR"

echo ""
echo "=== Backup complete ==="
echo "File: backups/${BACKUP_NAME}.tar.gz"
