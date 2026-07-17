#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST must be set}"
: "${POSTGRES_PORT:?POSTGRES_PORT must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"
: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"

restore_database="${POSTGRES_DB}_restore_check"
dump_file="$(mktemp /tmp/schaefchen-backup-XXXXXX)"

cleanup() {
    dropdb \
        --if-exists \
        --host="$POSTGRES_HOST" \
        --port="$POSTGRES_PORT" \
        --username="$POSTGRES_USER" \
        "$restore_database" >/dev/null 2>&1 || true
    rm -f "$dump_file"
}

trap cleanup EXIT INT TERM

pg_dump \
    --format=custom \
    --no-owner \
    --host="$POSTGRES_HOST" \
    --port="$POSTGRES_PORT" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --file="$dump_file"

dropdb \
    --if-exists \
    --host="$POSTGRES_HOST" \
    --port="$POSTGRES_PORT" \
    --username="$POSTGRES_USER" \
    "$restore_database"

createdb \
    --host="$POSTGRES_HOST" \
    --port="$POSTGRES_PORT" \
    --username="$POSTGRES_USER" \
    "$restore_database"

pg_restore \
    --no-owner \
    --exit-on-error \
    --host="$POSTGRES_HOST" \
    --port="$POSTGRES_PORT" \
    --username="$POSTGRES_USER" \
    --dbname="$restore_database" \
    "$dump_file"

psql \
    --set=ON_ERROR_STOP=1 \
    --host="$POSTGRES_HOST" \
    --port="$POSTGRES_PORT" \
    --username="$POSTGRES_USER" \
    --dbname="$restore_database" <<'SQL'
DO $$
DECLARE
    missing_tables INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO missing_tables
    FROM (
        VALUES
            ('companies'),
            ('users'),
            ('roles'),
            ('user_roles'),
            ('customers'),
            ('customer_contacts'),
            ('customer_locations'),
            ('projects'),
            ('project_locations'),
            ('project_responsibles'),
            ('construction_sites'),
            ('site_assignments'),
            ('site_assignment_history'),
            ('site_supervisors'),
            ('site_supervisor_history'),
            ('work_days'),
            ('time_entries')
    ) AS required(table_name)
    WHERE TO_REGCLASS('public.' || required.table_name) IS NULL;

    IF missing_tables <> 0 THEN
        RAISE EXCEPTION '% erwartete Tabellen fehlen nach Restore', missing_tables;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM companies
        WHERE company_number = 'F-000001'
          AND legal_name = 'Schaaf Elektro GmbH'
    ) THEN
        RAISE EXCEPTION 'Seed-Firma fehlt nach Restore';
    END IF;
END;
$$;
SQL

echo "Backup-/Restore-Abnahmetest erfolgreich."
