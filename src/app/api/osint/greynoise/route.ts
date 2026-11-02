import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';
import type { GreyNoiseReputation } from '@/lib/bgp-intel';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ip = searchParams.get('ip')?.trim();

  if (!ip || !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
    return NextResponse.json({ error: 'Valid IP address required' }, { status: 400 });
  }

  try {
    const url = `https://api.greynoise.io/v3/community/${encodeURIComponent(ip)}`;
    const res = await stealthFetch(url, { signal: AbortSignal.timeout(6000) });

    if (res.ok) {
      const data = await res.json();
      const rep: GreyNoiseReputation = {
        ip,
        noise: Boolean(data.noise),
        riot: Boolean(data.riot),
        classification: data.classification === 'malicious' ? 'malicious' : data.classification === 'benign' ? 'benign' : 'unknown',
        name: data.name || data.actor || 'Internet Scanner',
        link: data.link,
        last_seen: data.last_seen,
        message: data.message,
      };
      return NextResponse.json(rep, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
      });
    }
  } catch (e) {
    console.warn('[OSIRIS GREYNOISE] Fetch error:', e);
  }

  // Fallback if GreyNoise unlisted or request timed out
  return NextResponse.json({
    ip,
    noise: false,
    riot: false,
    classification: 'unknown',
    name: 'Unindexed / Private IP',
  });
}
