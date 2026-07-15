# Codex CLI Prompts

These prompts are intentionally phased. Paste them into Codex from the repository root.

---

## Prompt 0A — Repository audit

```text
Read AGENTS.md, PROJECT_SPEC.md, BUILD_GUIDE_CODEX.md, and CODEX_PROMPTS.md.

Do not modify files.

Inspect the current OSIRIS repository and produce docs/current-osiris-baseline.md containing:
- current commit SHA and branch;
- package manager and lockfile;
- Node requirements;
- existing scripts;
- current test, lint and build status;
- API route inventory;
- map/layer inventory;
- environment variables used by current code;
- current market, earthquake, fire, flight, maritime and news data paths;
- any discrepancies between the live repository and our documentation.

Run safe read-only inspection commands and the existing tests/build where practical. Do not fix failures in this task. Clearly distinguish pre-existing failures from documentation drift.
```

---

## Prompt 0B — Phase 1 plan

```text
Read the Phase 1 section of BUILD_GUIDE_CODEX.md and the non-negotiable rules in AGENTS.md.

Do not modify files yet.

Produce a concrete implementation plan for the USGS earthquake raw-ingestion vertical slice. Include:
- exact files to create or modify;
- database migration order;
- collector package design;
- raw archive write sequence;
- idempotency strategy;
- database-backed compatibility-route strategy;
- fixture and contract tests;
- commands to verify the result;
- risks to existing OSIRIS behaviour.

Keep the plan limited to Phase 1. Do not include fires, agriculture, market anomalies, evidence chains or Telegram.
```

---

## Prompt 1 — Implement infrastructure and migrations

```text
Implement only the infrastructure and database portion of Phase 1 from BUILD_GUIDE_CODEX.md.

Requirements:
- preserve all existing OSIRIS behaviour;
- add docker-compose.worldstate.yml;
- add safe .env.example entries without real credentials;
- add PostgreSQL/PostGIS migrations for source_catalogue, collection_runs, raw_observations and seismic_events;
- add a deterministic migration runner;
- add tests or verification scripts for migration from an empty database;
- use TIMESTAMPTZ and PostGIS geometry;
- document how to start and reset the development database;
- do not implement the collector or change existing API routes yet.

Run the relevant tests, lint and build commands. Report exact results and any pre-existing failures.
```

---

## Prompt 2 — Implement collector framework

```text
Implement only the standalone TypeScript collector framework for Phase 1.

Requirements:
- create collector/ with its own package.json and tsconfig;
- validate configuration;
- use structured logging;
- define source collector, raw response and collection result contracts;
- implement collection-run persistence;
- implement SHA-256 hashing;
- implement atomic gzip raw-archive writing;
- implement bounded HTTP fetch with timeout;
- add fixture-based unit tests;
- do not add USGS-specific parsing yet;
- do not modify the OSIRIS frontend;
- do not add Redis, Kafka, Python or a web framework.

Run collector tests, lint and build. Report exact results.
```

---

## Prompt 3 — Implement USGS collector

```text
Implement the USGS earthquake collector described in Phase 1.

Requirements:
- call the official USGS feed directly;
- preserve and archive the exact raw response before parsing;
- capture request timings, status, selected headers, content type and hash;
- persist collection_runs;
- validate and parse from committed fixtures;
- upsert raw observations using stable USGS event IDs;
- normalise into seismic_events with PostGIS points;
- preserve occurred_at and collection timestamps separately;
- make replay idempotent;
- add a changed-event fixture proving updates do not duplicate;
- keep live integration tests opt-in;
- do not modify the existing OSIRIS earthquake route yet.

Run migrations against a clean test database and run all collector verification commands.
```

---

## Prompt 4 — Add compatibility route

```text
Add the database-backed earthquake compatibility path without removing the existing live OSIRIS route.

Requirements:
- support EARTHQUAKE_DATA_MODE=live|database|database_with_live_fallback;
- preserve the existing response contract consumed by the OSIRIS map;
- add contract tests using fixtures;
- database mode must query normalised seismic_events;
- database_with_live_fallback must fail visibly in logs while returning the live source only when database retrieval fails;
- do not change the frontend field contract;
- update documentation and .env.example;
- run root and collector tests, lint and builds.

Report whether any visible existing OSIRIS behaviour changed.
```

---

## Prompt 5 — Review Phase 1

```text
Review the complete Phase 1 implementation against AGENTS.md and BUILD_GUIDE_CODEX.md.

Do not add new features.

Look specifically for:
- raw data being parsed before archival;
- non-atomic archive writes;
- duplicate events on replay;
- incorrect timestamp semantics;
- secrets in code or logs;
- database writes outside transactions where consistency matters;
- route contract drift;
- missing failure records;
- tests that accidentally require live internet;
- Docker volume or permission problems;
- existing OSIRIS features being removed or bypassed.

Fix confirmed problems, run all relevant tests and provide a concise review report.
```

---

