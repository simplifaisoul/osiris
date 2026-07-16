import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  loadSnapshot: vi.fn(),
}));

vi.mock('@/lib/earthquakes/service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/earthquakes/service')>(
    '@/lib/earthquakes/service',
  );
  return {
    ...actual,
    loadEarthquakeRuntimeConfig: mocks.loadConfig,
    loadEarthquakeSnapshot: mocks.loadSnapshot,
  };
});

import {
  UsgsEarthquakeFetchError,
  UsgsEarthquakeHttpError,
} from '@/lib/earthquakes/live-source';
import { EarthquakeDatabaseUnavailableError } from '@/lib/earthquakes/service';
import { expectedFixtureEarthquakes } from '@/lib/earthquakes/test-fixture';

import { GET } from './route';

describe('GET /api/earthquakes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.loadConfig.mockReset();
    mocks.loadSnapshot.mockReset();
    mocks.loadConfig.mockReturnValue({ mode: 'live', databaseMaxAgeMs: 900_000 });
  });

  it('returns the compatibility body, cache policy, and database provenance headers', async () => {
    const responseReceivedAt = new Date('2026-01-01T00:06:00.000Z');
    const upstreamTimestamp = new Date('2026-01-01T00:05:00.000Z');
    mocks.loadSnapshot.mockResolvedValue({
      response: {
        earthquakes: expectedFixtureEarthquakes,
        total: 2,
        timestamp: '2026-01-01T00:10:00.000Z',
      },
      mode: 'database',
      source: 'worldstate-database',
      databaseResponseReceivedAt: responseReceivedAt,
      databaseUpstreamTimestamp: upstreamTimestamp,
      databaseStale: false,
      fallbackReason: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      earthquakes: expectedFixtureEarthquakes,
      total: 2,
      timestamp: '2026-01-01T00:10:00.000Z',
    });
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=120',
    );
    expect(response.headers.get('x-osiris-earthquake-source')).toBe('worldstate-database');
    expect(response.headers.get('x-osiris-database-response-received')).toBe(
      responseReceivedAt.toISOString(),
    );
  });

  it('preserves the existing HTTP-200 response for an upstream HTTP error', async () => {
    mocks.loadSnapshot.mockRejectedValue(new UsgsEarthquakeHttpError(503));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      earthquakes: [],
      error: 'USGS unavailable',
    });
  });

  it('reports a stale-database live fallback through headers only', async () => {
    const responseReceivedAt = new Date('2026-01-01T00:00:00.000Z');
    const upstreamTimestamp = new Date('2025-12-31T23:59:00.000Z');
    mocks.loadSnapshot.mockResolvedValue({
      response: {
        earthquakes: expectedFixtureEarthquakes,
        total: 2,
        timestamp: '2026-01-01T01:00:00.000Z',
      },
      mode: 'database_with_live_fallback',
      source: 'usgs-live-fallback',
      databaseResponseReceivedAt: responseReceivedAt,
      databaseUpstreamTimestamp: upstreamTimestamp,
      databaseStale: true,
      fallbackReason: 'database-stale',
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-osiris-earthquake-fallback')).toBe('database-stale');
    expect(response.headers.get('x-osiris-database-stale')).toBe('true');
    expect(response.headers.get('x-osiris-database-upstream-timestamp')).toBe(
      upstreamTimestamp.toISOString(),
    );
  });

  it('returns the existing 500 error body for malformed HTTP-200 provider data', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.loadSnapshot.mockRejectedValue(
      new UsgsEarthquakeFetchError('Failed to parse earthquake data'),
    );

    const response = await GET();

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      earthquakes: [],
      error: 'Failed to fetch earthquake data',
    });
  });

  it('returns 503 without connection details when database-only mode is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.loadSnapshot.mockRejectedValue(new EarthquakeDatabaseUnavailableError(
      'Earthquake database query failed',
      { cause: new Error('postgresql://user:secret@example.invalid/database') },
    ));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      earthquakes: [],
      error: 'Earthquake database unavailable',
    });
    expect(console.error).toHaveBeenCalledWith(
      '[earthquakes] Database mode unavailable:',
      'Earthquake database query failed',
    );
  });
});
