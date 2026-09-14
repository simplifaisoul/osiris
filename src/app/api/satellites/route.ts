
import { NextResponse } from 'next/server';

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
  return { mission: 'Unknown', color: '#808080' };
}

function gmst(jd: number): number {
  const t = (jd - 2451545.0) / 36525.0;
  const gmstSec = 67310.54841 + (876600.0 * 3600 + 8640184.812866) * t + 0.093104 * t * t - 6.2e-6 * t * t * t;
  return ((gmstSec % 86400) / 86400.0) * 2 * Math.PI;
}

function parseTLE(tleText: string) {
  const lines = tleText.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const satellites: any[] = [];

  for (let i = 0; i < lines.length - 2; i++) {
    // Find name + line1 + line2 pattern
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue;
    if (name.startsWith('1 ') || name.startsWith('2 ')) continue;

    satellites.push({ name, line1, line2 });
    i += 2; // skip the TLE lines
  }
  return satellites;
}

function propagateSGP4Simple(line1: string, line2: string): { lat: number; lng: number; alt: number } | null {
  try {
    const incDeg = parseFloat(line2.substring(8, 16));
    const raanDeg = parseFloat(line2.substring(17, 25));
    const eccStr = '0.' + line2.substring(26, 33).trim();
    const ecc = parseFloat(eccStr);
    const argPerDeg = parseFloat(line2.substring(34, 42));
    const meanAnomDeg = parseFloat(line2.substring(43, 51));
    const meanMotion = parseFloat(line2.substring(52, 63));

    if (isNaN(meanMotion) || meanMotion === 0) return null;

    const now = new Date();
    const epochYear = parseInt(line1.substring(18, 20));
    const epochDay = parseFloat(line1.substring(20, 32));
    const fullYear = epochYear > 56 ? 1900 + epochYear : 2000 + epochYear;

    const epochDate = new Date(fullYear, 0, 1);
    epochDate.setDate(epochDate.getDate() + epochDay - 1);
    const elapsedMin = (now.getTime() - epochDate.getTime()) / 60000;

    // Reject stale TLEs (> 30 days old)
    if (Math.abs(elapsedMin) > 43200) return null;

    const n = meanMotion * 2 * Math.PI / 1440;
    const M = ((meanAnomDeg * Math.PI / 180) + n * elapsedMin) % (2 * Math.PI);

    let E = M;
    for (let j = 0; j < 10; j++) {
      E = M + ecc * Math.sin(E);
    }

    const sinV = Math.sqrt(1 - ecc * ecc) * Math.sin(E) / (1 - ecc * Math.cos(E));
    const cosV = (Math.cos(E) - ecc) / (1 - ecc * Math.cos(E));
    const v = Math.atan2(sinV, cosV);

    const a = Math.pow(398600.4418 / (meanMotion * 2 * Math.PI / 86400) ** 2, 1 / 3);
    const r = a * (1 - ecc * Math.cos(E));

    const inc = incDeg * Math.PI / 180;
    const raan = raanDeg * Math.PI / 180;
    const argPer = argPerDeg * Math.PI / 180;
    const u = v + argPer;

    const x = r * (Math.cos(raan) * Math.cos(u) - Math.sin(raan) * Math.sin(u) * Math.cos(inc));
    const y = r * (Math.sin(raan) * Math.cos(u) + Math.cos(raan) * Math.sin(u) * Math.cos(inc));
    const z = r * Math.sin(u) * Math.sin(inc);

    const jd = 2440587.5 + now.getTime() / 86400000;
    const theta = gmst(jd);

    const xRot = x * Math.cos(theta) + y * Math.sin(theta);
    const yRot = -x * Math.sin(theta) + y * Math.cos(theta);

    const lng = Math.atan2(yRot, xRot) * 180 / Math.PI;
    const lat = Math.atan2(z, Math.sqrt(xRot * xRot + yRot * yRot)) * 180 / Math.PI;
    const alt = r - 6371;

    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90) return null;
    if (alt < 100 || alt > 50000) return null; // sanity check

    return {
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(((lng + 540) % 360 - 180) * 10000) / 10000,
      alt: Math.round(alt),
    };
  } catch {
    return null;
  }
}

// Multiple TLE sources — individual groups fetched in parallel for resilience
// NOTE: The full 'active' catalog often returns empty from cloud/serverless IPs
// due to Celestrak rate-limiting. Individual groups are smaller and more reliable.
const TLE_SOURCES = [
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle', group: 'stations' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle', group: 'visual' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle', group: 'weather' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle', group: 'resource' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=sarsat&FORMAT=tle', group: 'sarsat' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle', group: 'gps' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=glo-ops&FORMAT=tle', group: 'glonass' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle', group: 'galileo' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle', group: 'beidou' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=tle', group: 'military' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=tle', group: 'science' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=geodetic&FORMAT=tle', group: 'geodetic' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=engineering&FORMAT=tle', group: 'engineering' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=education&FORMAT=tle', group: 'education' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle', group: 'starlink' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle', group: 'active-fallback' },
];

async function fetchTLEFromSource(source: typeof TLE_SOURCES[0]): Promise<string | null> {
  try {
    const res = await fetch(source.url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'OSIRIS-Intelligence-Platform/3.4' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length < 100 || text.includes('<!DOCTYPE') || text.includes('<html')) return null;
    return text;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // Fetch all groups in parallel for maximum speed & resilience
    const results = await Promise.allSettled(
      TLE_SOURCES.map(src => fetchTLEFromSource(src))
    );

    const allSats: any[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const parsed = parseTLE(result.value);
        for (const sat of parsed) {
          if (!seen.has(sat.name)) {
            seen.add(sat.name);
            allSats.push(sat);
          }
        }
      }
    }

    const source = allSats.length > 0 ? 'celestrak-groups' : 'none';

    // Sample for performance (max 2000 satellites)
    const sampled = allSats.length > 2000
      ? allSats.filter((_, i) => i % Math.ceil(allSats.length / 2000) === 0)
      : allSats;

    const satellites = [];
    for (const sat of sampled) {
      const pos = propagateSGP4Simple(sat.line1, sat.line2);
      if (!pos) continue;

      const classification = classifySatellite(sat.name);
      satellites.push({
        name: sat.name,
        lat: pos.lat,
        lng: pos.lng,
        alt: pos.alt,
        mission: classification.mission,
        color: classification.color,
      });
    }

    return NextResponse.json({
      satellites,
      total: satellites.length,
      source,
      raw_count: allSats.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Satellite fetch error:', error);
    return NextResponse.json({ satellites: [], error: 'Failed to fetch satellite data' }, { status: 500 });
  }
}

