import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Ontario CCTV Cameras (MTO / 511on.ca)
 * Source: https://511on.ca — the same IBI 511 stack the US states run
 * ~940 cameras province-wide — NO API KEY NEEDED.
 *
 * The first non-American deployment of this platform in OSIRIS, which is why
 * `Ibi511Source` grew a `country`: the mapper hardcoded `US` until this and
 * [alberta] arrived, and a Toronto camera filed under the United States is
 * simply wrong.
 *
 * Snapshot-only — MTO publishes no `videoUrl`. The 400-series highways, the
 * QEW and the Niagara and Windsor border approaches are the bulk of it.
 *
 * `countyLabel` is empty on purpose. The county column here holds regional
 * municipalities — Niagara, Halton, Peel — and "Niagara County" is a real but
 * entirely different place in New York State, two hundred kilometres away and
 * already in this same map from [newyork].
 */
const MTO: Ibi511Source = {
  base: 'https://511on.ca',
  idPrefix: 'mto',
  source: 'Ontario MTO',
  state: 'Ontario',
  country: 'Canada',
  countyLabel: '',
  bounds: { minLat: 41.6, maxLat: 57.0, minLng: -95.3, maxLng: -74.2 },
};

export const fetchOntarioCameras = cachedSource('ontario', () => loadIbi511Cameras(MTO));
