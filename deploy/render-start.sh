#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${API_DB_USER:?API_DB_USER must be set}"
: "${API_DB_PASSWORD:?API_DB_PASSWORD must be set}"

set -- \
  "$DATABASE_URL" \
  --set=ON_ERROR_STOP=1 \
  --command="SELECT pg_advisory_lock(hashtext('schaefchen-production-start'));"

for file in database/preflight/*.sql database/migrations/*.sql database/seeds/*.sql; do
  if [ ! -f "$file" ]; then
    echo "Erforderliche SQL-Datei fehlt: $file" >&2
    exit 1
  fi
  set -- "$@" --file="$file"
done

set -- \
  "$@" \
  --file=database/scripts/configure-api-role.sql \
  --command="SELECT pg_advisory_unlock(hashtext('schaefchen-production-start'));"

echo "Prüfe Datenbankmigrationen und Ersteinrichtung ..."
psql "$@"

echo "Starte Schäfchen Online ..."
exec node api/src/server.mjs
