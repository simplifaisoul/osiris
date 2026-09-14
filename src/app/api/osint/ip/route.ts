import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

// IP Geolocation + Reputation — combines multiple free sources
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

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: 'IP lookup failed' }, { status: 500 });
  }
}
