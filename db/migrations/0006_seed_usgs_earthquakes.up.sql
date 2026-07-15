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
    'usgs-earthquakes',
    'USGS Earthquake Hazards Program GeoJSON Feed',
    'United States Geological Survey',
    'Official real-time GeoJSON summary feed for earthquakes of magnitude 2.5 and greater during the previous day.',
    'https_json',
    'free',
    'US government information; follow the linked USGS copyright and credit guidance.',
    'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
    'active',
    NOW(),
    jsonb_build_object(
        'endpoint', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
        'format', 'GeoJSON',
        'provenance_classification', 'reported',
        'rate_limit_notes', 'Public feed; collect conservatively and honour provider guidance.',
        'provider_time_semantics', jsonb_build_array('generated', 'time', 'updated')
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
