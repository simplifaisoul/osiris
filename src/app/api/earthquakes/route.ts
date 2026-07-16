
import { NextResponse } from 'next/server';

import {
  EarthquakeDatabaseUnavailableError,
  loadEarthquakeRuntimeConfig,
  loadEarthquakeSnapshot,
  type EarthquakeSnapshot,
} from '@/lib/earthquakes/service';
import {
  UsgsEarthquakeFetchError,
  UsgsEarthquakeHttpError,
} from '@/lib/earthquakes/live-source';

/**
 * OSIRIS — Earthquake Data API
 * Preserves the existing last-24h M2.5+ response contract while selecting
 * live USGS or the durable World-State snapshot on the server.
 */

export const runtime = 'nodejs';

const SUCCESS_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=120';

function responseHeaders(snapshot: EarthquakeSnapshot): Record<string, string> {
  return {
    'Cache-Control': SUCCESS_CACHE_CONTROL,
    'X-OSIRIS-Earthquake-Mode': snapshot.mode,
    'X-OSIRIS-Earthquake-Source': snapshot.source,
    ...(snapshot.databaseResponseReceivedAt === null
      ? {}
      : {
          'X-OSIRIS-Database-Response-Received':
            snapshot.databaseResponseReceivedAt.toISOString(),
        }),
    ...(snapshot.databaseUpstreamTimestamp === null
      ? {}
      : {
          'X-OSIRIS-Database-Upstream-Timestamp':
            snapshot.databaseUpstreamTimestamp.toISOString(),
        }),
    ...(snapshot.databaseStale ? { 'X-OSIRIS-Database-Stale': 'true' } : {}),
    ...(snapshot.fallbackReason === null
      ? {}
      : { 'X-OSIRIS-Earthquake-Fallback': snapshot.fallbackReason }),
  };
}

export async function GET() {
  try {
    const snapshot = await loadEarthquakeSnapshot(loadEarthquakeRuntimeConfig(), {
      warn: (message) => console.warn(message),
    });
    return NextResponse.json(snapshot.response, { headers: responseHeaders(snapshot) });
  } catch (error) {
    if (error instanceof UsgsEarthquakeHttpError) {
      return NextResponse.json(
        { earthquakes: [], error: 'USGS unavailable' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (error instanceof EarthquakeDatabaseUnavailableError) {
      console.error('[earthquakes] Database mode unavailable:', error.message);
      return NextResponse.json(
        { earthquakes: [], error: 'Earthquake database unavailable' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown earthquake error';
    console.error('Earthquake fetch error:', message);
    return NextResponse.json(
      {
        earthquakes: [],
        error: error instanceof UsgsEarthquakeFetchError
          ? 'Failed to fetch earthquake data'
          : 'Failed to load earthquake data',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

