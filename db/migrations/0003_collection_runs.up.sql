CREATE TABLE collection_runs (
    id UUID PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES source_catalogue(source_id),
    started_at TIMESTAMPTZ NOT NULL,
    response_received_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    upstream_timestamp TIMESTAMPTZ,
    status TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    http_status INTEGER,
    content_type TEXT,
    content_hash TEXT,
    archive_path TEXT,
    response_headers JSONB NOT NULL DEFAULT '{}'::JSONB,
    record_count INTEGER,
    collector_version TEXT NOT NULL,
    parser_version TEXT,
    error JSONB,
    metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT collection_runs_id_source_unique
        UNIQUE (id, source_id),
    CONSTRAINT collection_runs_status_check
        CHECK (status IN ('running', 'succeeded', 'failed')),
    CONSTRAINT collection_runs_http_status_check
        CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
    CONSTRAINT collection_runs_content_hash_check
        CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT collection_runs_record_count_check
        CHECK (record_count IS NULL OR record_count >= 0),
    CONSTRAINT collection_runs_timestamps_check
        CHECK (
            (response_received_at IS NULL OR response_received_at >= started_at)
            AND (completed_at IS NULL OR completed_at >= started_at)
        ),
    CONSTRAINT collection_runs_completion_check
        CHECK (
            (status = 'running' AND completed_at IS NULL)
            OR (status IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
        ),
    CONSTRAINT collection_runs_success_archive_check
        CHECK (
            status <> 'succeeded'
            OR (content_hash IS NOT NULL AND archive_path IS NOT NULL AND error IS NULL)
        )
);

CREATE INDEX collection_runs_source_started_idx
    ON collection_runs (source_id, started_at DESC);

CREATE INDEX collection_runs_status_started_idx
    ON collection_runs (status, started_at DESC);
