COMPOSE := docker compose --env-file .env

.PHONY: check-env dev-up dev-init dev-down dev-reset db-migrate db-seed db-test backup restore

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
