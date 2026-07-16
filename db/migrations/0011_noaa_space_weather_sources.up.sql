CREATE TABLE space_weather_observations (
    id UUID PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES source_catalogue(source_id),
    source_observation_id TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    event_kind TEXT NOT NULL,
    numeric_value DOUBLE PRECISION,
    classification TEXT,
    message TEXT,
    raw_observation_id UUID NOT NULL,
    evidence_classification TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    normalised_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT space_weather_observations_source_observation_unique
        UNIQUE (source_id, source_observation_id),
    CONSTRAINT space_weather_observations_raw_observation_fk
        FOREIGN KEY (raw_observation_id, source_id)
        REFERENCES raw_observations(id, source_id),
    CONSTRAINT space_weather_observations_kind_check
        CHECK (event_kind IN ('planetary_k_index', 'alert', 'xray_flare')),
    CONSTRAINT space_weather_observations_evidence_classification_check
        CHECK (evidence_classification IN ('observed', 'reported', 'derived', 'inferred', 'hypothesis')),
    CONSTRAINT space_weather_observations_updated_check
        CHECK (updated_at >= observed_at)
);

CREATE INDEX space_weather_observations_source_time_idx
    ON space_weather_observations (source_id, observed_at DESC);

CREATE INDEX space_weather_observations_kind_time_idx
    ON space_weather_observations (event_kind, observed_at DESC);

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
    'noaa-swpc-planetary-k-index',
    'NOAA SWPC Planetary K-index 1-minute JSON',
    'NOAA Space Weather Prediction Center',
    'Recent planetary K-index observations used by the existing OSIRIS space-weather route for geomagnetic storm state.',
    'https_json',
    'free',
    'NOAA public data; follow NOAA and SWPC data usage guidance.',
    'https://www.noaa.gov/information-technology/open-data-dissemination',
    'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
        'format', 'JSON',
        'provenance_classification', 'observed',
        'rate_limit_notes', 'Public NOAA JSON endpoint; collect conservatively with the configured polling interval.',
        'timestamp_semantics', 'time_tag is treated as observation time and source update time.',
        'stable_identifier_notes', 'time_tag is used as the stable source observation identifier.'
    )
),
(
    'noaa-swpc-alerts',
    'NOAA SWPC Alerts JSON',
    'NOAA Space Weather Prediction Center',
    'Recent SWPC alert products used by the existing OSIRIS space-weather route.',
    'https_json',
    'free',
    'NOAA public data; follow NOAA and SWPC data usage guidance.',
    'https://www.noaa.gov/information-technology/open-data-dissemination',
    'https://services.swpc.noaa.gov/products/alerts.json',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://services.swpc.noaa.gov/products/alerts.json',
        'format', 'JSON',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public NOAA JSON endpoint; collect conservatively with the configured polling interval.',
        'timestamp_semantics', 'issue_datetime is treated as publication time and source update time.',
        'stable_identifier_notes', 'product_id plus issue_datetime is used as the stable source observation identifier because product codes can repeat.'
    )
),
(
    'noaa-swpc-xray-flares',
    'NOAA SWPC GOES Primary X-ray Flares Latest JSON',
    'NOAA Space Weather Prediction Center',
    'Latest GOES primary X-ray flare events used by the existing OSIRIS space-weather route.',
    'https_json',
    'free',
    'NOAA public data; follow NOAA and SWPC data usage guidance.',
    'https://www.noaa.gov/information-technology/open-data-dissemination',
    'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json',
        'format', 'JSON',
        'provenance_classification', 'observed',
        'rate_limit_notes', 'Public NOAA JSON endpoint; collect conservatively with the configured polling interval.',
        'timestamp_semantics', 'max_time is treated as flare observation time and source update time.',
        'stable_identifier_notes', 'A deterministic identifier from max_time and max_class is used.'
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
