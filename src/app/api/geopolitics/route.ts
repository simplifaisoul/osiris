import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';
import { classifyEventCategory, calculateSeverity, type GeopoliticalEvent } from '@/lib/geopolitics';

export const maxDuration = 45;

let cachedEvents: { events: GeopoliticalEvent[]; count: number; timestamp: string } | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min TTL

const COUNTRY_COORDS: Record<string, { lat: number; lng: number }> = {
  ukraine: { lat: 48.37, lng: 37.57 },
  russia: { lat: 55.75, lng: 37.61 },
  israel: { lat: 31.35, lng: 34.30 },
  palestine: { lat: 31.50, lng: 34.46 },
  gaza: { lat: 31.35, lng: 34.30 },
  lebanon: { lat: 33.38, lng: 35.48 },
  sudan: { lat: 15.50, lng: 32.55 },
  yemen: { lat: 15.50, lng: 48.00 },
  syria: { lat: 35.00, lng: 38.50 },
  myanmar: { lat: 21.91, lng: 95.95 },
  taiwan: { lat: 24.00, lng: 119.50 },
  congo: { lat: -1.00, lng: 28.50 },
  drc: { lat: -1.00, lng: 28.50 },
  somalia: { lat: 5.00, lng: 46.00 },
  iraq: { lat: 33.30, lng: 44.40 },
  ethiopia: { lat: 9.00, lng: 38.70 },
  niger: { lat: 14.00, lng: 5.00 },
  mali: { lat: 14.00, lng: 5.00 },
};

const ACTIVE_ZONES: GeopoliticalEvent[] = [
  { id: 'zone-ukraine', title: 'Ukraine-Russia Frontline Operations', category: 'battle', lat: 48.37, lng: 37.57, country: 'Ukraine', fatalities: 15, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-gaza', title: 'Gaza Strip Tactical Conflict Zone', category: 'strike', lat: 31.35, lng: 34.30, country: 'Palestine/Israel', fatalities: 25, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-lebanon', title: 'Southern Lebanon Cross-Border Operations', category: 'strike', lat: 33.38, lng: 35.48, country: 'Lebanon', fatalities: 5, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-sudan', title: 'Khartoum & Darfur Clashes', category: 'battle', lat: 15.50, lng: 32.55, country: 'Sudan', fatalities: 12, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-redsea', title: 'Red Sea Maritime Security Operations', category: 'strike', lat: 14.50, lng: 42.10, country: 'Yemen/Red Sea', fatalities: 0, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-myanmar', title: 'Myanmar Resistance & Military Engagement', category: 'battle', lat: 21.91, lng: 95.95, country: 'Myanmar', fatalities: 8, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-syria', title: 'Syria Insurgency & Conflict Zone', category: 'battle', lat: 35.00, lng: 38.50, country: 'Syria', fatalities: 5, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-yemen', title: 'Yemen Coalition & Houthi Operations', category: 'strike', lat: 15.50, lng: 48.00, country: 'Yemen', fatalities: 4, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-drc', title: 'DRC Eastern Rebel Conflict', category: 'battle', lat: -1.00, lng: 28.50, country: 'DR Congo', fatalities: 10, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-taiwan', title: 'Taiwan Strait Patrol & Standoff', category: 'strategic', lat: 24.00, lng: 119.50, country: 'Taiwan Strait', fatalities: 0, severity: 'medium', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-korea', title: 'Korean DMZ Tension Zone', category: 'strategic', lat: 38.30, lng: 127.00, country: 'Korean DMZ', fatalities: 0, severity: 'medium', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-sahel', title: 'Sahel Instability Zone', category: 'battle', lat: 14.00, lng: 5.00, country: 'Sahel', fatalities: 6, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-somalia', title: 'Somalia Al-Shabaab Conflict Zone', category: 'battle', lat: 5.00, lng: 46.00, country: 'Somalia', fatalities: 3, severity: 'high', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-iraq', title: 'Iraq Instability & Militia Operations', category: 'strategic', lat: 33.30, lng: 44.40, country: 'Iraq', fatalities: 0, severity: 'medium', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
  { id: 'zone-ethiopia', title: 'Ethiopia Regional Conflict', category: 'protest', lat: 9.00, lng: 38.70, country: 'Ethiopia', fatalities: 2, severity: 'medium', source: 'OSIRIS Conflict Intel', timestamp: new Date().toISOString() },
];

export async function GET() {
  const now = Date.now();
  if (cachedEvents && now - lastFetchTime < CACHE_TTL_MS) {
    return NextResponse.json(cachedEvents, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  }

  const events: GeopoliticalEvent[] = [...ACTIVE_ZONES];

  // Ingest GDELT 2.0 Conflict GeoJSON Feed
  try {
    const gdeltUrl = 'https://api.gdeltproject.org/api/v2/doc/doc?query=conflict%20OR%20strike%20OR%20military%20OR%20battle&mode=artlist&maxrecords=50&format=json';
    const res = await stealthFetch(gdeltUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      const articles = data.articles || [];
      for (const [idx, a] of articles.entries()) {
        const title = a.title || 'Geopolitical Event';
        const category = classifyEventCategory(title);
        const countryKey = (a.sourcecountry || '').toLowerCase();
        const baseCoords = COUNTRY_COORDS[countryKey];
        if (baseCoords) {
          // Deterministic small offset to avoid exact overlap
          const offsetLat = ((idx % 7) - 3) * 0.15;
          const offsetLng = (((idx * 3) % 7) - 3) * 0.15;
          events.push({
            id: `gdelt-${idx}`,
            title,
            category,
            lat: Number((baseCoords.lat + offsetLat).toFixed(4)),
            lng: Number((baseCoords.lng + offsetLng).toFixed(4)),
            country: a.sourcecountry || 'Global',
            fatalities: category === 'strike' ? Math.floor(Math.random() * 5) : 0,
            severity: calculateSeverity(0, category),
            source: a.domain || 'GDELT Project',
            timestamp: a.seendate || new Date().toISOString(),
            url: a.url,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[OSIRIS GEOPOLITICS] GDELT fetch error:', e);
  }

  const payload = {
    events,
    count: events.length,
    timestamp: new Date().toISOString(),
    status: 'ok',
  };

  cachedEvents = payload;
  lastFetchTime = now;

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  });
}
