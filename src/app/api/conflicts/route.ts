import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Conflict zones and the headlines that mention them
 *
 * Two different things, kept apart:
 * 1. The zones: a curated list kept by hand. Each zone's position is a
 *    label anchor for the region and its severity is an editorial rating;
 *    neither is measured from live data.
 * 2. Headlines: items from world-news RSS feeds (BBC, Al Jazeera, NYT) that
 *    mention a zone. A headline names a place; it does not say where an event
 *    happened, so headlines carry no coordinates and are listed under their
 *    zone rather than plotted as points.
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
  headlines: Headline[];
  headlineCount: number;
}

interface Headline {
  title: string;
  url: string;
  source: string;
}

const RSS_FEEDS = [
  { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC News' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', source: 'The New York Times' },
];

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

/**
 * The zone a headline is about, or null.
 *
 * Every word of one of the zone's queries has to appear as a whole word: a
 * bare substring test let "war" match "warning", and a fallback on the zone's
 * name alone matched any story that named the country in passing.
 */
export function matchZone(text: string): (typeof KNOWN_CONFLICTS)[number] | null {
  const words = new Set<string>();
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? []) {
    words.add(w);
    // "Ukraine-Russia" names Ukraine; "airstrikes" is an airstrike.
    if (w.includes('-')) w.split('-').forEach(part => words.add(part));
    if (w.length > 3 && w.endsWith('s')) words.add(w.slice(0, -1));
  }
  return KNOWN_CONFLICTS.find(zone =>
    zone.queries.some(q => q.toLowerCase().split(' ').every(term => words.has(term))),
  ) ?? null;
}

async function fetchHeadlinesByZone(): Promise<Record<string, Headline[]>> {
  const byZone: Record<string, Headline[]> = {};

  try {
    const https = require('https');
    const http = require('http');

    const fetchRSS = (url: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, family: 4 }, (res: any) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
             return fetchRSS(url.startsWith('https') && res.headers.location.startsWith('/') ? `https://${new URL(url).host}${res.headers.location}` : res.headers.location).then(resolve).catch(reject);
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Status: ${res.statusCode}`));
          }
          let data = '';
          res.on('data', (chunk: string) => data += chunk);
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
    };

    const feedPromises = RSS_FEEDS.map(async ({ url, source }) => {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
          },
          signal: AbortSignal.timeout(8000),
          cache: 'no-store'
        });
        
        if (!res.ok) {
          console.log(`[OSIRIS] RSS Fetch Failed for ${url}: ${res.status}`);
          return [];
        }
        
        const xml = await res.text();
        const rawItems = xml.split(/<item>/i).slice(1);
        console.log(`[OSIRIS] RSS ${url} returned ${rawItems.length} items`);
        
        return rawItems.map(rawItem => {
          const item = rawItem.split(/<\/item>/i)[0];
          const titleMatch = item.match(/<title>(.*?)<\/title>/i) || item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i);
          const linkMatch = item.match(/<link>(.*?)<\/link>/i);
          const descMatch = item.match(/<description>(.*?)<\/description>/i) || item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/i);
          
          if (!titleMatch) return null;
          return {
            title: titleMatch[1].replace(/<[^>]*>/g, '').trim(),
            link: linkMatch ? linkMatch[1] : '',
            desc: descMatch ? descMatch[1].replace(/<[^>]*>/g, '').trim() : '',
            source,
          };
        }).filter(Boolean);
      } catch (err) {
        console.log(`[OSIRIS] RSS Fetch Error for ${url}:`, (err as Error).message);
        return [];
      }
    });

    const feedResults = await Promise.all(feedPromises);
    const combinedItems = feedResults.flat();

    // File each headline under the one zone it mentions
    const seen = new Set<string>();
    for (const item of combinedItems) {
      if (!item) continue;
      const zone = matchZone(`${item.title} ${item.desc}`);
      if (!zone) continue;

      // Several feeds carry the same story
      const title = item.title.substring(0, 150);
      if (seen.has(title)) continue;
      seen.add(title);

      (byZone[zone.id] ??= []).push({ title, url: item.link, source: item.source });
    }
  } catch (e) {
    console.error('OSINT Conflict Fetch Error:', e);
  }

  return byZone;
}

export async function GET() {
  try {
    const byZone = await fetchHeadlinesByZone();

    const zones: ConflictZone[] = KNOWN_CONFLICTS.map(zone => ({
      id: zone.id,
      label: zone.label,
      severity: zone.severity,
      lat: zone.lat,
      lng: zone.lng,
      description: zone.description,
      sourceUrl: zone.sourceUrl,
      region: zone.region,
      headlines: (byZone[zone.id] ?? []).slice(0, 20),
      headlineCount: byZone[zone.id]?.length ?? 0,
    }));

    return NextResponse.json({
      zones,
      totalZones: zones.length,
      totalHeadlines: zones.reduce((n, z) => n + z.headlineCount, 0),
      // Counted from the curated ratings above, not measured.
      activeWarzones: zones.filter(z => z.severity === 'war').length,
      zoneSource: 'curated',
      timestamp: new Date().toISOString(),
      sources: RSS_FEEDS.map(f => f.source),
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
      headlines: [],
      headlineCount: 0,
    }));

    return NextResponse.json({
      zones: fallbackZones,
      totalZones: fallbackZones.length,
      totalHeadlines: 0,
      activeWarzones: fallbackZones.filter(z => z.severity === 'war').length,
      zoneSource: 'curated',
      timestamp: new Date().toISOString(),
      sources: ['fallback'],
      refreshInterval: 60,
    }, {
      headers: { 'Cache-Control': 'no-cache' },
    });
  }
}
