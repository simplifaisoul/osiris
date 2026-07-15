# Build Guide for Codex CLI

## OSIRIS World-State Intelligence Platform

This guide breaks the project into safe, independently reviewable phases.

Do not ask Codex to implement the entire specification in one task. Each phase has:

- a goal;
- expected files;
- implementation notes;
- acceptance criteria;
- tests;
- a suggested Codex workflow.

---

## 1. Development assumptions

### Existing application

The upstream repository is a Next.js and TypeScript OSIRIS dashboard with MapLibre visualisation and internal API routes.

Treat the live repository as authoritative. File paths in this guide are targets, not guarantees.

### Runtime choices

- OSIRIS frontend/API: existing Next.js application.
- Continuous collection: standalone Node.js/TypeScript service.
- Database: PostgreSQL with PostGIS.
- Raw archive: local filesystem volume with gzip compression for the first version.
- Scheduling: collector-owned scheduler using simple timers or a lightweight scheduler package.
- Queueing: PostgreSQL outbox initially.
- Telegram: direct Bot API adapter later.
- Python: optional, offline research only.

### Why this is deliberately simple

The first version does not need:

- Kafka;
- Spark;
- Kubernetes;
- Redis;
- MinIO;
- microservices for each source;
- a machine-learning platform.

One OSIRIS container, one collector container and one PostGIS container are sufficient for the initial system.

---

## 2. Phase 0 — Baseline, audit and guardrails

### Goal

Prove the upstream application works before changing it and document the current route contracts.

### Tasks

1. Clone the repository and retain `upstream`.
2. Install dependencies.
3. Run tests, lint and production build.
4. List existing API routes.
5. Identify map layers and the response fields each consumes.
6. Record any existing failures before making changes.
7. Add:
   - `AGENTS.md`;
   - `PROJECT_SPEC.md`;
   - `BUILD_GUIDE_CODEX.md`;
   - `CODEX_PROMPTS.md`.
8. Add no runtime features during this phase.

### Suggested commands

```bash
npm install
npm test
npm run lint
npm run build
git status
```

Use the package manager and lockfile already present in the repository. Do not replace them casually.

### Deliverable

Create `docs/current-osiris-baseline.md` containing:

- commit SHA;
- Node version;
- package-manager version;
- test results;
- build results;
- route inventory;
- layer inventory;
- known issues;
- environment variables read by the current code.

### Acceptance criteria

- No functional source files changed.
- Existing test/build status documented honestly.
- Current routes and layers inventoried.
- Git working tree is understandable and reviewable.

---

## 3. Phase 1 — Raw ingestion vertical slice

### Goal

Create the smallest complete path:

```text
USGS raw response
→ immutable archive
→ PostgreSQL record
→ normalised earthquake rows
→ OSIRIS-compatible database response
```

Do not add other sources until this works.

### 3.1 Infrastructure

Add `docker-compose.worldstate.yml` containing:

- existing OSIRIS service or a documented way to run it;
- `postgis/postgis` using a stable PostgreSQL/PostGIS image;
- collector service;
- named database volume;
- bind mount for raw archive.

Use environment variables for:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
DATABASE_URL
RAW_ARCHIVE_PATH
OSIRIS_BASE_URL
```

Add safe placeholders to `.env.example`.

Do not commit `.env`.

### 3.2 Database migrations

Create SQL migrations for:

#### `source_catalogue`

Minimum fields:

```text
source_id TEXT PRIMARY KEY
name TEXT NOT NULL
provider TEXT NOT NULL
description TEXT
access_method TEXT NOT NULL
cost_class TEXT NOT NULL
licence TEXT
terms_url TEXT
documentation_url TEXT
status TEXT NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
last_reviewed_at TIMESTAMPTZ
metadata JSONB NOT NULL
```

#### `collection_runs`

```text
id UUID PRIMARY KEY
source_id TEXT REFERENCES source_catalogue
started_at TIMESTAMPTZ NOT NULL
completed_at TIMESTAMPTZ
status TEXT NOT NULL
endpoint TEXT NOT NULL
http_status INTEGER
content_type TEXT
content_hash TEXT
archive_path TEXT
record_count INTEGER
collector_version TEXT NOT NULL
parser_version TEXT
error JSONB
metrics JSONB NOT NULL
```

#### `raw_observations`

```text
id UUID PRIMARY KEY
source_id TEXT REFERENCES source_catalogue
collection_run_id UUID REFERENCES collection_runs
source_record_id TEXT
observed_at TIMESTAMPTZ NOT NULL
occurred_at TIMESTAMPTZ
first_seen_at TIMESTAMPTZ NOT NULL
last_seen_at TIMESTAMPTZ NOT NULL
content_hash TEXT NOT NULL
archive_path TEXT NOT NULL
payload JSONB
schema_version INTEGER NOT NULL
metadata JSONB NOT NULL
```

Add uniqueness that permits safe replay. For the first source, a sensible key is source plus stable provider ID.

#### `seismic_events`

Include:

```text
source_id
source_event_id
occurred_at
updated_at
magnitude
depth_km
place
tsunami
felt
alert
event_type
geometry GEOMETRY(POINT, 4326)
raw_observation_id
```

Add useful time and spatial indexes.

### 3.3 Collector package

Create `collector/` as a separate TypeScript package.

Recommended dependencies:

- a PostgreSQL client;
- `zod` for configuration and boundary validation;
- `pino` for structured logs;
- test framework consistent with the root repository where practical.

Prefer Node’s built-in:

- `fetch`;
- `AbortSignal.timeout`;
- `crypto`;
- `zlib`;
- filesystem promises.

Do not add a heavy framework unless it solves a demonstrated problem.

### 3.4 Collector framework interfaces

Create explicit interfaces, for example:

```ts
export interface SourceCollector {
  readonly sourceId: string;
  collect(context: CollectorContext): Promise<CollectionResult>;
}

