import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Live Conflict Zone Intelligence API
 * 
 * Aggregates real-time conflict data from:
 * 1. GDELT GEO 2.0 API — real-time geo-located conflict events
 * 2. GDELT DOC API — article-level conflict reporting with coordinates
 * 3. Known active conflict zones — enriched with live event counts
 * 
 * All sources are free, no auth required.
 */

interface ConflictZone {
  id: string;
  label: string;
  severity: 'war' | 'high' | 'elevated' | 'moderate';
  lat: number;
  lng: number;
  description: string;
  sourceUrl: string;
  region: string;
  events: ConflictEvent[];
  eventCount: number;
  lastUpdated: string;
}

interface ConflictEvent {
  id: string;
  lat: number;
  lng: number;
  title: string;
  url: string;
  type: string;
  timestamp: string;
}

// Known active conflict zones (anchors — enriched with live data)
const KNOWN_CONFLICTS = [
  { id: 'ukraine', label: 'UKRAINE WAR', severity: 'war' as const, lat: 48.5, lng: 31.2, region: 'ukraine', 
    description: 'Ongoing Russian invasion of Ukraine — active frontlines across eastern and southern regions.',
    sourceUrl: 'https://liveuamap.com/',
    queries: ['ukraine war', 'ukraine attack', 'ukraine frontline'],
    bounds: { minLat: 44, maxLat: 53, minLng: 22, maxLng: 40 } },
  { id: 'gaza', label: 'GAZA CONFLICT', severity: 'war' as const, lat: 31.35, lng: 34.35, region: 'gaza',
    description: 'Active military operations and humanitarian crisis in Gaza Strip.',
    sourceUrl: 'https://israelpalestine.liveuamap.com/',
    queries: ['gaza attack', 'gaza airstrike', 'israel hamas'],
    bounds: { minLat: 31, maxLat: 32, minLng: 34, maxLng: 34.8 } },
  { id: 'lebanon', label: 'LEBANON BORDER', severity: 'high' as const, lat: 33.377, lng: 35.483, region: 'lebanon',
    description: 'Active cross-border military operations in southern Lebanon.',
    sourceUrl: 'https://lebanon.liveuamap.com/',
    queries: ['lebanon airstrike', 'hezbollah attack', 'lebanon military'],
    bounds: { minLat: 33, maxLat: 34.5, minLng: 35, maxLng: 36.5 } },
  { id: 'sudan', label: 'SUDAN CIVIL WAR', severity: 'war' as const, lat: 15.0, lng: 30.0, region: 'sudan',
    description: 'Armed conflict between SAF and RSF factions across Sudan.',
    sourceUrl: 'https://sudan.liveuamap.com/',
    queries: ['sudan war', 'sudan conflict', 'RSF SAF'],
    bounds: { minLat: 10, maxLat: 22, minLng: 22, maxLng: 38 } },
  { id: 'myanmar', label: 'MYANMAR CONFLICT', severity: 'war' as const, lat: 19.5, lng: 96.5, region: 'myanmar',
    description: 'Internal conflict — military junta vs opposition forces.',
    sourceUrl: 'https://myanmar.liveuamap.com/',
    queries: ['myanmar conflict', 'myanmar military', 'myanmar junta'],
    bounds: { minLat: 10, maxLat: 28, minLng: 92, maxLng: 101 } },
  { id: 'yemen', label: 'YEMEN WAR', severity: 'war' as const, lat: 15.5, lng: 48.0, region: 'yemen',
    description: 'Houthi militant operations, Red Sea maritime threats, and coalition strikes.',
    sourceUrl: 'https://yemen.liveuamap.com/',
    queries: ['yemen houthi', 'red sea attack', 'yemen strike'],
    bounds: { minLat: 12, maxLat: 20, minLng: 42, maxLng: 55 } },
  { id: 'syria', label: 'SYRIA', severity: 'high' as const, lat: 35.0, lng: 38.5, region: 'syria',
    description: 'Ongoing civil conflict and localized insurgencies.',
    sourceUrl: 'https://syria.liveuamap.com/',
    queries: ['syria attack', 'syria military', 'syria conflict'],
    bounds: { minLat: 32, maxLat: 37, minLng: 35, maxLng: 42 } },
  { id: 'drc', label: 'DRC EASTERN CONFLICT', severity: 'war' as const, lat: -1.0, lng: 28.5, region: 'drc',
    description: 'M23 rebel offensive and regional instability in eastern Congo.',
    sourceUrl: 'https://drc.liveuamap.com/',
    queries: ['congo conflict', 'M23 DRC', 'congo attack'],
    bounds: { minLat: -5, maxLat: 5, minLng: 25, maxLng: 32 } },
  { id: 'red-sea', label: 'RED SEA THREAT', severity: 'high' as const, lat: 16.0, lng: 40.0, region: 'red-sea',
    description: 'Houthi anti-ship missile and drone attacks on maritime traffic.',
    sourceUrl: 'https://yemen.liveuamap.com/',
    queries: ['red sea ship attack', 'houthi missile ship'],
    bounds: { minLat: 12, maxLat: 22, minLng: 36, maxLng: 44 } },
  { id: 'taiwan-strait', label: 'TAIWAN STRAIT', severity: 'elevated' as const, lat: 24.0, lng: 119.5, region: 'taiwan',
    description: 'Elevated military drills and regional tension.',
    sourceUrl: 'https://china.liveuamap.com/',
    queries: ['taiwan strait military', 'china taiwan'],
    bounds: { minLat: 22, maxLat: 26, minLng: 117, maxLng: 122 } },
  { id: 'korean-dmz', label: 'KOREAN DMZ', severity: 'elevated' as const, lat: 38.3, lng: 127.0, region: 'korea',
    description: 'Ongoing cross-border tension and military posturing.',
    sourceUrl: 'https://liveuamap.com/',
    queries: ['north korea military', 'korean dmz'],
    bounds: { minLat: 37, maxLat: 39.5, minLng: 124, maxLng: 130 } },
  { id: 'sahel', label: 'SAHEL INSTABILITY', severity: 'high' as const, lat: 14.0, lng: 5.0, region: 'sahel',
    description: 'Insurgencies and military coups across Mali, Burkina Faso, Niger.',
    sourceUrl: 'https://africa.liveuamap.com/',
    queries: ['sahel insurgency', 'mali burkina niger conflict'],
    bounds: { minLat: 10, maxLat: 20, minLng: -5, maxLng: 15 } },
  { id: 'somalia', label: 'SOMALIA', severity: 'high' as const, lat: 5.0, lng: 46.0, region: 'somalia',
    description: 'Al-Shabaab insurgency and counter-terrorism operations.',
    sourceUrl: 'https://africa.liveuamap.com/',
    queries: ['somalia al-shabaab', 'somalia attack'],
    bounds: { minLat: -2, maxLat: 12, minLng: 40, maxLng: 52 } },
  { id: 'iraq', label: 'IRAQ INSTABILITY', severity: 'elevated' as const, lat: 33.3, lng: 44.4, region: 'iraq',
    description: 'Ongoing militia activity and counter-terrorism operations.',
    sourceUrl: 'https://iraq.liveuamap.com/',
    queries: ['iraq militia', 'iraq attack', 'iraq isis'],
    bounds: { minLat: 29, maxLat: 37.5, minLng: 38, maxLng: 49 } },
  { id: 'ethiopia', label: 'ETHIOPIA', severity: 'elevated' as const, lat: 9.0, lng: 38.7, region: 'ethiopia',
    description: 'Ethnic tensions and regional conflicts across multiple regions.',
    sourceUrl: 'https://africa.liveuamap.com/',
    queries: ['ethiopia conflict', 'tigray amhara'],
    bounds: { minLat: 3, maxLat: 15, minLng: 33, maxLng: 48 } },
];

