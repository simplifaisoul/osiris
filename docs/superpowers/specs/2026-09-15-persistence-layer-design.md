# Persistence Layer Design

Date: 2026-09-15
Status: Approved (design), pending implementation plan

## Context

Osiris (Next.js 16 App Router monorepo, `src/app/`) currently has **no persistence anywhere**. All "history" is either live request-time fetches or transient `globalThis`-scoped in-memory caches that reset on process restart. `engine/` (a Python project referenced by `runs/ledger.jsonl`) is dead code — no `.py` sources exist, nothing in `src/` references it.

This blocks three planned product modules from `osiris-plano-economia-financas.md`:

1. **Chokepoint risk index** — needs a 30/90-day moving-average baseline of AIS traffic per chokepoint to detect deviation (already has live chokepoint + ship data in `src/app/api/maritime/route.ts`, just no history).
2. **News sentiment / event study** — needs to accumulate `(timestamp, source, text, sentiment, category, geo)` over time to run event-study analysis (AR/CAR) against asset returns. Already has news ingestion in `src/app/api/news/route.ts`, no accumulation.
3. **Sanctions exposure tracking** — needs historical snapshots of trade volume / digital presence per sanctioned entity to detect trend deviation. Already has OFAC SDN integration in `src/lib/sanctions.ts`, no history.

Rather than build ad-hoc storage three times, this spec defines one shared persistence foundation all three modules build on.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Storage engine | `better-sqlite3`, embedded | Deploy topology undecided (single instance vs. scaled) — cheapest option now, migratable to Postgres later if needed. No DB dependency exists in `package.json` today. |
| File layout | One file, `osiris.db` | Enables future cross-module joins (plan item 7 — regime-change detection explicitly needs correlated data from modules 1 and 2). Simpler backup/volume story than N files. |
| Schema | Per-module tables, not a generic `events` blob | Typed columns, direct queries, no JSON-extract overhead as data grows. Matches repo's existing per-domain file organization. |
| Write path | API routes call typed functions in `src/lib/db/<module>.ts` directly | No cron/scheduler exists in this codebase (everything is client-driven `setInterval`); introducing one is out of scope for this spec. Routes already run per-request, so writes piggyback on existing request handling. |
| Retention | Indefinite for now | Data volume is low at MVP (throttled snapshots, not raw polling frequency). Add a purge/rollup job later if `osiris.db` size becomes a problem — not blocking to build now. |
| Query layer | Raw SQL via prepared statements, no ORM | No ORM exists anywhere in the repo today; adding one is disproportionate to 3 tables. Aggregation (`AVG`, `GROUP BY`) done in SQL, not loaded into JS. |

## Architecture

New directory `src/lib/db/`:

- **`client.ts`** — singleton `Database` instance. Opens `process.env.DB_PATH` (default `./data/osiris.db` for local dev; `/app/data/osiris.db` in Docker via env var). Uses the repo's existing `globalThis`-cache pattern (same as `shipsCache` in `maritime/route.ts`) to survive Next.js dev hot-reload without opening duplicate connections. Sets `PRAGMA journal_mode = WAL` for concurrent read/write. Runs pending migrations on first access.
- **`migrations/000N_<name>.sql`** — numbered, idempotent, tracked in a `_migrations(id, applied_at)` table, applied in order on boot.
- **`maritime.ts`, `news.ts`, `sanctions.ts`** — one file per module, each exporting typed read/write functions with prepared statements. API routes call these functions; no inline SQL in route files.

## Schema

```sql
-- 0001_maritime_baseline.sql
CREATE TABLE maritime_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chokepoint_id TEXT NOT NULL,
  ts INTEGER NOT NULL,           -- unix ms
  ship_count INTEGER NOT NULL,
  risk_level TEXT NOT NULL       -- LOW/ELEVATED/HIGH/CRITICAL
);
CREATE INDEX idx_maritime_chokepoint_ts ON maritime_snapshots(chokepoint_id, ts);

-- 0002_news_events.sql
CREATE TABLE news_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,  -- dedupe key
  text TEXT NOT NULL,
  sentiment REAL,                 -- -1..1, null until classified
  category TEXT,                  -- geopolitico/macro/cripto/commodities
  region TEXT,
  lat REAL,
  lng REAL
);
CREATE INDEX idx_news_ts ON news_events(ts);
CREATE INDEX idx_news_category_ts ON news_events(category, ts);

-- 0003_sanctions_history.sql
CREATE TABLE sanctions_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  trade_volume REAL,
  domain_active INTEGER NOT NULL,  -- 0/1
  exposure_score REAL NOT NULL
);
CREATE INDEX idx_sanctions_entity_ts ON sanctions_history(entity_id, ts);
```

