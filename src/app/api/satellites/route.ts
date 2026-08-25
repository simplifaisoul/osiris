
import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';
import { propagateTLE } from '@/lib/orbit';

export const maxDuration = 60;

/**
 * OSIRIS — Satellite Tracking API
 * Fetches TLE data from multiple sources with fallbacks
 * Computes real-time positions using simplified SGP4
 */

// Mission classification by NORAD name keywords
const MISSION_CLASSIFY: Record<string, { mission: string; color: string }> = {
  'USA': { mission: 'Military Recon', color: '#FF3D3D' },
  'NROL': { mission: 'NRO Classified', color: '#FF3D3D' },
  'LACROSSE': { mission: 'SAR Imaging', color: '#00E5FF' },
  'MENTOR': { mission: 'SIGINT', color: '#FFFFFF' },
  'ORION': { mission: 'SIGINT', color: '#FFFFFF' },
  'TRUMPET': { mission: 'SIGINT', color: '#FFFFFF' },
  'GPS': { mission: 'Navigation', color: '#448AFF' },
  'NAVSTAR': { mission: 'Navigation', color: '#448AFF' },
  'GLONASS': { mission: 'Navigation', color: '#448AFF' },
  'GALILEO': { mission: 'Navigation', color: '#448AFF' },
  'BEIDOU': { mission: 'Navigation', color: '#448AFF' },
  'SBIRS': { mission: 'Early Warning', color: '#FF00FF' },
  'DSP': { mission: 'Early Warning', color: '#FF00FF' },
  'STARLINK': { mission: 'Commercial Comms', color: '#00E676' },
  'ONEWEB': { mission: 'Commercial Comms', color: '#00E676' },
  'PLANET': { mission: 'Earth Imaging', color: '#00E676' },
  'WORLDVIEW': { mission: 'Commercial Imaging', color: '#00E676' },
  'ISS': { mission: 'Space Station', color: '#FFD700' },
  'TIANGONG': { mission: 'Space Station', color: '#FFD700' },
  'COSMOS': { mission: 'Russian Military', color: '#FF6B6B' },
  'YAOGAN': { mission: 'Chinese Recon', color: '#FF6B6B' },
  'FENGYUN': { mission: 'Weather', color: '#87CEEB' },
  'GOES': { mission: 'Weather', color: '#87CEEB' },
  'NOAA': { mission: 'Weather', color: '#87CEEB' },
  'METEOSAT': { mission: 'Weather', color: '#87CEEB' },
  'LANDSAT': { mission: 'Earth Observation', color: '#90EE90' },
  'SENTINEL': { mission: 'Earth Observation', color: '#90EE90' },
  'TERRA': { mission: 'Earth Science', color: '#90EE90' },
  'AQUA': { mission: 'Earth Science', color: '#90EE90' },
  'HUBBLE': { mission: 'Space Telescope', color: '#FFD700' },
  'JAMES WEBB': { mission: 'Space Telescope', color: '#FFD700' },
};

function classifySatellite(name: string): { mission: string; color: string } {
  const upper = name.toUpperCase();
  for (const [keyword, info] of Object.entries(MISSION_CLASSIFY)) {
    if (upper.includes(keyword)) return info;
  }
  return { mission: 'Unknown', color: '#00E5FF' };
}

/**
 * Position for one TLE, in the shape this route returns.
 *
 * This used to be a hand-rolled two-body Kepler solve: no J2, no drag, and it
 * reported geocentric latitude and altitude above a 6371 km sphere. Good
 * enough for a dot on a flat map, but the globe now draws satellites at their
 * altitude, and an orbit placed by that solve sits visibly off the satellite
 * it belongs to. src/lib/orbit.ts wraps satellite.js (already a dependency,
 * previously unused) for real SGP4/SDP4 and geodetic coordinates.
 */
function propagateSGP4Simple(line1: string, line2: string): { lat: number; lng: number; alt: number } | null {
  const p = propagateTLE(line1, line2);
  if (!p) return null;
  return {
    lat: Math.round(p.lat * 10000) / 10000,
    lng: Math.round(p.lng * 10000) / 10000,
    alt: Math.round(p.altKm),
  };
}

