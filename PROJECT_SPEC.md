# OSIRIS World-State Intelligence Platform

## Product and Architecture Specification

Status: Draft for phased implementation
Primary implementation language: TypeScript
Primary interface: Extended OSIRIS
Default operating model: Self-hosted, free-first data collection

---

## 1. Vision

Build a durable world-state intelligence platform by extending OSIRIS rather than replacing or reducing it.

The platform continuously records public observations about the physical, economic and geopolitical world. It preserves those observations historically, links them to industries and financial instruments, detects unusual market behaviour, and presents transparent evidence chains through the OSIRIS interface.

The long-term objective is not to claim omniscience or automatic causation. It is to accumulate enough well-timestamped, well-sourced history to support:

- situational awareness;
- event studies;
- lagged-correlation research;
- supply-chain analysis;
- industrial exposure mapping;
- explainable market alerts;
- later forecasting experiments.

The historical dataset is the primary asset. Models and analytical methods are replaceable.

---

## 2. Product principles

### 2.1 Extend, never neuter

Existing OSIRIS functionality remains available.

A richer source does not automatically replace an existing source. Overlapping sources are retained independently so that:

- disagreements can be measured;
- gaps can be filled;
- provider outages can be survived;
- source quality can be evaluated historically;
- transformations remain reversible.

### 2.2 Preserve full upstream fidelity

The complete upstream response is stored before OSIRIS-specific display transformations such as:

- sampling;
- rounding;
- filtering;
- categorisation;
- risk scoring;
- coordinate simplification;
- truncation;
- fallback substitution.

OSIRIS may still receive a reduced map-friendly view. The preserved raw response remains the canonical evidence record.

### 2.3 Free-first source strategy

The default installation must function with open data and free tiers.

Preferred source classes:

1. Government open-data systems.
2. Scientific and meteorological institutions.
3. Regulators and official economic statistics.
4. Open satellite programmes.
5. Public-company filings.
6. Public APIs and bulk archives.
7. Open-source data projects.
8. Rate-limited commercial free tiers.

Paid adapters may be supported later, but the platform must not require them for the core build.

### 2.4 Honest provenance

Every value is labelled as one of:

- `observed`;
- `reported`;
- `derived`;
- `inferred`;
- `hypothesis`.

The UI must not present modelled or inferred values as directly measured facts.

### 2.5 Explainable before clever

Early market alerts use transparent statistical methods. Evidence chains are composed from recorded graph relationships and events.

Complex machine-learning models may be added later only after:

- sufficient history exists;
- baseline methods exist;
- walk-forward testing exists;
- false-positive rates are known;
- outputs can be inspected.

---

## 3. Scope

### 3.1 Included

- Existing OSIRIS data layers and interface.
- Durable raw-data collection.
- Historical normalised observations.
- Source catalogue and source-discovery workflow.
- Geospatial linking through PostGIS.
- Industry, asset and supply-chain graph.
- Regional agriculture intelligence.
- Market bars and market anomaly detection.
- Evidence-backed alert explanations.
- Telegram outbound notifications.
- Research datasets for later correlation and forecasting work.

### 3.2 Not initially included

- Automated trading.
- Investment recommendations.
- Farm-by-farm yield estimation.
- Proprietary exchange-depth feeds.
- Paid global cargo manifests.
- Guaranteed causal attribution.
- LLM-generated graph relationships without evidence.
- A mandatory Python runtime.
- Massive distributed infrastructure such as Kafka or Spark.

---

## 4. System architecture

```text
                              ┌───────────────────────────┐
                              │ Public and free-tier data │
                              │ feeds, bulk files, APIs   │
                              └─────────────┬─────────────┘
                                            │
                              ┌─────────────▼─────────────┐
                              │ TypeScript collector       │
                              │ retries, rate limits,      │
                              │ provenance, deduplication  │
                              └───────┬───────────┬────────┘
                                      │           │
                         ┌────────────▼───┐   ┌───▼────────────────┐
                         │ Immutable raw   │   │ PostgreSQL/PostGIS │
                         │ archive         │   │ normalised history │
                         └────────────┬────┘   └─────────┬──────────┘
                                      │                  │
                              ┌───────▼──────────────────▼───────┐
                              │ Derived features and graph jobs  │
                              │ industry, region, exposure, lag  │
                              └────────────────┬─────────────────┘
                                               │
                  ┌────────────────────────────▼───────────────────────────┐
                  │ Versioned query API and OSIRIS compatibility routes   │
                  └───────────────┬──────────────────────┬─────────────────┘
                                  │                      │
                      ┌───────────▼──────────┐  ┌───────▼──────────────┐
                      │ Extended OSIRIS GUI  │  │ Alert/notification    │
                      │ map, panels, chains  │  │ service and Telegram │
                      └──────────────────────┘  └──────────────────────┘
```

