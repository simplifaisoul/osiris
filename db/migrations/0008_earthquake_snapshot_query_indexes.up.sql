-- The compatibility API selects the latest complete USGS feed and then joins
-- only observations seen in that exact response. These indexes keep that
-- minute-scale dashboard query bounded as source history grows.
CREATE INDEX collection_runs_source_success_response_idx
    ON collection_runs (source_id, response_received_at DESC, id DESC)
    WHERE status = 'succeeded'
      AND legacy_provenance_incomplete = FALSE
      AND response_received_at IS NOT NULL;

CREATE INDEX raw_observations_source_last_seen_idx
    ON raw_observations (source_id, last_seen_at DESC)
    WHERE source_record_id IS NOT NULL;
