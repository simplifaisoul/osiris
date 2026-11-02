import { NextResponse } from 'next/server';
import { GET as getFires } from '../fires/route';
import { GET as getDisasterAlerts } from '../gdelt/route';
import { fetchGdeltEvents } from '@/lib/gdeltEvents';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * OSIRIS — SCM Supplier Risk Overlay
 * Calculates intersection between live global threats (earthquakes, fires,
 * disaster alerts, reported conflict) and static Tier 1/2 supplier coordinates.
 *
 * The sibling feeds are called in-process. They used to be fetched from
 * http://127.0.0.1:3000, which exists on a developer's machine and nowhere
 * else, so in a deployment the fire and conflict checks never ran.
 */

type Point = { lat: number; lng: number };
type Signal = 'earthquakes' | 'fires' | 'disaster_alerts' | 'conflict';
/** A fire hotspot or a GDACS alert, as those feeds return them. */
type Located = Point & { type?: string };
type Quake = Point & { mag: number };
type UsgsFeature = { geometry: { coordinates: number[] }; properties: { mag: number } };

const GDACS_TYPE_LABELS: Record<string, string> = {
  weather: 'TROPICAL CYCLONE', flood: 'FLOOD', volcano: 'VOLCANO', drought: 'DROUGHT',
};

const SUPPLIERS = [
  // Semiconductor & Electronics (Taiwan, Korea, Japan)
  { id: 'sup-tsmc-hsinchu', name: 'TSMC Fab 12 (Tier 1)', city: 'Hsinchu', country: 'Taiwan', lat: 24.774, lng: 120.992, category: 'Semiconductor' },
  { id: 'sup-tsmc-tainan', name: 'TSMC Fab 14 (Tier 1)', city: 'Tainan', country: 'Taiwan', lat: 23.111, lng: 120.273, category: 'Semiconductor' },
  { id: 'sup-sec-giheung', name: 'Samsung Electronics (Tier 1)', city: 'Giheung', country: 'South Korea', lat: 37.221, lng: 127.098, category: 'Semiconductor' },
  { id: 'sup-sk-icheon', name: 'SK Hynix (Tier 1)', city: 'Icheon', country: 'South Korea', lat: 37.256, lng: 127.483, category: 'Semiconductor' },
  { id: 'sup-sony-kumamoto', name: 'Sony Semiconductor (Tier 2)', city: 'Kikuyo', country: 'Japan', lat: 32.883, lng: 130.825, category: 'Electronics' },
  { id: 'sup-mlcc-murata', name: 'Murata MLCC (Tier 2)', city: 'Izumo', country: 'Japan', lat: 35.361, lng: 132.756, category: 'Electronics' },
  
  // Automotive & Machinery (Europe, Mexico)
  { id: 'sup-bosch-stuttgart', name: 'Bosch Auto Parts (Tier 1)', city: 'Stuttgart', country: 'Germany', lat: 48.815, lng: 9.176, category: 'Automotive' },
  { id: 'sup-zf-bavaria', name: 'ZF Friedrichshafen (Tier 1)', city: 'Friedrichshafen', country: 'Germany', lat: 47.662, lng: 9.489, category: 'Automotive' },
  { id: 'sup-valeo-paris', name: 'Valeo R&D (Tier 2)', city: 'Paris', country: 'France', lat: 48.878, lng: 2.308, category: 'Automotive' },
  { id: 'sup-magna-celaya', name: 'Magna Assembly (Tier 2)', city: 'Celaya', country: 'Mexico', lat: 20.525, lng: -100.814, category: 'Automotive' },
  { id: 'sup-denso-monterrey', name: 'Denso Corp (Tier 1)', city: 'Monterrey', country: 'Mexico', lat: 25.772, lng: -100.174, category: 'Automotive' },

  // Battery & Energy (China, US)
  { id: 'sup-catl-ningde', name: 'CATL Battery HQ (Tier 1)', city: 'Ningde', country: 'China', lat: 26.666, lng: 119.544, category: 'Battery' },
  { id: 'sup-byd-shenzhen', name: 'BYD Gigafactory (Tier 1)', city: 'Shenzhen', country: 'China', lat: 22.684, lng: 114.341, category: 'Battery' },
  { id: 'sup-panasonic-nevada', name: 'Panasonic Giga (Tier 1)', city: 'Sparks', country: 'US', lat: 39.539, lng: -119.439, category: 'Battery' },
];