---

## 5. Runtime components

### 5.1 OSIRIS application

Responsibilities:

- Map and globe rendering.
- Existing OSIRIS layers.
- Layer controls and search.
- Market panels.
- Alert panels.
- Entity and evidence graph visualisation.
- Industry and agriculture overlays.
- Historical timeline controls.
- Source and provenance inspection.

OSIRIS should not become the scheduler or durable collector.

### 5.2 Collector service

A standalone Node.js/TypeScript process.

Responsibilities:

- Poll HTTP APIs.
- Maintain approved WebSocket feeds.
- Download bulk data.
- Apply rate limits.
- Retry transient failures.
- Persist raw responses.
- Trigger normalisation.
- Record collection runs.
- Expose health information.
- Maintain source-specific cursors where supported.

### 5.3 PostgreSQL/PostGIS

Responsibilities:

- Source catalogue.
- Collection-run history.
- Normalised events and observations.
- Spatial entities and regions.
- Market bars.
- Industry relationships.
- Alerts and alert evidence.
- Notification outbox.
- Derived feature tables.

### 5.4 Raw archive

Append-only compressed source responses.

Recommended initial implementation:

- Local filesystem volume on the 5 TB drive.
- Gzip compression using Node standard libraries.
- Content-addressed filenames.
- Database pointer and hash.
- Future option to use MinIO without changing collector contracts.

### 5.5 Alert engine

Responsibilities:

- Calculate instrument-specific baselines.
- Identify unusual market activity.
- Persist alert calculations and windows.
- Search for related observations and graph paths.
- Assign an explanation category and confidence.
- Add messages to the notification outbox.

### 5.6 Notification worker

Responsibilities:

- Deliver qualified alerts.
- Retry failures safely.
- Deduplicate notifications.
- Apply user filters, quiet hours and cooldowns.
- Initially support Telegram outbound messages.

---

## 6. Data lifecycle

```text
discovered
→ approved
→ collected
→ raw archived
→ normalised
→ enriched
→ aggregated
→ linked
→ analysed
→ displayed
→ optionally notified
```

A failure later in the pipeline must not invalidate an already preserved raw observation.

---

## 7. Source catalogue

The source catalogue is a first-class subsystem.

### 7.1 Required fields

```text
source_id
name
provider
description
industry_tags
geographic_coverage
time_coverage
update_frequency
access_method
authentication_type
cost_class
rate_limit_notes
licence
redistribution_notes
terms_url
documentation_url
data_quality_notes
timestamp_semantics
stable_identifier_notes
collector_status
last_reviewed_at
```

### 7.2 Cost classes

```text
OPEN_BULK
FREE_UNLIMITED
FREE_KEY_REQUIRED
FREE_RATE_LIMITED
PAID_OPTIONAL
RESTRICTED
REJECTED
```

### 7.3 Discovery workflow

1. Find a candidate source.
2. Record it in the catalogue as `candidate`.
3. Review licence and terms.
4. Test a small sample.
5. Document timestamps and identifiers.
6. Compare with existing sources.
7. Approve or reject.
8. Implement a fixture-backed collector.
9. Monitor reliability and drift.
10. Re-review periodically.

Automated discovery may suggest sources but must not automatically enable unreviewed scraping.

---

## 8. Core data model

The exact schema evolves through migrations, but the initial logical model includes:

### 8.1 Collection records

```text
source_catalogue
collection_runs
raw_observations
normalisation_runs
```

### 8.2 World-state records

```text
entities
entity_aliases
locations
regions
events
observations
relationships
```

### 8.3 Domain records

```text
aircraft_positions
vessel_positions
weather_observations
fire_observations
seismic_events
agricultural_conditions
agricultural_production
economic_releases
industrial_metrics
trade_flows
market_bars
```

### 8.4 Intelligence records

```text
derived_features
market_alerts
alert_evidence
evidence_paths
notification_outbox
notification_attempts
```

---

## 9. Timestamp requirements

Store all timestamps as UTC `TIMESTAMPTZ`.

Where applicable, preserve:

- `request_started_at`;
- `request_completed_at`;
- `provider_published_at`;
- `occurred_at`;
- `observed_at`;
- `first_seen_at`;
- `last_seen_at`;
- `effective_from`;
- `effective_to`.

A news publication timestamp must not be treated as the occurrence time of the event it describes.

---

## 10. Initial source domains

The project begins with sources already represented by OSIRIS and expands outward.

### 10.1 Physical events

- Earthquakes.
- Fires.
- Volcanoes.
- Floods.
- Severe weather.
- Drought.
- Air quality.
- Space weather.

### 10.2 Transport and logistics

