import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Severe Weather & Anomalies API
 * Fetches active natural events from NASA EONET (global storms/volcanoes/sea ice),
 * NOAA/NWS active alerts (U.S. only), and GDACS (global cyclones/floods/droughts).
 * NWS alone only covers the U.S.; GDACS fills the rest of the world with the same
 * severity/coordinate shape so the map layer shows weather events everywhere.
 */

type Severity = 'low' | 'medium' | 'high';

type WeatherEvent = {
  id: string;
  title: string;
  category: string;
  type: string;
  icon: string;
  severity: Severity;
  lat: number;
  lng: number;
  date?: string;
  expires?: string;
  area?: string;
  source: string;
  provider: 'NASA EONET' | 'NOAA/NWS' | 'GDACS';
};

type EonetEvent = {
  id: string;
  title: string;
  categories?: {
    id?: string;
    title?: string;
  }[];
  geometry?: {
    type?: string;
    coordinates?: number[];
    date?: string;
  }[];
  sources?: {
    url?: string;
  }[];
};

type EonetResponse = {
  events?: EonetEvent[];
};

type NwsGeometry =
  | {
      type: 'Point';
      coordinates: number[];
    }
  | {
      type: 'Polygon';
      coordinates?: number[][][];
    }
  | {
      type: 'MultiPolygon';
      coordinates?: number[][][][];
    };

type NwsFeature = {
  geometry?: NwsGeometry | null;
  properties?: {
    '@id'?: string;
    id?: string;
    headline?: string;
    event?: string;
    severity?: string;
    effective?: string;
    sent?: string;
    expires?: string;
    areaDesc?: string;
  };
};

type NwsResponse = {
  features?: NwsFeature[];
};

// GDACS event types we surface here. EQ (earthquakes) and WF (wildfires) are already
// covered by the dedicated /api/earthquakes (USGS) and /api/fires (FIRMS) routes.
const GDACS_TYPE_MAP: Record<string, { type: string; icon: string }> = {
  TC: { type: 'Tropical Cyclone', icon: 'cyclone' },
  FL: { type: 'Flood', icon: 'flood' },
  DR: { type: 'Drought', icon: 'drought' },
};

function getGdacsTag(itemXml: string, tag: string): string {
  const m = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return (m?.[1] || '').trim();
}

function normalizeGdacsSeverity(alertLevel: string): Severity {
  switch (alertLevel.toLowerCase()) {
    case 'red': return 'high';
    case 'orange': return 'medium';
    default: return 'low';
  }
}

function parseGdacsRss(xml: string): WeatherEvent[] {
  const events: WeatherEvent[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const eventType = getGdacsTag(itemXml, 'gdacs:eventtype');
    const mapped = GDACS_TYPE_MAP[eventType];
    if (!mapped) continue;

    const latMatch = itemXml.match(/<geo:lat>([-\d.]+)<\/geo:lat>/i);
    const lonMatch = itemXml.match(/<geo:long>([-\d.]+)<\/geo:long>/i);
    if (!latMatch || !lonMatch) continue;

    const eventId = getGdacsTag(itemXml, 'gdacs:eventid');
    const episodeId = getGdacsTag(itemXml, 'gdacs:episodeid');
    const title = getGdacsTag(itemXml, 'title').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<');
    const country = getGdacsTag(itemXml, 'gdacs:country');
    const alertLevel = getGdacsTag(itemXml, 'gdacs:alertlevel');
    const link = getGdacsTag(itemXml, 'link').replace(/&amp;/g, '&');

    events.push({
      id: `gdacs-${eventType}-${eventId}-${episodeId}`,
      title,
      category: 'gdacs',
      type: mapped.type,
      icon: mapped.icon,
      severity: normalizeGdacsSeverity(alertLevel),
      lat: parseFloat(latMatch[1]),
      lng: parseFloat(lonMatch[1]),
      date: getGdacsTag(itemXml, 'pubDate'),
      area: country || undefined,
      source: link || 'https://www.gdacs.org/',
      provider: 'GDACS',
    });
  }

  return events;
}

/**
 * One read per window, however many readers.
 *
 * Live Alerts lists these warnings, so every open dashboard now asks for them
 * every five minutes — without this, each of those asks would be three more
 * requests to NASA, the National Weather Service and GDACS. The cache also
 * keeps the last good list when a provider has a bad minute, which matters
 * more here than anywhere else in the app: an empty warnings panel reads as
 * "nothing is happening", and that is not the same as "we could not ask".
 */
const loadEvents = cachedSource<WeatherEvent>('weather:events', collectEvents, 3 * 60_000);