## Prompt 6 — Add one source safely

Replace `<SOURCE>` before use.

```text
Implement one additional source adapter: <SOURCE>.

First inspect the current OSIRIS adapter and the actual upstream provider.

Before editing, report:
- actual upstream source and endpoint;
- data licence and free-tier notes;
- stable identifiers;
- timestamp semantics;
- whether OSIRIS currently samples, rounds, truncates or substitutes values;
- proposed database tables or reuse of existing tables;
- expected request frequency and volume.

Then implement only this source:
- preserve complete raw responses;
- add source catalogue entry;
- add fixtures;
- add idempotent normalisation;
- keep existing OSIRIS behaviour available;
- add a database-backed compatibility mode where appropriate;
- run tests, lint and builds.
```

---

## Prompt 7 — Source discovery report

```text
Do not implement a collector.

Research one industry domain using official, scientific, regulatory, government or clearly licensed open sources: <INDUSTRY>.

Create docs/source-research/<industry>.md containing a candidate table with:
- source name;
- provider;
- official documentation URL;
- data types;
- geography;
- historical depth;
- update frequency;
- free access requirements;
- rate-limit notes;
- bulk download availability;
- stable IDs;
- timestamp semantics;
- licence and redistribution notes;
- relationship to existing OSIRIS data;
- expected analytical value;
- implementation difficulty;
- recommendation: approve, investigate, optional or reject.

Prefer independent sources that observe different parts of the industry chain. Do not recommend terms-violating scraping.
```

---

## Prompt 8 — Agriculture schema and source plan

```text
Read the agriculture sections of PROJECT_SPEC.md and BUILD_GUIDE_CODEX.md.

Do not implement UI or collectors yet.

Choose an initial wheat and corn/maize regional scope based on the free sources already documented in docs/source-research.

Design:
- crop and season tables;
- agricultural region geometry;
- agricultural observations;
- production statistics;
- crop-condition reports;
- vegetation observations;
- provenance classification;
- spatial overlap queries with weather, fires and disasters;
- relationships to export routes and market instruments.

Create a migration proposal and API contract proposal. Include example queries and test fixtures. Do not require farm-level data.
```

---

## Prompt 9 — Market anomaly baseline

```text
Implement only the first transparent market anomaly baseline.

Prerequisites:
- durable market bars already exist;
- selected instruments and benchmark relationships already exist.

Requirements:
- compute returns;
- rolling percentiles;
- median and median absolute deviation;
- robust z-scores;
- exponentially weighted volatility;
- benchmark-relative residuals where configured;
- version calculation parameters;
- persist full input-window references;
- emit PRICE_SPIKE, VOLATILITY_BREAKOUT and UNEXPLAINED_MARKET_ANOMALY;
- make reprocessing idempotent;
- add fixtures for normal behaviour, a spike and missing data;
- expose alert details internally;
- do not send Telegram;
- do not claim causation;
- do not add neural models.

Run deterministic tests and report alert counts for each fixture.
```

---

## Prompt 10 — Evidence path

```text
Implement a first evidence-path query for one narrow chain:

chokepoint disruption
→ oil transport exposure
→ crude-oil market anomaly
→ energy and airline sector exposure

Requirements:
- every graph edge has a source and effective dates;
- candidate events are filtered by time window and relevant geography;
- store supporting and contradicting evidence;
- return a path with an explanation class and confidence inputs;
- NO_EXPLANATION_FOUND is valid;
- do not use an LLM to generate edges;
- add fixtures demonstrating strong evidence, weak evidence and no explanation;
- add an OSIRIS-readable API response, but keep UI changes minimal and separate if possible.
```

---

## Prompt 11 — Telegram outbox

```text
Implement outbound Telegram notifications using a PostgreSQL outbox.

Requirements:
- alerts are persisted before outbox rows;
- add subscription, outbox and attempt tables;
- Telegram is disabled by default;
- use TELEGRAM_BOT_TOKEN and allowlisted chat IDs from environment variables;
- never log the token;
- support severity, alert type, instrument, quiet-hours and cooldown filters;
- use deduplication keys;
- retry transient failures with bounded exponential backoff;
- dead-letter permanent failures;
- mock Telegram in normal tests;
- keep real integration tests opt-in;
- do not implement inbound bot commands yet.

Run all notification tests and document local test mode.
```

---

## Prompt 12 — Final review before merge

```text
Review the current branch against AGENTS.md and the relevant phase in BUILD_GUIDE_CODEX.md.

Do not expand scope.

Check:
- existing OSIRIS functionality;
- raw-fidelity preservation;
- source licensing notes;
- timestamp correctness;
- idempotency;
- migrations;
- data provenance;
- secret handling;
- API compatibility;
- test isolation;
- restart behaviour;
- failure visibility;
- documentation accuracy.

Run /review-style analysis, fix confirmed defects, then run the complete verification suite. Report exact commands, results, known limitations and manual verification steps.
```