export interface RawResponse {
  endpoint: string;
  fetchedAt: Date;
  status: number;
  headers: Record<string, string>;
  contentType: string | null;
  body: Buffer;
}

export interface CollectionResult {
  runId: string;
  sourceId: string;
  rawHash: string;
  archivePath: string;
  recordsSeen: number;
  recordsInserted: number;
  recordsUpdated: number;
}
```

The exact shape may change after repository inspection. Preserve the semantics.

### 3.5 Raw archive writer

Requirements:

1. Write into a temporary file.
2. Compress with gzip.
3. Flush and atomically rename.
4. Name using timestamp and SHA-256 hash.
5. Return the final relative path.
6. Do not mark the collection successful until archive and database writes succeed.
7. Avoid overwriting an existing hash-identical file.
8. Unit test path generation, hashing and atomic behaviour.

### 3.6 USGS collector

Call the official USGS GeoJSON feed directly.

For each collection:

1. Create `collection_runs` row with `running`.
2. Fetch with timeout.
3. Capture selected headers and raw bytes.
4. Hash the body.
5. Archive the unmodified body.
6. Update collection-run archive metadata.
7. Parse only after archival.
8. Validate expected outer structure.
9. Upsert raw observation records by USGS event ID.
10. Upsert normalised seismic events.
11. Complete the run with metrics.
12. On failure, persist failure information.

Use committed fixtures for tests. Live tests must require an explicit environment flag.

### 3.7 Database-backed compatibility route

Do not immediately delete the current OSIRIS earthquake route.

Introduce configuration such as:

```text
EARTHQUAKE_DATA_MODE=live|database|database_with_live_fallback
```

The database response must match the existing OSIRIS route contract.

Add contract tests with a representative fixture.

### Phase 1 acceptance criteria

- Existing OSIRIS can still run in `live` mode.
- PostGIS starts from an empty volume.
- All migrations apply.
- Collector writes an immutable compressed raw response.
- Collection run is persisted.
- Earthquakes are idempotently normalised.
- Replaying the same fixture creates no duplicate event.
- Updated provider data updates the existing event correctly.
- Database-backed route renders on the existing map.
- Collector survives restart.
- Existing root tests, lint and build pass or documented pre-existing failures remain unchanged.

### Phase 1 verification

```bash
docker compose -f docker-compose.worldstate.yml up -d db
npm --prefix collector install
npm --prefix collector test
npm --prefix collector run lint
npm --prefix collector run build
npm test
npm run lint
npm run build
```

Add a deterministic fixture command such as:

```bash
npm --prefix collector run ingest:fixture -- usgs-earthquakes
```

---

## 4. Phase 2 — Expand existing OSIRIS sources safely

### Goal

Add source adapters one at a time while preserving complete upstream payloads.

### Suggested order

1. GDACS disaster feed.
2. NASA FIRMS fires.
3. NASA EONET events.
4. Space weather.
5. Existing OSIRIS news sources.
6. Existing market snapshot endpoint.
7. Aircraft positions.
8. AIS vessel positions.
9. Remaining OSIRIS domains.

### Source-specific warning

Do not assume the existing route name accurately describes the upstream source. Record the actual provider and endpoint in the catalogue.

### Moving-entity policy

Aircraft and vessel positions can create large volumes.

Initial policy:

- target economically important regions;
- store raw approved stream messages;
- normalise positions;
- calculate five-minute regional summaries;
- define retention explicitly;
- never pretend sampled coverage is global complete coverage.

### Acceptance criteria per source

- Catalogue entry reviewed.
- Complete upstream response archived.
- Fixture tests added.
- Stable IDs documented.
- Timestamp semantics documented.
- Deduplication verified.
- OSIRIS response remains compatible.
- Health information visible.
- Rate limiting configurable.

---

## 5. Phase 3 — Source discovery subsystem

### Goal

Make “find more useful free data” an organised workflow rather than random integration.

### Add

- Source catalogue API.
- Candidate-source status.
- Review checklist.
- Industry tags.
- Geographic coverage.
- Cost and licence classes.
- Reliability notes.
- Last-reviewed timestamp.
- Source-health history.

### Optional source-scout command

Create a CLI command that produces a Markdown candidate report from supplied metadata:

```bash
npm --prefix collector run source:report -- candidate.json
```

Do not build uncontrolled web scraping into the production collector.

### Source approval gates

A source cannot become enabled by default until:

- terms are recorded;
- licence is recorded;
- stable IDs are understood;
- timestamp meaning is documented;
- fixture tests exist;
- expected request frequency is configured;
- failure behaviour is defined.

---

## 6. Phase 4 — Agriculture vertical slice

### Goal

Display regional agricultural conditions without requiring farm-level data.

### Initial crop focus

Choose one or two crops, for example:

- wheat;
- corn/maize.

Choose a small set of regions with good open data.

### Required layers

1. Crop-region polygons.
2. Historical production and yield.
3. Rainfall and temperature.
4. Soil-moisture or drought product.
5. Fire and disaster overlap.
6. Vegetation-condition product where practical.
7. Relevant futures or commodity price.
8. Export port and route relationships.

### Agriculture schema

Add:

```text
crops
growing_seasons
agricultural_regions
agricultural_observations
production_statistics
crop_condition_reports
vegetation_observations
```

Every value must state whether it is:

- measured;
- reported estimate;
- forecast;
- derived index;
- inferred.

### OSIRIS interface

Add a toggleable agriculture layer and regional panel.

The panel should display:

- crop and season;
- planted/harvested area where available;
- latest condition;
- rainfall anomaly;
- temperature anomaly;
- soil moisture or drought;
- nearby fires/disasters;
- export route status;
- associated market instrument;
- source list;
- observation timestamps.

### Acceptance criteria

- No farm-level data required.
- Region geometry can be queried spatially.
- Weather and event overlap is reproducible.
- Every panel number has provenance.
- Missing values are shown as unavailable, not guessed.
- Existing OSIRIS layers remain unaffected.

---

## 7. Phase 5 — Proper market bars

### Goal

Create durable market history suitable for anomaly analysis.

### Provider abstraction

Define a market provider interface because free tiers and licences change.

```ts
interface MarketDataProvider {
  providerId: string;
  fetchBars(request: BarRequest): Promise<MarketBarBatch>;
  describeCapabilities(): ProviderCapabilities;
}
```

Record:

- whether data is real-time, delayed or end-of-day;
- supported instruments;
- interval;
- licensing and redistribution notes;
- provider timestamp;
- adjustment status.

### Initial universe

Keep it limited and economically linked to collected industries.

Example:

- broad equity indices;
- energy sector;
- defence sector;
- agriculture sector;
- shipping;
- airlines;
- Brent/WTI;
- natural gas;
- gold;
- copper;
- wheat;
- corn;
- selected currencies.

### Acceptance criteria

- Repeated requests are idempotent.
- Provider gaps are visible.
- Market session and timezone are handled.
- Delayed data is labelled.
- Corporate actions are not silently ignored.
- Existing OSIRIS market snapshot remains available.

---

## 8. Phase 6 — Market anomaly engine

### Goal

Produce explainable anomaly records before attempting causal narratives.

### First calculations

For each instrument and interval:

- log or percentage return;
- rolling median;
- median absolute deviation;
- robust z-score;
- rolling percentile;
- exponentially weighted volatility;
- volume percentile where volume exists;
- benchmark residual;
- sector residual.

### Version everything

Persist:

- feature version;
- baseline window;
- thresholds;
- input bar range;
- calculation code version.

### Notification rule

Do not send Telegram yet.

First expose alerts internally and measure:

- alerts per day;
- duplicate alerts;
- alert duration;
- false positives;
- missing-data alerts;
- unexplained alerts.

### Acceptance criteria

- Re-running the same window creates no duplicate alert.
- A fixture with a known spike creates the expected alert.
- A normal fixture does not.
- Calculation details are inspectable.
- No claim of causation is produced.

---

## 9. Phase 7 — Evidence graph

### Goal

Connect alerts to relevant physical and economic observations.

### Begin with curated relationships

Examples:

```text
Strait of Hormuz TRANSPORTS crude_oil
Brent REPRESENTS crude_oil_market
Airlines CONSUME jet_fuel
wheat_region PRODUCES wheat
grain_port EXPORTS wheat
```

Store source and effective dates.

### Candidate-event search

For an anomaly:

1. Determine relevant industries and commodities.
2. Determine exposed regions and infrastructure.
3. Search events in configured lookback windows.
4. Search related market and operational changes.
5. Score evidence based on:
   - temporal proximity;
   - spatial overlap;
   - graph path;
   - independent source count;
   - historical relationship;
   - contradictory evidence.
6. Persist the full evidence path.

### Acceptance criteria

- Every path edge has a source.
- Temporal windows are visible.
- Contradictory evidence can be stored.
- `NO_EXPLANATION_FOUND` is a valid result.
- No LLM is required for the first implementation.

---

## 10. Phase 8 — Telegram notifications

### Goal

Reliably deliver selected persisted alerts.

### Database outbox

Add:

```text
notification_subscriptions
notification_outbox
notification_attempts
```

Use transactionally inserted outbox records.

### Telegram adapter

Environment variables:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_DEFAULT_CHAT_ID
TELEGRAM_ENABLED
```