export async function GET() {
  try {
    const events = await loadEvents();
    return NextResponse.json({
      events,
      total: events.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('Weather API error:', error);
    return NextResponse.json({ events: [], error: 'Failed to fetch weather data' }, { status: 500 });
  }
}

async function collectEvents(): Promise<WeatherEvent[]> {
  {
    const [eonetRes, nwsRes, gdacsRes] = await Promise.allSettled([
      stealthFetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100', {
        signal: AbortSignal.timeout(10000),
      }),
      fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert', {
        headers: {
          Accept: 'application/geo+json',
          'User-Agent': 'OSIRIS Severe Weather Layer',
        },
        signal: AbortSignal.timeout(10000),
      }),
      stealthFetch('https://www.gdacs.org/xml/rss.xml', {
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    const events: WeatherEvent[] = [];
    let providerSucceeded = false;

    if (eonetRes.status === 'fulfilled' && eonetRes.value.ok) {
      try {
        const data = (await eonetRes.value.json()) as EonetResponse;
        providerSucceeded = true;

        for (const event of data.events || []) {
          const geom = event.geometry && event.geometry.length > 0 ? event.geometry[event.geometry.length - 1] : null;
          if (!geom || geom.type !== 'Point' || !geom.coordinates) continue;

          const category = event.categories?.[0]?.id || 'unknown';

          // We already track wildfires via FIRMS, so we skip EONET wildfires
          if (category === 'wildfires') continue;

          let typeLabel = 'Event';
          let icon = 'alert';
          let severity: Severity = 'low';

          if (category === 'severeStorms') {
            typeLabel = 'Severe Storm';
            icon = 'cyclone';
            severity = 'high';
          } else if (category === 'volcanoes') {
            typeLabel = 'Volcano Eruption';
            icon = 'volcano';
            severity = 'high';
          } else if (category === 'seaIce') {
            typeLabel = 'Iceberg / Sea Ice';
            icon = 'ice';
            severity = 'medium';
          } else if (category === 'earthquakes') {
            continue;
          } else {
            typeLabel = event.categories?.[0]?.title || 'Anomaly';
          }

          events.push({
            id: `eonet-${event.id}`,
            title: event.title,
            category,
            type: typeLabel,
            icon,
            severity,
            lat: geom.coordinates[1],
            lng: geom.coordinates[0],
            date: geom.date,
            source: event.sources?.[0]?.url || 'NASA EONET',
            provider: 'NASA EONET',
          });
        }
      } catch (error) {
        console.error('NASA EONET normalization error:', error);
      }
    }

    if (nwsRes.status === 'fulfilled' && nwsRes.value.ok) {
      try {
        const data = (await nwsRes.value.json()) as NwsResponse;
        providerSucceeded = true;

        for (const feature of data.features || []) {
          const props = feature.properties || {};
          const coords = getRepresentativePoint(feature.geometry);
          if (!coords) continue;

          events.push({
            id: `nws-${props.id || props['@id'] || props.event || coords.lat}`,
            title: props.headline || props.event || 'NWS Weather Alert',
            category: 'weatherAlerts',
            type: props.event || 'Weather Alert',
            icon: 'weather',
            severity: normalizeNwsSeverity(props.severity),
            lat: coords.lat,
            lng: coords.lng,
            date: props.effective || props.sent,
            expires: props.expires,
            area: props.areaDesc,
            source: props['@id'] || 'https://api.weather.gov/alerts/active',
            provider: 'NOAA/NWS',
          });
        }
      } catch (error) {
        console.error('NOAA/NWS normalization error:', error);
      }
    }

    if (gdacsRes.status === 'fulfilled' && gdacsRes.value.ok) {
      try {
        const xml = await gdacsRes.value.text();
        events.push(...parseGdacsRss(xml));
        providerSucceeded = true;
      } catch (error) {
        console.error('GDACS normalization error:', error);
      }
    }

    /* Every provider failed: throw rather than return nothing, so the cache
       serves the last good warnings instead of an empty panel. */
    if (!providerSucceeded) throw new Error('no weather provider answered');

    return events;
  }
}

function normalizeNwsSeverity(severity?: string): Severity {
  switch (severity) {
    case 'Extreme':
    case 'Severe':
      return 'high';
    case 'Moderate':
      return 'medium';
    default:
      return 'low';
  }
}

function getRepresentativePoint(geometry?: NwsGeometry | null) {
  if (!geometry) return null;

  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates;
    return { lat, lng };
  }

  if (geometry.type === 'Polygon') {
    return averageCoordinates(geometry.coordinates?.[0]);
  }

  if (geometry.type === 'MultiPolygon') {
    return averageCoordinates(geometry.coordinates?.[0]?.[0]);
  }

  return null;
}

function averageCoordinates(coords?: number[][]) {
  if (!coords || coords.length === 0) return null;

  const totals = coords.reduce(
    (acc, coord) => {
      acc.lng += coord[0];
      acc.lat += coord[1];
      return acc;
    },
    { lat: 0, lng: 0 }
  );

  return {
    lat: totals.lat / coords.length,
    lng: totals.lng / coords.length,
  };
}