// CelesTrak constellation groups — many smaller groups to avoid 403 rate limits
const CT = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=';
const FMT = '&FORMAT=tle';
const CELESTRAK_GROUPS = [
  // Full catalogs
  `${CT}active${FMT}`, 
  // Use supplemental feed for Starlink to avoid strict rate limits on the primary group
  `https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle`,
  // Navigation (GPS, GLONASS, Galileo, BeiDou)
  `${CT}gps-ops${FMT}`, `${CT}glonass-operational${FMT}`, `${CT}galileo${FMT}`, `${CT}beidou${FMT}`,
  // Communications
  `${CT}oneweb${FMT}`, `${CT}iridium-NEXT${FMT}`, `${CT}globalstar${FMT}`, `${CT}orbcomm${FMT}`,
  `${CT}intelsat${FMT}`, `${CT}ses${FMT}`, `${CT}other-comm${FMT}`, `${CT}x-comm${FMT}`,
  // Stations & Science
  `${CT}stations${FMT}`, `${CT}education${FMT}`, `${CT}engineering${FMT}`, `${CT}science${FMT}`,
  // Weather & Earth observation
  `${CT}weather${FMT}`, `${CT}resource${FMT}`, `${CT}sarsat${FMT}`, `${CT}planet${FMT}`,
  `${CT}goes${FMT}`, `${CT}argos${FMT}`, `${CT}dmc${FMT}`, `${CT}spire${FMT}`,
  // Military / Government
  `${CT}military${FMT}`, `${CT}radar${FMT}`, `${CT}geodetic${FMT}`, `${CT}tdrss${FMT}`,
  // GEO belt
  `${CT}geo${FMT}`,
  // Small sats & cubesats
  `${CT}cubesat${FMT}`, `${CT}tle-new${FMT}`, `${CT}amateur${FMT}`,
  // Recently launched (catches new Starlinks)
  `${CT}last-30-days${FMT}`,
  // Visual / high-interest
  `${CT}visual${FMT}`,
  // Supplemental
  `${CT}supplemental${FMT}`,
  // Debris fields (thousands of tracked objects)
  `${CT}fengyun-1c-debris${FMT}`, `${CT}cosmos-2251-debris${FMT}`,
  `${CT}iridium-33-debris${FMT}`, `${CT}cosmos-1408-debris${FMT}`,
  // Other NOAA
  `${CT}nnss${FMT}`, `${CT}musson${FMT}`,
];

// SatNOGS Open API - Fallback source
const SATNOGS_API = 'https://db.satnogs.org/api/tle/?format=json';

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = join(process.cwd(), '.next', 'cache');
const CACHE_FILE = join(CACHE_DIR, 'satellites-tle-cache.json');

/** Save TLE data to disk so it survives server restarts */
function saveToDisk(sats: any[]) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ time: Date.now(), sats }));
  } catch { /* non-critical */ }
}

/** Load TLE data from disk (valid for 4 hours) */
function loadFromDisk(): { sats: any[]; time: number } | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    // Accept disk cache up to 4 hours old
    if (data.sats?.length > 0 && Date.now() - data.time < 14400000) {
      return data;
    }
  } catch { /* corrupted cache */ }
  return null;
}

let globalCachedSats: any[] = [];
let globalCacheTime = 0;

// On module load, try to restore from disk immediately
const diskCache = loadFromDisk();
if (diskCache && diskCache.sats.length > 0) {
  globalCachedSats = diskCache.sats;
  globalCacheTime = diskCache.time;
}

/** Parse raw 3-line TLE text into satellite objects */
function parseTLEText(text: string): { name: string; line1: string; line2: string }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const sats: { name: string; line1: string; line2: string }[] = [];
  let i = 0;
  while (i < lines.length - 1) {
    if (!lines[i].startsWith('1') && lines[i + 1]?.startsWith('1') && lines[i + 2]?.startsWith('2')) {
      sats.push({ name: lines[i].replace(/^0\s+/, '').trim(), line1: lines[i + 1], line2: lines[i + 2] });
      i += 3;
    } else if (lines[i].startsWith('1') && lines[i + 1]?.startsWith('2')) {
      const noradId = lines[i].substring(2, 7).trim();
      sats.push({ name: `SAT-${noradId}`, line1: lines[i], line2: lines[i + 1] });
      i += 2;
    } else {
      i++;
    }
  }
  return sats;
}