Never log the token.

### Initial message

Include:

- severity;
- instrument;
- movement;
- anomaly score;
- explanation class;
- top evidence points;
- alert ID;
- OSIRIS deep link if available.

### Reliability

- exponential retry;
- maximum attempts;
- dead-letter state;
- deduplication key;
- cooldown;
- quiet hours;
- test mode;
- allowlisted chat IDs.

### Acceptance criteria

- Alert exists before delivery attempt.
- Failed Telegram call does not lose the alert.
- Reprocessing does not duplicate a delivered message.
- Disabled mode makes no network request.
- Tests mock Telegram.
- Real bot integration test is opt-in.

---

## 11. Phase 9 — Research and correlation engine

### Goal

Use accumulated history to investigate relationships without corrupting the operational system.

### Research outputs

- event studies;
- lagged correlation;
- rolling correlation;
- regime-conditioned relationships;
- historical median response;
- sample size;
- confidence intervals;
- out-of-sample results.

### Required protections

- use returns rather than raw price levels where appropriate;
- avoid look-ahead leakage;
- account for economic-data revisions;
- preserve publication and occurrence timestamps;
- correct for repeated hypothesis testing;
- use walk-forward validation;
- distinguish discovery from validation datasets.

Python notebooks may be added here as optional tooling. Production collection remains TypeScript.

