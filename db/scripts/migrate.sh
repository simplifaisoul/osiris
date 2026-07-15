#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-${SCRIPT_DIR}/../migrations}"
PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
PGOPTIONS="${PGOPTIONS:--c statement_timeout=120000 -c lock_timeout=15000}"
export PGCONNECT_TIMEOUT PGOPTIONS

if [[ ! "${PGCONNECT_TIMEOUT}" =~ ^[1-9][0-9]*$ ]]; then
    echo "PGCONNECT_TIMEOUT must be a positive number of seconds" >&2
    exit 2
fi

psql_target=()
if [[ -n "${DATABASE_URL:-}" ]]; then
    psql_target=("${DATABASE_URL}")
else
    missing_pg_settings=()
    for setting in PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD; do
        if [[ -z "${!setting:-}" ]]; then
            missing_pg_settings+=("${setting}")
        fi
    done

    if (( ${#missing_pg_settings[@]} > 0 )); then
        echo "Set DATABASE_URL or all discrete PostgreSQL settings; missing: ${missing_pg_settings[*]}" >&2
        exit 2
    fi
fi

for command in psql sha256sum find sort awk tr cat; do
    if ! command -v "${command}" >/dev/null 2>&1; then
        echo "Required command not found: ${command}" >&2
        exit 2
    fi
done

if [[ ! -d "${MIGRATIONS_DIR}" ]]; then
    echo "Migration directory not found: ${MIGRATIONS_DIR}" >&2
    exit 2
fi

psql "${psql_target[@]}" --no-psqlrc --set=ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

mapfile -d '' migration_files < <(
    find "${MIGRATIONS_DIR}" -maxdepth 1 -type f -name '*.up.sql' -print0 | sort -z
)

if (( ${#migration_files[@]} == 0 )); then
    echo "No migrations found in ${MIGRATIONS_DIR}" >&2
    exit 2
fi

for migration_file in "${migration_files[@]}"; do
    filename="$(basename "${migration_file}")"
    version="${filename%.up.sql}"
    checksum="$(sha256sum "${migration_file}" | awk '{print $1}')"
    applied_checksum="$(
        printf '%s\n' "SELECT checksum FROM schema_migrations WHERE version = :'migration_version';" \
        | psql "${psql_target[@]}" \
            --no-psqlrc \
            --tuples-only \
            --no-align \
            --quiet \
            --set=ON_ERROR_STOP=1 \
            --set=migration_version="${version}" \
        | tr -d '[:space:]'
    )"

    if [[ -n "${applied_checksum}" ]]; then
        if [[ "${applied_checksum}" != "${checksum}" ]]; then
            echo "Checksum mismatch for applied migration ${version}" >&2
            echo "Database: ${applied_checksum}" >&2
            echo "File:     ${checksum}" >&2
            exit 1
        fi
        echo "Already applied: ${version}"
        continue
    fi

    echo "Applying: ${version}"
    {
        printf '%s\n' '\set ON_ERROR_STOP on' 'BEGIN;'
        cat "${migration_file}"
        printf '%s\n' \
            "INSERT INTO schema_migrations (version, checksum) VALUES (:'migration_version', :'migration_checksum');" \
            'COMMIT;'
    } | psql "${psql_target[@]}" \
        --no-psqlrc \
        --set=ON_ERROR_STOP=1 \
        --set=migration_version="${version}" \
        --set=migration_checksum="${checksum}"
done

echo "All migrations are current."
