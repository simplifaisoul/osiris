import type { SourceAdapter } from '../types';

export interface WigleNetwork {
  id: string;
  lat: number;
  lng: number;
  ssid: string;
  bssid: string;
  encryption: string | undefined;
  type: string | undefined;
  lastUpdate: string | undefined;
}

interface WigleResult {
  trilat?: number;
  trilong?: number;
  ssid?: string;
  netid?: string;
  encryption?: string;
  type?: string;
  lastupdt?: string;
}

interface WigleSearchResponse {
  results?: WigleResult[];
}

const MAX_ENTRIES = 100;
const DEFAULT_RADIUS_KM = 3;
const KM_PER_DEGREE_LAT = 111;

// WiGLE's search API requires a bounding box (no global feed), so this
// adapter is called on-demand for a point + radius rather than polled.
export const wigleNetworks: SourceAdapter<WigleNetwork[]> = {
  meta: {
    id: 'wigle-networks',
    name: 'WiGLE Wireless Networks',
    category: 'osint',
    homepage: 'https://wigle.net/',
    requiresKey: true,
    keyEnvVars: ['WIGLE_API_NAME', 'WIGLE_API_TOKEN'],
    ttlSeconds: 1800,
    minIntervalMs: 60_000,
    attribution: 'WiGLE.net',
  },
  isEnabled: () => !!process.env.WIGLE_API_NAME && !!process.env.WIGLE_API_TOKEN,
  async fetch({ signal, params }) {
    const lat = parseFloat(params?.lat ?? '');
    const lng = parseFloat(params?.lng ?? '');
    if (isNaN(lat) || isNaN(lng)) throw new Error('WiGLE lookup requires lat/lng params');
    const radiusKm = parseFloat(params?.radius ?? '') || DEFAULT_RADIUS_KM;
    const dLat = radiusKm / KM_PER_DEGREE_LAT;
    const dLng = radiusKm / (KM_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180) || 1);

    const name = process.env.WIGLE_API_NAME || '';
    const token = process.env.WIGLE_API_TOKEN || '';
    const auth = Buffer.from(`${name}:${token}`).toString('base64');

    const url = `https://api.wigle.net/api/v2/network/search?latrange1=${lat - dLat}&latrange2=${lat + dLat}&longrange1=${lng - dLng}&longrange2=${lng + dLng}`;
    const res = await fetch(url, { signal, headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) throw new Error(`WiGLE responded ${res.status}`);
    const data = (await res.json()) as WigleSearchResponse;
    const results = data.results ?? [];

    const networks: WigleNetwork[] = [];
    for (const r of results.slice(0, MAX_ENTRIES)) {
      if (r.trilat == null || r.trilong == null || !r.netid) continue;
      networks.push({
        id: `wigle-${r.netid}`,
        lat: r.trilat,
        lng: r.trilong,
        ssid: r.ssid || '(hidden)',
        bssid: r.netid,
        encryption: r.encryption,
        type: r.type,
        lastUpdate: r.lastupdt,
      });
    }
    return networks;
  },
};
