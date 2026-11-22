import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchSouthAfricaCameras, mapSanralIcon, resetSanralPictureCheck, sanralName, sanralPictureCheck } from './south-africa';

vi.mock('./south-africa.generated', () => ({ SANRAL_CAMERA_LABELS: { '1--2': 'GP CCTV N12 711' } }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
  resetSanralPictureCheck();
});

describe('SANRAL cameras', () => {
  it('turns tooltip labels into readable names', () => {
    expect(sanralName('GP CCTV N12 711', '1')).toBe('N12 camera 711');
    expect(sanralName('N2-CCTV-401', '1')).toBe('N2 camera 401');
    expect(sanralName('WC CCTV N2 201B', '1')).toBe('N2 camera 201B');
    expect(sanralName('EC N2 CCTV 1101A(P) N2 Eastbound', '1')).toBe('N2 camera 1101A, Eastbound');
    expect(sanralName('GP CCTV 709A N12', '1')).toBe('N12 camera 709A');
    expect(sanralName('N3-CCTV-147NB_A', '1')).toBe('N3 camera 147NB-A');
    expect(sanralName('EC N2 CCTV 1101A(S) N2 Eastbound', '1')).toBe('N2 camera 1101A, Eastbound');
    expect(sanralName('WC CCTV N1 C190A', '1')).toBe('N1 camera C190A');
    expect(sanralName('WC CCTV N1 10B5 Ramp to N7/Wingfield', '1')).toBe('N1 camera 10B5, Ramp to N7/Wingfield');
    expect(sanralName('N2-CCTV-VMS-PS1', '1')).toBe('N2 camera PS1, VMS');
    expect(sanralName('GP CCTV N1 21 NB after Flying Saucer I/C', '1')).toBe('N1 camera 21, NB after Flying Saucer I/C');
    expect(sanralName('N3-CCTV-TruckstopA', '1')).toBe('N3 TruckstopA');
    expect(sanralName('WC CCTV N 217A N2', '1')).toBe('N2 camera 217A');
    expect(sanralName('WC CCTV R300 303A E', '1')).toBe('R300 camera 303A, East');
    expect(sanralName(undefined, '57')).toBe('SANRAL camera 57');
  });

  it('maps a map icon to a camera captioned with its traffic centre', () => {
    expect(mapSanralIcon({ itemId: '1--2', location: [-26.26888, 28.06085] }, { '1--2': 'GP CCTV N12 711' })).toEqual({
      id: 'sanral-1-2', lat: -26.26888, lng: 28.06085, name: 'N12 camera 711', city: 'Gauteng', country: 'South Africa',
      feed_url: 'https://www.i-traffic.co.za/map/Cctv/1--2', source: 'SANRAL',
    });
    expect(mapSanralIcon({ itemId: '9--4', location: [-33.9, 18.5] }, {})?.city).toBe('Cape Town, Western Cape');
    expect(mapSanralIcon({ itemId: '9--4', location: [51.5, -0.1] }, {})).toBeNull();
    expect(mapSanralIcon({ itemId: '../x', location: [-33.9, 18.5] }, {})).toBeNull();
  });

  it('shows every camera at once, then hides stand-in cards and frozen frames', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    let sizes: Record<string, number | null> = { '1--2': 5939, '2--2': 9338, '3--2': null, '4--2': 8120 };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/map/mapIcons/Cameras')) {
        return Response.json(Object.keys(sizes).map((itemId, i) => ({ itemId, location: [-26.2 - i / 10, 28.0] })));
      }
      expect(init?.method).toBe('HEAD');
      const bytes = sizes[url.split('/').pop()!];
      if (bytes === null) throw new Error('timeout');
      return new Response(null, { headers: { 'Content-Length': String(bytes) } });
    }));
    const ids = async () => (await fetchSouthAfricaCameras()).map(c => c.id);

    expect(await ids()).toEqual(['sanral-1-2', 'sanral-2-2', 'sanral-3-2', 'sanral-4-2']);
    await sanralPictureCheck();
    // The card is hidden; the camera whose size could not be read stays.
    expect(await ids()).toEqual(['sanral-2-2', 'sanral-3-2', 'sanral-4-2']);

    // Fifteen minutes on, a picture the same size as before is a frozen frame.
    sizes = { ...sizes, '4--2': 8164 };
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    await ids();
    await sanralPictureCheck();
    expect(await ids()).toEqual(['sanral-3-2', 'sanral-4-2']);
  });
});
