CREATE TABLE seismic_events (
    id UUID PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES source_catalogue(source_id),
    source_event_id TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ,
    magnitude DOUBLE PRECISION,
    depth_km DOUBLE PRECISION,
    place TEXT,
    tsunami BOOLEAN NOT NULL DEFAULT FALSE,
    felt INTEGER,
    alert TEXT,
    event_type TEXT,
    geometry GEOMETRY(POINT, 4326) NOT NULL,
    raw_observation_id UUID NOT NULL,
    evidence_classification TEXT NOT NULL DEFAULT 'reported',
    parser_version TEXT NOT NULL,
    normalised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT seismic_events_source_event_unique
        UNIQUE (source_id, source_event_id),
    CONSTRAINT seismic_events_raw_source_fk
        FOREIGN KEY (raw_observation_id, source_id)
        REFERENCES raw_observations(id, source_id),
    CONSTRAINT seismic_events_felt_check
        CHECK (felt IS NULL OR felt >= 0),
    CONSTRAINT seismic_events_evidence_classification_check
        CHECK (evidence_classification IN ('observed', 'reported', 'derived', 'inferred', 'hypothesis'))
);

CREATE INDEX seismic_events_occurred_idx
    ON seismic_events (occurred_at DESC);

CREATE INDEX seismic_events_source_occurred_idx
    ON seismic_events (source_id, occurred_at DESC);

CREATE INDEX seismic_events_geometry_gix
    ON seismic_events USING GIST (geometry);

CREATE INDEX seismic_events_magnitude_occurred_idx
    ON seismic_events (magnitude, occurred_at DESC)
    WHERE magnitude IS NOT NULL;
