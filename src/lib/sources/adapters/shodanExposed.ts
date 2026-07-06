import type { SourceAdapter } from '../types';

export interface ShodanHost {
  id: string;
  lat: number;
  lng: number;
  ip: string;
  port: number;
  org: string | undefined;
  product: string | undefined;
  country: string | undefined;
  city: string | undefined;
  timestamp: string | undefined;
}

interface ShodanMatch {
  ip_str?: string;
  port?: number;
  org?: string;
  product?: string;
  timestamp?: string;
  location?: { latitude?: number; longitude?: number; country_name?: string; city?: string };
}

interface ShodanSearchResponse {
  matches?: ShodanMatch[];
}

// A single, low-churn query — Shodan search credits are scarce on free/dev
// keys, hence the long ttl/minInterval below.
const QUERY = 'webcam';
const MAX_ENTRIES = 100;

export const shodanExposed: SourceAdapter<ShodanHost[]> = {
  meta: {
    id: 'shodan-exposed',
    name: 'Shodan Exposed Devices',
    category: 'osint',
    homepage: 'https://www.shodan.io/',
    requiresKey: true,
    keyEnvVars: ['SHODAN_API_KEY'],
    ttlSeconds: 3600,
    minIntervalMs: 900_000,
    attribution: 'Shodan',
  },
  isEnabled: () => !!process.env.SHODAN_API_KEY,
  async fetch({ signal }) {
    const key = process.env.SHODAN_API_KEY || '';
    const url = `https://api.shodan.io/shodan/host/search?key=${encodeURIComponent(key)}&query=${encodeURIComponent(QUERY)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Shodan responded ${res.status}`);
    const data = (await res.json()) as ShodanSearchResponse;
    const matches = data.matches ?? [];

    const hosts: ShodanHost[] = [];
    for (const m of matches.slice(0, MAX_ENTRIES)) {
      const lat = m.location?.latitude;
      const lng = m.location?.longitude;
      if (lat == null || lng == null || !m.ip_str) continue;
      hosts.push({
        id: `shodan-${m.ip_str}-${m.port ?? 0}`,
        lat,
        lng,
        ip: m.ip_str,
        port: m.port ?? 0,
        org: m.org,
        product: m.product,
        country: m.location?.country_name,
        city: m.location?.city,
        timestamp: m.timestamp,
      });
    }
    return hosts;
  },
};
