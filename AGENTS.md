# AGENTS.md — OSIRIS World-State

## Mission

Extend OSIRIS into a historical world-state and explainable market-intelligence platform.

OSIRIS remains the visual command interface. New services add durable collection, raw archival storage, normalisation, source discovery, industry intelligence, anomaly detection, evidence chains and notifications.

## Non-negotiable rules

1. **Extend; never neuter.**
   - Do not remove an existing OSIRIS source, route, layer, panel, keyboard control or visualisation merely because a replacement exists.
   - Add richer sources alongside existing sources.
   - Keep compatibility responses until their consumers have been migrated and tested.

2. **Raw before transformed.**
   - Store the complete upstream response before filtering, sampling, rounding, classification or normalisation.
   - Preserve source timestamps, collection timestamps, response headers, HTTP status, endpoint identity and collector version.
   - Transformations must be reproducible from stored raw data.

3. **No fabricated certainty.**
   - Distinguish `observed`, `reported`, `derived`, `inferred` and `hypothesis`.
   - Do not label correlation as causation.
   - If an alert has no credible explanation, report it as unexplained.

4. **Free-first, not free-only.**
   - Prefer government, scientific, regulatory, open-source and provider-free-tier sources.
   - Record licensing, usage restrictions and rate limits in the source catalogue.
   - Do not add scraping that violates a provider’s terms or bypasses technical restrictions.
   - Paid sources may be represented as optional adapters but must not be required for the default build.

5. **TypeScript for always-on runtime work.**
   - Collector and runtime services use Node.js and TypeScript unless a documented technical reason requires another language.
   - Python may be used later for offline research notebooks or model experiments, but it must not become a required always-running dependency without explicit approval.

6. **PostgreSQL/PostGIS is the durable system of record.**
   - Do not use browser memory, Next.js module globals or Redis as durable storage.
   - Redis may later be added for queues or caches only.
   - Raw archive files are append-only.

7. **Security and secrets.**
   - Never commit API keys, Telegram tokens, database passwords or sample real credentials.
   - Use environment variables and `.env.example`.
   - Avoid logging secret-bearing URLs, authorization headers or complete environment dumps.
   - Validate externally supplied URLs and identifiers.
   - Treat source payloads as untrusted input.

8. **Make changes in reviewable phases.**
   - Do not attempt the whole platform in one change.
   - Each phase must build, test and preserve the current OSIRIS experience.
   - Prefer vertical slices over broad scaffolding with no working path.

9. **Hand off merge-ready pull requests.**
   - Publish pull requests as ready for review, not as drafts, unless the repository owner explicitly requests a draft.
   - Project pull requests must target `DaveWibs/osirisP`. Treat `simplifaisoul/osiris` as a read-only upstream reference: do not push to it or open pull requests, comments, deployments or other write actions against it unless the repository owner explicitly requests that exact upstream action.
   - Before creating or handing off a PR, verify the full base repository and base branch, not only the branch name. Check for duplicate open PRs from the same head branch across both the fork and upstream repository, and close any accidental upstream PR immediately.
   - Before handoff, inspect the PR merge state, required checks and external status checks. Resolve every in-scope blocker and confirm that GitHub reports the PR as mergeable.
   - Do not describe a PR as complete while it has an unresolved check, conflict or review requirement. If an external permission or service blocks completion, report the exact blocker and required owner action.
   - Record the validation performed and distinguish new failures from documented baseline failures.

10. **Do not use Vercel.**
   - Do not create, connect or enable a Vercel project, deployment, preview, webhook, GitHub app or status check for this repository.
   - Do not add Vercel configuration, Vercel-specific workflows, Vercel URLs or new `@vercel/*` dependencies unless the repository owner explicitly reverses this rule.
   - Treat existing Vercel references as legacy: do not expand or rely on them, and remove them when they are encountered in the scope of an otherwise approved change.
   - Prefer the repository's Docker and self-hosted deployment paths.

## Repository assumptions

The upstream OSIRIS project is a Next.js/TypeScript application with MapLibre-based visualisation and internal API routes that proxy or transform external sources.

Before modifying anything:

1. Inspect the actual current repository.
2. Compare it against `PROJECT_SPEC.md` and `BUILD_GUIDE_CODEX.md`.
3. Report material drift.
4. Adapt the plan to the current code rather than forcing stale file paths.

## Intended repository layout

This is a target, not permission to reorganise the repository unnecessarily.

```text
/
├── src/                         # Existing OSIRIS application
├── collector/                   # Standalone Node/TypeScript collector
│   ├── src/
│   │   ├── collectors/
│   │   ├── framework/
│   │   ├── storage/
│   │   ├── normalisers/
│   │   ├── scheduler/
│   │   └── index.ts
│   ├── test/
│   ├── package.json
│   └── tsconfig.json
├── db/
│   ├── migrations/
│   ├── fixtures/
│   └── scripts/
├── archive/                     # Local development archive only; gitignored
├── docs/
├── docker-compose.worldstate.yml
├── .env.example
├── AGENTS.md
├── PROJECT_SPEC.md
└── BUILD_GUIDE_CODEX.md
```

