# Persistence Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared SQLite persistence foundation to the osiris repo so the maritime, news, and sanctions modules can accumulate history instead of relying on transient in-memory caches.

**Architecture:** A `src/lib/db/` module owns a singleton `better-sqlite3` connection (`osiris.db`), runs versioned migrations on boot, and exposes one typed read/write file per domain (`maritime.ts`, `news.ts`, `sanctions.ts`). Existing API routes call these functions directly inside their existing request handlers — no new cron/scheduler is introduced. Writes are throttled per-key (time-bucketed) so high-frequency polling doesn't flood the tables, and are always best-effort (wrapped in try/catch) so a persistence failure never breaks a live-data response.

**Tech Stack:** `better-sqlite3` (embedded SQLite, synchronous API), raw SQL (no ORM), Vitest (already used in this repo).

**Spec:** [docs/superpowers/specs/2026-09-15-persistence-layer-design.md](../specs/2026-09-15-persistence-layer-design.md)

## Global Constraints

- One database file: `osiris.db` (per spec's "File layout" decision — enables future cross-module joins).
- Schema is per-module (typed tables), not a generic JSON blob table.
- No ORM — raw SQL via `better-sqlite3` prepared statements.
- Writes happen inline in existing API routes (no new server-side cron/scheduler).
- Retention is indefinite for now — no purge/rollup job in this plan.
- Every write from a route handler is wrapped in try/catch and must never fail the route's response.
- `PRAGMA journal_mode = WAL` is set on every non-`:memory:` connection.
- Sentiment classification, Comtrade integration, and event-study statistics are explicitly out of scope (spec's "Out of scope" section) — this plan only builds the storage foundation and wires raw persistence into the two routes that already compute real data (maritime, news). Sanctions gets its schema and access functions but no route wiring yet, because no route currently computes `trade_volume`/`domain_active`/`exposure_score`.

---

### Task 1: DB client, migration runner, and schema foundation

**Files:**
- Create: `src/lib/db/migrations/0001_maritime_baseline.ts`
- Create: `src/lib/db/migrations/0002_news_events.ts`
- Create: `src/lib/db/migrations/0003_sanctions_history.ts`
- Create: `src/lib/db/migrations/index.ts`
- Create: `src/lib/db/client.ts`
- Test: `src/lib/db/client.test.ts`
- Modify: `package.json` (add `better-sqlite3` dependency, `@types/better-sqlite3` devDependency)
- Modify: `next.config.ts:19` (add `'better-sqlite3'` to `serverExternalPackages`)
- Modify: `Dockerfile` (add native-module build toolchain to the `deps` stage)

**Interfaces:**
- Produces: `getDb(): Database.Database` — the singleton connection, migrations already applied. `resetDbForTests(): void` — test seam that closes and clears the cached connection so the next `getDb()` call rebuilds fresh (used with `DB_PATH=':memory:'`).
- Every later task's `db/<module>.ts` file calls `getDb()` from `./client`.

Migration SQL is embedded as exported TS string constants (not raw `.sql` files read via `fs` at runtime) because Next.js's standalone build only bundles files that are actually imported — a `fs.readdirSync()` over a `migrations/` directory would silently find nothing once deployed via `.next/standalone`, even though it works in `next dev`. Exporting the SQL as a string from a `.ts` file makes it part of the JS bundle like any other import.

- [ ] **Step 1: Add dependencies**

Edit `package.json` — add to `dependencies` (right after `"@vercel/analytics": "^2.0.1",`):

```json
    "better-sqlite3": "^13.0.3",
```

Add to `devDependencies` (right after `"@tailwindcss/postcss": "^4",`):

```json
    "@types/better-sqlite3": "^9.6.0",
```

Run: `npm install`
Expected: lockfile updates, `node_modules/better-sqlite3` present, no errors.

- [ ] **Step 2: Mark better-sqlite3 as a server-external package**

Edit `next.config.ts:19`:

```ts
  serverExternalPackages: ['ws'],
```

becomes:

```ts
  serverExternalPackages: ['ws', 'better-sqlite3'],
```

This keeps Next from trying to bundle the native `.node` binary into the webpack/turbopack graph — it stays a normal `require()` resolved from `node_modules` at runtime, same treatment `ws` already gets.

- [ ] **Step 3: Add native build toolchain to the Docker deps stage**

Edit `Dockerfile` — the `deps` stage currently is:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
```

Change to:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
```

`better-sqlite3` is a native addon; Alpine (musl) doesn't always have a prebuilt binary available, so `npm ci` falls back to compiling it with `node-gyp`, which needs `python3`, `make`, and `g++`. (The `runner` stage doesn't need these — it only copies the already-built `node_modules` via the Next.js standalone output.)

- [ ] **Step 4: Write the migration files**

Create `src/lib/db/migrations/0001_maritime_baseline.ts`:

```ts
export const id = '0001_maritime_baseline';

export const sql = `
CREATE TABLE maritime_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chokepoint_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  ship_count INTEGER NOT NULL,
  risk_level TEXT NOT NULL
);
CREATE INDEX idx_maritime_chokepoint_ts ON maritime_snapshots(chokepoint_id, ts);
`;
```

