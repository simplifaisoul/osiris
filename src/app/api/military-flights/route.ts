import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';
import { classifyMilitaryAircraft, type MilitaryFlight } from '@/lib/adsb-military';

export const maxDuration = 45;

let cachedMilitary: { flights: MilitaryFlight[]; count: number; timestamp: string } | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 45000; // 45s TTL for live tactical tracking

export async function GET() {
  const now = Date.now();
  if (cachedMilitary && now - lastFetchTime < CACHE_TTL_MS) {
    return NextResponse.json(cachedMilitary, {
      headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' },
    });
  }

  const endpoints = [
    'https://opendata.adsb.fi/api/v2/mil',
    'https://api.adsb.lol/v2/mil',
  ];

  const results = await Promise.allSettled(
    endpoints.map(url => stealthFetch(url, { signal: AbortSignal.timeout(12000) }))
  );

  const seenHex = new Set<string>();
  const militaryFlights: MilitaryFlight[] = [];

  for (const res of results) {
    if (res.status === 'fulfilled' && res.value.ok) {
      try {
        const data = await res.value.json();
        const aircraftList = data.ac || data.aircraft || [];
        for (const item of aircraftList) {
          const hex = (item.hex || item.icao24 || '').toLowerCase().trim();
          if (hex && !seenHex.has(hex)) {
            const classified = classifyMilitaryAircraft(item);
            if (classified) {
              seenHex.add(hex);
              militaryFlights.push(classified);
            }
          }
        }
      } catch (e) {
        console.warn('[OSIRIS MIL] Endpoint parse error:', e);
      }
    }
  }

  const responsePayload = {
    flights: militaryFlights,
    count: militaryFlights.length,
    timestamp: new Date().toISOString(),
    status: 'ok',
  };

  if (militaryFlights.length > 0) {
    cachedMilitary = responsePayload;
    lastFetchTime = now;
  }

  return NextResponse.json(responsePayload, {
    headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' },
  });
}