- Aircraft positions and corridor summaries.
- Vessel positions and chokepoint summaries.
- Ports.
- Canals.
- Major road and rail disruptions where public data exists.
- Freight and trade indicators.

### 10.3 Geopolitical and regulatory

- Public news feeds.
- Official alerts.
- Sanctions.
- Conflict and tension events.
- Export controls.
- Government notices.
- Regulatory filings.

### 10.4 Economic and market

- Market bars for selected instruments.
- Commodity prices.
- Major indices.
- Sector exchange-traded funds.
- Currencies.
- Crypto where useful.
- Economic releases.
- Energy production and inventory.
- Public-company filings.

### 10.5 Agriculture

- Crop-region geometry.
- Planted and harvested area.
- Regional production.
- Historical yield.
- Crop-condition reports.
- Soil moisture.
- Rainfall.
- Temperature.
- Drought.
- Frost.
- Flood.
- Fire.
- Vegetation indices.
- Fertiliser and energy inputs.
- Export routes and port activity.
- Agricultural commodity prices.

Farm-level data is not required.

---

## 11. Industry intelligence model

Each industry is represented through a reusable structure:

```text
industry
├── production regions
├── physical assets
├── input commodities
├── output commodities
├── transport routes
├── trade flows
├── workforce indicators
├── weather exposure
├── geopolitical exposure
├── companies
└── traded instruments
```

Example chains:

```text
drought
→ crop stress
→ expected regional yield pressure
→ export-volume pressure
→ grain-price response
→ producer and consumer exposure
```

```text
earthquake near fabrication cluster
→ possible production interruption
→ component supply risk
→ customer and supplier exposure
→ sector-price response
```

```text
chokepoint congestion
→ reduced throughput
→ expected delivery delay
→ commodity or freight repricing
→ downstream industry exposure
```

---

## 12. Market data

The existing OSIRIS market route remains available.

The new system adds durable market bars with:

```text
instrument_id
provider
provider_symbol
exchange
currency
interval
timestamp
open
high
low
close
volume
session
adjustment_status
collection_run_id
raw_observation_id
```

The initial tracked universe should be deliberately limited:

- major indices;
- major commodities;
- selected sector ETFs;
- important currencies;
- selected public companies;
- selected crypto assets where relevant.

Broad real-time exchange coverage is not a free-tier requirement.

---

## 13. Market anomaly detection

### 13.1 Goal

Detect behaviour that is unusual for an instrument relative to:

- its own history;
- its recent volatility regime;
- its sector;
- its benchmark;
- related assets;
- time of day and market session.

### 13.2 Initial methods

- Rolling return percentiles.
- Robust z-score.
- Median absolute deviation.
- Exponentially weighted volatility.
- Volume percentile.
- Intraday-range percentile.
- Sector-relative residual.
- Benchmark-relative residual.
- Cross-asset divergence.
- Simple change-point detection.

### 13.3 Alert types

```text
PRICE_SPIKE
PRICE_REVERSAL
VOLUME_SURGE
VOLATILITY_BREAKOUT
SECTOR_DISLOCATION
CROSS_ASSET_DIVERGENCE
COMMODITY_DISLOCATION
SUPPLY_CHAIN_DISRUPTION
EVENT_MARKET_ALIGNMENT
UNEXPLAINED_MARKET_ANOMALY
DATA_QUALITY_WARNING
```

### 13.4 Required alert fields

```text
alert_id
instrument_id
alert_type
detected_at
window_start
window_end
anomaly_score
historical_percentile
baseline_version
calculation_version
severity
status
summary
explanation_class
confidence
```

The engine stores the full calculation inputs or immutable references to them.

---

## 14. Evidence-chain engine

### 14.1 Purpose

Provide a precise, inspectable path from an anomaly to relevant events, industries and assets.

Precision means that every step has evidence. It does not mean that causation is guaranteed.

### 14.2 Node types

- Event.
- Location.
- Region.
- Infrastructure asset.
- Transport route.
- Commodity.
- Industry.
- Company.
- Security.
- Currency.
- Economic release.
- Regulatory action.
- Source record.

### 14.3 Edge types

```text
LOCATED_IN
PRODUCES
CONSUMES
TRANSPORTS
SUPPLIES
DEPENDS_ON
EXPOSED_TO
AFFECTS
COMPETES_WITH
CORRELATED_WITH
PRECEDES
REPORTED_BY
```

### 14.4 Edge provenance

Every relationship stores:

```text
source
classification
effective_from
effective_to
direction
confidence
derivation_method
sample_size
best_observed_lag
last_validated_at
```

### 14.5 Explanation classes

```text
CONFIRMED_MECHANISM
STRONG_ATTRIBUTION
POSSIBLE_CONTRIBUTOR
WEAK_ASSOCIATION
NO_EXPLANATION_FOUND
```