// Parse GDELT DOC pointdata CSV response into events
function parsePointDataCSV(csv: string): ConflictEvent[] {
  const events: ConflictEvent[] = [];
  const lines = csv.trim().split('\n');
  // CSV format: lat\tlng\tname\turl (tab-separated)
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue;
    
    const name = (parts[2] || 'Conflict Event').replace(/<[^>]*>/g, '').trim();
    const url = parts[3] || '';
    
    events.push({
      id: `gdelt-pt-${events.length}`,
      lat, lng,
      title: name.substring(0, 150),
      url,
      type: 'conflict',
      timestamp: new Date().toISOString(),
    });
  }
  return events;
}

// Main comprehensive conflict query — fetches from GDELT DOC API (pointdata mode)
async function fetchAllLiveConflictData(): Promise<{ events: ConflictEvent[]; eventsByRegion: Record<string, number> }> {
  // A single broad query keeps the whole route well under the client timeout.
  // The previous 3-query loop spaced 6s apart (plus a 6s DOC-fallback delay)
  // could run ~90s and time the endpoint out entirely, so the layer returned
  // nothing. One combined GDELT query returns comparable coverage in ~10s.
  const conflictQueries = [
    'airstrike OR missile OR shelling OR bombing OR frontline OR drone strike OR war casualties',
  ];

  const allEvents: ConflictEvent[] = [];
  const eventsByRegion: Record<string, number> = {};

  // Sequential requests with 6s delay between each (GDELT enforces 1 per 5s)
  for (let i = 0; i < conflictQueries.length; i++) {
    if (i > 0) await new Promise(resolve => setTimeout(resolve, 6000));
    
    try {
      const query = conflictQueries[i];
      const encodedQuery = encodeURIComponent(query);
      
      // Try GEO API first (returns GeoJSON with coordinates)
      const geoUrl = `https://api.gdeltproject.org/api/v2/geo/geo?query=${encodedQuery}&format=GeoJSON&timespan=72h&maxpoints=100`;
      const geoRes = await stealthFetch(geoUrl, { signal: AbortSignal.timeout(10000) });
      
      if (geoRes.ok) {
        const contentType = geoRes.headers.get('content-type') || '';
        const text = await geoRes.text();
        
        // Check if it's actually JSON (not HTML error page)
        if (text.startsWith('{') || contentType.includes('json')) {
          try {
            const data = JSON.parse(text);
            if (data?.features) {
              for (const feature of data.features) {
                const coords = feature.geometry?.coordinates;
                if (!coords || coords.length < 2) continue;
                
                const lat = coords[1];
                const lng = coords[0];
                const title = feature.properties?.name || 
                  feature.properties?.html?.replace(/<[^>]*>/g, '').slice(0, 150) || 
                  'Conflict Event';
                
                // Deduplicate by proximity
                const isDupe = allEvents.some(e => 
                  Math.abs(e.lat - lat) < 0.3 && Math.abs(e.lng - lng) < 0.3
                );
                if (isDupe) continue;

                allEvents.push({
                  id: `gdelt-live-${allEvents.length}`,
                  lat, lng,
                  title: title.substring(0, 150),
                  url: feature.properties?.url || '',
                  type: 'conflict',
                  timestamp: new Date().toISOString(),
                });
              }
              continue; // GEO worked, skip DOC fallback
            }
          } catch { /* parse failed, try DOC fallback */ }
        }
      }

      // Fallback: DOC API pointdata mode (CSV with lat/lng). Short spacing so a
      // single GEO miss doesn't push the route past the client timeout.
      await new Promise(resolve => setTimeout(resolve, 1500));
      const docUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodedQuery}&mode=pointdata&format=csv&timespan=72h&maxrecords=80`;
      const docRes = await stealthFetch(docUrl, { signal: AbortSignal.timeout(10000) });
      
      if (docRes.ok) {
        const csv = await docRes.text();
        if (!csv.includes('<!DOCTYPE') && !csv.includes('limit requests')) {
          const parsed = parsePointDataCSV(csv);
          for (const event of parsed) {
            const isDupe = allEvents.some(e => 
              Math.abs(e.lat - event.lat) < 0.3 && Math.abs(e.lng - event.lng) < 0.3
            );
            if (!isDupe) allEvents.push(event);
          }
        }
      }
    } catch {
      // Individual query failure is non-fatal
    }
  }

  // Classify events into conflict regions
  for (const event of allEvents) {
    for (const zone of KNOWN_CONFLICTS) {
      if (event.lat >= zone.bounds.minLat && event.lat <= zone.bounds.maxLat &&
          event.lng >= zone.bounds.minLng && event.lng <= zone.bounds.maxLng) {
        eventsByRegion[zone.id] = (eventsByRegion[zone.id] || 0) + 1;
      }
    }
  }

  return { events: allEvents, eventsByRegion };
}

export async function GET() {
  try {
    // Fetch live conflict data from GDELT
    const { events: liveEvents, eventsByRegion } = await fetchAllLiveConflictData();

    // Build enriched conflict zones
    const zones: ConflictZone[] = KNOWN_CONFLICTS.map(zone => {
      // Find live events within this zone's bounds
      const zoneEvents = liveEvents.filter(e =>
        e.lat >= zone.bounds.minLat && e.lat <= zone.bounds.maxLat &&
        e.lng >= zone.bounds.minLng && e.lng <= zone.bounds.maxLng
      );

      return {
        id: zone.id,
        label: zone.label,
        severity: zone.severity,
        lat: zone.lat,
        lng: zone.lng,
        description: zone.description,
        sourceUrl: zone.sourceUrl,
        region: zone.region,
        events: zoneEvents.slice(0, 20),
        eventCount: eventsByRegion[zone.id] || zoneEvents.length,
        lastUpdated: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      zones,
      liveEvents: liveEvents.slice(0, 500),
      totalZones: zones.length,
      totalLiveEvents: liveEvents.length,
      activeWarzones: zones.filter(z => z.severity === 'war').length,
      timestamp: new Date().toISOString(),
      sources: ['GDELT GEO 2.0', 'GDELT DOC 2.0'],
      refreshInterval: 300, // suggest 5 min refresh
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('[OSIRIS] Conflict API error:', error);
    
    // Fallback: return known zones without live enrichment
    const fallbackZones = KNOWN_CONFLICTS.map(zone => ({
      id: zone.id,
      label: zone.label,
      severity: zone.severity,
      lat: zone.lat,
      lng: zone.lng,
      description: zone.description,
      sourceUrl: zone.sourceUrl,
      region: zone.region,
      events: [],
      eventCount: 0,
      lastUpdated: new Date().toISOString(),
    }));

    return NextResponse.json({
      zones: fallbackZones,
      liveEvents: [],
      totalZones: fallbackZones.length,
      totalLiveEvents: 0,
      activeWarzones: fallbackZones.filter(z => z.severity === 'war').length,
      timestamp: new Date().toISOString(),
      sources: ['fallback'],
      refreshInterval: 60,
    }, {
      headers: { 'Cache-Control': 'no-cache' },
    });
  }
}
