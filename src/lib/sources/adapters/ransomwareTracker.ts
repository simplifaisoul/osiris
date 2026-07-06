import type { SourceAdapter } from '../types';

export interface RansomwareVictim {
  id: string;
  victim: string;
  group: string;
  country: string;
  activity: string | undefined;
  published: string | undefined;
  url: string | undefined;
}

interface RansomwareLiveEntry {
  victim?: string;
  group?: string;
  country?: string;
  activity?: string;
  published?: string;
  post_url?: string;
}

const URL = 'https://api.ransomware.live/v1/recentvictims';
const MAX_ENTRIES = 100;

export const ransomwareTracker: SourceAdapter<RansomwareVictim[]> = {
  meta: {
    id: 'ransomware-live',
    name: 'ransomware.live Recent Victims',
    category: 'cyber',
    homepage: 'https://ransomware.live/',
    requiresKey: false,
    ttlSeconds: 900,
    minIntervalMs: 300_000,
    attribution: 'ransomware.live',
  },
  isEnabled: () => true,
  async fetch({ signal }) {
    const res = await fetch(URL, { signal });
    if (!res.ok) throw new Error(`ransomware.live responded ${res.status}`);
    const data = (await res.json()) as RansomwareLiveEntry[];
    return data.slice(0, MAX_ENTRIES).map((entry, i) => ({
      id: `ransomware-${i}`,
      victim: entry.victim || 'Unknown',
      group: entry.group || 'unknown',
      country: entry.country || '',
      activity: entry.activity,
      published: entry.published,
      url: entry.post_url,
    }));
  },
};
