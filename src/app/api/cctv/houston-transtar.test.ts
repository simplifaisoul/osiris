import { describe, expect, it } from 'vitest';
import { matchHoustonTranstarCameras, parseTranstarCameras, parseTranstarRoads } from './houston-transtar';
import type { CctvCamera } from './types';

const camera = (name: string): CctvCamera => ({
  id: `txdot-HOU-${name}`, lat: 29.765444, lng: -95.367628,
  name, city: 'Houston', country: 'US', source: 'TxDOT',
  feed_url: '/api/cctv/texas/snapshot?district=HOU&id=old',
  stream_type: 'jpg',
});

describe('Houston TranStar', () => {
  it('parses live roadway and camera links', () => {
    expect(parseTranstarRoads('<a href="?roadway=IH-45_North">I-45</a><a href="?roadway=IH-45_North">again</a>')).toEqual(['IH-45_North']);
    expect(parseTranstarCameras('IH-45_North', "<a href='?cam=Franklin&id=202'>Franklin</a>")).toEqual([
      { road: 'IH-45_North', name: 'Franklin', id: '202' },
    ]);
  });

  it('uses a unique exact roadway and intersection match without relabeling another location', () => {
    const listings = [
      { road: 'IH-45_North', name: 'Franklin', id: '202' },
      { road: 'IH-69_Eastex', name: 'Franklin', id: '999' },
    ];
    const result = matchHoustonTranstarCameras([
      camera('IH-45 North @ Franklin'),
      camera('IH-10 East @ Franklin'),
    ], listings);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'IH-45 North @ Franklin',
      source: 'Houston TranStar',
      feed_url: 'https://traffic.houstontranstar.org/snapshots/cctv/202.jpg',
      lat: 29.765444, lng: -95.367628,
    });
  });

  it('preserves Yoakum as the district for matched eastern Texas cameras', () => {
    const result = matchHoustonTranstarCameras([
      { ...camera('IH-10 West @ FM 1458'), city: 'Yoakum' },
    ], [{ road: 'IH-10_West', name: 'FM 1458', id: '364' }]);
    expect(result[0]).toMatchObject({ city: 'Yoakum', feed_url: 'https://traffic.houstontranstar.org/snapshots/cctv/364.jpg' });
  });

  it('drops ambiguous matches', () => {
    expect(matchHoustonTranstarCameras([camera('IH-45 North @ Franklin')], [
      { road: 'IH-45_North', name: 'Franklin', id: '202' },
      { road: 'IH-45_North', name: 'Franklin', id: '999' },
    ])).toEqual([]);
  });
});
