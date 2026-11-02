import { NextResponse } from 'next/server';
import { visitorIp } from '@/lib/ssrf-guard';

/* The answer is one visitor's location. No cache, shared or otherwise, may
   hand it to the next visitor. */
const NO_STORE = { 'Cache-Control': 'private, no-store' };

// Server-side proxy for IP geolocation — avoids mixed-content block on HTTPS pages
// Three providers with cascading fallback for maximum reliability
export async function GET(request: Request) {
  try {
    const ip = visitorIp(request) ?? '';

    /* No public address means the proxy chain lost the visitor's. Asking the
       providers without one locates this server instead, which would fly
       every such visitor to the server's city. Only in development, where the
       server is the developer's own machine, is that the right answer. */
    if (!ip && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ status: 'fail', message: 'Visitor address unknown' }, { headers: NO_STORE });
    }

    // ── Provider 1: ipapi.co (HTTPS, free tier 1000/day) ──
    try {
      const url = ip ? `https://ipapi.co/${ip}/json/` : 'https://ipapi.co/json/';
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
        headers: { 'User-Agent': 'OSIRIS/4.2' },
      });
      if (res.ok) {
        const d = await res.json();
        if (!d.error && d.latitude) {
          return NextResponse.json({
            status: 'success',
            query: d.ip,
            lat: d.latitude,
            lon: d.longitude,
            city: d.city,
            regionName: d.region,
            country: d.country_name,
            isp: d.org || 'Unknown',
            org: d.org || 'Unknown',
            as: d.asn ? `AS${d.asn} ${d.org}` : 'Unknown',
          }, { headers: NO_STORE });
        }
      }
    } catch { /* fall through */ }

    // ── Provider 2: freeipapi.com (HTTPS, no key needed) ──
    try {
      const url = ip ? `https://freeipapi.com/api/json/${ip}` : 'https://freeipapi.com/api/json';
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (res.ok) {
        const d = await res.json();
        if (d.latitude) {
          return NextResponse.json({
            status: 'success',
            query: d.ipAddress || ip || 'auto',
            lat: d.latitude,
            lon: d.longitude,
            city: d.cityName || 'Unknown',
            regionName: d.regionName || 'Unknown',
            country: d.countryName || 'Unknown',
            isp: d.isp || 'Unknown',
            org: d.isp || 'Unknown',
            as: 'Unknown',
          }, { headers: NO_STORE });
        }
      }
    } catch { /* fall through */ }

    // ── Provider 3: ip-api.com (HTTP — safe here because this is server-to-server) ──
    try {
      const url = ip
        ? `http://ip-api.com/json/${ip}?fields=status,lat,lon,city,regionName,country,query,isp,org,as`
        : 'http://ip-api.com/json/?fields=status,lat,lon,city,regionName,country,query,isp,org,as';
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          return NextResponse.json(data, { headers: NO_STORE });
        }
      }
    } catch { /* fall through */ }

    return NextResponse.json({ error: 'All geolocation providers failed' }, { status: 502, headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to reach geolocation service', detail: e instanceof Error ? e.message : String(e) },
      { status: 503, headers: NO_STORE }
    );
  }
}
