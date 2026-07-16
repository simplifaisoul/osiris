CREATE TABLE weather_events (
    id UUID PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES source_catalogue(source_id),
    source_event_id TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    area TEXT,
    expires_at TIMESTAMPTZ,
    link TEXT,
    geometry GEOMETRY(POINT, 4326) NOT NULL,
    raw_observation_id UUID NOT NULL,
    evidence_classification TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    normalised_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT weather_events_source_event_unique
        UNIQUE (source_id, source_event_id),
    CONSTRAINT weather_events_raw_observation_fk
        FOREIGN KEY (raw_observation_id, source_id)
        REFERENCES raw_observations(id, source_id),
    CONSTRAINT weather_events_severity_check
        CHECK (severity IN ('low', 'medium', 'high')),
    CONSTRAINT weather_events_evidence_classification_check
        CHECK (evidence_classification IN ('observed', 'reported', 'derived', 'inferred', 'hypothesis')),
    CONSTRAINT weather_events_updated_check
        CHECK (updated_at >= occurred_at)
);

CREATE INDEX weather_events_source_time_idx
    ON weather_events (source_id, occurred_at DESC);

CREATE INDEX weather_events_severity_time_idx
    ON weather_events (severity, occurred_at DESC);

CREATE INDEX weather_events_geometry_idx
    ON weather_events USING GIST (geometry);

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
    'nasa-eonet-weather',
    'NASA EONET Open Weather and Natural Events',
    'NASA EONET',
    'Open NASA EONET events used by the existing OSIRIS weather route, excluding wildfire and earthquake categories already handled by dedicated sources.',
    'https_json',
    'free',
    'NASA EONET public API; follow NASA and EONET usage guidance.',
    'https://eonet.gsfc.nasa.gov/',
    'https://eonet.gsfc.nasa.gov/docs/v3',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100',
        'format', 'JSON',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public NASA API; collect conservatively and prefer the configured polling interval.',
        'timestamp_semantics', 'The latest Point geometry date is used as occurred_at and source_updated_at.',
        'stable_identifier_notes', 'EONET event id is used as the stable source identifier.',
        'category_filter_notes', 'The adapter skips wildfires and earthquakes because FIRMS and USGS collectors cover those domains.'
    )
),
(
    'noaa-nws-alerts',
    'NOAA/NWS Active Weather Alerts GeoJSON',
    'NOAA National Weather Service',
    'Active U.S. weather alerts used by the existing OSIRIS weather route.',
    'https_geojson',
    'free',
    'NOAA/NWS public API; follow weather.gov terms and User-Agent guidance.',
    'https://www.weather.gov/disclaimer',
    'https://www.weather.gov/documentation/services-web-api',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://api.weather.gov/alerts/active?status=actual&message_type=alert',
        'format', 'GeoJSON',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public weather.gov endpoint; send an identifying User-Agent and collect conservatively.',
        'timestamp_semantics', 'effective is treated as occurrence time; sent is retained as source update time when available.',
        'stable_identifier_notes', 'properties.id is preferred, falling back to properties.@id or feature id.',
        'geometry_notes', 'Point geometries are stored directly; Polygon and MultiPolygon alerts use an averaged representative point for map compatibility.'
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
