import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

// BGP/ASN Lookup — remplacé après shutdown de bgpview.io
// Sources: ip-api.com + RIPE Stat
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query');
  if (!query) return NextResponse.json({ error: 'Missing query parameter (IP, ASN number, or prefix)' }, { status: 400 });

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const results: any = { query, timestamp: new Date().toISOString() };

    const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(query);
    const isASN = /^(AS)?\d+$/i.test(query);
    const asnNum = isASN ? query.replace(/^AS/i, '') : null;

    if (isIP) {
      // IP → ASN lookup via ip-api.com
      const res = await fetch(`http://ip-api.com/json/${query}?fields=status,country,countryCode,region,regionName,city,as,org,isp,reverse,query`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          // Parse ASN from "AS15169 Google LLC"
          let asn = 'N/A', asOrg = data.org || data.isp || 'N/A', asCountry = data.countryCode || 'N/A';
          const asMatch = data.as?.match(/^AS(\d+)\s+(.+)$/);
          if (asMatch) {
            asn = asMatch[1];
            asOrg = asMatch[2] || asOrg;
          }

          // Fetch richer ASN info from RIPE Stat
          let asnDesc = 'N/A';
          if (asn !== 'N/A') {
            try {
              const ripeRes = await fetch(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${asn}`, {
                signal: AbortSignal.timeout(5000),
              });
              if (ripeRes.ok) {
                const ripe = await ripeRes.json();
                if (ripe?.data?.holder) asnDesc = ripe.data.holder;
              }
            } catch { /* RIPE optional */ }
          }

          results.ip = {
            asn: {
              asn: asn !== 'N/A' ? parseInt(asn, 10) : 'N/A',
              name: asOrg,
              description: asnDesc,
              country_code: asCountry,
            },
            prefixes: [],
            ptr_record: data.reverse || 'N/A',
            rir_allocation: `${data.country} (${data.countryCode})`,
          };
          results.type = 'ip';
        }
      }
    } else if (asnNum) {
      // ASN details via RIPE Stat
      let asnName = 'N/A', asnDesc = 'N/A', asnCountry = 'N/A';

      try {
        const ripeRes = await fetch(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${asnNum}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (ripeRes.ok) {
          const ripe = await ripeRes.json();
          if (ripe?.data?.holder) {
            asnName = ripe.data.holder;
            asnDesc = ripe.data.holder;
          }
        }
      } catch { /* RIPE optional */ }

      results.asn = {
        asn: parseInt(asnNum, 10),
        name: asnName,
        description: asnDesc,
        country_code: asnCountry,
      };
      results.prefixes = { ipv4: [], ipv6: [], total_v4: 0, total_v6: 0 };
      results.peers = { upstream: [], total: 0 };
      results.type = 'asn';
    } else {
      return NextResponse.json({ error: 'Unrecognized query format. Use IP address or AS number.' }, { status: 400 });
    }

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: 'BGP lookup failed' }, { status: 500 });
  }
}
