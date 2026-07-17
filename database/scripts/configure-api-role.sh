#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST must be set}"
: "${POSTGRES_PORT:?POSTGRES_PORT must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"
: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${API_DB_USER:?API_DB_USER must be set}"
: "${API_DB_PASSWORD:?API_DB_PASSWORD must be set}"

psql \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set ON_ERROR_STOP=1 <<'SQL'
\getenv api_db_user API_DB_USER
\getenv api_db_password API_DB_PASSWORD

SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
    :'api_db_user',
    :'api_db_password'
)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = :'api_db_user'
) \gexec

SELECT format(
    'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
    :'api_db_user',
    :'api_db_password'
) \gexec

SELECT format('GRANT schaefchen_api TO %I', :'api_db_user') \gexec
SQL

echo "Eingeschränkte API-Datenbankrolle ist konfiguriert."
