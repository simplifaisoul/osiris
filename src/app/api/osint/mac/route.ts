import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mac = searchParams.get('mac');

  if (!mac) {
    return NextResponse.json({ error: 'Missing MAC parameter' }, { status: 400 });
  }

  // Clean the MAC address format to allow varied inputs
  const cleanMac = mac.trim().toUpperCase().replace(/[^A-F0-9:-]/g, '');

  try {
    const res = await fetch(`https://api.maclookup.app/v2/macs/${encodeURIComponent(cleanMac)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`MAC Lookup API HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data && data.found) {
      return NextResponse.json({
        mac: cleanMac,
        vendor: data.company || 'Unknown',
        address: data.address || '',
        prefix: data.macPrefix || cleanMac.slice(0, 8)
      });
    } else {
      return NextResponse.json({ mac: cleanMac, vendor: 'Not Found' });
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'MAC lookup failed', detail: error.message }, { status: 502 });
  }
}