Create `src/lib/db/migrations/0002_news_events.ts`:

```ts
export const id = '0002_news_events';

export const sql = `
CREATE TABLE news_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  sentiment REAL,
  category TEXT,
  region TEXT,
  lat REAL,
  lng REAL
);
CREATE INDEX idx_news_ts ON news_events(ts);
CREATE INDEX idx_news_category_ts ON news_events(category, ts);
`;
```

Create `src/lib/db/migrations/0003_sanctions_history.ts`:

```ts
export const id = '0003_sanctions_history';

export const sql = `
CREATE TABLE sanctions_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  trade_volume REAL,
  domain_active INTEGER NOT NULL,
  exposure_score REAL NOT NULL
);
CREATE INDEX idx_sanctions_entity_ts ON sanctions_history(entity_id, ts);
`;
```

Create `src/lib/db/migrations/index.ts`:

```ts
import * as m0001 from './0001_maritime_baseline';
import * as m0002 from './0002_news_events';
import * as m0003 from './0003_sanctions_history';

export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [m0001, m0002, m0003];
```

- [ ] **Step 5: Write the failing test for the DB client**

Create `src/lib/db/client.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

process.env.DB_PATH = ':memory:';

import { getDb, resetDbForTests } from './client';

beforeEach(() => {
  resetDbForTests();
});

describe('getDb', () => {
  it('applies all migrations and records them', () => {
    const db = getDb();

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
    ).map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining(['_migrations', 'maritime_snapshots', 'news_events', 'sanctions_history'])
    );

    const applied = (db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: string }[]).map(
      (row) => row.id
    );
    expect(applied).toEqual(['0001_maritime_baseline', '0002_news_events', '0003_sanctions_history']);
  });

  it('does not re-apply migrations on a second getDb() call', () => {
    getDb();
    const db = getDb();
    const count = (db.prepare('SELECT COUNT(*) as n FROM _migrations').get() as { n: number }).n;
    expect(count).toBe(3);
  });

  it('reuses the same connection across calls', () => {
    expect(getDb()).toBe(getDb());
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/db/client.test.ts`
Expected: FAIL — `Cannot find module './client'` (file doesn't exist yet).

- [ ] **Step 7: Implement the DB client**

Create `src/lib/db/client.ts`:

```ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { migrations } from './migrations';

const globalForDb = globalThis as unknown as {
  osirisDb: Database.Database | undefined;
};

function resolveDbPath(): string {
  return process.env.DB_PATH || path.join(process.cwd(), 'data', 'osiris.db');
}

function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: string }[]).map((row) => row.id)
  );

  const insertMigration = db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    db.exec(migration.sql);
    insertMigration.run(migration.id, Date.now());
  }
}

function createDb(): Database.Database {
  const dbPath = resolveDbPath();
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

/** Singleton connection, cached on globalThis so Next.js dev hot-reload
    doesn't open a second handle onto the same file. */
export function getDb(): Database.Database {
  if (!globalForDb.osirisDb) {
    globalForDb.osirisDb = createDb();
  }
  return globalForDb.osirisDb;
}

/** Test seam — closes the current connection so the next getDb() call
    rebuilds it from scratch. Pair with DB_PATH=':memory:' in tests. */
export function resetDbForTests(): void {
  globalForDb.osirisDb?.close();
  globalForDb.osirisDb = undefined;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/lib/db/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json next.config.ts Dockerfile src/lib/db/client.ts src/lib/db/client.test.ts src/lib/db/migrations/
git commit -m "feat(db): add SQLite client, migration runner, and schema for maritime/news/sanctions"
```

---

### Task 2: Maritime baseline module

**Files:**
- Create: `src/lib/db/maritime.ts`
- Test: `src/lib/db/maritime.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `resetDbForTests()` from `./client` (Task 1). Table `maritime_snapshots` (Task 1, migration `0001`).
- Produces: `insertSnapshot(chokepointId: string, shipCount: number, riskLevel: string): void`, `getBaseline(chokepointId: string, days: 30 | 90): number`, `getDeviation(chokepointId: string, shipCount: number): number`. Task 5 (route wiring) calls `insertSnapshot`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/maritime.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { resetDbForTests } from './client';
import { getBaseline, getDeviation, insertSnapshot } from './maritime';

beforeEach(() => {
  resetDbForTests();
  vi.useRealTimers();
});

describe('insertSnapshot / getBaseline', () => {
  it('throttles inserts within the 15-minute bucket', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('strait-of-hormuz', 10, 'HIGH');
    vi.setSystemTime(5 * 60 * 1000); // 5 min later, still inside the bucket
    insertSnapshot('strait-of-hormuz', 20, 'HIGH');
    vi.useRealTimers();

    expect(getBaseline('strait-of-hormuz', 90)).toBe(10);
  });

  it('inserts again once the bucket has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('strait-of-hormuz', 10, 'HIGH');
    vi.setSystemTime(16 * 60 * 1000); // past the 15-minute bucket
    insertSnapshot('strait-of-hormuz', 20, 'HIGH');
    vi.useRealTimers();

    expect(getBaseline('strait-of-hormuz', 90)).toBe(15); // avg(10, 20)
  });

  it('keeps chokepoints independent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('strait-of-hormuz', 10, 'HIGH');
    insertSnapshot('suez-canal', 99, 'ELEVATED');
    vi.useRealTimers();

    expect(getBaseline('strait-of-hormuz', 90)).toBe(10);
    expect(getBaseline('suez-canal', 90)).toBe(99);
  });

  it('returns 0 when there is no history yet', () => {
    expect(getBaseline('lombok-strait', 90)).toBe(0);
  });
});

describe('getDeviation', () => {
  it('returns 0 when there is no baseline yet', () => {
    expect(getDeviation('strait-of-hormuz', 10)).toBe(0);
  });

  it('computes signed percentage deviation from the 90-day baseline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('strait-of-hormuz', 100, 'HIGH');
    vi.setSystemTime(20 * 60 * 1000); // past the bucket, second point recorded
    insertSnapshot('strait-of-hormuz', 50, 'HIGH');
    vi.useRealTimers();

    // baseline = avg(100, 50) = 75
    expect(getDeviation('strait-of-hormuz', 80)).toBeCloseTo((80 - 75) / 75, 5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/db/maritime.test.ts`
Expected: FAIL — `Cannot find module './maritime'`.

- [ ] **Step 3: Implement the maritime module**

Create `src/lib/db/maritime.ts`:

```ts
import { getDb } from './client';

const BASELINE_BUCKET_MS = 15 * 60 * 1000; // one snapshot per chokepoint per 15 minutes

/** Best-effort, throttled write — no-ops if a snapshot for this chokepoint
    was already recorded within the current bucket. */
export function insertSnapshot(chokepointId: string, shipCount: number, riskLevel: string): void {
  const db = getDb();
  const last = db
    .prepare('SELECT ts FROM maritime_snapshots WHERE chokepoint_id = ? ORDER BY ts DESC LIMIT 1')
    .get(chokepointId) as { ts: number } | undefined;

  const now = Date.now();
  if (last && now - last.ts < BASELINE_BUCKET_MS) return;

  db.prepare(
    'INSERT INTO maritime_snapshots (chokepoint_id, ts, ship_count, risk_level) VALUES (?, ?, ?, ?)'
  ).run(chokepointId, now, shipCount, riskLevel);
}

export function getBaseline(chokepointId: string, days: 30 | 90): number {
  const db = getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const row = db
    .prepare('SELECT AVG(ship_count) as avg FROM maritime_snapshots WHERE chokepoint_id = ? AND ts > ?')
    .get(chokepointId, since) as { avg: number | null };
  return row.avg ?? 0;
}

export function getDeviation(chokepointId: string, shipCount: number): number {
  const baseline = getBaseline(chokepointId, 90);
  if (baseline === 0) return 0;
  return (shipCount - baseline) / baseline;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/db/maritime.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/maritime.ts src/lib/db/maritime.test.ts
git commit -m "feat(db): add maritime baseline read/write functions"
```

---

### Task 3: News events module

**Files:**
- Create: `src/lib/db/news.ts`
- Test: `src/lib/db/news.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `resetDbForTests()` from `./client` (Task 1). Table `news_events` (Task 1, migration `0002`).
- Produces: `NewsEventInput` type, `insertEvent(event: NewsEventInput): void`, `NewsEvent` type, `getEventsByWindow(category: string, region: string, fromTs: number, toTs: number): NewsEvent[]`, `getSentimentSeries(category: string, days: number): { ts: number; sentiment: number }[]`. Task 6 (route wiring) calls `insertEvent`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/news.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { getDb, resetDbForTests } from './client';
import { getEventsByWindow, getSentimentSeries, insertEvent } from './news';

beforeEach(() => {
  resetDbForTests();
});

const baseEvent = {
  ts: 1000,
  source: 'BBC',
  urlHash: 'hash-1',
  text: 'Tension rises at the border',
  sentiment: -0.4,
  category: 'geopolitico',
  region: 'ukraine',
  lat: 49.0,
  lng: 31.0,
};

describe('insertEvent / getEventsByWindow', () => {
  it('stores a new event and returns it within its window', () => {
    insertEvent(baseEvent);

    const events = getEventsByWindow('geopolitico', 'ukraine', 0, 2000);
    expect(events).toHaveLength(1);
    expect(events[0].urlHash).toBe('hash-1');
    expect(events[0].sentiment).toBe(-0.4);
  });

  it('excludes events outside the requested window', () => {
    insertEvent(baseEvent);
    expect(getEventsByWindow('geopolitico', 'ukraine', 2000, 3000)).toHaveLength(0);
  });

  it('ignores a duplicate url_hash', () => {
    insertEvent(baseEvent);
    insertEvent({ ...baseEvent, text: 'Different text, same URL' });

    const events = getEventsByWindow('geopolitico', 'ukraine', 0, 2000);
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe('Tension rises at the border');
  });

  it('accepts a null sentiment/category/region for unclassified events', () => {
    insertEvent({
      ts: 1500,
      source: 'BBC',
      urlHash: 'hash-2',
      text: 'Unclassified report',
      sentiment: null,
      category: null,
      region: null,
      lat: null,
      lng: null,
    });

    const db = getDb();
    const row = db.prepare('SELECT * FROM news_events WHERE url_hash = ?').get('hash-2') as {
      sentiment: unknown;
      category: unknown;
    };
    expect(row.sentiment).toBeNull();
    expect(row.category).toBeNull();
  });
});

describe('getSentimentSeries', () => {
  it('buckets sentiment by day and averages it', () => {
    const oneDay = 24 * 60 * 60 * 1000;
    const anchor = 1_700_000_000_000;

    vi.useFakeTimers();
    vi.setSystemTime(anchor);
    insertEvent({ ...baseEvent, ts: anchor, urlHash: 'a', category: 'macro', sentiment: -0.2 });
    insertEvent({ ...baseEvent, ts: anchor + 1000, urlHash: 'b', category: 'macro', sentiment: -0.6 });
    insertEvent({ ...baseEvent, ts: anchor + oneDay + 5000, urlHash: 'c', category: 'macro', sentiment: 0.5 });
    vi.setSystemTime(anchor + oneDay + 5000);

    const series = getSentimentSeries('macro', 90);
    vi.useRealTimers();

    expect(series).toHaveLength(2);
    expect(series[0].sentiment).toBeCloseTo(-0.4, 5); // avg(-0.2, -0.6)
    expect(series[1].sentiment).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/db/news.test.ts`
Expected: FAIL — `Cannot find module './news'`.

- [ ] **Step 3: Implement the news module**

Create `src/lib/db/news.ts`:

```ts
import { getDb } from './client';

export interface NewsEventInput {
  ts: number;
  source: string;
  urlHash: string;
  text: string;
  sentiment: number | null;
  category: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
}

export interface NewsEvent extends NewsEventInput {
  id: number;
}

/** Append-only insert, deduped by urlHash — a re-fetch of the same article
    is a silent no-op rather than a duplicate row. */
export function insertEvent(event: NewsEventInput): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO news_events (ts, source, url_hash, text, sentiment, category, region, lat, lng)
     VALUES (@ts, @source, @urlHash, @text, @sentiment, @category, @region, @lat, @lng)`
  ).run(event as unknown as Record<string, unknown>);
}

