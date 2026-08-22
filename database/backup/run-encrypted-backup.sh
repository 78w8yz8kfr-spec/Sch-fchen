#!/bin/sh
set -eu
set -o pipefail

: "${PGHOST:?PGHOST must be set}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE must be set}"

if [ ! -r "$RESTIC_PASSWORD_FILE" ]; then
  echo "RESTIC_PASSWORD_FILE ist nicht lesbar." >&2
  exit 2
fi

if restic snapshots --no-lock >/dev/null 2>&1; then
  :
elif [ "${BACKUP_INIT_REPOSITORY:-false}" = "true" ]; then
  restic init
else
  echo "Das Restic-Repository ist nicht erreichbar oder nicht initialisiert." >&2
  echo "Für die bewusste Ersteinrichtung BACKUP_INIT_REPOSITORY=true setzen." >&2
  exit 3
fi

started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
environment_tag=${APP_ENVIRONMENT:-unknown}

# Der Dump fließt ohne unverschlüsselte Zwischenkopie direkt in das von
# Restic verschlüsselte Repository. Dokumentinhalte liegen derzeit noch in
# PostgreSQL und sind dadurch Bestandteil desselben konsistenten Dumps.
pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --dbname="$PGDATABASE" \
  | restic backup \
      --stdin \
      --stdin-filename=/schaefchen.dump \
      --host=schaefchen-database \
      --tag=database \
      --tag="environment-${environment_tag}"

restic forget \
  --host=schaefchen-database \
  --tag=database \
  --keep-daily="${BACKUP_KEEP_DAILY:-14}" \
  --keep-weekly="${BACKUP_KEEP_WEEKLY:-8}" \
  --keep-monthly="${BACKUP_KEEP_MONTHLY:-12}" \
  --keep-yearly="${BACKUP_KEEP_YEARLY:-3}" \
  --prune

restic check --read-data-subset="${BACKUP_CHECK_SUBSET:-5%}"
completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Verschlüsseltes Datenbanksnapshot geprüft: ${started_at} bis ${completed_at}."
