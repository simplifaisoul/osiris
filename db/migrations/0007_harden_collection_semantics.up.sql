ALTER TABLE seismic_events
    ALTER COLUMN tsunami DROP DEFAULT,
    ALTER COLUMN evidence_classification DROP DEFAULT;

ALTER TABLE raw_observations
    ALTER COLUMN evidence_classification DROP DEFAULT;

ALTER TABLE collection_runs
    ADD COLUMN request_started_at TIMESTAMPTZ,
    ADD COLUMN retry_not_before TIMESTAMPTZ,
    ADD COLUMN legacy_provenance_incomplete BOOLEAN;

-- Migrations 0001-0006 allowed terminal rows without exact HTTP-request and
-- error provenance. Preserve those rows without inventing timestamps or error
-- details, but label the gap explicitly. Rows created after this migration are
-- subject to the stronger constraints below.
UPDATE collection_runs
SET legacy_provenance_incomplete = TRUE;

ALTER TABLE collection_runs
    ALTER COLUMN legacy_provenance_incomplete SET DEFAULT FALSE,
    ALTER COLUMN legacy_provenance_incomplete SET NOT NULL;

COMMENT ON COLUMN collection_runs.legacy_provenance_incomplete IS
    'True only for rows created before migration 0007 whose missing provenance was not fabricated during upgrade.';

ALTER TABLE collection_runs
    ADD CONSTRAINT collection_runs_request_response_order_check
    CHECK (
        legacy_provenance_incomplete
        OR (
            (
                request_started_at IS NULL
                AND response_received_at IS NULL
            )
            OR (
                request_started_at IS NOT NULL
                AND request_started_at >= started_at
                AND (
                    response_received_at IS NULL
                    OR response_received_at >= request_started_at
                )
            )
        )
    );

ALTER TABLE collection_runs
    ADD CONSTRAINT collection_runs_response_completion_order_check
    CHECK (
        legacy_provenance_incomplete
        OR completed_at IS NULL
        OR completed_at >= COALESCE(response_received_at, request_started_at, started_at)
    );

ALTER TABLE collection_runs
    ADD CONSTRAINT collection_runs_retry_deadline_check
    CHECK (
        retry_not_before IS NULL
        OR (
            status = 'failed'
            AND response_received_at IS NOT NULL
            AND retry_not_before >= response_received_at
        )
    );

ALTER TABLE collection_runs
    ADD CONSTRAINT collection_runs_terminal_state_check
    CHECK (
        legacy_provenance_incomplete
        OR (
            (
                status = 'running'
                AND completed_at IS NULL
                AND error IS NULL
            )
            OR (
                status = 'failed'
                AND completed_at IS NOT NULL
                AND error IS NOT NULL
                AND jsonb_typeof(error) = 'object'
            )
            OR (
                status = 'succeeded'
                AND request_started_at IS NOT NULL
                AND response_received_at IS NOT NULL
                AND completed_at IS NOT NULL
                AND content_hash IS NOT NULL
                AND archive_path IS NOT NULL
                AND record_count IS NOT NULL
                AND parser_version IS NOT NULL
                AND error IS NULL
            )
        )
    );

CREATE INDEX collection_runs_source_retry_not_before_idx
    ON collection_runs (source_id, retry_not_before DESC)
    WHERE retry_not_before IS NOT NULL;

CREATE INDEX collection_runs_source_status_completed_idx
    ON collection_runs (source_id, status, completed_at DESC)
    WHERE completed_at IS NOT NULL;
