import { NextResponse } from 'next/server';
import { fetchScotlandPicture } from '../../scotland';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * OSIRIS — a Traffic Scotland camera's current picture.
 *
 * Traffic Scotland publishes a camera's picture only inside that camera's map
 * popup, as an inline JPEG (see ../../scotland). This reads the popup and
 * answers with the picture. Each one is kept for a minute, so a camera that
 * many people have open costs Traffic Scotland one request a minute.
 *
 *   /api/cctv/scotland/picture?sid=1  → image/jpeg, or 404 while the camera is down
 */

const TTL_MS = 60_000;
const MAX_ENTRIES = 500;

const cache = new Map<string, { until: number; jpeg: Buffer | null }>();

/** For tests. */
export const clearScotlandPictureCache = () => cache.clear();

export async function GET(req: Request) {
  const sid = new URL(req.url).searchParams.get('sid') ?? '';
  if (!/^\d{1,5}$/.test(sid)) return NextResponse.json({ error: 'unknown camera' }, { status: 400 });

  let hit = cache.get(sid);
  if (!hit || Date.now() >= hit.until) {
    hit = { until: Date.now() + TTL_MS, jpeg: await fetchScotlandPicture(sid).catch(() => null) };
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(sid, hit);
  }
  if (!hit.jpeg) return NextResponse.json({ error: 'camera unavailable' }, { status: 404 });
  return new NextResponse(new Uint8Array(hit.jpeg), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=60' },
  });
}
