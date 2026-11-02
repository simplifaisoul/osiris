import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTexasCameras, mapTexasInventory, TEXAS_DISTRICTS } from './texas';
import { clearSourceCache } from '@/lib/sourceCache';

const camera = {
  icd_Id: 'IH20 @ Dallas-Tarrant CL', name: 'IH20 @ Dallas-Tarrant CL',
  latitude: 32.676316, longitude: -97.035836, hasSnapshot: true,
};
const inventory = (rows: unknown[]) => ({ roadwayCctvStatuses: { IH20: rows } });

afterEach(() => { vi.unstubAllGlobals(); clearSourceCache(); });

describe('Texas inventory', () => {
  it('maps actual TxDOT fields into previewable snapshots and preserves IDs in URLs', () => {
    const [result] = mapTexasInventory(inventory([camera]), 'DAL');
    expect(result).toMatchObject({ lat: camera.latitude, lng: camera.longitude, city: 'Dallas', source: 'TxDOT', stream_type: 'jpg' });
    const url = new URL(result.feed_url!, 'http://localhost');
    expect(url.searchParams.get('id')).toBe(camera.icd_Id);
    expect(url.searchParams.get('district')).toBe('DAL');
  });
  it('deduplicates roadway groups and drops missing snapshots and invalid coordinates', () => {
    const rows = [camera, camera, null, { ...camera, hasSnapshot: false }, { ...camera, latitude: null },
      { ...camera, latitude: NaN }, { ...camera, longitude: 0 }, { ...camera, icd_Id: '' }];
    expect(mapTexasInventory(inventory(rows), 'DAL')).toHaveLength(1);
    expect(mapTexasInventory(inventory(rows), 'constructor')).toEqual([]);
    expect(() => mapTexasInventory({}, 'DAL')).toThrow('roadwayCctvStatuses');
    expect(mapTexasInventory(inventory([{ ...camera, statusDescription: 'Device Error' }]), 'DAL')).toEqual([]);
  });
  it('omits San Antonio while online-labelled cameras have no snapshots', async () => {
    const sat = { ...camera, icd_Id: 'IH 10 at Main', name: 'IH 10 at Main', latitude: 29.5, longitude: -98.5 };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('districtCode=SAT')) return Response.json(inventory([sat]));
      if (url.includes('GetCctvSnapshotByIcdId')) return Response.json(null);
      return new Response('', { status: 503 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await fetchTexasCameras()).filter(c => c.city === 'San Antonio')).toEqual([]);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('GetCctvSnapshotByIcdId'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('keeps other districts available when one district fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('districtCode=DAL')) return Response.json(inventory([camera]));
      return new Response('', { status: 503 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await fetchTexasCameras()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(Object.keys(TEXAS_DISTRICTS).length);
    vi.restoreAllMocks();
  });
});

it.skipIf(!process.env.RUN_LIVE_TESTS)('loads live Texas cameras across districts', async () => {
  const cameras = await fetchTexasCameras();
  expect(cameras.length).toBeGreaterThan(100);
  expect(new Set(cameras.map(c => c.city)).size).toBeGreaterThan(3);
});
