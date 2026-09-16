import { describe, it, expect } from 'vitest';
import { cameraCity, mapIbi511Record, type Ibi511Record, type Ibi511Source } from './ibi511';
import { fetchNewYorkCameras } from './newyork';
import { fetchPennsylvaniaCameras } from './pennsylvania';
import { fetchWisconsinCameras } from './wisconsin';
import { fetchIdahoCameras } from './idaho';
import { fetchAlaskaCameras } from './alaska';
import { fetchOntarioCameras } from './ontario';
import { fetchAlbertaCameras } from './alberta';

/**
 * The seven deployments added alongside Florida, Georgia, NCDOT and Arizona.
 * They are pure configuration over the shared loader, so what is worth testing
 * is the two things configuration can get wrong: which country a camera is
 * filed under, and whether the bounding box actually covers the place.
 */

/** A real row from 511ny.org, trimmed to the fields the mapper reads. */
const nyRow: Ibi511Record = {
  id: 19,
  roadway: 'US 9',
  direction: 'Southbound',
  location: 'US 9 SB @ I-87 Exit 17',
  county: 'Saratoga',
  latLng: { geography: { wellKnownText: 'POINT (-73.690416 43.237344)' } },
  images: [{
    description: 'Traffic closest to the camera is traveling sb.',
    imageUrl: '/map/Cctv/4438',
    videoUrl: 'https://s51.nysdot.skyvdn.com/rtplive/R1_033/playlist.m3u8',
    isVideoAuthRequired: false,
    blocked: false,
    disabled: false,
  }],
};

const NYSDOT: Ibi511Source = {
  base: 'https://511ny.org',
  idPrefix: 'nysdot',
  source: 'NYSDOT',
  state: 'New York',
  bounds: { minLat: 40.4, maxLat: 45.1, minLng: -79.9, maxLng: -71.8 },
};

const MTO: Ibi511Source = {
  base: 'https://511on.ca',
  idPrefix: 'mto',
  source: 'Ontario MTO',
  state: 'Ontario',
  country: 'Canada',
  countyLabel: '',
  bounds: { minLat: 41.6, maxLat: 57.0, minLng: -95.3, maxLng: -74.2 },
};

describe('New York', () => {
  it('keeps the ungated HLS playlist as a live stream, and the snapshot with it', () => {
    expect(mapIbi511Record(nyRow, NYSDOT)).toEqual({
      id: 'nysdot-19',
      lat: 43.237344,
      lng: -73.690416,
      name: 'US 9 SB @ I-87 Exit 17',
      city: 'Saratoga County',
      country: 'US',
      feed_url: 'https://511ny.org/map/Cctv/4438',
      stream_url: 'https://s51.nysdot.skyvdn.com/rtplive/R1_033/playlist.m3u8',
      stream_type: 'hls',
      source: 'NYSDOT',
    });
  });

  /* NYSDOT parks a few rows at the origin. Without the box they would land in
     the Gulf of Guinea. */
  it('drops the null-island rows the feed carries', () => {
    expect(mapIbi511Record({
      ...nyRow,
      latLng: { geography: { wellKnownText: 'POINT (0 0)' } },
    }, NYSDOT)).toBeNull();
  });
});

describe('Pennsylvania', () => {
  /* Every PennDOT row sets isVideoAuthRequired, like Florida and Georgia. The
     playlist exists but their edge answers 401 to anyone but their own player,
     so the camera has to show its snapshot instead of a stream that cannot
     open. */
  it('refuses the auth-gated playlist and serves the snapshot', () => {
    const PENNDOT: Ibi511Source = {
      base: 'https://511pa.com',
      idPrefix: 'penndot',
      source: 'PennDOT',
      state: 'Pennsylvania',
      bounds: { minLat: 39.6, maxLat: 42.4, minLng: -80.6, maxLng: -74.6 },
    };
    const cam = mapIbi511Record({
      id: 143,
      roadway: 'Southern Beltway (PA-576)',
      direction: 'Westbound',
      location: 'Southern Beltway (PA-576 @ I-79)',
      county: 'Allegheny',
      latLng: { geography: { wellKnownText: 'POINT (-80.145553 40.321006)' } },
      images: [{
        imageUrl: '/map/Cctv/4833',
        videoUrl: 'https://pa-se1.arcadis-ivds.com:8200/chan-2333/index.m3u8',
        isVideoAuthRequired: true,
        blocked: false,
        disabled: false,
      }],
    }, PENNDOT);
    expect(cam?.feed_url).toBe('https://511pa.com/map/Cctv/4833');
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.city).toBe('Allegheny County');
  });
});

