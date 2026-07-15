#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
POSTGIS_IMAGE="${POSTGIS_IMAGE:-postgis/postgis:16-3.5@sha256:e547a8319d5b134527c6d1e0307acde1311aa57f8eb7fbf78810dafc6a6b41fe}"
RUN_ID="${RANDOM:-0}$$"
CONTAINER_NAME="osiris-worldstate-verify-db-${RUN_ID}"
NETWORK_NAME="osiris-worldstate-verify-net-${RUN_ID}"
VOLUME_NAME="osiris-worldstate-verify-data-${RUN_ID}"
DB_NAME="osiris_worldstate_verify"
DB_USER="osiris_verify"
DB_PASSWORD="verify-${RUN_ID}"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${CONTAINER_NAME}:5432/${DB_NAME}"

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required for clean-database verification" >&2
    exit 2
fi

if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed, but the current user cannot access the Docker daemon" >&2
    exit 2
fi

cleanup() {
    docker rm --force "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    docker volume rm --force "${VOLUME_NAME}" >/dev/null 2>&1 || true
    docker network rm "${NETWORK_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cleanup
docker network create "${NETWORK_NAME}" >/dev/null
docker volume create "${VOLUME_NAME}" >/dev/null
docker run --detach \
    --name "${CONTAINER_NAME}" \
    --network "${NETWORK_NAME}" \
    --env "POSTGRES_DB=${DB_NAME}" \
    --env "POSTGRES_USER=${DB_USER}" \
    --env "POSTGRES_PASSWORD=${DB_PASSWORD}" \
    --volume "${VOLUME_NAME}:/var/lib/postgresql/data" \
    "${POSTGIS_IMAGE}" >/dev/null

for _ in $(seq 1 60); do
    if docker exec \
        --env "PGPASSWORD=${DB_PASSWORD}" \
        "${CONTAINER_NAME}" \
        pg_isready --username "${DB_USER}" --dbname "${DB_NAME}" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

if ! docker exec \
    --env "PGPASSWORD=${DB_PASSWORD}" \
    "${CONTAINER_NAME}" \
    pg_isready --username "${DB_USER}" --dbname "${DB_NAME}" >/dev/null 2>&1; then
    echo "Disposable PostGIS database did not become ready" >&2
    docker logs "${CONTAINER_NAME}" >&2 || true
    exit 1
fi

run_migrations() {
    docker run --rm \
        --network "${NETWORK_NAME}" \
        --env "DATABASE_URL=${DATABASE_URL}" \
        --volume "${REPOSITORY_ROOT}/db:/db:ro" \
        --entrypoint bash \
        "${POSTGIS_IMAGE}" \
        /db/scripts/migrate.sh
}

run_psql() {
    docker exec --interactive \
        --env "PGPASSWORD=${DB_PASSWORD}" \
        "${CONTAINER_NAME}" \
        psql --username "${DB_USER}" --dbname "${DB_NAME}" --no-psqlrc --set=ON_ERROR_STOP=1 "$@"
}

run_migrations
run_migrations

run_psql <<'SQL'
DO $verification$
DECLARE
    expected_tables TEXT[] := ARRAY[
        'collection_runs',
        'raw_observations',
        'seismic_events',
        'source_catalogue'
    ];
    table_name TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        RAISE EXCEPTION 'PostGIS extension is missing';
    END IF;

    FOREACH table_name IN ARRAY expected_tables LOOP
        IF to_regclass('public.' || table_name) IS NULL THEN
            RAISE EXCEPTION 'Expected table is missing: %', table_name;
        END IF;
    END LOOP;

    IF (SELECT COUNT(*) FROM schema_migrations) <> 6 THEN
        RAISE EXCEPTION 'Expected 6 migration records';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM source_catalogue WHERE source_id = 'usgs-earthquakes'
    ) THEN
        RAISE EXCEPTION 'USGS source seed is missing';
    END IF;
END
$verification$;

BEGIN;

INSERT INTO collection_runs (
    id, source_id, started_at, completed_at, status, endpoint,
    content_hash, archive_path, record_count, collector_version, parser_version
) VALUES (
    '00000000-0000-4000-8000-000000000001',
    'usgs-earthquakes',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:01Z',
    'succeeded',
    'fixture://usgs-earthquakes',
    repeat('a', 64),
    'archive/usgs-earthquakes/fixture.json.gz',
    1,
    'verify',
    'verify'
);

