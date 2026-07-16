COMPOSE := docker compose --env-file .env

.PHONY: check-env dev-up dev-init dev-down dev-reset db-migrate db-seed db-test backup restore backup-restore-test frontend-test frontend-serve

check-env:
	@test -f .env || (echo "Fehler: .env fehlt. Zuerst 'cp .env.example .env' ausführen." && exit 1)
	@! grep -q 'CHANGE_ME' .env || (echo "Fehler: In .env sind noch CHANGE_ME-Werte enthalten." && exit 1)

dev-up: check-env
	$(COMPOSE) up -d postgres pgadmin minio n8n

db-migrate: check-env
	$(COMPOSE) run --rm db-migrate

db-seed: check-env
	$(COMPOSE) run --rm db-seed

db-test: check-env
	$(COMPOSE) run --rm db-test

dev-init: dev-up db-migrate db-seed db-test

dev-down: check-env
	$(COMPOSE) down

dev-reset: check-env
	$(COMPOSE) down --volumes

backup: check-env
	@mkdir -p backups
	@file="backups/schaefchen_$$(date +%Y%m%d_%H%M%S).dump"; \
	$(COMPOSE) exec -T postgres sh -c 'pg_dump --format=custom --no-owner --username="$$POSTGRES_USER" --dbname="$$POSTGRES_DB"' > "$$file"; \
	echo "Backup erstellt: $$file"

restore: check-env
	@test -n "$(FILE)" || (echo "Fehler: make restore FILE=backups/datei.dump" && exit 1)
	@test -f "$(FILE)" || (echo "Fehler: Datei $(FILE) nicht gefunden." && exit 1)
	$(COMPOSE) exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --username="$$POSTGRES_USER" --dbname="$$POSTGRES_DB"' < "$(FILE)"

backup-restore-test: check-env
	@set -a; . ./.env; set +a; \
	PGPASSWORD="$$POSTGRES_PASSWORD" \
	POSTGRES_HOST=127.0.0.1 \
	POSTGRES_PORT="$${POSTGRES_PORT:-5432}" \
	sh database/scripts/verify-backup-restore.sh

frontend-test:
	node --check frontend/app.js
	node --check frontend/sw.js
	node frontend/tests/smoke.mjs

frontend-serve:
	python3 -m http.server 4173 --directory frontend
