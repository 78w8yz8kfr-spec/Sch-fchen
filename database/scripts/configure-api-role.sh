#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST must be set}"
: "${POSTGRES_PORT:?POSTGRES_PORT must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"
: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${API_DB_USER:?API_DB_USER must be set}"
: "${API_DB_PASSWORD:?API_DB_PASSWORD must be set}"

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

psql \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set ON_ERROR_STOP=1 \
  --file "$script_directory/configure-api-role.sql"

echo "Eingeschränkte API-Datenbankrolle ist konfiguriert."