export function getEventsByWindow(
  category: string,
  region: string,
  fromTs: number,
  toTs: number
): NewsEvent[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, ts, source, url_hash as urlHash, text, sentiment, category, region, lat, lng
       FROM news_events
       WHERE category = ? AND region = ? AND ts BETWEEN ? AND ?
       ORDER BY ts ASC`
    )
    .all(category, region, fromTs, toTs) as NewsEvent[];
}

/** Daily-bucketed average sentiment for a category, over the trailing
    `days` window — the input series for the event-study module. */
export function getSentimentSeries(category: string, days: number): { ts: number; sentiment: number }[] {
  const db = getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db
    .prepare(
      `SELECT (ts / 86400000) * 86400000 as ts, AVG(sentiment) as sentiment
       FROM news_events
       WHERE category = ? AND ts > ? AND sentiment IS NOT NULL
       GROUP BY ts
       ORDER BY ts ASC`
    )
    .all(category, since) as { ts: number; sentiment: number }[];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/db/news.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/news.ts src/lib/db/news.test.ts
git commit -m "feat(db): add news events read/write functions"
```

---

### Task 4: Sanctions history module

**Files:**
- Create: `src/lib/db/sanctions.ts` (note: distinct from the existing `src/lib/sanctions.ts` OFAC lookup — this is the new persistence module, one directory level down)
- Test: `src/lib/db/sanctions.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `resetDbForTests()` from `./client` (Task 1). Table `sanctions_history` (Task 1, migration `0003`).
- Produces: `insertSnapshot(entityId: string, tradeVolume: number | null, domainActive: boolean, exposureScore: number): void`, `getExposureTrend(entityId: string, days: number): { ts: number; exposure_score: number }[]`. No route wiring in this plan — no existing route computes these values yet (see Global Constraints).

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/sanctions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { resetDbForTests } from './client';
import { getExposureTrend, insertSnapshot } from './sanctions';

beforeEach(() => {
  resetDbForTests();
  vi.useRealTimers();
});

describe('insertSnapshot / getExposureTrend', () => {
  it('throttles inserts within the 24h bucket', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('entity-1', 1_000_000, true, 0.8);
    vi.setSystemTime(60 * 60 * 1000); // 1h later, still inside the bucket
    insertSnapshot('entity-1', 2_000_000, true, 0.9);
    vi.useRealTimers();

    const trend = getExposureTrend('entity-1', 90);
    expect(trend).toHaveLength(1);
    expect(trend[0].exposure_score).toBe(0.8);
  });

  it('inserts again once the 24h bucket has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('entity-1', 1_000_000, true, 0.8);
    vi.setSystemTime(25 * 60 * 60 * 1000); // past the 24h bucket
    insertSnapshot('entity-1', 2_000_000, false, 0.3);
    vi.useRealTimers();

    const trend = getExposureTrend('entity-1', 90);
    expect(trend).toHaveLength(2);
    expect(trend[1].exposure_score).toBe(0.3);
  });

  it('accepts a null trade_volume', () => {
    insertSnapshot('entity-2', null, false, 0.1);
    const trend = getExposureTrend('entity-2', 90);
    expect(trend).toHaveLength(1);
    expect(trend[0].exposure_score).toBe(0.1);
  });

  it('returns an empty trend for an entity with no history', () => {
    expect(getExposureTrend('unknown-entity', 90)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/db/sanctions.test.ts`
Expected: FAIL — `Cannot find module './sanctions'`.

- [ ] **Step 3: Implement the sanctions module**

Create `src/lib/db/sanctions.ts`:

```ts
import { getDb } from './client';

const EXPOSURE_BUCKET_MS = 24 * 60 * 60 * 1000; // matches the OFAC SDN cache TTL in src/lib/sanctions.ts

/** Best-effort, throttled write — no-ops if a snapshot for this entity was
    already recorded within the current 24h bucket. */
export function insertSnapshot(
  entityId: string,
  tradeVolume: number | null,
  domainActive: boolean,
  exposureScore: number
): void {
  const db = getDb();
  const last = db
    .prepare('SELECT ts FROM sanctions_history WHERE entity_id = ? ORDER BY ts DESC LIMIT 1')
    .get(entityId) as { ts: number } | undefined;

  const now = Date.now();
  if (last && now - last.ts < EXPOSURE_BUCKET_MS) return;

  db.prepare(
    'INSERT INTO sanctions_history (entity_id, ts, trade_volume, domain_active, exposure_score) VALUES (?, ?, ?, ?, ?)'
  ).run(entityId, now, tradeVolume, domainActive ? 1 : 0, exposureScore);
}

export function getExposureTrend(entityId: string, days: number): { ts: number; exposure_score: number }[] {
  const db = getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db
    .prepare('SELECT ts, exposure_score FROM sanctions_history WHERE entity_id = ? AND ts > ? ORDER BY ts ASC')
    .all(entityId, since) as { ts: number; exposure_score: number }[];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/db/sanctions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/sanctions.ts src/lib/db/sanctions.test.ts
git commit -m "feat(db): add sanctions exposure history read/write functions"
```

---

### Task 5: Wire maritime route to persist snapshots

**Files:**
- Modify: `src/app/api/maritime/route.ts:289-306` (the `dynamicChokepoints` map inside `buildSnapshot()`)
- Modify: `src/app/api/maritime/route.ts` (add import, add a `chokepointId` slug helper)
- Modify: `src/app/api/maritime/route.test.ts` (extend existing test file)

**Interfaces:**
- Consumes: `insertSnapshot` and `getBaseline` from `@/lib/db/maritime` (Task 2).

- [ ] **Step 1: Write the failing test**

Modify `src/app/api/maritime/route.test.ts` — add the import and reset call, then a new test.

Change the top of the file from:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, clearMaritimeSnapshot } from './route';
```

to:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { GET, clearMaritimeSnapshot } from './route';
import { resetDbForTests } from '@/lib/db/client';
import { getBaseline } from '@/lib/db/maritime';
```

