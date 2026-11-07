import { formatBox, inBox, type LngLatBox } from './cutout';

/**
 * What a cut-out carries: the CCTV cameras and the network hosts that stand
 * inside its box. Both come from the same routes the map's layers read, so
 * the cut-out shows what the map shows.
 */

/** A camera row as the catalogue serves it; CameraViewer reads the rest. */
export interface CutoutCamera {
  id: string | number;
  lat: number;
  lng: number;
  name?: string;
  source?: string;
  stream_url?: string;
  [key: string]: unknown;
}

/** A command-and-control host from the Network Intel layers. */
export interface NetHost {
  id: string;
  ip: string;
  port: number | null;
  lat: number;
  lng: number;
  /** Malware family, when the listing names one. */
  family: string;
  /** "C2 panel", "C2 server", "Botnet C2". */
  role: string;
  status: string | null;
  asName: string;
  place: string;
  firstSeen: string;
  lastSeen: string;
  source: string;
  reference: string | null;
}

const ROLE: Record<string, string> = { c2_panel: 'C2 panel', c2_server: 'C2 server' };

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Live Malware (ViriBack, C2IntelFeeds): geolocated per address. */
export function hostsFromMalware(threats: any[]): NetHost[] {
  return (Array.isArray(threats) ? threats : [])
    .filter(t => typeof t?.lat === 'number' && typeof t?.lng === 'number' && t.ip)
    .map(t => ({
      id: `mw-${t.id ?? t.ip}`, ip: String(t.ip), port: typeof t.port === 'number' ? t.port : null, lat: t.lat, lng: t.lng,
      family: t.malware || 'Unnamed', role: ROLE[t.threat_type] ?? 'C2 host', status: null,
      asName: t.as_name || '', place: [t.city, t.country].filter(Boolean).join(', '),
      firstSeen: t.first_seen || '', lastSeen: t.last_seen || '', source: t.source || 'Live Malware', reference: t.reference || null,
    }));
}

/** Botnet C2 (Feodo Tracker and researcher reports). A country centroid is not a place, so those stay out. */
export function hostsFromC2(indicators: any[]): NetHost[] {
  return (Array.isArray(indicators) ? indicators : [])
    .filter(i => typeof i?.lat === 'number' && typeof i?.lng === 'number' && i.ip && i.location_precision === 'city')
    .map(i => ({
      id: `c2-${i.id ?? i.ip}`, ip: String(i.ip), port: typeof i.port === 'number' ? i.port : null, lat: i.lat, lng: i.lng,
      family: i.malware || 'Unnamed', role: 'Botnet C2', status: i.status || null,
      asName: i.as_name || '', place: [i.city, i.country].filter(Boolean).join(', '),
      firstSeen: i.first_seen || '', lastSeen: i.last_online || '', source: i.source || 'Botnet C2', reference: i.reference || null,
    }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** One host per address and port, inside the box. */
export function hostsInBox(hosts: NetHost[], box: LngLatBox): NetHost[] {
  const seen = new Set<string>();
  return hosts.filter(h => {
    const key = `${h.ip}:${h.port ?? ''}`;
    if (!inBox(h.lng, h.lat, box) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadCutoutCameras(box: LngLatBox, signal?: AbortSignal): Promise<CutoutCamera[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`/api/cctv?bbox=${formatBox(box)}`, { signal });
    if (!res.ok) throw new Error(`Cameras HTTP ${res.status}`);
    const body = await res.json();
    const cameras = Array.isArray(body.cameras) ? body.cameras as CutoutCamera[] : [];
    // A cold server is still filling regions; ask again once they land.
    if (!body.pendingRegions?.length || attempt === 2) return cameras;
    await new Promise(r => setTimeout(r, 6000));
    if (signal?.aborted) return cameras;
  }
  return [];
}

/** Both feeds at once; `onPartial` hears each as it lands, since a cold feed can take a while. */
export async function loadCutoutHosts(box: LngLatBox, signal?: AbortSignal, onPartial?: (hosts: NetHost[]) => void): Promise<NetHost[]> {
  const read = (url: string) => fetch(url, { signal }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  let malware: NetHost[] = [], c2: NetHost[] = [];
  const now = () => hostsInBox([...malware, ...c2], box);
  await Promise.all([
    read('/api/malware').then(d => { malware = hostsFromMalware(d?.threats); if (!signal?.aborted) onPartial?.(now()); }),
    read('/api/cyber-attacks').then(d => { c2 = hostsFromC2(d?.indicators); if (!signal?.aborted) onPartial?.(now()); }),
  ]);
  return now();
}
