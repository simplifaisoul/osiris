import { NextResponse } from 'next/server';
import { centroidFor } from '@/lib/countryCentroids';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Cloudflare Radar (internet disruption + attack origin)
 * Source: https://radar.cloudflare.com/  (API docs: developers.cloudflare.com/radar)
 *
 * Requires CLOUDFLARE_API_TOKEN — a free Cloudflare account token scoped to
 * "Radar: Read". Fails closed: with no token the route reports itself
 * unconfigured and the map layer stays hidden, mirroring /api/scanner.
 *
 * The token is read server-side only and is never included in a response.
 */

const RADAR_BASE = 'https://api.cloudflare.com/client/v4/radar';

interface RadarOutage {
  id: string;
  lat: number;
  lng: number;
  country: string;
  country_name: string;
  scope: string;
  event_type: string;
  cause: string;
  description: string;
  start: string;
  end: string | null;
  ongoing: boolean;
  url: string;
}

interface RadarAttackOrigin {
  country: string;
  country_name: string;
  lat: number;
  lng: number;
  /** Share of observed layer-3 attack traffic, as a percentage. */
  share: number;
}

/* Minimal shapes for the slices of the Radar payload we consume. Everything is
   optional because Cloudflare adds and reorders fields between API versions. */
interface RawAnnotation {
  id?: string;
  locations?: string[];
  locationsDetails?: Array<{ code?: string; name?: string }>;
  scope?: string;
  eventType?: string;
  outage?: { outageCause?: string; outageType?: string };
  description?: string;
  startDate?: string;
  endDate?: string | null;
  linkedUrl?: string;
}

interface RawTopLocation {
  originCountryAlpha2?: string;
  clientCountryAlpha2?: string;
  originCountry?: string;
  originCountryName?: string;
  clientCountryName?: string;
  value?: string | number;
}

interface RadarResult {
  annotations?: RawAnnotation[];
  top_0?: RawTopLocation[];
  top0?: RawTopLocation[];
}

function isConfigured() {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN);
}

async function radarFetch(path: string, signal: AbortSignal): Promise<RadarResult> {
  const res = await fetch(`${RADAR_BASE}${path}`, {
    signal,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Radar ${path} responded ${res.status}`);
  const json = await res.json();
  // Cloudflare wraps everything in { success, errors, result }.
  if (json?.success === false) {
    const detail = json?.errors?.[0]?.message || 'unknown error';
    throw new Error(`Radar ${path} rejected the request: ${detail}`);
  }
  return json?.result ?? {};
}

function mapOutages(result: RadarResult): RadarOutage[] {
  const annotations = result?.annotations ?? [];
  const out: RadarOutage[] = [];

  for (const a of annotations) {
    // An annotation can name several locations; emit one marker per located country.
    const codes: string[] = Array.isArray(a?.locations) ? a.locations : [];
    const names: Record<string, string> = {};
    for (const d of a?.locationsDetails ?? []) {
      if (d?.code) names[d.code] = d.name ?? d.code;
    }

    for (const code of codes) {
      const c = centroidFor(code);
      if (!c) continue;
      out.push({
        id: `${a?.id ?? 'outage'}-${code}`,
        lng: c[0],
        lat: c[1],
        country: code,
        country_name: names[code] || code,
        scope: a?.scope || '',
        event_type: a?.eventType || 'OUTAGE',
        cause: a?.outage?.outageCause || a?.outage?.outageType || '',
        description: a?.description || '',
        start: a?.startDate || '',
        end: a?.endDate || null,
        ongoing: !a?.endDate,
        url: a?.linkedUrl || '',
      });
    }
  }
  return out;
}

function mapAttackOrigins(result: RadarResult): RadarAttackOrigin[] {
  // Top-N endpoints return the series under `top_0`.
  const rows = result?.top_0 ?? result?.top0 ?? [];
  const out: RadarAttackOrigin[] = [];

  for (const r of rows) {
    const code = r?.originCountryAlpha2 ?? r?.clientCountryAlpha2 ?? r?.originCountry;
    const c = centroidFor(code);
    if (!c) continue;
    out.push({
      country: String(code).toUpperCase(),
      country_name: r?.originCountryName ?? r?.clientCountryName ?? String(code),
      lng: c[0],
      lat: c[1],
      share: Number(Number(r?.value).toFixed(2)) || 0,
    });
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Capability probe — lets the UI decide whether to show the layer without
  // provoking an upstream call. Always 200 so it is cheap and unambiguous.
  if (searchParams.get('probe') === '1') {
    return NextResponse.json({ configured: isConfigured(), source: 'Cloudflare Radar' });
  }

  if (!isConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        outages: [],
        attack_origins: [],
        error: 'Cloudflare Radar not configured',
        hint: 'Set CLOUDFLARE_API_TOKEN (Cloudflare account → API Tokens → Radar: Read) in .env',
      },
      { status: 503 }
    );
  }

  const signal = AbortSignal.timeout(20000);

  // Degrade per-section rather than all-or-nothing: one endpoint failing should
  // not blank the whole layer.
  const [outagesRes, attacksRes] = await Promise.allSettled([
    radarFetch('/annotations/outages?limit=50&format=json', signal),
    radarFetch('/attacks/layer3/top/locations/origin?limit=25&format=json', signal),
  ]);

  const outages = outagesRes.status === 'fulfilled' ? mapOutages(outagesRes.value) : [];
  const attack_origins = attacksRes.status === 'fulfilled' ? mapAttackOrigins(attacksRes.value) : [];

  const errors: string[] = [];
  if (outagesRes.status === 'rejected') errors.push(`outages: ${outagesRes.reason?.message ?? 'failed'}`);
  if (attacksRes.status === 'rejected') errors.push(`attack_origins: ${attacksRes.reason?.message ?? 'failed'}`);

  if (outages.length === 0 && attack_origins.length === 0 && errors.length > 0) {
    console.error('[OSIRIS] Cloudflare Radar fetch failed:', errors.join('; '));
    return NextResponse.json(
      { configured: true, outages: [], attack_origins: [], error: 'Cloudflare Radar unavailable', errors },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      configured: true,
      outages,
      attack_origins,
      total_outages: outages.length,
      total_attack_origins: attack_origins.length,
      ...(errors.length > 0 ? { partial: true, errors } : {}),
      source: 'Cloudflare Radar',
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  );
}