describe('Ontario', () => {
  const onRow: Ibi511Record = {
    id: 1283,
    roadway: 'QEW',
    direction: 'Unknown',
    location: 'QEW East of Concession Road',
    county: 'Niagara',
    latLng: { geography: { wellKnownText: 'POINT (-78.925595 42.909086)' } },
    images: [{ description: 'Toronto Bound', imageUrl: '/map/Cctv/2555', blocked: false, disabled: false }],
  };

  it('files an Ontario camera under Canada, not the US default', () => {
    expect(mapIbi511Record(onRow, MTO)?.country).toBe('Canada');
  });

  /* Niagara Region, Ontario is not Niagara County, New York - and with
     [newyork] in the same map, both names are on screen at once. */
  it('leaves an Ontario region name bare instead of calling it a county', () => {
    expect(mapIbi511Record(onRow, MTO)?.city).toBe('Niagara');
  });

  it('is snapshot-only, since MTO publishes no video', () => {
    const cam = mapIbi511Record(onRow, MTO);
    expect(cam?.feed_url).toBe('https://511on.ca/map/Cctv/2555');
    expect(cam?.stream_url).toBeUndefined();
  });
});

describe('cameraCity', () => {
  it('still says County by default, so the US deployments are unchanged', () => {
    expect(cameraCity({ id: 1, county: 'Brevard' }, 'Florida')).toBe('Brevard County');
  });

  it('drops the suffix when a deployment asks for none', () => {
    expect(cameraCity({ id: 1, county: 'Halton' }, 'Ontario', '')).toBe('Halton');
  });

  it('falls back to the state when a row names no place at all', () => {
    expect(cameraCity({ id: 1 }, 'Alaska')).toBe('Alaska');
    expect(cameraCity({ id: 1, county: 'N/A', city: 'N/A' }, 'Alberta', '')).toBe('Alberta');
  });
});

describe('Wisconsin', () => {
  /* WisDOT ships its Madison Beltline "Flex" cameras at POINT (0 0) - 34 of
     489. They are rows we are right to refuse, and for a while refusing them
     is what kept the whole state dark: the loader's completeness check counted
     mapped cameras, so 455 of 489 read as a failed fetch. See the note on that
     check in ibi511.ts. */
  it('drops the unplaced Flex cameras without taking the state down with them', () => {
    const WISDOT: Ibi511Source = {
      base: 'https://511wi.gov',
      idPrefix: 'wisdot',
      source: 'WisDOT',
      state: 'Wisconsin',
      bounds: { minLat: 42.4, maxLat: 47.4, minLng: -93.0, maxLng: -86.2 },
    };
    const flex: Ibi511Record = {
      id: 700,
      roadway: 'US 12/18',
      location: 'US 12/18 at Rimrock Rd (Flex)',
      latLng: { geography: { wellKnownText: 'POINT (0 0)' } },
      images: [{ imageUrl: '/map/Cctv/700', blocked: false, disabled: false }],
    };
    expect(mapIbi511Record(flex, WISDOT)).toBeNull();

    const placed = mapIbi511Record({
      ...flex,
      latLng: { geography: { wellKnownText: 'POINT (-89.518702 44.454149)' } },
      county: 'Portage',
    }, WISDOT);
    expect(placed?.id).toBe('wisdot-700');
    expect(placed?.city).toBe('Portage County');
  });
});

describe('region wiring', () => {
  it('exports a loader for every new deployment', () => {
    for (const fetcher of [
      fetchNewYorkCameras, fetchPennsylvaniaCameras, fetchWisconsinCameras,
      fetchIdahoCameras, fetchAlaskaCameras, fetchOntarioCameras, fetchAlbertaCameras,
    ]) {
      expect(typeof fetcher).toBe('function');
    }
  });
});
