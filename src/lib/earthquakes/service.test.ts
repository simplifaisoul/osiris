import { describe, expect, it, vi } from 'vitest';

import type { EarthquakeDatabase, EarthquakeDatabaseSnapshot } from './database-source';
import {
  EarthquakeDatabaseUnavailableError,
  loadEarthquakeRuntimeConfig,
  loadEarthquakeSnapshot,
  type EarthquakeRuntimeConfig,
} from './service';
import { expectedFixtureEarthquakes } from './test-fixture';

const now = new Date('2026-01-01T00:10:00.000Z');
const freshSnapshot: EarthquakeDatabaseSnapshot = {
  earthquakes: expectedFixtureEarthquakes,
  responseReceivedAt: new Date('2026-01-01T00:06:00.000Z'),
  upstreamTimestamp: new Date('2026-01-01T00:05:00.000Z'),
};

function config(
  mode: EarthquakeRuntimeConfig['mode'],
  databaseMaxAgeMs = 15 * 60 * 1_000,
): EarthquakeRuntimeConfig {
  return { mode, databaseMaxAgeMs };
}

function database(snapshot: EarthquakeDatabaseSnapshot): EarthquakeDatabase {
  return { loadSnapshot: vi.fn(async () => snapshot) };
}

describe('earthquake source selection', () => {
  it('defaults to live and ignores irrelevant database freshness configuration', () => {
    expect(loadEarthquakeRuntimeConfig({
      EARTHQUAKE_DATABASE_MAX_AGE_MS: 'invalid-in-live-mode',
    })).toEqual({ mode: 'live', databaseMaxAgeMs: 900_000 });
  });

  it('validates database mode and freshness configuration', () => {
    expect(() => loadEarthquakeRuntimeConfig({
      EARTHQUAKE_DATA_MODE: 'sometimes',
    })).toThrow('EARTHQUAKE_DATA_MODE must be live, database, or database_with_live_fallback');
    expect(() => loadEarthquakeRuntimeConfig({
      EARTHQUAKE_DATA_MODE: 'database',
      EARTHQUAKE_DATABASE_MAX_AGE_MS: '59999',
    })).toThrow('EARTHQUAKE_DATABASE_MAX_AGE_MS');
  });

  it('uses live USGS without resolving a database in live mode', async () => {
    const getDatabase = vi.fn();

    const snapshot = await loadEarthquakeSnapshot(config('live'), {
      getDatabase,
      loadLive: async () => expectedFixtureEarthquakes,
      now: () => now,
    });

    expect(snapshot.source).toBe('usgs-live');
    expect(snapshot.response.earthquakes).toEqual(expectedFixtureEarthquakes);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it('uses a fresh complete database snapshot without contacting USGS', async () => {
    const loadLive = vi.fn(async () => expectedFixtureEarthquakes);

    const snapshot = await loadEarthquakeSnapshot(config('database'), {
      getDatabase: () => database(freshSnapshot),
      loadLive,
      now: () => now,
    });

    expect(snapshot.source).toBe('worldstate-database');
    expect(snapshot.response).toEqual({
      earthquakes: expectedFixtureEarthquakes,
      total: 2,
      timestamp: now.toISOString(),
    });
    expect(loadLive).not.toHaveBeenCalled();
  });

  it('keeps a fresh successful empty snapshot instead of falling back', async () => {
    const loadLive = vi.fn(async () => expectedFixtureEarthquakes);
    const snapshot = await loadEarthquakeSnapshot(config('database_with_live_fallback'), {
      getDatabase: () => database({ ...freshSnapshot, earthquakes: [] }),
      loadLive,
      now: () => now,
    });

    expect(snapshot.source).toBe('worldstate-database');
    expect(snapshot.response.earthquakes).toEqual([]);
    expect(loadLive).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'unconfigured',
      getDatabase: (): EarthquakeDatabase | null => null,
      reason: 'database-unconfigured' as const,
    },
    {
      name: 'configuration failure',
      getDatabase: (): EarthquakeDatabase => {
        throw new Error('connection secret must not escape');
      },
      reason: 'database-unavailable' as const,
    },
    {
      name: 'query failure',
      getDatabase: (): EarthquakeDatabase => ({
        loadSnapshot: async () => { throw new Error('connection secret must not escape'); },
      }),
      reason: 'database-unavailable' as const,
    },
    {
      name: 'no complete success',
      getDatabase: (): EarthquakeDatabase => database({
        earthquakes: [],
        responseReceivedAt: null,
        upstreamTimestamp: null,
      }),
      reason: 'database-without-success' as const,
    },
    {
      name: 'stale upstream feed',
      getDatabase: (): EarthquakeDatabase => database({
        ...freshSnapshot,
        upstreamTimestamp: new Date('2025-12-31T23:00:00.000Z'),
      }),
      reason: 'database-stale' as const,
    },
  ])('logs and falls back safely when the database is $name', async ({ getDatabase, reason }) => {
    const warnings: string[] = [];
    const snapshot = await loadEarthquakeSnapshot(config('database_with_live_fallback'), {
      getDatabase,
      loadLive: async () => expectedFixtureEarthquakes,
      now: () => now,
      warn: (message) => warnings.push(message),
    });

    expect(snapshot.source).toBe('usgs-live-fallback');
    expect(snapshot.fallbackReason).toBe(reason);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain('connection secret');
  });

  it('rejects a stale snapshot in database-only mode', async () => {
    await expect(loadEarthquakeSnapshot(config('database'), {
      getDatabase: () => database({
        ...freshSnapshot,
        responseReceivedAt: new Date('2025-12-31T23:00:00.000Z'),
      }),
      loadLive: async () => expectedFixtureEarthquakes,
      now: () => now,
    })).rejects.toThrow(EarthquakeDatabaseUnavailableError);
  });

  it('rejects missing database configuration in database-only mode', async () => {
    await expect(loadEarthquakeSnapshot(config('database'), {
      getDatabase: () => null,
      loadLive: async () => expectedFixtureEarthquakes,
      now: () => now,
    })).rejects.toThrow('Earthquake database is not configured');
  });
});
