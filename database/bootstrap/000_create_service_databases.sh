#!/bin/sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"
: "${N8N_DB_NAME:?N8N_DB_NAME must be set}"

psql --set=ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set=service_db="$N8N_DB_NAME" <<'SQL'
SELECT 'CREATE DATABASE ' || quote_ident(:'service_db')
WHERE NOT EXISTS (
    SELECT 1
    FROM pg_database
    WHERE datname = :'service_db'
) \gexec
SQL