## Write throttling

API routes are polled by the client on fixed intervals (maritime every 10s, news every 30min). Inserting a row on every request would flood the tables with near-duplicate snapshots. Two dedupe strategies, chosen per table's nature:

- **`news_events`**: dedupe via `url_hash UNIQUE` + `INSERT OR IGNORE` — each article is a distinct row, naturally deduped by its source URL.
- **`maritime_snapshots`** (bucket: 1 insert / 15 min per chokepoint) and **`sanctions_history`** (bucket: 1 insert / 24h per entity, aligned with the existing OFAC cache TTL): explicit check before insert — `SELECT ts FROM <table> WHERE <key>=? ORDER BY ts DESC LIMIT 1`, only insert if `now - last_ts > bucket_ms`. A `UNIQUE` constraint doesn't work here because the value changes on every snapshot, only the *time bucket* should be deduped.

## Read API (per module)

```ts
// db/maritime.ts
function insertSnapshot(chokepointId: string, shipCount: number, riskLevel: string): void  // throttled internally
function getBaseline(chokepointId: string, days: 30 | 90): number   // AVG(ship_count) over window
function getDeviation(chokepointId: string, shipCount: number): number  // (current - baseline90d) / baseline90d

// db/news.ts
function insertEvent(event: NewsEventInput): void   // INSERT OR IGNORE by url_hash
function getEventsByWindow(category: string, region: string, fromTs: number, toTs: number): NewsEvent[]
function getSentimentSeries(category: string, days: number): { ts: number; sentiment: number }[]

// db/sanctions.ts
function insertSnapshot(entityId: string, tradeVolume: number, domainActive: boolean, exposureScore: number): void  // throttled internally
function getExposureTrend(entityId: string, days: number): { ts: number; exposure_score: number }[]
```

Routes stay thin: call `insertSnapshot()` and/or a `get*()` aggregate function. All aggregation (`AVG`, `GROUP BY` for daily buckets) runs in SQLite, not in a JS loop over loaded rows — avoids pulling large histories into Node process memory.

## Deployment

`docker-compose.yml` currently has no volume for the `osiris` service (only `osiris-cache` nginx does). Add:

```yaml
services:
  osiris:
    volumes:
      - osiris-data:/app/data
    environment:
      - DB_PATH=/app/data/osiris.db
volumes:
  osiris-data:
```

Named volume (not bind mount) survives image rebuilds without host path management. `data/` added to `.gitignore` for local dev. Migrations run automatically on first `getDb()` call — no manual deploy step required.

## Concurrency and error handling

- `PRAGMA journal_mode = WAL` allows concurrent reads during writes (relevant given 10s maritime polling).
- Single connection via `globalThis` cache, matching the repo's existing pattern — avoids duplicate connections / "database is locked" under Next.js dev hot-reload.
- Writes are best-effort: `insertSnapshot()` calls are wrapped in try/catch and logged via `console.error`, never allowed to break the route's response. Persistence is a side effect layered onto working live-data endpoints, not a dependency they can fail on.
- `better-sqlite3` is synchronous (blocks the event loop) — acceptable here because queries are small (point inserts, indexed aggregates), not a high-throughput hot path.

## Testing

Repo already uses Vitest. `client.ts` accepts `DB_PATH=:memory:` for tests — each test opens an in-memory DB, runs migrations, and exercises `insertSnapshot`/`getBaseline`/throttle/dedupe in isolation without touching the real `osiris.db`. Coverage: migrations apply cleanly, throttle doesn't duplicate within a bucket, baseline aggregation matches manually inserted fixture data.

## Out of scope (explicitly deferred)

- Retention/purge/rollup jobs — revisit if `osiris.db` grows large.
- Server-side cron/scheduler — writes stay piggybacked on API route requests, matching the existing client-driven polling model.
- Horizontal scaling / external DB (Postgres, Timescale) — revisit if deploy topology moves to multiple replicas.
- Sentiment classification model, Comtrade integration, event-study statistics — these are module-specific work for plan items 2 and 3, not part of this foundation.
