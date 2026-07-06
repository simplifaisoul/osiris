import type { SourceAdapter } from '../types';

export interface TsunamiEvent {
  id: string;
  title: string;
  lat: number;
  lng: number;
  updated: string;
  summary: string;
  url: string;
}

// PAAQ = the NWS Pacific/Alaska Tsunami Warning Center's combined feed,
// covering both the Pacific and Atlantic basins.
const URL = 'https://www.tsunami.gov/events/xml/PAAQAtom.xml';

function parseEntry(entryXml: string, index: number): TsunamiEvent | null {
  const titleMatch = entryXml.match(/<title>(.*?)<\/title>/i);
  const latMatch = entryXml.match(/<geo:lat>(.*?)<\/geo:lat>/i);
  const lngMatch = entryXml.match(/<geo:long>(.*?)<\/geo:long>/i);
  const updatedMatch = entryXml.match(/<updated>(.*?)<\/updated>/i);
  const summaryMatch = entryXml.match(/<summary>(.*?)<\/summary>/i);
  const linkMatch = entryXml.match(/<link[^>]*href="([^"]+)"/i);

  if (!titleMatch || !latMatch || !lngMatch) return null;

  return {
    id: `tsunami-${index}`,
    title: titleMatch[1],
    lat: parseFloat(latMatch[1]),
    lng: parseFloat(lngMatch[1]),
    updated: updatedMatch ? updatedMatch[1] : '',
    summary: summaryMatch ? summaryMatch[1] : '',
    url: linkMatch ? linkMatch[1] : 'https://www.tsunami.gov/',
  };
}

export const noaaTsunami: SourceAdapter<TsunamiEvent[]> = {
  meta: {
    id: 'noaa-tsunami',
    name: 'NOAA Tsunami Warning Center',
    category: 'disaster',
    homepage: 'https://www.tsunami.gov/',
    license: 'Public domain (US Government work)',
    requiresKey: false,
    ttlSeconds: 300,
    minIntervalMs: 60_000,
    attribution: 'NOAA NTWC',
  },
  isEnabled: () => true,
  async fetch({ signal }) {
    const res = await fetch(URL, { signal });
    if (!res.ok) throw new Error(`NOAA Tsunami responded ${res.status}`);
    const xml = await res.text();
    const entries = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi);
    const events: TsunamiEvent[] = [];
    let i = 0;
    for (const match of entries) {
      const parsed = parseEntry(match[1], i);
      if (parsed) { events.push(parsed); i++; }
    }
    return events;
  },
};
