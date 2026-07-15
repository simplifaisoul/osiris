CREATE TABLE source_catalogue (
    source_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    description TEXT,
    access_method TEXT NOT NULL,
    cost_class TEXT NOT NULL,
    licence TEXT,
    terms_url TEXT,
    documentation_url TEXT,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reviewed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT source_catalogue_cost_class_check
        CHECK (cost_class IN ('free', 'free_tier', 'paid_optional', 'unknown')),
    CONSTRAINT source_catalogue_status_check
        CHECK (status IN ('candidate', 'active', 'paused', 'deprecated', 'rejected')),
    CONSTRAINT source_catalogue_timestamps_check
        CHECK (updated_at >= created_at)
);