Change the `beforeEach` from:

```ts
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    ships().clear();
    clearMaritimeSnapshot();
  });
```

to:

```ts
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    ships().clear();
    clearMaritimeSnapshot();
    resetDbForTests();
  });
```

Add a new test at the end of the `describe('GET /api/maritime', ...)` block, right before its closing `});`:

```ts

  it('persists a snapshot for a chokepoint with nearby ships', async () => {
    addShip(1, 26.57, 56.25); // sits on top of the Strait of Hormuz
    await GET();

    expect(getBaseline('strait-of-hormuz', 90)).toBe(1);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/maritime/route.test.ts`
Expected: FAIL — `getBaseline('strait-of-hormuz', 90)` returns `0`, not `1` (nothing is persisted yet).

- [ ] **Step 3: Wire the persistence call into the route**

Edit `src/app/api/maritime/route.ts`. Add the import near the top of the file, alongside the other imports:

```ts
import { insertSnapshot as insertMaritimeSnapshot } from '@/lib/db/maritime';
```

Add a slug helper right after the `CHOKEPOINTS` array (after line 80):

```ts
function chokepointId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
```

Change the `dynamicChokepoints` block from:

```ts
  const dynamicChokepoints = CHOKEPOINTS.map(choke => {
    let nearbyCount = 0;
    for (let i = 0; i < ships.length; i++) {
      if (getDistanceKm(choke.lat, choke.lng, ships[i].lat, ships[i].lng) < 100) nearbyCount++;
    }
    
    // Dynamically adjust risk based on live ship concentration
    let dynamicRisk = choke.risk;
    if (nearbyCount > 50) dynamicRisk = 'CRITICAL';
    else if (nearbyCount > 20 && dynamicRisk !== 'CRITICAL') dynamicRisk = 'HIGH';
    else if (nearbyCount > 5 && dynamicRisk === 'LOW') dynamicRisk = 'ELEVATED';

    return {
      ...choke,
      traffic: `${choke.traffic} | LIVE SHIPS: ${nearbyCount}`,
      risk: dynamicRisk
    };
  });
```

