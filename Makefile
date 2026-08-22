COMPOSE := docker compose --env-file .env

.PHONY: check-env dev-up dev-init dev-down dev-reset db-migrate db-api-role db-seed db-test api-up api-test api-coverage backup restore backup-local-dev restore-local-dev backup-restore-test frontend-test frontend-serve

check-env:
	@test -f .env || (echo "Fehler: .env fehlt. Zuerst 'cp .env.example .env' ausführen." && exit 1)
	@! grep -q 'CHANGE_ME' .env || (echo "Fehler: In .env sind noch CHANGE_ME-Werte enthalten." && exit 1)

dev-up: check-env
	$(COMPOSE) up -d postgres pgadmin minio n8n

db-migrate: check-env
	$(COMPOSE) run --rm db-migrate

db-api-role: check-env
	$(COMPOSE) run --rm db-api-role

db-seed: check-env
	$(COMPOSE) run --rm db-seed

db-test: check-env
	$(COMPOSE) run --rm db-test

api-up: check-env
	$(COMPOSE) up -d --build api

api-test:
	npm --prefix api ci --ignore-scripts
	npm --prefix api test

# Prüft zusätzlich die Mindestabdeckung von api/src. Verlangt eine erreichbare
# Datenbank und API_INTEGRATION_TEST=true, sonst bleiben die Integrationstests
# aus und die Abdeckung unterschreitet die Schwelle.
api-coverage:
	npm --prefix api ci --ignore-scripts
	npm --prefix api run test:coverage

dev-init: check-env
	$(MAKE) dev-up
	$(MAKE) db-migrate
	$(MAKE) db-api-role
	$(MAKE) db-seed
	$(MAKE) db-test
	$(MAKE) api-test
	$(MAKE) api-up

dev-down: check-env
	$(COMPOSE) down

dev-reset: check-env
	$(COMPOSE) down --volumes

backup:
	@echo "Abbruch: Der alte Klartext-Backup-Befehl ist deaktiviert."
	@echo "Produktion: docs/BACKUP_RESTORE_RUNBOOK.md verwenden."
	@echo "Nur lokal: make backup-local-dev CONFIRM=PLAINTEXT_LOCAL_BACKUP"
	@exit 2

restore:
	@echo "Abbruch: Ein Restore in die aktive Datenbank ist nicht mehr der Standardweg."
	@echo "Restore-Drill: docs/BACKUP_RESTORE_RUNBOOK.md verwenden."
	@echo "Nur lokal: make restore-local-dev FILE=... CONFIRM=OVERWRITE_LOCAL_DATABASE"
	@exit 2

backup-local-dev: check-env
	@test "$(CONFIRM)" = "PLAINTEXT_LOCAL_BACKUP" || (echo "Fehler: Nur für lokale Testdaten CONFIRM=PLAINTEXT_LOCAL_BACKUP setzen." && exit 1)
	@mkdir -p backups
	@file="backups/schaefchen_$$(date +%Y%m%d_%H%M%S).dump"; \
	$(COMPOSE) exec -T postgres sh -c 'pg_dump --format=custom --no-owner --username="$$POSTGRES_USER" --dbname="$$POSTGRES_DB"' > "$$file"; \
	echo "Unverschlüsseltes lokales Testbackup erstellt: $$file"

restore-local-dev: check-env
	@test "$(CONFIRM)" = "OVERWRITE_LOCAL_DATABASE" || (echo "Fehler: CONFIRM=OVERWRITE_LOCAL_DATABASE fehlt." && exit 1)
	@test -n "$(FILE)" || (echo "Fehler: make restore-local-dev FILE=backups/datei.dump CONFIRM=OVERWRITE_LOCAL_DATABASE" && exit 1)
	@test -f "$(FILE)" || (echo "Fehler: Datei $(FILE) nicht gefunden." && exit 1)
	$(COMPOSE) exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --username="$$POSTGRES_USER" --dbname="$$POSTGRES_DB"' < "$(FILE)"

backup-restore-test: check-env
	@set -a; . ./.env; set +a; \
	PGPASSWORD="$$POSTGRES_PASSWORD" \
	POSTGRES_HOST=127.0.0.1 \
	POSTGRES_PORT="$${POSTGRES_PORT:-5432}" \
	sh database/scripts/verify-backup-restore.sh

frontend-test:
	node frontend/tests/smoke.mjs
	node --test frontend/tests/*.test.mjs

frontend-serve:
	python3 -m http.server 4173 --directory frontend
