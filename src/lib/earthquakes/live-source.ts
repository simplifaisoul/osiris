import { mapUsgsEarthquakeFeed, type Earthquake } from './contract';

export const USGS_EARTHQUAKE_FEED_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

const USGS_REQUEST_TIMEOUT_MS = 10_000;

export type EarthquakeFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export class UsgsEarthquakeHttpError extends Error {
  constructor(readonly status: number) {
    super(`USGS returned HTTP ${status}`);
    this.name = 'UsgsEarthquakeHttpError';
  }
}

export class UsgsEarthquakeFetchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UsgsEarthquakeFetchError';
  }
}

export async function fetchLiveEarthquakes(
  fetchImplementation: EarthquakeFetch = fetch,
): Promise<Earthquake[]> {
  let response: Response;

  try {
    response = await fetchImplementation(USGS_EARTHQUAKE_FEED_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(USGS_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new UsgsEarthquakeFetchError('Failed to fetch earthquake data', { cause: error });
  }

  if (!response.ok) {
    throw new UsgsEarthquakeHttpError(response.status);
  }

  try {
    return mapUsgsEarthquakeFeed(await response.json());
  } catch (error) {
    throw new UsgsEarthquakeFetchError('Failed to parse earthquake data', { cause: error });
  }
}