LLMs may later convert graph results into readable summaries, but cannot invent unsupported nodes or edges.

---

## 15. Telegram notifications

### 15.1 Initial scope

Outbound notifications only.

Alerts are written to the database before notification. A database outbox ensures that Telegram downtime does not lose alerts.

### 15.2 Controls

- Minimum severity.
- Alert types.
- Instruments and industries.
- Quiet hours.
- Cooldown periods.
- Immediate critical alerts.
- Daily digest.
- Allowed chat IDs.

### 15.3 Later commands

```text
/details <alert>
/ack <alert>
/mute <instrument>
/watch <instrument>
/status
/digest
```

Inbound commands are deferred until authorization and outbound reliability are complete.

---

## 16. Non-functional requirements

### Reliability

- Collector restarts must not lose state.
- Collectors must be idempotent.
- Duplicate source records must not duplicate normalised facts.
- Failures must be visible.
- A source outage must not take down OSIRIS.

### Performance

- OSIRIS map queries return only required geography and time windows.
- Raw payload retrieval is separate from normal map responses.
- Large moving-entity histories are aggregated for normal UI use.
- Spatial and timestamp indexes are based on real query patterns.

### Maintainability

- Fixture-based source tests.
- Versioned parsers.
- Versioned migrations.
- Source-specific adapters behind common interfaces.
- No hidden data transformation in React components.

### Observability

- Last successful collection time.
- Error counts.
- Records collected.
- Deduplication counts.
- Normalisation failures.
- Archive-write failures.
- Source latency.
- Notification attempts.

---

## 17. Development phases

### Phase 0 — Baseline and guardrails

- Fork OSIRIS.
- Record upstream remote.
- Run current build, lint and tests.
- Add this documentation.
- Add regression notes for current routes and layers.

### Phase 1 — Raw ingestion vertical slice

- PostgreSQL/PostGIS.
- Raw archive.
- Source catalogue.
- Collection-run schema.
- TypeScript collector framework.
- USGS earthquake collector.
- Fixture tests.
- Database-backed compatibility route behind configuration.

### Phase 2 — Existing-source expansion

- Fires.
- Disaster feeds.
- Weather.
- OSIRIS news feeds.
- Markets snapshot history.
- Existing flight and maritime feeds where keys permit.
- Per-source health page.

### Phase 3 — Agriculture layer

- Crop regions.
- Weather and moisture.
- Historical production and yield.
- Vegetation products.
- Agriculture panel and map overlay.
- Regional condition summaries.

### Phase 4 — Proper market bars and anomalies

- Selected instrument universe.
- Market bar collector.
- Baseline calculations.
- Transparent anomaly detection.
- Internal alert UI.
- False-positive evaluation.

### Phase 5 — Evidence graph

- Industry and asset relationships.
- Spatial and temporal joins.
- Evidence-path query.
- OSIRIS chain visualisation.
- Explicit confidence and provenance.

### Phase 6 — Telegram

- Notification outbox.
- Telegram adapter.
- Filtering.
- Retry and deduplication.
- Digest support.

### Phase 7 — Research engine

- Event studies.
- Lagged relationships.
- Rolling correlation.
- Walk-forward tests.
- Relationship promotion and retirement.
- Optional offline Python notebooks.

---

## 18. Definition of success

The platform succeeds when:

1. Existing OSIRIS features continue to work.
2. Raw upstream data is durably preserved.
3. Historical world-state queries survive restarts and source outages.
4. Additional industries can be added through source and relationship adapters.
5. Agriculture can be analysed regionally without farm-level data.
6. Market anomalies are detected with transparent calculations.
7. Alert explanations expose every evidence step.
8. Telegram delivery is reliable but decoupled.
9. Free and open sources support the default installation.
10. Later analytical models can be replaced without rebuilding the historical dataset.

---

## 19. Reference links

- OSIRIS repository: https://github.com/simplifaisoul/osiris
- Codex CLI documentation: https://learn.chatgpt.com/docs/codex/cli
- AGENTS.md documentation: https://learn.chatgpt.com/docs/codex/agents-md
- Telegram Bot API: https://core.telegram.org/bots/api
- USGS earthquake feeds: https://earthquake.usgs.gov/earthquakes/feed/
- NASA FIRMS: https://firms.modaps.eosdis.nasa.gov/
- NASA POWER: https://power.larc.nasa.gov/
- Copernicus Data Space: https://dataspace.copernicus.eu/
- USDA Quick Stats: https://quickstats.nass.usda.gov/
- World Bank indicators: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
- FRED API: https://fred.stlouisfed.org/docs/api/fred/
- US EIA open data: https://www.eia.gov/opendata/
- SEC EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