export async function GET() {
  const dynamicSuppliers = [...SUPPLIERS].map(s => ({ ...s, risk_level: 'NORMAL', active_threats: [] as string[] }));

  // Fast distance approximation (km)
  const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dx = (lng1 - lng2) * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    const dy = lat1 - lat2;
    return Math.sqrt(dx * dx + dy * dy) * 111.32;
  };

  const near = <T extends Point>(points: T[], sup: Point, km: number) =>
    points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && getDistanceKm(sup.lat, sup.lng, p.lat, p.lng) < km);
  const raise = (sup: { risk_level: string }, level: 'HIGH' | 'CRITICAL') => {
    if (level === 'CRITICAL' || sup.risk_level === 'NORMAL') sup.risk_level = level;
  };

  // Each source on its own: one failing must not take the others with it.
  const [eq, fire, disaster, conflict] = await Promise.allSettled([
    fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson', { signal: AbortSignal.timeout(8000) })
      .then(async (r): Promise<Quake[]> => {
        if (!r.ok) throw new Error(`USGS ${r.status}`);
        const features: UsgsFeature[] = (await r.json()).features ?? [];
        return features.map(f => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], mag: f.properties.mag }));
      }),
    getFires().then(async (r): Promise<Located[]> => { if (!r.ok) throw new Error(`fires ${r.status}`); return (await r.json()).fires ?? []; }),
    getDisasterAlerts().then(async (r): Promise<Located[]> => {
      const body = await r.json();
      if (!r.ok || body.error) throw new Error(body.error || `GDACS ${r.status}`);
      return body.events ?? [];
    }),
    // GDELT quad class 4 is material conflict: protests, force, assault, fighting.
    fetchGdeltEvents({ quads: [4], minArticles: 2, limit: 2000 }).then(r => r.events),
  ]);

  const failed: Signal[] = [];

  if (eq.status === 'fulfilled') {
    dynamicSuppliers.forEach(sup => {
      const nearbyEq = near(eq.value, sup, 150);
      if (nearbyEq.length > 0) {
        raise(sup, 'CRITICAL');
        sup.active_threats.push(`SEISMIC SHOCK (M${Math.max(...nearbyEq.map(e => e.mag)).toFixed(1)})`);
      }
    });
  } else failed.push('earthquakes');

  if (fire.status === 'fulfilled') {
    const fires = fire.value.filter(f => f.type !== 'volcano');
    dynamicSuppliers.forEach(sup => {
      const nearbyFires = near(fires, sup, 50);
      if (nearbyFires.length > 0) {
        raise(sup, 'HIGH');
        sup.active_threats.push(`WILDFIRE PROXIMITY (${nearbyFires.length} hotspots)`);
      }
    });
  } else failed.push('fires');

  if (disaster.status === 'fulfilled') {
    // Earthquakes and wildfires are counted from USGS and FIRMS above.
    const alerts = disaster.value.filter(e => e.type && GDACS_TYPE_LABELS[e.type]);
    dynamicSuppliers.forEach(sup => {
      for (const label of new Set(near(alerts, sup, 150).map(e => GDACS_TYPE_LABELS[e.type!]))) {
        raise(sup, 'HIGH');
        sup.active_threats.push(`GDACS ALERT: ${label}`);
      }
    });
  } else failed.push('disaster_alerts');

  if (conflict.status === 'fulfilled') {
    dynamicSuppliers.forEach(sup => {
      const reports = near(conflict.value, sup, 100);
      if (reports.length > 0) {
        // News-reported, not confirmed on the ground, so HIGH rather than CRITICAL.
        raise(sup, 'HIGH');
        sup.active_threats.push(`CONFLICT REPORTED NEARBY (${reports.length} GDELT events)`);
      }
    });
  } else failed.push('conflict');

  if (failed.length) console.warn('[OSIRIS] SCM risk: signals unavailable:', failed.join(', '));

  return NextResponse.json({
    suppliers: dynamicSuppliers,
    total: dynamicSuppliers.length,
    critical_count: dynamicSuppliers.filter(s => s.risk_level === 'CRITICAL').length,
    // A supplier at NORMAL means "nothing found" only for the signals that ran.
    degraded_signals: failed,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
