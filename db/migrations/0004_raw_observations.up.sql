CREATE TABLE raw_observations (
    id UUID PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES source_catalogue(source_id),
    collection_run_id UUID NOT NULL,
    source_record_id TEXT,
    observed_at TIMESTAMPTZ NOT NULL,
    occurred_at TIMESTAMPTZ,
    source_updated_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    content_hash TEXT NOT NULL,
    archive_path TEXT NOT NULL,
    payload JSONB,
    schema_version INTEGER NOT NULL,
    parser_version TEXT NOT NULL,
    evidence_classification TEXT NOT NULL DEFAULT 'reported',
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT raw_observations_id_source_unique
        UNIQUE (id, source_id),
    CONSTRAINT raw_observations_run_source_fk
        FOREIGN KEY (collection_run_id, source_id)
        REFERENCES collection_runs(id, source_id),
    CONSTRAINT raw_observations_content_hash_check
        CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT raw_observations_schema_version_check
        CHECK (schema_version > 0),
    CONSTRAINT raw_observations_evidence_classification_check
        CHECK (evidence_classification IN ('observed', 'reported', 'derived', 'inferred', 'hypothesis')),
    CONSTRAINT raw_observations_seen_timestamps_check
        CHECK (last_seen_at >= first_seen_at),
    CONSTRAINT raw_observations_row_timestamps_check
        CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX raw_observations_source_record_uidx
    ON raw_observations (source_id, source_record_id)
    WHERE source_record_id IS NOT NULL;

CREATE INDEX raw_observations_source_observed_idx
    ON raw_observations (source_id, observed_at DESC);

CREATE INDEX raw_observations_collection_run_idx
    ON raw_observations (collection_run_id);