---

## 12. Codex CLI working style

Codex CLI can work interactively from the repository, use an `AGENTS.md`, run local commands, review changes and run non-interactive tasks.

Recommended loop:

1. Start from a clean branch.
2. Ask Codex to inspect and plan without editing.
3. Approve one phase or vertical slice.
4. Let Codex edit and test.
5. Inspect the diff.
6. Run `/review`.
7. Correct findings.
8. Commit.
9. Start a new branch or task for the next phase.

Avoid prompts such as:

```text
Build the complete platform described in PROJECT_SPEC.md.
```

Prefer:

```text
Implement only Phase 1.3 and Phase 1.4 from BUILD_GUIDE_CODEX.md.
Do not modify the OSIRIS frontend.
Run collector tests and report the exact commands and results.
```

---

## 13. Final verification checklist for every pull request

- [ ] Existing OSIRIS feature removed? If yes, stop and justify.
- [ ] Raw source archived before transformation?
- [ ] Source catalogue updated?
- [ ] Licence and rate-limit notes included?
- [ ] Stable ID and timestamp semantics documented?
- [ ] Fixture tests included?
- [ ] Live tests opt-in?
- [ ] Collector replay idempotent?
- [ ] Database migration tested from empty state?
- [ ] No secrets committed?
- [ ] Existing API contract preserved or versioned?
- [ ] UI values expose provenance?
- [ ] Build, lint and tests run?
- [ ] Known failures honestly reported?
