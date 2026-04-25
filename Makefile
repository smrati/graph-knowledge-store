.PHONY: backup restore rebuild-graph dev

backup:
	@bash scripts/backup.sh

restore:
	@bash scripts/restore.sh $(filter-out $@,$(MAKECMDGOALS))

restore-%:
	@bash scripts/restore.sh backups/backup_$*.tar.gz

rebuild-graph:
	@python scripts/rebuild_graph.py

rebuild-graph-only:
	@python scripts/rebuild_graph.py --graph-only

rebuild-embeddings:
	@python scripts/rebuild_graph.py --embeddings-only

list-backups:
	@echo "Available backups:"
	@ls -lht backups/backup_*.tar.gz 2>/dev/null || echo "  (no backups found)"

dev:
	@docker compose up -d
	@cd frontend && npx vite --host &
	@.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

%:
	@true
