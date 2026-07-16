#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
POSTGIS_IMAGE="${POSTGIS_IMAGE:-postgis/postgis:16-3.5@sha256:e547a8319d5b134527c6d1e0307acde1311aa57f8eb7fbf78810dafc6a6b41fe}"
POSTGIS_PLATFORM="${POSTGIS_PLATFORM:-linux/amd64}"
RUN_ID="${RANDOM:-0}$$"
CONTAINER_NAME="osiris-worldstate-verify-db-${RUN_ID}"
NETWORK_NAME="osiris-worldstate-verify-net-${RUN_ID}"
VOLUME_NAME="osiris-worldstate-verify-data-${RUN_ID}"
DB_NAME="osiris_worldstate_verify"
DB_USER="osiris_verify"
DB_PASSWORD="verify-${RUN_ID}"

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
    --platform "${POSTGIS_PLATFORM}" \
    --name "${CONTAINER_NAME}" \
    --network "${NETWORK_NAME}" \
    --publish 127.0.0.1::5432 \
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
        --platform "${POSTGIS_PLATFORM}" \
        --network "${NETWORK_NAME}" \
        --env "PGHOST=${CONTAINER_NAME}" \
        --env "PGPORT=5432" \
        --env "PGDATABASE=${DB_NAME}" \
        --env "PGUSER=${DB_USER}" \
        --env "PGPASSWORD=${DB_PASSWORD}" \
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

HOST_DB_PORT="$(docker inspect \
    --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' \
    "${CONTAINER_NAME}")"

run_psql <<'SQL'
DO $verification$
DECLARE
    expected_tables TEXT[] := ARRAY[
        'collection_runs',
        'active_fire_detections',
        'disaster_events',
        'raw_observations',
        'seismic_events',
        'space_weather_observations',
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

    IF (SELECT COUNT(*) FROM schema_migrations) <> 11 THEN
        RAISE EXCEPTION 'Expected 11 migration records';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
              (table_name = 'active_fire_detections' AND column_name = 'evidence_classification')
              OR (table_name = 'disaster_events' AND column_name = 'evidence_classification')
              OR (table_name = 'seismic_events' AND column_name IN ('tsunami', 'evidence_classification'))
              OR (table_name = 'space_weather_observations' AND column_name = 'evidence_classification')
              OR (table_name = 'raw_observations' AND column_name = 'evidence_classification')
          )
          AND column_default IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Fact and provenance columns must not fabricate defaults';
    END IF;

    IF (
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'collection_runs'
          AND column_name = 'legacy_provenance_incomplete'
    ) IS DISTINCT FROM 'false' THEN
        RAISE EXCEPTION 'New collection runs must default to complete provenance enforcement';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'collection_runs_response_completion_order_check'
          AND conrelid = 'collection_runs'::regclass
    ) THEN
        RAISE EXCEPTION 'Collection response/completion ordering constraint is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'collection_runs_request_response_order_check'
          AND conrelid = 'collection_runs'::regclass
    ) THEN
        RAISE EXCEPTION 'Collection request/response ordering constraint is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'collection_runs_retry_deadline_check'
          AND conrelid = 'collection_runs'::regclass
    ) THEN
        RAISE EXCEPTION 'Collection retry-deadline constraint is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'collection_runs_terminal_state_check'
          AND conrelid = 'collection_runs'::regclass
    ) THEN
        RAISE EXCEPTION 'Collection terminal-state constraint is missing';
    END IF;

    IF to_regclass('public.collection_runs_source_retry_not_before_idx') IS NULL THEN
        RAISE EXCEPTION 'Collection retry-deadline index is missing';
    END IF;

    IF to_regclass('public.collection_runs_source_status_completed_idx') IS NULL THEN
        RAISE EXCEPTION 'Collection terminal-history index is missing';
    END IF;

    IF to_regclass('public.collection_runs_source_success_response_idx') IS NULL THEN
        RAISE EXCEPTION 'Earthquake latest-snapshot index is missing';
    END IF;

    IF to_regclass('public.raw_observations_source_last_seen_idx') IS NULL THEN
        RAISE EXCEPTION 'Earthquake feed-membership index is missing';
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
    id, source_id, started_at, request_started_at, response_received_at,
    completed_at, status, endpoint, http_status, content_hash, archive_path,
    record_count, collector_version, parser_version
) VALUES (
    '00000000-0000-4000-8000-000000000001',
    'usgs-earthquakes',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00.100Z',
    '2026-01-01T00:00:00.500Z',
    '2026-01-01T00:00:01Z',
    'succeeded',
    'fixture://usgs-earthquakes',
    200,
    repeat('a', 64),
    'archive/usgs-earthquakes/fixture.json.gz',
    1,
    'verify',
    'verify'
);

DO $new_run_provenance$
BEGIN
    IF (
        SELECT legacy_provenance_incomplete
        FROM collection_runs
        WHERE id = '00000000-0000-4000-8000-000000000001'
    ) THEN
        RAISE EXCEPTION 'A new collection run was incorrectly marked as legacy';
    END IF;
END
$new_run_provenance$;

-- Simulate a terminal row written under migrations 0001-0006. Migration 0007
-- must preserve explicitly marked legacy provenance gaps without inventing
-- request timestamps, status codes, parser versions or record counts.
INSERT INTO collection_runs (
    id, source_id, started_at, completed_at, status, endpoint,
    content_hash, archive_path, collector_version,
    legacy_provenance_incomplete
) VALUES (
    '00000000-0000-4000-8000-00000000000b',
    'usgs-earthquakes',
    '2025-12-31T23:59:00Z',
    '2025-12-31T23:59:01Z',
    'succeeded',
    'fixture://legacy-before-0007',
    repeat('f', 64),
    'archive/usgs-earthquakes/legacy.json.gz',
    'legacy-verify',
    TRUE
);

