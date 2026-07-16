CREATE TABLE active_fire_detections (
    id UUID PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES source_catalogue(source_id),
    source_detection_id TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    satellite TEXT,
    instrument TEXT,
    confidence TEXT,
    brightness_kelvin DOUBLE PRECISION NOT NULL,
    fire_radiative_power_mw DOUBLE PRECISION,
    daynight TEXT,
    geometry GEOMETRY(POINT, 4326) NOT NULL,
    raw_observation_id UUID NOT NULL,
    evidence_classification TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    normalised_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT active_fire_detections_source_detection_unique
        UNIQUE (source_id, source_detection_id),
    CONSTRAINT active_fire_detections_raw_observation_fk
        FOREIGN KEY (raw_observation_id, source_id)
        REFERENCES raw_observations(id, source_id),
    CONSTRAINT active_fire_detections_brightness_check
        CHECK (brightness_kelvin > 0),
    CONSTRAINT active_fire_detections_evidence_classification_check
        CHECK (evidence_classification IN ('observed', 'reported', 'derived', 'inferred', 'hypothesis')),
    CONSTRAINT active_fire_detections_updated_check
        CHECK (updated_at >= occurred_at)
);

CREATE INDEX active_fire_detections_source_time_idx
    ON active_fire_detections (source_id, occurred_at DESC);

CREATE INDEX active_fire_detections_geometry_idx
    ON active_fire_detections USING GIST (geometry);

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
) VALUES
(
    'nasa-firms-viirs',
    'NASA FIRMS Suomi NPP VIIRS Global 24h CSV',
    'NASA FIRMS',
    'Near-real-time global active fire and thermal anomaly detections from the Suomi NPP VIIRS feed used by the existing OSIRIS fires route.',
    'https_csv',
    'free',
    'NASA FIRMS public active fire data; follow NASA FIRMS and Earthdata usage guidance.',
    'https://firms.modaps.eosdis.nasa.gov/',
    'https://firms.modaps.eosdis.nasa.gov/active_fire/',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv',
        'format', 'CSV',
        'provenance_classification', 'observed',
        'rate_limit_notes', 'Public file download; collect conservatively and prefer the configured polling interval.',
        'timestamp_semantics', 'acq_date and acq_time are treated as UTC satellite acquisition time.',
        'stable_identifier_notes', 'FIRMS CSV rows do not expose a provider event ID; the adapter deduplicates by a content fingerprint of the complete row.'
    )
),
(
    'nasa-firms-modis',
    'NASA FIRMS MODIS Global 24h CSV',
    'NASA FIRMS',
    'Near-real-time global active fire and thermal anomaly detections from the MODIS feed used as the existing OSIRIS fallback.',
    'https_csv',
    'free',
    'NASA FIRMS public active fire data; follow NASA FIRMS and Earthdata usage guidance.',
    'https://firms.modaps.eosdis.nasa.gov/',
    'https://firms.modaps.eosdis.nasa.gov/active_fire/',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
        'format', 'CSV',
        'provenance_classification', 'observed',
        'rate_limit_notes', 'Public file download; collect conservatively and prefer the configured polling interval.',
        'timestamp_semantics', 'acq_date and acq_time are treated as UTC satellite acquisition time.',
        'stable_identifier_notes', 'FIRMS CSV rows do not expose a provider event ID; the adapter deduplicates by a content fingerprint of the complete row.'
    )
),
(
    'nasa-eonet-volcanoes',
    'NASA EONET Volcano Events',
    'NASA EONET',
    'Curated active/open volcano events from NASA EONET API v3, matching the volcano supplement used by the existing OSIRIS fires route.',
    'https_json',
    'free',
    'NASA EONET public API; follow NASA and EONET usage guidance.',
    'https://eonet.gsfc.nasa.gov/',
    'https://eonet.gsfc.nasa.gov/docs/v3',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=volcanoes&limit=50',
        'format', 'JSON',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public API; collect conservatively and prefer the configured polling interval.',
        'timestamp_semantics', 'The latest Point geometry date is used as occurred_at and source_updated_at for this adapter.',
        'stable_identifier_notes', 'EONET event id is used as the stable source identifier.'
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