to:

```ts
  const dynamicChokepoints = CHOKEPOINTS.map(choke => {
    let nearbyCount = 0;
    for (let i = 0; i < ships.length; i++) {
      if (getDistanceKm(choke.lat, choke.lng, ships[i].lat, ships[i].lng) < 100) nearbyCount++;
    }
    
    // Dynamically adjust risk based on live ship concentration
    let dynamicRisk = choke.risk;
    if (nearbyCount > 50) dynamicRisk = 'CRITICAL';
    else if (nearbyCount > 20 && dynamicRisk !== 'CRITICAL') dynamicRisk = 'HIGH';
    else if (nearbyCount > 5 && dynamicRisk === 'LOW') dynamicRisk = 'ELEVATED';

    try {
      insertMaritimeSnapshot(chokepointId(choke.name), nearbyCount, dynamicRisk);
    } catch (err) {
      console.error('[maritime] failed to persist snapshot', err);
    }

    return {
      ...choke,
      traffic: `${choke.traffic} | LIVE SHIPS: ${nearbyCount}`,
      risk: dynamicRisk
    };
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/maritime/route.test.ts`
Expected: PASS (all 5 tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/maritime/route.ts src/app/api/maritime/route.test.ts
git commit -m "feat(maritime): persist per-chokepoint ship-count snapshots"
```

---

### Task 6: Wire news route to persist events

**Files:**
- Modify: `src/app/api/news/route.ts` (add import, compute `urlHash`/`ts` once, persist each item)
- Test: `src/app/api/news/route.test.ts` (new file)

**Interfaces:**
- Consumes: `insertEvent` from `@/lib/db/news` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `src/app/api/news/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { getDb, resetDbForTests } from '@/lib/db/client';
import { GET } from './route';

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss><channel>
<item>
<title><![CDATA[Border tension escalates]]></title>
<description><![CDATA[Reports of a military buildup near the border.]]></description>
<link>https://example.com/article-1</link>
<pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
</item>
</channel></rss>`;

beforeEach(() => {
  resetDbForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('https://t.me/s/')) {
        return { ok: false } as unknown as Response;
      }
      if (url === 'https://feeds.bbci.co.uk/news/world/rss.xml') {
        return { ok: true, text: async () => RSS_FIXTURE } as unknown as Response;
      }
      return { ok: false } as unknown as Response;
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/news', () => {
  it('persists fetched articles to news_events', async () => {
    await GET();

    const rows = getDb()
      .prepare('SELECT source, text, sentiment, category FROM news_events')
      .all() as { source: string; text: string; sentiment: number | null; category: string | null }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('BBC');
    expect(rows[0].text).toContain('Border tension escalates');
    expect(rows[0].sentiment).toBeNull();
    expect(rows[0].category).toBeNull();
  });

  it('does not duplicate a row when the same article is fetched twice', async () => {
    await GET();
    await GET();

    const count = (getDb().prepare('SELECT COUNT(*) as n FROM news_events').get() as { n: number }).n;
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/news/route.test.ts`
Expected: FAIL — 0 rows in `news_events` (nothing is persisted yet).

- [ ] **Step 3: Wire the persistence call into the route**

Edit `src/app/api/news/route.ts`. Add the import at the top, alongside the existing ones:

```ts
import { insertEvent as insertNewsEvent } from '@/lib/db/news';
```

Change the `newsItems` mapping from:

```ts
    const newsItems = allArticles.map(article => {
      const riskScore = scoreRisk(article.description || article.title);
      const coords = findCoords(article.description || article.title);

      return {
        id: crypto.createHash('md5').update((article.link || '') + (article.pubDate || '')).digest('hex'),
        title: article.title,
        description: article.description,
        link: article.link,
        published: article.pubDate,
        source: article.source,
        risk_score: riskScore,
        coords: coords ? [coords[0], coords[1]] : null,
        coords_default: !coords,
        machine_assessment: riskScore >= 8 ? "AI Analysis indicates elevated tactical priority based on OSINT stream patterns." : null,
      };
    });
```

to:

```ts
    const newsItems = allArticles.map(article => {
      const riskScore = scoreRisk(article.description || article.title);
      const coords = findCoords(article.description || article.title);
      const urlHash = crypto.createHash('md5').update((article.link || '') + (article.pubDate || '')).digest('hex');
      const ts = Date.parse(article.pubDate) || Date.now();

      try {
        insertNewsEvent({
          ts,
          source: article.source,
          urlHash,
          text: `${article.title}\n${article.description || ''}`.trim(),
          sentiment: null,
          category: null,
          region: null,
          lat: coords ? coords[0] : null,
          lng: coords ? coords[1] : null,
        });
      } catch (err) {
        console.error('[news] failed to persist event', err);
      }

      return {
        id: urlHash,
        title: article.title,
        description: article.description,
        link: article.link,
        published: article.pubDate,
        source: article.source,
        risk_score: riskScore,
        coords: coords ? [coords[0], coords[1]] : null,
        coords_default: !coords,
        machine_assessment: riskScore >= 8 ? "AI Analysis indicates elevated tactical priority based on OSINT stream patterns." : null,
      };
    });
```

(`id` in the returned item now reuses `urlHash` instead of re-hashing the same inputs — same value as before, computed once.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/news/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/news/route.ts src/app/api/news/route.test.ts
git commit -m "feat(news): persist fetched articles to news_events"
```

---

### Task 7: Docker volume and environment wiring

**Files:**
- Modify: `Dockerfile` (create `/app/data`, owned by the `nextjs` user; default `DB_PATH`)
- Modify: `docker-compose.yml` (add a named volume for the `osiris` service)
- Modify: `.gitignore` (ignore local `data/` dir used by dev `DB_PATH` default)
- Modify: `.env.example` (document `DB_PATH`)

**Interfaces:** None — deployment configuration only, no code.

- [ ] **Step 1: Update the Dockerfile runner stage**

Edit `Dockerfile` — the `runner` stage currently is:

```dockerfile
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
```

Change to:

```dockerfile
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/app/data/osiris.db

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app/data && chown -R nextjs:nodejs /app/data
```

- [ ] **Step 2: Add the named volume to docker-compose.yml**

Edit `docker-compose.yml` — the `osiris` service currently is:

```yaml
  osiris:
    # Builds locally from the Dockerfile so you always run the cloned code.
    # To use the prebuilt image instead, replace the `build:` block below with
    # `image: ghcr.io/simplifaisoul/osiris:latest`.
    build:
      context: .
      dockerfile: Dockerfile
    container_name: osiris
    # Host port is configurable via OSIRIS_PORT in .env (defaults to 3000).
    ports:
      - "${OSIRIS_PORT:-3000}:3000"
    # Optional API keys / scanner backend — copy .env.template to .env and
    # fill in what you need. Missing file is ignored (keyless feeds still work).
    env_file:
      - path: .env
        required: false
    environment:
      - NODE_OPTIONS=--dns-result-order=ipv4first
      - NODE_ENV=production
      - PORT=3000
      - HOSTNAME=0.0.0.0
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
    networks:
      - default
      - umami_default
```

Add a `volumes:` key to it (right after `container_name: osiris`):

```yaml
  osiris:
    # Builds locally from the Dockerfile so you always run the cloned code.
    # To use the prebuilt image instead, replace the `build:` block below with
    # `image: ghcr.io/simplifaisoul/osiris:latest`.
    build:
      context: .
      dockerfile: Dockerfile
    container_name: osiris
    volumes:
      - osiris-data:/app/data
    # Host port is configurable via OSIRIS_PORT in .env (defaults to 3000).
    ports:
      - "${OSIRIS_PORT:-3000}:3000"
    # Optional API keys / scanner backend — copy .env.template to .env and
    # fill in what you need. Missing file is ignored (keyless feeds still work).
    env_file:
      - path: .env
        required: false
    environment:
      - NODE_OPTIONS=--dns-result-order=ipv4first
      - NODE_ENV=production
      - PORT=3000
      - HOSTNAME=0.0.0.0
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
    networks:
      - default
      - umami_default
```

And register the named volume in the top-level `volumes:` block — currently:

```yaml
volumes:
  nginx-cache:
```

becomes:

```yaml
volumes:
  nginx-cache:
  osiris-data:
```

- [ ] **Step 3: Ignore the local dev data directory**

Edit `.gitignore` — add a new section (after the `# Misc` block, near `.DS_Store`):

```
# Local SQLite data (dev default for DB_PATH)
/data/
```

- [ ] **Step 4: Document DB_PATH in .env.example**

Edit `.env.example` — add a new section after the `SCANNER_URL`/`SCANNER_KEY` block (after line 26):

```

# ─────────────────────────────────────────────────────────────────────────
#  PERSISTENCE  ── local SQLite database path ──
#  Where osiris.db lives. Defaults to ./data/osiris.db if unset (created
#  automatically). The Docker image sets this to /app/data/osiris.db,
#  backed by the osiris-data named volume — leave it unset here to use the
#  Docker default.
# ─────────────────────────────────────────────────────────────────────────
DB_PATH=
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .gitignore .env.example
git commit -m "chore(docker): persist osiris.db in a named volume"
```

---

### Task 8: Manual verification

Not a TDD cycle — these are infra/build checks that don't reduce to a single automated test. Run after Tasks 1-7 are committed.

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: All tests pass, including the new `src/lib/db/*.test.ts`, `src/app/api/maritime/route.test.ts`, and `src/app/api/news/route.test.ts`.

- [ ] **Step 2: Type check and lint**

Run: `npx tsc --noEmit`
Expected: No type errors (`db.pragma`/`db.prepare` calls type-check against `better-sqlite3`'s bundled `Database.Database` type from `@types/better-sqlite3`).

Run: `npm run lint`
Expected: No new lint errors in `src/lib/db/` or the two modified route files.

- [ ] **Step 3: Local dev smoke test**

Run: `npm run dev`, then in another terminal: `curl http://localhost:3000/api/maritime` and `curl http://localhost:3000/api/news`.
Expected: Both return 200 with JSON bodies (same shape as before this plan). Confirm `data/osiris.db` was created in the repo root.

Then inspect it directly: `npx tsx -e "import Database from 'better-sqlite3'; const db = new Database('data/osiris.db'); console.log(db.prepare('SELECT COUNT(*) as n FROM maritime_snapshots').get()); console.log(db.prepare('SELECT COUNT(*) as n FROM news_events').get());"`
Expected: Both counts are ≥ 1 after hitting the two endpoints once each.

- [ ] **Step 4: Docker build (if Docker is available)**

Run: `docker compose build osiris`
Expected: Build succeeds — in particular, the `deps` stage's `npm ci` compiles `better-sqlite3` without error under Alpine.

Run: `docker compose up -d osiris` then `docker compose exec osiris ls -la /app/data`
Expected: `/app/data` exists, owned by `nextjs`, and after hitting `/api/maritime` or `/api/news` through the container's port, `osiris.db` appears there.

Run: `docker compose down`

- [ ] **Step 5: Clean up local dev artifacts**

The `data/osiris.db` created in Step 3 is a local dev artifact (already covered by the `.gitignore` entry from Task 7) — no action needed, but confirm `git status` doesn't show it as untracked-and-about-to-be-committed.
