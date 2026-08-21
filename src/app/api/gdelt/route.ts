import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Real-Time Geopolitical Events (GDELT 2.0 GeoJSON API)
 * Source: GDELT Project — completely free, no auth required
 * Replaces the old RSS scraper with actual GDELT geo-coded events.
 */

// RSS carries its payload XML-escaped, so every GDACS report link arrives as
// report.aspx?eventtype=EQ&amp;eventid=… . That form resolves to a generic
// page — GDACS reads the parameter as "amp;eventid" and serves no event — so
// the entities have to be decoded before the URL is handed to a client.
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export async function GET() {
  try {
    const res = await fetch('https://www.gdacs.org/xml/rss.xml', { signal: AbortSignal.timeout(15000),
      next: { revalidate: 300 }, // Cache 5 min
    });

    if (!res.ok) {
      return NextResponse.json({ events: [], error: 'GDACS unavailable' });
    }

    const xml = await res.text();
    // Split by <item> instead of using regex to avoid ReDoS on large XML
    const rawItems = xml.split(/<item>/i).slice(1);
    const allEvents: any[] = [];
    let eventId = 0;

    for (const rawItem of rawItems) {
      const item = rawItem.split(/<\/item>/i)[0]; // get content up to </item>
      
      const titleMatch = item.match(/<title>(.*?)<\/title>/i) || item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i);
      const linkMatch = item.match(/<link>(.*?)<\/link>/i);
      const descMatch = item.match(/<description>(.*?)<\/description>/i) || item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/i);
      const latMatch = item.match(/<geo:lat>(.*?)<\/geo:lat>/i);
      const lngMatch = item.match(/<geo:long>(.*?)<\/geo:long>/i);
      const typeMatch = item.match(/<gdacs:eventtype>(.*?)<\/gdacs:eventtype>/i);

      if (!titleMatch || !latMatch || !lngMatch) continue;

      const title = decodeEntities(titleMatch[1]);
      const link = decodeEntities(linkMatch ? linkMatch[1] : '');
      const desc = decodeEntities(descMatch ? descMatch[1] : '');
      const lat = parseFloat(latMatch[1]);
      const lng = parseFloat(lngMatch[1]);
      const eventType = typeMatch ? typeMatch[1] : 'UNK';

      // Map GDACS event types to Osiris types. WF and DR used to fall through
      // to the 'conflict' default, which is most of the feed — a live sample
      // was 330 wildfires and 12 droughts out of 369 events, all of them
      // reaching the map labelled as conflicts. Unknown types are 'incident'
      // now; nothing in this feed is a conflict, it is a disaster alert feed.
      let type = 'incident';
      if (eventType === 'EQ') type = 'earthquake';
      else if (eventType === 'TC') type = 'weather';
      else if (eventType === 'FL') type = 'flood';
      else if (eventType === 'VO') type = 'volcano';
      else if (eventType === 'WF') type = 'wildfire';
      else if (eventType === 'DR') type = 'drought';

      allEvents.push({
        id: `gdacs-${eventId++}`,
        lat,
        lng,
        name: title,
        url: link,
        html: `<a href="${link}" target="_blank">${title}</a><br/><i>${desc}</i>`,
        type,
      });
    }

    return NextResponse.json({
      events: allEvents,
      total: allEvents.length,
      timestamp: new Date().toISOString(),
      source: 'GDACS RSS API',
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[OSIRIS] GDACS fetch error:', error);
    return NextResponse.json({ events: [], total: 0, error: 'GDACS unavailable' }, { status: 500 });
  }
}
