import { NextResponse } from 'next/server';
import { geocoderConfigured } from '@/lib/geocoder';
import { GET as search } from '../route';

export const maxDuration = 20;

/**
 * OSIRIS — this deployment's geocoder, shared with copies that have none.
 *
 * A copy of OSIRIS without OSIRIS_GEOCODER_URL asks here from its server (sharedSearch
 * in lib/geocoder.ts), so someone running it on their own machine searches the
 * same streets and addresses with nothing to set up. It answers only from
 * this deployment's own geocoder, with only the query and the bias passed on,
 * and never asks anywhere else, so deployments can never ask each other in a
 * circle. 501 when this deployment has no geocoder to share.
 */
export async function GET(request: Request) {
  if (!geocoderConfigured()) return NextResponse.json({ results: [] }, { status: 501, headers: { 'Cache-Control': 'no-store' } });

  const url = new URL(request.url);
  const only = new URLSearchParams();
  for (const k of ['q', 'lat', 'lng']) {
    const v = url.searchParams.get(k);
    if (v !== null) only.set(k, v);
  }
  return search(new Request(`${url.origin}/api/geosearch?${only}`));
}
