import { NextResponse } from 'next/server';
import { fetchGdeltEvents } from '@/lib/gdeltEvents';

export const maxDuration = 60;

/**
 * OSIRIS — GDELT 2.0 Geocoded Events
 * Source: GDELT Project 15-minute Events export — free, no auth required.
 * https://www.gdeltproject.org/
 *
 * Distinct from /api/gdelt, which despite its name reads GDACS disaster alerts.
 * This route serves actual GDELT event records with ActionGeo coordinates.
 */

const MAX_LIMIT = 2000;

function parseQuads(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(v => Number(v.trim()))
    .filter(v => v >= 1 && v <= 4);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const quads = parseQuads(searchParams.get('quad'));
  const minArticles = Math.max(1, Number(searchParams.get('min_articles')) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get('limit')) || 600));

  try {
    const { events, window, scanned } = await fetchGdeltEvents({ quads, minArticles, limit });

    return NextResponse.json(
      {
        events,
        total: events.length,
        scanned,
        window,
        source: 'GDELT 2.0 Events',
        timestamp: new Date().toISOString(),
      },
      {
        // GDELT publishes a new export every 15 minutes, so anything under that
        // is wasted work. Serve stale while revalidating to absorb bursts.
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      }
    );
  } catch (error) {
    console.error('[OSIRIS] GDELT events fetch failed:', error);
    return NextResponse.json(
      { events: [], total: 0, error: 'Failed to fetch GDELT events' },
      { status: 502 }
    );
  }
}
