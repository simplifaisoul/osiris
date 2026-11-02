import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';
import { fetchHoustonTranstarIndex, matchHoustonTranstarCameras } from './houston-transtar';

// Public inventory used by https://its.txdot.gov/its/District/DAL/cameras.
// District codes come from the site's statewide district selector.
export const TEXAS_DISTRICTS: Record<string, string> = {
  ABL: 'Abilene', AMA: 'Amarillo', ATL: 'Atlanta', AUS: 'Austin',
  BMT: 'Beaumont', BWD: 'Brownwood', BRY: 'Bryan', CHS: 'Childress',
  CRP: 'Corpus Christi', DAL: 'Dallas', ELP: 'El Paso', FTW: 'Fort Worth',
  HOU: 'Houston', LRD: 'Laredo', LBB: 'Lubbock', LFK: 'Lufkin',
  ODA: 'Odessa', PAR: 'Paris', PHR: 'Pharr', SJT: 'San Angelo',
  SAT: 'San Antonio', TYL: 'Tyler', WAC: 'Waco', WFS: 'Wichita Falls', YKM: 'Yoakum',
};
export const TXDOT_BASE = 'https://its.txdot.gov/its/DistrictIts/';

export function mapTexasInventory(data: unknown, district: string): CctvCamera[] {
  if (!Object.hasOwn(TEXAS_DISTRICTS, district)) return [];
  const groups = (data as { roadwayCctvStatuses?: unknown } | null)?.roadwayCctvStatuses;
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    throw new Error('TxDOT inventory is missing roadwayCctvStatuses');
  }
  const cameras = new Map<string, CctvCamera>();
  for (const rows of Object.values(groups)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const { icd_Id: id, latitude: lat, longitude: lng } = row;
      if (typeof id !== 'string' || !id.trim() || id.length > 256 || row.hasSnapshot !== true) continue;
      if (row.statusDescription === 'Device Error' || row.statusDescription === 'Device Offline') continue;
      if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < 25.8 || lat > 36.6 || lng < -106.7 || lng > -93.4) continue;
      const key = `txdot-${district}-${id}`;
      cameras.set(key, {
        id: key, lat, lng,
        name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id,
        city: TEXAS_DISTRICTS[district], country: 'US', source: 'TxDOT',
        stream_type: 'jpg',
        feed_url: `/api/cctv/texas/snapshot?${new URLSearchParams({ district, id })}`,
        external_url: `https://its.txdot.gov/its/District/${district}/cameras`,
      });
    }
  }
  return [...cameras.values()];
}

async function sanAntonioHasSnapshots(cameras: CctvCamera[]): Promise<boolean> {
  if (!cameras.length) return false;
  // TxDOT lists SAT cameras as online while returning JSON null for the district.
  // Probe separated cameras so they reappear when the source recovers.
  const samples = [cameras[0], cameras[Math.floor(cameras.length / 2)], cameras[cameras.length - 1]];
  const results = await Promise.allSettled(samples.map(async camera => {
    const id = camera.id.slice('txdot-SAT-'.length);
    const query = new URLSearchParams({ districtCode: 'SAT', icdId: id });
    const response = await fetch(`${TXDOT_BASE}GetCctvSnapshotByIcdId?${query}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return typeof data?.snippet === 'string' && data.snippet.startsWith('/9j/');
  }));
  return results.some(result => result.status === 'fulfilled' && result.value);
}

const districtFetchers = Object.keys(TEXAS_DISTRICTS).map(district => {
  const fetchDistrict = async () => {
    const response = await fetch(`${TXDOT_BASE}GetCctvStatusListByDistrict?districtCode=${district}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`TxDOT ${district}: HTTP ${response.status}`);
    const cameras = mapTexasInventory(await response.json(), district);
    if (district === 'HOU' || district === 'YKM') {
      return matchHoustonTranstarCameras(cameras, await fetchHoustonTranstarIndex());
    }
    if (district === 'SAT' && !(await sanAntonioHasSnapshots(cameras))) return [];
    return cameras;
  };
  // Do not keep a stale positive SAT inventory through a district-wide media
  // outage. The surrounding Texas region cache still bounds refresh frequency.
  return district === 'SAT' ? fetchDistrict : cachedSource(`texas:${district}`, fetchDistrict);
});

export async function fetchTexasCameras(): Promise<CctvCamera[]> {
  // Cache each district independently so an outage cannot discard its last inventory.
  const results = await Promise.allSettled(districtFetchers.map(fetcher => fetcher()));
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}
