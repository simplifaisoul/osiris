import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');

  if (!email) return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 });

  try {
    // We will call the breach-analytics endpoint to get deep details on what exactly was leaked.
    const res = await fetch(`https://api.xposedornot.com/v1/breach-analytics?email=${encodeURIComponent(email)}`, { signal: AbortSignal.timeout(15000),
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OSIRIS/1.0'
      }
    });
    
    if (res.status === 404) {
      return NextResponse.json({ email, breached: false, breaches: [], data_exposed: [] });
    }

    if (!res.ok) throw new Error(`XposedOrNot API HTTP ${res.status}`);

    const data = await res.json();
    
    // Parse the analytics data
    let breachList = [];
    const dataExposed = new Set<string>();

    if (data.BreachesSummary && data.BreachesSummary.site) {
       breachList = data.BreachesSummary.site.split(';').filter(Boolean);
    }
    
    if (data.ExposedData && Array.isArray(data.ExposedData)) {
       data.ExposedData.forEach((item: any) => {
          if (item.data_classes && Array.isArray(item.data_classes)) {
             item.data_classes.forEach((dc: string) => dataExposed.add(dc));
          }
       });
    }

    return NextResponse.json({
      email,
      breached: breachList.length > 0,
      breaches: breachList,
      data_exposed: Array.from(dataExposed).sort()
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Leak lookup failed', detail: error.message }, { status: 500 });
  }
}
