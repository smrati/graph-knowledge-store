#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[START]${NC} $*"; }
warn() { echo -e "${YELLOW}[START]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

cleanup() {
    echo ""
    log "Shutting down..."
    if [ -n "${BACKEND_PID:-}" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
    if [ -n "${FRONTEND_PID:-}" ]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
    if [ -n "${DOCKER_STARTED:-}" ]; then
        docker compose down
        log "Docker containers stopped"
    fi
    log "Done"
    exit 0
}
trap cleanup SIGINT SIGTERM

if [ ! -f .env ]; then
    err ".env file not found. Run: cp .env.example .env"
    exit 1
fi

log "Checking Docker containers..."
if ! docker compose ps -q postgres 2>/dev/null | grep -q . || \
   ! docker compose ps -q neo4j 2>/dev/null | grep -q .; then
    log "Starting databases (Postgres + Neo4j)..."
    docker compose up -d
    DOCKER_STARTED=1

    log "Waiting for Postgres..."
    for i in $(seq 1 30); do
        if docker compose exec -T postgres pg_isready -U postgres &>/dev/null; then
            break
        fi
        sleep 1
    done

    log "Waiting for Neo4j..."
    for i in $(seq 1 60); do
        if docker compose exec -T neo4j cypher-shell -u neo4j -p password123 "RETURN 1" &>/dev/null; then
            break
        fi
        sleep 2
    done
    log "Databases ready"
else
    warn "Databases already running"
fi

log "Running database migrations..."
uv run alembic upgrade head

log "Starting backend (uvicorn)..."
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

log "Starting frontend (vite)..."
cd frontend
npx vite --host &
FRONTEND_PID=$!
cd "$ROOT_DIR"

sleep 2

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Graph Knowledge Store is running!${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "  Frontend:  ${GREEN}http://localhost:5173${NC}"
echo -e "  Backend:   ${GREEN}http://localhost:8000${NC}"
echo -e "  Neo4j:     ${GREEN}http://localhost:7474${NC}"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop all services"
echo ""

wait
