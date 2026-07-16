export interface Earthquake {
  id: string;
  lat: number;
  lng: number;
  depth: number;
  magnitude: number | null;
  place: string | null;
  time: number;
  url: string | null;
  tsunami: 0 | 1;
  type: string | null;
  felt: number | null;
  alert: string | null;
}

export interface EarthquakeResponse {
  earthquakes: Earthquake[];
  total: number;
  timestamp: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isEarthquake(value: unknown): value is Earthquake {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.lat === 'number'
    && Number.isFinite(value.lat)
    && typeof value.lng === 'number'
    && Number.isFinite(value.lng)
    && typeof value.depth === 'number'
    && Number.isFinite(value.depth)
    && isNullableFiniteNumber(value.magnitude)
    && isNullableString(value.place)
    && typeof value.time === 'number'
    && Number.isFinite(value.time)
    && isNullableString(value.url)
    && (value.tsunami === 0 || value.tsunami === 1)
    && isNullableString(value.type)
    && isNullableFiniteNumber(value.felt)
    && isNullableString(value.alert);
}

export class UsgsEarthquakeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsgsEarthquakeContractError';
  }
}

function invalidFeature(index: number, field: string): never {
  throw new UsgsEarthquakeContractError(
    `USGS feature at index ${index} has invalid ${field}`,
  );
}

function mapUsgsFeature(value: unknown, index: number): Earthquake {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
    return invalidFeature(index, 'id');
  }
  if (
    !isRecord(value.geometry)
    || value.geometry.type !== 'Point'
    || !Array.isArray(value.geometry.coordinates)
    || value.geometry.coordinates.length !== 3
  ) {
    return invalidFeature(index, 'geometry');
  }
  if (!isRecord(value.properties)) return invalidFeature(index, 'properties');

  const [longitudeValue, latitudeValue, depthValue] = value.geometry.coordinates;
  const longitude = longitudeValue;
  const latitude = latitudeValue;
  const depth = depthValue;
  const magnitude = value.properties.mag;
  const place = value.properties.place;
  const time = value.properties.time;
  const url = value.properties.url;
  const tsunami = value.properties.tsunami;
  const type = value.properties.type;
  const felt = value.properties.felt;
  const alert = value.properties.alert;

  if (
    typeof longitude !== 'number'
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
    || typeof latitude !== 'number'
    || !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || typeof depth !== 'number'
    || !Number.isFinite(depth)
  ) {
    return invalidFeature(index, 'coordinates');
  }
  if (!isNullableFiniteNumber(magnitude)) return invalidFeature(index, 'magnitude');
  if (!isNullableString(place)) return invalidFeature(index, 'place');
  if (typeof time !== 'number' || !Number.isSafeInteger(time) || time < 0) {
    return invalidFeature(index, 'time');
  }
  if (!isNullableString(url)) return invalidFeature(index, 'url');
  if (tsunami !== 0 && tsunami !== 1) return invalidFeature(index, 'tsunami');
  if (!isNullableString(type)) return invalidFeature(index, 'type');
  if (felt !== null && (typeof felt !== 'number' || !Number.isInteger(felt) || felt < 0)) {
    return invalidFeature(index, 'felt');
  }
  if (!isNullableString(alert)) return invalidFeature(index, 'alert');

  return {
    id: value.id,
    lat: latitude,
    lng: longitude,
    depth,
    magnitude,
    place,
    time,
    url,
    tsunami,
    type,
    felt,
    alert,
  };
}

/** Map the official USGS GeoJSON feed into the long-standing OSIRIS contract. */
export function mapUsgsEarthquakeFeed(value: unknown): Earthquake[] {
  if (
    !isRecord(value)
    || value.type !== 'FeatureCollection'
    || !isRecord(value.metadata)
    || typeof value.metadata.count !== 'number'
    || !Number.isInteger(value.metadata.count)
    || value.metadata.count < 0
    || !Array.isArray(value.features)
  ) {
    throw new UsgsEarthquakeContractError('Invalid USGS FeatureCollection envelope');
  }
  if (value.metadata.count !== value.features.length) {
    throw new UsgsEarthquakeContractError(
      'USGS metadata count does not match the feature array',
    );
  }

  return value.features.map(mapUsgsFeature);
}

export function buildEarthquakeResponse(
  earthquakes: Earthquake[],
  generatedAt: Date,
): EarthquakeResponse {
  return {
    earthquakes,
    total: earthquakes.length,
    timestamp: generatedAt.toISOString(),
  };
}

/** Validate the same-origin API boundary before replacing last-good UI data. */
export function parseEarthquakeResponse(value: unknown): EarthquakeResponse | null {
  if (
    !isRecord(value)
    || 'error' in value
    || !Array.isArray(value.earthquakes)
    || !value.earthquakes.every(isEarthquake)
    || typeof value.total !== 'number'
    || value.total !== value.earthquakes.length
    || typeof value.timestamp !== 'string'
  ) {
    return null;
  }

  return {
    earthquakes: value.earthquakes,
    total: value.total,
    timestamp: value.timestamp,
  };
}
