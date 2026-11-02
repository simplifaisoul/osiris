import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — the rain radar frames for the Rain layer: the last two hours,
 * oldest first, a frame every ten minutes.
 * Source: RainViewer's public radar mosaic — no key. The browser pulls the
 * tiles straight from RainViewer's cache; RainBar builds their addresses.
 */

const TTL_MS = 2 * 60 * 1000;
const PATH = /^\/v2\/radar\/[0-9a-z]+$/i;

type Body = { host: string; frames: { time: number; path: string }[] };
let cached: { body: Body; expiresAt: number } | null = null;

export async function GET() {
  if (!cached || Date.now() > cached.expiresAt) {
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`RainViewer ${res.status}`);
      const maps = await res.json();
      const host = typeof maps?.host === 'string' && maps.host.startsWith('https://') ? maps.host : null;
      const frames = (Array.isArray(maps?.radar?.past) ? maps.radar.past : [])
        .filter((f: { time?: unknown; path?: unknown }) => Number.isFinite(f?.time) && typeof f?.path === 'string' && PATH.test(f.path))
        .map((f: { time: number; path: string }) => ({ time: f.time * 1000, path: f.path }));
      if (!host || !frames.length) throw new Error('RainViewer: no radar frames');
      cached = { body: { host, frames }, expiresAt: Date.now() + TTL_MS };
    } catch (e) {
      console.warn('[OSIRIS] rain:', e);
      if (!cached) return NextResponse.json({ error: 'Rain radar unavailable' }, { status: 502 });
    }
  }
  return NextResponse.json(cached.body, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
