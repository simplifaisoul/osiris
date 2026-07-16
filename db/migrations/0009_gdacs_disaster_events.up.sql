CREATE TABLE disaster_events (
    id UUID PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES source_catalogue(source_id),
    source_event_id TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    link TEXT,
    event_type TEXT NOT NULL,
    geometry GEOMETRY(POINT, 4326) NOT NULL,
    raw_observation_id UUID NOT NULL,
    evidence_classification TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    normalised_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT disaster_events_source_event_unique
        UNIQUE (source_id, source_event_id),
    CONSTRAINT disaster_events_raw_observation_fk
        FOREIGN KEY (raw_observation_id, source_id)
        REFERENCES raw_observations(id, source_id),
    CONSTRAINT disaster_events_evidence_classification_check
        CHECK (evidence_classification IN ('observed', 'reported', 'derived', 'inferred', 'hypothesis')),
    CONSTRAINT disaster_events_updated_check
        CHECK (updated_at >= occurred_at)
);

CREATE INDEX disaster_events_source_time_idx
    ON disaster_events (source_id, occurred_at DESC);

CREATE INDEX disaster_events_geometry_idx
    ON disaster_events USING GIST (geometry);

INSERT INTO source_catalogue (
    source_id,
    name,
    provider,
    description,
    access_method,
    cost_class,
    licence,
    terms_url,
    documentation_url,
    status,
    last_reviewed_at,
    metadata
) VALUES (
    'gdacs-disasters',
    'GDACS Disaster Alert RSS Feed',
    'Global Disaster Alert and Coordination System',
    'Public RSS feed of GDACS disaster alerts, including event type, coordinates, links and publication timestamps.',
    'https_rss',
    'free',
    'Public GDACS alert feed; verify redistribution terms before republishing bulk data.',
    'https://www.gdacs.org/',
    'https://www.gdacs.org/xml/rss.xml',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://www.gdacs.org/xml/rss.xml',
        'format', 'RSS XML',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public feed; collect conservatively with the shared collector retry and interval settings.',
        'timestamp_semantics', jsonb_build_object(
            'pubDate', 'Provider publication time for the RSS item; used as occurred_at and source_updated_at until GDACS exposes a richer per-event update timestamp in this adapter.'
        ),
        'stable_identifier_notes', 'Prefer RSS guid, then link, then a deterministic hash of title, pubDate and coordinates.'
    )
)
ON CONFLICT (source_id) DO UPDATE SET
    name = EXCLUDED.name,
    provider = EXCLUDED.provider,
    description = EXCLUDED.description,
    access_method = EXCLUDED.access_method,
    cost_class = EXCLUDED.cost_class,
    licence = EXCLUDED.licence,
    terms_url = EXCLUDED.terms_url,
    documentation_url = EXCLUDED.documentation_url,
    status = EXCLUDED.status,
    updated_at = NOW(),
    last_reviewed_at = EXCLUDED.last_reviewed_at,
    metadata = EXCLUDED.metadata;
