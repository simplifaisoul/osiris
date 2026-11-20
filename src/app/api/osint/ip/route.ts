import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';
import { matchExact, type SanctionEntry } from '@/lib/sanctions';

// IP Geolocation + Reputation — combines multiple free sources.
// Cross-checks the ASN owner / ISP / org strings against the US sanctions lists
// list so an IP routed via a sanctioned operator surfaces a hit.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ip = searchParams.get('ip');
  if (!ip) return NextResponse.json({ error: 'Missing ip parameter' }, { status: 400 });

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Validate IP format
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  if (!ipv4.test(ip) && !ipv6.test(ip)) {
    return NextResponse.json({ error: 'Invalid IP format' }, { status: 400 });
  }

  try {
    const results: any = { ip, timestamp: new Date().toISOString() };

    // 1. ip-api.com — geolocation (free, no key)
    try {
      const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,continent,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,mobile,proxy,hosting,query`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const geo = await res.json();
        if (geo.status === 'success') {
          results.geo = {
            country: geo.country,
            country_code: geo.countryCode,
            region: geo.regionName,
            city: geo.city,
            lat: geo.lat,
            lon: geo.lon,
            timezone: geo.timezone,
            isp: geo.isp,
            org: geo.org,
            as_number: geo.as,
            as_name: geo.asname,
            is_mobile: geo.mobile,
            is_proxy: geo.proxy,
            is_hosting: geo.hosting,
          };
        }
      }
    } catch (e) { console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e); }

    // 2. AbuseIPDB-style check via ip-api proxy flag
    results.reputation = {
      is_proxy: results.geo?.is_proxy || false,
      is_hosting: results.geo?.is_hosting || false,
      is_mobile: results.geo?.is_mobile || false,
      risk_level: results.geo?.is_proxy ? 'HIGH' : results.geo?.is_hosting ? 'MEDIUM' : 'LOW',
    };

    // US sanctions cross-check on ASN / ISP / org strings.
    try {
      const candidates = new Set<string>();
      if (results.geo?.org) candidates.add(results.geo.org);
      if (results.geo?.isp) candidates.add(results.geo.isp);
      if (results.geo?.as_name) candidates.add(results.geo.as_name);
      const hits: Array<{ matched_value: string; entries: SanctionEntry[] }> = [];
      for (const value of candidates) {
        const entries = await matchExact(value);
        if (entries.length) hits.push({ matched_value: value, entries });
      }
      results.sanctions_match = hits.length
        ? { source: 'US sanctions (OpenSanctions us_sanctions + us_fcc_covered_list)', hits }
        : null;
    } catch (e) { console.warn('[OSIRIS] Sanctions cross-check failed:', e instanceof Error ? e.message : e); }

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: 'IP lookup failed' }, { status: 500 });
  }
}
