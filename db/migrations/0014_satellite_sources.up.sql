CREATE TABLE satellite_tle_observations (
    id UUID PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES source_catalogue(source_id),
    source_tle_id TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    norad_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    line1 TEXT NOT NULL,
    line2 TEXT NOT NULL,
    epoch_at TIMESTAMPTZ,
    raw_observation_id UUID NOT NULL,
    evidence_classification TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    normalised_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT satellite_tle_observations_source_tle_unique
        UNIQUE (source_id, source_tle_id),
    CONSTRAINT satellite_tle_observations_raw_observation_fk
        FOREIGN KEY (raw_observation_id, source_id)
        REFERENCES raw_observations(id, source_id),
    CONSTRAINT satellite_tle_observations_evidence_classification_check
        CHECK (evidence_classification IN ('observed', 'reported', 'derived', 'inferred', 'hypothesis')),
    CONSTRAINT satellite_tle_observations_updated_check
        CHECK (updated_at >= observed_at)
);

CREATE INDEX satellite_tle_observations_source_time_idx
    ON satellite_tle_observations (source_id, observed_at DESC);

CREATE INDEX satellite_tle_observations_norad_idx
    ON satellite_tle_observations (norad_id);

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
    'celestrak-active-tle',
    'CelesTrak Active Satellites GP TLE',
    'CelesTrak',
    'General perturbations TLE set for active satellites used by the existing OSIRIS satellite route.',
    'https_tle',
    'free',
    'CelesTrak public data; follow CelesTrak terms and preserve attribution.',
    'https://celestrak.org/NORAD/documentation/',
    'https://celestrak.org/NORAD/documentation/gp-data-formats.php',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
        'format', 'TLE',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public TLE feed; collect conservatively and preserve raw responses.',
        'timestamp_semantics', 'TLE epoch is treated as observed_at and source update time.',
        'stable_identifier_notes', 'NORAD catalogue number is used as the stable source TLE identifier.'
    )
),
(
    'celestrak-starlink-supplemental-tle',
    'CelesTrak Starlink Supplemental TLE',
    'CelesTrak',
    'Supplemental Starlink TLE set used by the existing OSIRIS satellite route when Starlink-specific coverage is needed.',
    'https_tle',
    'free',
    'CelesTrak public data; follow CelesTrak terms and preserve attribution.',
    'https://celestrak.org/NORAD/documentation/',
    'https://celestrak.org/NORAD/documentation/supplemental-data.php',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle',
        'format', 'TLE',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public supplemental TLE feed; collect conservatively and preserve raw responses.',
        'timestamp_semantics', 'TLE epoch is treated as observed_at and source update time.',
        'stable_identifier_notes', 'NORAD catalogue number is used as the stable source TLE identifier.'
    )
),
(
    'satnogs-tle',
    'SatNOGS TLE API',
    'SatNOGS',
    'SatNOGS TLE JSON fallback used by the existing OSIRIS satellite route.',
    'https_json',
    'free',
    'SatNOGS public data; follow SatNOGS terms and preserve attribution.',
    'https://db.satnogs.org/',
    'https://db.satnogs.org/api/',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://db.satnogs.org/api/tle/?format=json',
        'format', 'JSON',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public API; collect conservatively and preserve raw responses.',
        'timestamp_semantics', 'updated is treated as observed_at and source update time; TLE epoch is stored separately as epoch_at.',
        'stable_identifier_notes', 'norad_cat_id is used as the stable source TLE identifier.'
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