INSERT INTO raw_observations (
    id, source_id, collection_run_id, source_record_id, observed_at,
    occurred_at, first_seen_at, last_seen_at, content_hash, archive_path,
    payload, schema_version, parser_version
) VALUES (
    '00000000-0000-4000-8000-000000000002',
    'usgs-earthquakes',
    '00000000-0000-4000-8000-000000000001',
    'fixture-event',
    '2026-01-01T00:00:01Z',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:01Z',
    '2026-01-01T00:00:01Z',
    repeat('a', 64),
    'archive/usgs-earthquakes/fixture.json.gz',
    '{"id":"fixture-event"}'::JSONB,
    1,
    'verify'
);

INSERT INTO seismic_events (
    id, source_id, source_event_id, occurred_at, magnitude, depth_km,
    place, geometry, raw_observation_id, parser_version
) VALUES (
    '00000000-0000-4000-8000-000000000003',
    'usgs-earthquakes',
    'fixture-event',
    '2026-01-01T00:00:00Z',
    4.2,
    10.5,
    'Fixture location',
    ST_SetSRID(ST_MakePoint(151.2, -33.8), 4326),
    '00000000-0000-4000-8000-000000000002',
    'verify'
);

INSERT INTO source_catalogue (
    source_id, name, provider, access_method, cost_class, status
) VALUES (
    'fixture-other-source',
    'Fixture other source',
    'Verification',
    'fixture',
    'free',
    'active'
);

DO $deduplication$
BEGIN
    BEGIN
        INSERT INTO raw_observations (
            id, source_id, collection_run_id, source_record_id, observed_at,
            first_seen_at, last_seen_at, content_hash, archive_path,
            schema_version, parser_version
        ) VALUES (
            '00000000-0000-4000-8000-000000000004',
            'usgs-earthquakes',
            '00000000-0000-4000-8000-000000000001',
            'fixture-event',
            '2026-01-01T00:00:01Z',
            '2026-01-01T00:00:01Z',
            '2026-01-01T00:00:01Z',
            repeat('a', 64),
            'archive/usgs-earthquakes/fixture.json.gz',
            1,
            'verify'
        );
        RAISE EXCEPTION 'raw observation duplicate was accepted';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO seismic_events (
            id, source_id, source_event_id, occurred_at, geometry,
            raw_observation_id, parser_version
        ) VALUES (
            '00000000-0000-4000-8000-000000000005',
            'usgs-earthquakes',
            'fixture-event',
            '2026-01-01T00:00:00Z',
            ST_SetSRID(ST_MakePoint(151.2, -33.8), 4326),
            '00000000-0000-4000-8000-000000000002',
            'verify'
        );
        RAISE EXCEPTION 'seismic event duplicate was accepted';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO raw_observations (
            id, source_id, collection_run_id, source_record_id, observed_at,
            first_seen_at, last_seen_at, content_hash, archive_path,
            schema_version, parser_version
        ) VALUES (
            '00000000-0000-4000-8000-000000000006',
            'fixture-other-source',
            '00000000-0000-4000-8000-000000000001',
            'cross-source-observation',
            '2026-01-01T00:00:01Z',
            '2026-01-01T00:00:01Z',
            '2026-01-01T00:00:01Z',
            repeat('a', 64),
            'archive/fixture/cross-source.json.gz',
            1,
            'verify'
        );
        RAISE EXCEPTION 'cross-source collection run link was accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO seismic_events (
            id, source_id, source_event_id, occurred_at, geometry,
            raw_observation_id, parser_version
        ) VALUES (
            '00000000-0000-4000-8000-000000000007',
            'fixture-other-source',
            'cross-source-event',
            '2026-01-01T00:00:00Z',
            ST_SetSRID(ST_MakePoint(151.2, -33.8), 4326),
            '00000000-0000-4000-8000-000000000002',
            'verify'
        );
        RAISE EXCEPTION 'cross-source raw observation link was accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;
END
$deduplication$;

ROLLBACK;
SQL

docker stop "${CONTAINER_NAME}" >/dev/null
docker start "${CONTAINER_NAME}" >/dev/null

for _ in $(seq 1 30); do
    if docker exec \
        --env "PGPASSWORD=${DB_PASSWORD}" \
        "${CONTAINER_NAME}" \
        pg_isready --username "${DB_USER}" --dbname "${DB_NAME}" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

migration_count="$(run_psql --tuples-only --no-align --command='SELECT COUNT(*) FROM schema_migrations;' | tr -d '[:space:]')"
if [[ "${migration_count}" != "6" ]]; then
    echo "Migration state did not survive database restart" >&2
    exit 1
fi

echo "Clean database, replay, constraints and restart persistence verified."
