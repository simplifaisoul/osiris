CREATE TABLE threat_intel_observations (
    id UUID PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES source_catalogue(source_id),
    source_indicator_id TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    indicator_type TEXT NOT NULL,
    indicator_value TEXT NOT NULL,
    threat_kind TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT,
    malware_family TEXT,
    port INTEGER,
    country_code TEXT,
    title TEXT,
    description TEXT,
    reference_url TEXT,
    due_at TIMESTAMPTZ,
    raw_observation_id UUID NOT NULL,
    evidence_classification TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    normalised_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT threat_intel_observations_source_indicator_unique
        UNIQUE (source_id, source_indicator_id),
    CONSTRAINT threat_intel_observations_raw_observation_fk
        FOREIGN KEY (raw_observation_id, source_id)
        REFERENCES raw_observations(id, source_id),
    CONSTRAINT threat_intel_observations_indicator_type_check
        CHECK (indicator_type IN ('ip', 'url', 'cve')),
    CONSTRAINT threat_intel_observations_threat_kind_check
        CHECK (threat_kind IN ('botnet_c2', 'malware_url', 'exploited_vulnerability')),
    CONSTRAINT threat_intel_observations_severity_check
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT threat_intel_observations_port_check
        CHECK (port IS NULL OR (port >= 1 AND port <= 65535)),
    CONSTRAINT threat_intel_observations_evidence_classification_check
        CHECK (evidence_classification IN ('observed', 'reported', 'derived', 'inferred', 'hypothesis')),
    CONSTRAINT threat_intel_observations_updated_check
        CHECK (updated_at >= observed_at)
);

CREATE INDEX threat_intel_observations_source_time_idx
    ON threat_intel_observations (source_id, observed_at DESC);

CREATE INDEX threat_intel_observations_kind_time_idx
    ON threat_intel_observations (threat_kind, observed_at DESC);

CREATE INDEX threat_intel_observations_indicator_idx
    ON threat_intel_observations (indicator_type, indicator_value);

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
    'abusech-feodo-ipblocklist',
    'Abuse.ch Feodo Tracker IP Blocklist JSON',
    'abuse.ch',
    'Botnet command-and-control IP indicators used by the existing OSIRIS malware and cyber-attack routes.',
    'https_json',
    'free',
    'abuse.ch public feed; follow abuse.ch terms of use.',
    'https://abuse.ch/terms/',
    'https://feodotracker.abuse.ch/blocklist/',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://feodotracker.abuse.ch/downloads/ipblocklist.json',
        'format', 'JSON',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public feed; collect conservatively and preserve raw responses.',
        'timestamp_semantics', 'first_seen is treated as observed_at; last_online is treated as source update time when available.',
        'stable_identifier_notes', 'ip_address plus port is used as the stable source indicator identifier.'
    )
),
(
    'abusech-urlhaus-online',
    'Abuse.ch URLhaus Online URLs CSV',
    'abuse.ch',
    'Online malware distribution URLs used by the existing OSIRIS malware route.',
    'https_csv',
    'free',
    'abuse.ch public feed; follow URLhaus API terms of use.',
    'https://urlhaus.abuse.ch/api/',
    'https://urlhaus.abuse.ch/downloads/csv_online/',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://urlhaus.abuse.ch/downloads/csv_online/',
        'format', 'CSV',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public CSV dump; collect conservatively and preserve raw responses.',
        'timestamp_semantics', 'dateadded is treated as observed_at; last_online is treated as source update time.',
        'stable_identifier_notes', 'URLhaus id is used as the stable source indicator identifier.'
    )
),
(
    'cisa-known-exploited-vulnerabilities',
    'CISA Known Exploited Vulnerabilities Catalog',
    'CISA',
    'Authoritative catalog of known exploited CVEs used by the existing OSIRIS cyber-threats route.',
    'https_json',
    'free',
    'U.S. government public information; follow CISA website terms.',
    'https://www.cisa.gov/about/website-privacy-policy',
    'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
        'format', 'JSON',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public JSON catalog; collect conservatively and preserve raw responses.',
        'timestamp_semantics', 'dateAdded is treated as observed_at; catalog dateReleased is treated as source update time.',
        'stable_identifier_notes', 'cveID is used as the stable source indicator identifier.'
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
