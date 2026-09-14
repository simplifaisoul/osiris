/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — Image Geolocation Endpoint
 *  POST /api/geolocate
 *  Predicts the real-world location an uploaded photo was taken,
 *  fanning out to one or more configured providers in parallel and
 *  merging their results into a single ranked, source-tagged list.
 * ═══════════════════════════════════════════════════════════════
 */

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { getProvider, getAllProviders } from '@/lib/geolocation';
import type { GeoCandidate, GeoResult } from '@/lib/geolocation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Limits ──
const MAX_BYTES = 10 * 1024 * 1024;            // 10 MB, matches the upload UI
const MAX_EDGE = 1568;                          // downscale long edge — keeps vision tokens/cost sane
const MAX_PROVIDERS = 5;                        // defensive cap — only 3 providers exist today
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]);

export async function GET() {
  const providers = getAllProviders().map(p => ({
    id: p.id,
    name: p.name,
    configured: p.isConfigured(),
  }));
  return NextResponse.json({ ok: true, providers });
}

type TaggedCandidate = GeoCandidate & { providerId: string; providerName: string };

interface ProviderResult {
  ok: boolean;
  providerId: string;
  providerName?: string;
  primary?: GeoResult['primary'];
  candidates?: GeoResult['candidates'];
  clues?: string[];
  error?: string;
}

export async function POST(req: Request) {
  // Rate limit — 10 analyses per minute per IP (vision calls are expensive,
  // and one analysis can now fan out to multiple upstream providers).
  const ip = getClientIp(req);
  if (isRateLimited(`geolocate:${ip}`, 10, 60_000)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Try again in a minute.' },
      { status: 429 },
    );
  }

  // ── Parse multipart form ──
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const file = form.get('image');
  const context = (form.get('context') as string | null)?.slice(0, 2000) || '';
  const mode = form.get('mode') === 'precise' ? 'precise' : 'fast';

  let providerIds: string[];
  try {
    const raw = form.get('providers') as string | null;
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((p) => typeof p === 'string')) {
      throw new Error('invalid');
    }
    providerIds = parsed;
  } catch {
    return NextResponse.json(
      { ok: false, error: '"providers" must be a non-empty JSON array of provider ids.' },
      { status: 400 },
    );
  }
  if (providerIds.length > MAX_PROVIDERS) {
    return NextResponse.json({ ok: false, error: `Select at most ${MAX_PROVIDERS} providers.` }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'No image uploaded (field "image").' }, { status: 400 });
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported type ${file.type}. Use jpg, png, webp, or heic.` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'Image exceeds 10 MB.' }, { status: 413 });
  }

  // ── Normalize to JPEG (handles HEIC/HEIF, PNG, WebP) and downscale ──
  let jpegB64: string;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const jpeg = await sharp(input, { failOn: 'none' })
      .rotate() // honour EXIF orientation before we strip metadata
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    jpegB64 = jpeg.toString('base64');
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Could not decode the image. If it is HEIC, re-export as JPG and retry.' },
      { status: 422 },
    );
  }

  // ── Fan out to every selected provider in parallel; one failure doesn't sink the rest ──
  const settled = await Promise.allSettled(
    providerIds.map(async (id): Promise<ProviderResult> => {
      const provider = getProvider(id);
      if (!provider) throw new Error(`Provider "${id}" not found.`);
      if (!provider.isConfigured()) throw new Error(`Provider "${provider.name}" is not configured.`);
      const result = await provider.geolocate(jpegB64, context, mode);
      return { ok: true, providerId: id, providerName: provider.name, ...result };
    }),
  );

  const results: ProviderResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      ok: false,
      providerId: providerIds[i],
      error: s.reason instanceof Error ? s.reason.message : 'Unknown error',
    };
  });

  const succeeded = results.filter((r) => r.ok);
  if (succeeded.length === 0) {
    console.error('[OSIRIS] geolocate: all providers failed:', results);
    return NextResponse.json(
      { ok: false, error: 'All selected providers failed.', results },
      { status: 502 },
    );
  }

  // ── Merge: flatten every successful provider's primary+candidates, tag by source, rank by confidence ──
  const flat: TaggedCandidate[] = [];
  for (const r of succeeded) {
    if (r.primary) flat.push({ ...r.primary, providerId: r.providerId, providerName: r.providerName! });
    for (const c of r.candidates || []) {
      flat.push({ ...c, providerId: r.providerId, providerName: r.providerName! });
    }
  }
  flat.sort((a, b) => b.confidence - a.confidence);

  const merged = {
    primary: flat[0],
    candidates: flat.slice(1, 8),
  };

  return NextResponse.json({ ok: true, mode, results, merged });
}
