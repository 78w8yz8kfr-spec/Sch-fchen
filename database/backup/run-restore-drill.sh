#!/bin/sh
set -eu

: "${PGHOST:?PGHOST must be set}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE must be set}"

if [ "${RESTORE_CONFIRMATION:-}" != "RESTORE_DRILL" ]; then
  echo "Abbruch: RESTORE_CONFIRMATION=RESTORE_DRILL fehlt." >&2
  exit 2
fi
case "$PGDATABASE" in
  *_restore|*_restore_drill) ;;
  *)
    echo "Abbruch: Die Zieldatenbank muss auf _restore oder _restore_drill enden." >&2
    exit 2
    ;;
esac
if [ ! -r "$RESTIC_PASSWORD_FILE" ]; then
  echo "RESTIC_PASSWORD_FILE ist nicht lesbar." >&2
  exit 2
fi

connected_database=$(psql --tuples-only --no-align --dbname="$PGDATABASE" \
  --command='SELECT current_database()')
if [ "$connected_database" != "$PGDATABASE" ]; then
  echo "Abbruch: Die ausdrücklich benannte Wiederherstellungsdatenbank wurde nicht erreicht." >&2
  exit 3
fi

# Objektberechtigungen gehören zur Sicherung. Die beiden NOLOGIN-Gruppen
# müssen deshalb im Zielcluster vor pg_restore existieren; der Drill legt sie
# nur dann an, wenn die Restore-Kennung dazu ausdrücklich berechtigt ist.
psql --set=ON_ERROR_STOP=1 --dbname="$PGDATABASE" --command="
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'schaefchen_api') THEN
    CREATE ROLE schaefchen_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'schaefchen_platform_api') THEN
    CREATE ROLE schaefchen_platform_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END;
\$\$;
"

work_directory=$(mktemp -d /tmp/schaefchen-restore-drill.XXXXXX)
cleanup() {
  rm -rf "$work_directory"
}
trap cleanup EXIT INT TERM

started_epoch=$(date +%s)
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
restic check --read-data
restic dump latest /schaefchen.dump > "$work_directory/schaefchen.dump"

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --exit-on-error \
  --dbname="$PGDATABASE" \
  "$work_directory/schaefchen.dump"

table_count=$(psql --tuples-only --no-align --dbname="$PGDATABASE" --command="
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
")
version_count=$(psql --tuples-only --no-align --dbname="$PGDATABASE" --command="
  SELECT COUNT(*) FROM application_versions;
")
security_model_ok=$(psql --tuples-only --no-align --dbname="$PGDATABASE" --command="
  SELECT (
    has_table_privilege('schaefchen_api', 'users', 'SELECT')
    AND NOT has_table_privilege('schaefchen_api', 'security_rate_limits', 'SELECT')
    AND has_function_privilege(
      'schaefchen_api',
      'api_consume_security_rate_limit(character varying,character,integer,integer)',
      'EXECUTE'
    )
    AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'users'::regclass)
  );
")
if [ "$table_count" -lt 20 ] || [ "$version_count" -lt 1 ] || [ "$security_model_ok" != "t" ]; then
  echo "Die wiederhergestellte Datenbank besteht die fachliche Mindestprüfung nicht." >&2
  exit 4
fi

completed_epoch=$(date +%s)
completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
duration_seconds=$((completed_epoch - started_epoch))
maximum_seconds=${RESTORE_EXPECTED_MAX_SECONDS:-14400}
if [ "$duration_seconds" -gt "$maximum_seconds" ]; then
  echo "RTO überschritten: ${duration_seconds}s statt höchstens ${maximum_seconds}s." >&2
  exit 5
fi

echo "Restore-Drill erfolgreich: Start=${started_at}, Ende=${completed_at}, RTO=${duration_seconds}s, Tabellen=${table_count}, Versionen=${version_count}, Berechtigungsmodell=ok."