INSERT INTO raw_observations (
    id, source_id, collection_run_id, source_record_id, observed_at,
    occurred_at, first_seen_at, last_seen_at, content_hash, archive_path,
    payload, schema_version, parser_version, evidence_classification
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
    'verify',
    'reported'
);

INSERT INTO seismic_events (
    id, source_id, source_event_id, occurred_at, magnitude, depth_km,
    place, tsunami, geometry, raw_observation_id, parser_version,
    evidence_classification
) VALUES (
    '00000000-0000-4000-8000-000000000003',
    'usgs-earthquakes',
    'fixture-event',
    '2026-01-01T00:00:00Z',
    4.2,
    10.5,
    'Fixture location',
    FALSE,
    ST_SetSRID(ST_MakePoint(151.2, -33.8), 4326),
    '00000000-0000-4000-8000-000000000002',
    'verify',
    'reported'
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
            schema_version, parser_version, evidence_classification
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
            'verify',
            'reported'
        );
        RAISE EXCEPTION 'raw observation duplicate was accepted';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO seismic_events (
            id, source_id, source_event_id, occurred_at, tsunami, geometry,
            raw_observation_id, parser_version, evidence_classification
        ) VALUES (
            '00000000-0000-4000-8000-000000000005',
            'usgs-earthquakes',
            'fixture-event',
            '2026-01-01T00:00:00Z',
            FALSE,
            ST_SetSRID(ST_MakePoint(151.2, -33.8), 4326),
            '00000000-0000-4000-8000-000000000002',
            'verify',
            'reported'
        );
        RAISE EXCEPTION 'seismic event duplicate was accepted';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO raw_observations (
            id, source_id, collection_run_id, source_record_id, observed_at,
            first_seen_at, last_seen_at, content_hash, archive_path,
            schema_version, parser_version, evidence_classification
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
            'verify',
            'reported'
        );
        RAISE EXCEPTION 'cross-source collection run link was accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO seismic_events (
            id, source_id, source_event_id, occurred_at, tsunami, geometry,
            raw_observation_id, parser_version, evidence_classification
        ) VALUES (
            '00000000-0000-4000-8000-000000000007',
            'fixture-other-source',
            'cross-source-event',
            '2026-01-01T00:00:00Z',
            FALSE,
            ST_SetSRID(ST_MakePoint(151.2, -33.8), 4326),
            '00000000-0000-4000-8000-000000000002',
            'verify',
            'reported'
        );
        RAISE EXCEPTION 'cross-source raw observation link was accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO collection_runs (
            id, source_id, started_at, completed_at, status, endpoint,
            collector_version
        ) VALUES (
            '00000000-0000-4000-8000-000000000008',
            'usgs-earthquakes',
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:01Z',
            'failed',
            'fixture://missing-error',
            'verify'
        );
        RAISE EXCEPTION 'failed run without error details was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO collection_runs (
            id, source_id, started_at, response_received_at, completed_at,
            status, endpoint, http_status, content_hash, archive_path,
            record_count, collector_version, parser_version
        ) VALUES (
            '00000000-0000-4000-8000-000000000009',
            'usgs-earthquakes',
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:00.500Z',
            '2026-01-01T00:00:01Z',
            'succeeded',
            'fixture://missing-request-start',
            200,
            repeat('b', 64),
            'archive/usgs-earthquakes/missing-request-start.json.gz',
            0,
            'verify',
            'verify'
        );
        RAISE EXCEPTION 'successful run without a request-start timestamp was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO collection_runs (
            id, source_id, started_at, request_started_at, response_received_at,
            completed_at, retry_not_before, status, endpoint, http_status,
            collector_version, error
        ) VALUES (
            '00000000-0000-4000-8000-00000000000a',
            'usgs-earthquakes',
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:00.100Z',
            '2026-01-01T00:00:00.500Z',
            '2026-01-01T00:00:01Z',
            '2026-01-01T00:00:00.400Z',
            'failed',
            'fixture://invalid-retry-deadline',
            429,
            'verify',
            '{"stage":"http","message":"rate limited"}'::JSONB
        );
        RAISE EXCEPTION 'retry deadline before response completion was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$deduplication$;

ROLLBACK;
SQL

if [[ -f "${REPOSITORY_ROOT}/collector/package.json" ]]; then
    if [[ ! -d "${REPOSITORY_ROOT}/collector/node_modules" ]]; then
        echo "Collector dependencies are missing; run npm ci --prefix collector" >&2
        exit 2
    fi

    TEST_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${HOST_DB_PORT}/${DB_NAME}" \
        npm --prefix "${REPOSITORY_ROOT}/collector" run test:integration
fi

if [[ ! -d "${REPOSITORY_ROOT}/node_modules" ]]; then
    echo "Root dependencies are missing; run npm ci" >&2
    exit 2
fi

(
    cd "${REPOSITORY_ROOT}"
    TEST_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${HOST_DB_PORT}/${DB_NAME}" \
        npm exec -- vitest run src/lib/earthquakes/database-source.test.ts
)

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
if [[ "${migration_count}" != "11" ]]; then
    echo "Migration state did not survive database restart" >&2
    exit 1
fi

echo "Clean database, replay, constraints and restart persistence verified."
