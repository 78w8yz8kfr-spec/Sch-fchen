#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST must be set}"
: "${POSTGRES_PORT:?POSTGRES_PORT must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"
: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"

if [ "$#" -eq 0 ]; then
    echo "Mindestens ein SQL-Verzeichnis muss angegeben werden." >&2
    exit 1
fi

for directory in "$@"; do
    found=false

    for file in "$directory"/*.sql; do
        if [ ! -f "$file" ]; then
            continue
        fi

        found=true
        echo "Wende $(basename "$file") an ..."
        psql \
            --set=ON_ERROR_STOP=1 \
            --host="$POSTGRES_HOST" \
            --port="$POSTGRES_PORT" \
            --username="$POSTGRES_USER" \
            --dbname="$POSTGRES_DB" \
            --file="$file"
    done

    if [ "$found" = false ]; then
        echo "Keine SQL-Dateien in $directory gefunden." >&2
        exit 1
    fi
done
