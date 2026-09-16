import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Idaho CCTV Cameras (ITD / 511.idaho.gov)
 * Source: https://511.idaho.gov — the same IBI 511 stack Arizona runs
 * ~460 cameras statewide — NO API KEY NEEDED.
 *
 * Snapshot-only: ITD publishes no `videoUrl` at all, so every one of these is
 * a refreshing still. Mountain-pass and winter-road coverage is the bulk of
 * it, plus the I-84 and I-15 corridors.
 *
 * Labels are ITD's own district shorthand ("D3 I-84 37.9 Garrity 538") — they
 * contain spaces, so the shared label logic keeps them rather than falling
 * back to the roadway. Only about half the rows name a county.
 */
const ITD: Ibi511Source = {
  base: 'https://511.idaho.gov',
  idPrefix: 'itd',
  source: 'ITD',
  state: 'Idaho',
  bounds: { minLat: 41.9, maxLat: 49.1, minLng: -117.3, maxLng: -110.9 },
};

export const fetchIdahoCameras = cachedSource('idaho', () => loadIbi511Cameras(ITD));
