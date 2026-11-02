import { NextResponse, type NextRequest } from 'next/server';
import { decodeGrib2, frameSource, gfsRuns, gfsUrl, toWindField, windTimes, type WindField } from '@/lib/wind-field';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — global surface wind for the Wind layer, through time.
 * Source: NOAA GFS via NOMADS — public, no key. A new run every six hours.
 *
 *   GET /api/wind              the newest run and the times its slider offers
 *   GET /api/wind?run=…&t=…    the wind at one of those times
 *
 * The past is older runs' own analyses; the future is the newest run's
 * forecast. Each file is fetched once and shared by everyone, and NOMADS asks
 * to be used gently, so no more than two downloads run at a time.
 */

const HOUR = 3600_000;
/** How often to look for a newer run. */
const RUN_TTL_MS = 30 * 60_000;
/** Decoded files held, least recently used dropped first: the whole slider and then some. */
const MAX_FILES = 120;
/** NOMADS keeps ten days of runs; stay clear of the oldest, which may be mid-deletion. */
const KEEP_MS = 9 * 24 * HOUR;
const MAX_DOWNLOADS = 2;

let newest: { run: number; checkedAt: number } | null = null;
let probing: Promise<number> | null = null;
const files = new Map<string, WindField>();
const inflight = new Map<string, Promise<WindField | null>>();

let downloads = 0;
const waiting: (() => void)[] = [];
async function gently<T>(job: () => Promise<T>): Promise<T> {
  while (downloads >= MAX_DOWNLOADS) await new Promise<void>(resolve => waiting.push(resolve));
  downloads++;
  try {
    return await job();
  } finally {
    downloads--;
    waiting.shift()?.();
  }
}

/** One GFS file, decoded; null when NOMADS doesn't have it (not posted yet, or cleared). */
function gfsFile(cycle: number, fh: number): Promise<WindField | null> {
  const key = `${cycle}/${fh}`;
  const hit = files.get(key);
  if (hit) {
    files.delete(key);
    files.set(key, hit);
    return Promise.resolve(hit);
  }
  let job = inflight.get(key);
  if (!job) {
    job = gently(async () => {
      const res = await fetch(gfsUrl(cycle, fh), { signal: AbortSignal.timeout(30_000), cache: 'no-store' });
      // 403 is NOMADS' "Request for Future Data"; 404 is a file it no longer has.
      if (res.status === 403 || res.status === 404) return null;
      if (!res.ok) throw new Error(`NOMADS ${res.status}`);
      return toWindField(decodeGrib2(new Uint8Array(await res.arrayBuffer())), new Date(cycle).toISOString());
    }).then(field => {
      if (field) {
        files.set(key, field);
        while (files.size > MAX_FILES) files.delete(files.keys().next().value!);
      }
      return field;
    }).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}

/** The newest run on NOMADS. A failed check keeps the run already known. */
function newestRun(): Promise<number> {
  if (newest && Date.now() - newest.checkedAt < RUN_TTL_MS) return Promise.resolve(newest.run);
  probing ??= (async () => {
    let lastError: unknown = null;
    for (const run of gfsRuns(Date.now())) {
      if (newest && run <= newest.run) return newest.run;
      try {
        if (await gfsFile(run, 0)) return run;
      } catch (e) {
        lastError = e;
      }
    }
    if (newest) return newest.run;
    throw lastError ?? new Error('No GFS run available');
  })().then(run => {
    newest = { run, checkedAt: Date.now() };
    return run;
  }).finally(() => { probing = null; });
  return probing;
}

const iso = (t: number) => new Date(t).toISOString();

export async function GET(request: NextRequest) {
  let run: number;
  try {
    run = await newestRun();
  } catch (e) {
    console.warn('[OSIRIS] wind:', e);
    return NextResponse.json({ error: 'Wind data unavailable' }, { status: 502 });
  }

  const params = request.nextUrl.searchParams;
  if (!params.has('t')) {
    return NextResponse.json({ run: iso(run), times: windTimes(run).map(iso) }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  // Only the times a slider was offered: around a run no newer than ours.
  const asked = Date.parse(params.get('run') ?? '');
  const t = Date.parse(params.get('t') ?? '');
  if (!Number.isFinite(asked) || asked % (6 * HOUR) !== 0 || asked > run || !windTimes(asked).includes(t)) {
    return NextResponse.json({ error: 'Not a wind time' }, { status: 400 });
  }
  const { cycle, fh } = frameSource(t, asked);
  if (cycle < Date.now() - KEEP_MS) return NextResponse.json({ error: 'Older than NOMADS keeps' }, { status: 404 });
  try {
    // A file not posted yet (or already cleared) is also in the run before, six hours further on.
    const exact = await gfsFile(cycle, fh);
    const field = exact ?? await gfsFile(cycle - 6 * HOUR, fh + 6);
    if (!field) return NextResponse.json({ error: 'Not on NOMADS' }, { status: 404 });
    return NextResponse.json(field, {
      headers: { 'Cache-Control': `public, max-age=${exact ? 86400 : 3600}` },
    });
  } catch (e) {
    console.warn('[OSIRIS] wind:', e);
    return NextResponse.json({ error: 'Wind data unavailable' }, { status: 502 });
  }
}