async function fetchCelesTrakGroup(url: string): Promise<{ name: string; line1: string; line2: string }[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
      headers: { 'User-Agent': 'OSIRIS/4.2 (satellite-tracker)' },
    });
    if (!res.ok) return [];
    const text = await res.text();
    // CelesTrak returns an error message (not TLE) if rate-limited
    if (text.includes('has not updated since') || text.length < 100) return [];
    return parseTLEText(text);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const nowTime = Date.now();
    let allSats: any[] = globalCachedSats;
    let source = 'memory-cache';

    if (globalCachedSats.length === 0 || globalCachedSats.length < 5000 || nowTime - globalCacheTime > 3600000) { // refresh if empty, too few, or stale
      
      // Primary: Fetch multiple CelesTrak groups in parallel
      const groupResults = await Promise.allSettled(
        CELESTRAK_GROUPS.map(url => fetchCelesTrakGroup(url))
      );
      
      const seen = new Set<string>();
      const merged: { name: string; line1: string; line2: string }[] = [];
      
      // 1. Add all newly fetched satellites
      for (const result of groupResults) {
        if (result.status === 'fulfilled') {
          for (const sat of result.value) {
            const noradId = sat.line1.substring(2, 7).trim();
            if (!seen.has(noradId)) {
              seen.add(noradId);
              merged.push(sat);
            }
          }
        }
      }
      
      // 2. Backfill with cached satellites that failed to fetch this time (due to rate limits)
      let backfilled = 0;
      for (const sat of globalCachedSats) {
        const noradId = sat.line1.substring(2, 7).trim();
        if (!seen.has(noradId)) {
          seen.add(noradId);
          merged.push(sat);
          backfilled++;
        }
      }
      
      if (merged.length > 500) {
        globalCachedSats = merged;
        globalCacheTime = nowTime;
        allSats = merged;
        source = `celestrak (${merged.length} TLEs: ${merged.length - backfilled} new, ${backfilled} cached)`;
        saveToDisk(merged);
      }


      // Fallback: SatNOGS if nothing yielded enough
      if (allSats.length < 500) {
        try {
          const res = await stealthFetch(SATNOGS_API, {
            signal: AbortSignal.timeout(15000),
            headers: { 'Accept': 'application/json' },
          });
          
          if (res.ok) {
            const data = await res.json();
            const fetchedSats: any[] = [];
            const seenNames = new Set<string>();

            for (const item of data) {
              const rawName = (item.tle0 || '').trim();
              const cleanName = rawName.replace(/^0\s+/, '');
              if (cleanName && item.tle1 && item.tle2 && !seenNames.has(cleanName)) {
                seenNames.add(cleanName);
                fetchedSats.push({
                  name: cleanName,
                  line1: item.tle1.trim(),
                  line2: item.tle2.trim(),
                });
              }
            }
            
            if (fetchedSats.length > 0) {
              globalCachedSats = fetchedSats;
              globalCacheTime = nowTime;
              allSats = fetchedSats;
              source = 'satnogs-api';
              saveToDisk(fetchedSats);
            }
          }
        } catch (err) {
          console.error('SatNOGS fetch error:', err);
        }
      }
    }

    // Emergency Fallback if cache is totally empty
    if (allSats.length === 0) {
      const issFallback = "1 25544U 98067A   24146.40251785  .00015505  00000-0  27885-3 0  9997\n2 25544  51.6402 189.7042 0004381 334.8091 106.8778 15.50091157455243";
      allSats = [{ name: 'ISS (FALLBACK)', line1: issFallback.split('\n')[0], line2: issFallback.split('\n')[1] }];
      source = 'emergency-fallback';
    }

    // No artificial cap — propagate all satellites, MapLibre handles it fine
    const satellites = [];
    for (const sat of allSats) {
      const pos = propagateSGP4Simple(sat.line1, sat.line2);
      if (!pos) continue;

      const classification = classifySatellite(sat.name);
      
      // High-level category for sub-layer filtering
      let category = 'other';
      const m = classification.mission;
      const upperName = sat.name.toUpperCase();
      
      // Debris detection
      if (upperName.includes(' DEB') || upperName.includes('DEBRIS') || upperName.includes(' R/B')) {
        category = 'other'; // debris goes to "other" category
      } else if (m === 'Commercial Comms' || m === 'Commercial Imaging') category = 'comms';
      else if (m === 'Navigation') category = 'navigation';
      else if (m === 'Weather' || m === 'Earth Observation' || m === 'Earth Science') category = 'earth_obs';
      else if (m === 'Military Recon' || m === 'NRO Classified' || m === 'SIGINT' || m === 'Early Warning' || m === 'Russian Military' || m === 'Chinese Recon' || m === 'SAR Imaging') category = 'military';
      else if (m === 'Space Station' || m === 'Space Telescope') category = 'science';

      satellites.push({
        name: sat.name,
        lat: pos.lat,
        lng: pos.lng,
        alt: pos.alt,
        mission: classification.mission,
        color: classification.color,
        category,
        noradId: sat.line1.substring(2, 7).trim(),
      });
    }

    const cacheControl = satellites.length < 10 
      ? 'no-store, max-age=0' 
      : 'public, s-maxage=120, stale-while-revalidate=300';

    // Count by category
    const categoryCounts: Record<string, number> = {};
    for (const s of satellites) {
      categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
    }

    return NextResponse.json({
      satellites,
      total: satellites.length,
      category_counts: categoryCounts,
      source,
      raw_count: allSats.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': cacheControl,
      },
    });
  } catch (error) {
    console.error('Satellite fetch error:', error);
    return NextResponse.json({ satellites: [], error: 'Failed to fetch satellite data' }, { status: 500 });
  }
}

