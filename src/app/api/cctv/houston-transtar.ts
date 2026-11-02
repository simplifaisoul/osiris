import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

const BASE = 'https://traffic.houstontranstar.org';

export interface TranstarListing {
  road: string;
  name: string;
  id: string;
}

function normalName(value: string): string {
  return value.toLowerCase().replaceAll('&amp;', 'and').replace(/[^a-z0-9]/g, '');
}

export function parseTranstarRoads(html: string): string[] {
  return [...new Set([...html.matchAll(/roadway=([^"'&<>]+)/g)].map(match => match[1]))];
}

export function parseTranstarCameras(road: string, html: string): TranstarListing[] {
  return [...html.matchAll(/cam=([^"'&<>]+)(?:&amp;|&)id=(\d+)/g)].map(match => ({
    road,
    name: decodeURIComponent(match[1]).replaceAll('_', ' '),
    id: match[2],
  }));
}

/**
 * TxDOT publishes coordinates for Houston and eastern Yoakum cameras, but its snapshot API
 * answers JSON null for those networks, even for rows marked online.
 * TranStar publishes working JPEGs by numeric id. Join only exact, unique
 * roadway + camera labels so a frame is never placed at the wrong intersection.
 */
export function matchHoustonTranstarCameras(txdot: CctvCamera[], listings: TranstarListing[]): CctvCamera[] {
  const index = new Map<string, TranstarListing | null>();
  for (const listing of listings) {
    const key = normalName(`${listing.road} @ ${listing.name}`);
    const previous = index.get(key);
    if (previous && previous.id !== listing.id) index.set(key, null);
    else if (!index.has(key)) index.set(key, listing);
  }

  return txdot.flatMap(camera => {
    const match = index.get(normalName(camera.name));
    if (!match) return [];
    return [{
      ...camera,
      source: 'Houston TranStar',
      feed_url: `${BASE}/snapshots/cctv/${match.id}.jpg`,
      external_url: `${BASE}/mobile/itranstar_cctv.aspx?roadway=${encodeURIComponent(match.road)}`,
    }];
  });
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Houston TranStar HTTP ${response.status}`);
  return response.text();
}

export const fetchHoustonTranstarIndex = cachedSource('houstontranstar:index', async (): Promise<TranstarListing[]> => {
  const home = await fetchPage(`${BASE}/mobile/itranstar_cctv.aspx`);
  const roads = parseTranstarRoads(home);
  if (roads.length < 20) throw new Error('Houston TranStar road list is incomplete');
  const pages = await Promise.all(roads.map(async road => ({
    road,
    html: await fetchPage(`${BASE}/mobile/itranstar_cctv.aspx?roadway=${encodeURIComponent(road)}`),
  })));
  const cameras = pages.flatMap(page => parseTranstarCameras(page.road, page.html));
  if (cameras.length < 300) throw new Error('Houston TranStar camera list is incomplete');
  return cameras;
});
