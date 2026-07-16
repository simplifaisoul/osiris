import { describe, expect, it } from 'vitest';

import {
  fetchLiveEarthquakes,
  UsgsEarthquakeFetchError,
  UsgsEarthquakeHttpError,
} from './live-source';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchLiveEarthquakes', () => {
  it('accepts an explicitly empty USGS FeatureCollection', async () => {
    await expect(fetchLiveEarthquakes(async () => jsonResponse({
      type: 'FeatureCollection',
      metadata: { count: 0 },
      features: [],
    }))).resolves.toEqual([]);
  });

  it.each([
    { error: 'invalid envelope', payload: { error: 'provider failure' } },
    {
      error: 'malformed feature',
      payload: {
        type: 'FeatureCollection',
        metadata: { count: 1 },
        features: [{ id: 'broken' }],
      },
    },
  ])('rejects an HTTP-200 $error atomically', async ({ payload }) => {
    await expect(fetchLiveEarthquakes(async () => jsonResponse(payload))).rejects.toThrow(
      UsgsEarthquakeFetchError,
    );
  });

  it('distinguishes a non-success USGS response', async () => {
    const error = await fetchLiveEarthquakes(async () => jsonResponse({}, 503)).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(UsgsEarthquakeHttpError);
    expect(error).toEqual(expect.objectContaining({ status: 503 }));
  });
});