Do not move existing OSIRIS files simply to match this tree.

## Data classification

Every persisted fact must carry a provenance classification:

```text
observed    Direct machine or sensor observation
reported    Published by an authority, company, media source or institution
derived     Deterministic calculation from observations
inferred    Statistical or rules-based estimate
hypothesis  Proposed explanatory relationship awaiting validation
```

Prefer enums or constrained database values over arbitrary strings.

## Collector contract

Each collector must:

- Have a stable source ID.
- Declare source metadata and licence notes.
- Respect configurable rate limits.
- Use bounded timeouts.
- Retry only transient failures with exponential backoff and jitter.
- Record every run in `collection_runs`.
- Hash the raw body.
- Persist the raw body before normalisation.
- Be idempotent.
- Deduplicate by stable source identifier where available.
- Retain both `observed_at` and `occurred_at` when meaningful.
- Expose health and last-success information.
- Have fixture-based tests that do not require live internet access.
- Keep live integration tests opt-in.

Do not silently replace missing upstream values with invented defaults.

## Raw archive requirements

The raw archive is immutable.

Recommended layout:

```text
archive/{source}/{YYYY}/{MM}/{DD}/{timestamp}-{content_hash}.{extension}.gz
```

A database record must point to the archived payload and include:

- source ID;
- endpoint;
- request start and completion times;
- upstream timestamp if available;
- HTTP status;
- selected response headers;
- content type;
- content hash;
- archive path;
- collector version;
- parser version;
- record count;
- error information.

If archive writing fails, the run must not be reported as successfully ingested.

## Database conventions

- Use SQL migrations committed to `db/migrations`.
- Migrations must be deterministic and reversible where practical.
- Use `TIMESTAMPTZ`.
- Store original provider identifiers.
- Use PostGIS geometry types for spatial records.
- Add indexes only with a demonstrated query pattern.
- Avoid premature table-per-source designs when a common observation model works.
- Do not discard raw JSON merely because fields have been normalised.
- Store schema and parser versions so historical data can be reprocessed.

## API compatibility

Existing OSIRIS components should continue receiving their current response shape during early phases.

When adding a database-backed route:

- Keep the old adapter available behind configuration or a clearly named fallback.
- Add contract tests comparing fixture responses.
- Preserve field names and nullability expected by the frontend.
- Do not make the frontend depend on database-only fields until the compatibility layer is tested.

New APIs should use a versioned namespace, for example:

```text
/api/v1/events
/api/v1/markets/bars
/api/v1/agriculture/conditions
/api/v1/alerts
/api/v1/evidence
```

## Market anomaly rules

The anomaly engine must begin with transparent statistical methods.

Allowed initial approaches:

- rolling percentiles;
- robust z-scores;
- median absolute deviation;
- exponentially weighted volatility;
- sector-relative and index-relative residual movement;
- cross-asset divergence;
- simple change-point detection.

Do not introduce a neural model before:

- the input history exists;
- a simple baseline exists;
- walk-forward evaluation exists;
- false-positive rates are measured;
- the output remains explainable.

Every alert must store the input window, calculation version, thresholds and evidence used.

## Evidence-chain rules

An evidence chain is a directed graph of sourced relationships, not an LLM story.

Each edge must record:

- relation type;
- source;
- effective dates;
- confidence;
- evidence classification;
- derivation method;
- validation date.

LLMs may later summarise a chain, but they may not create unsupported graph edges.

## Agriculture requirements

Farm-level data is not required.

Focus on:

- crop regions;
- planted and harvested area;
- regional production and yield;
- vegetation and moisture observations;
- drought, heat, frost, flood and fire exposure;
- fertiliser and energy inputs;
- export routes and port activity;
- crop-condition reports;
- commodity prices.

Agricultural source adapters must identify whether values are measurements, official estimates, forecasts or modelled products.

## Telegram requirements

Telegram is a notification adapter, not the alert engine.

- Alerts are persisted before notification.
- Notification failures must not lose alerts.
- Use an outbox/queue pattern.
- Deduplicate repeated notifications.
- Support severity and topic filters.
- Keep bot tokens server-side.
- Do not implement inbound commands until outbound delivery and authorization are tested.

## Tests required for every phase

Run relevant commands and report results.

At minimum:

```bash
npm test
npm run lint
npm run build
```

Collector work must also run its own tests, for example:

```bash
npm --prefix collector test
npm --prefix collector run lint
npm --prefix collector run build
```

Database work must include:

- migration from an empty database;
- idempotent collector replay;
- restart persistence;
- fixture-based normalisation;
- uniqueness and deduplication behaviour.

## Change-report format

At the end of a task, report:

1. What changed.
2. Files created or modified.
3. Migrations added.
4. Commands and tests run.
5. Test results.
6. Known limitations.
7. Manual verification steps.
8. Whether existing OSIRIS behaviour changed.

Do not claim tests passed unless they were run successfully.
