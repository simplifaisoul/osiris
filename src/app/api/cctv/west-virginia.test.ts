import { describe, expect, it } from 'vitest';
import { fetchWestVirginiaCameras } from './west-virginia';

describe('West Virginia DOT cameras (generated catalogue)', () => {
  it('lists each camera once, inside the state, playing its own stream from WVDOT', async () => {
    const cams = await fetchWestVirginiaCameras();
    expect(cams.length).toBeGreaterThan(50);
    expect(new Set(cams.map(c => c.id)).size).toBe(cams.length);
    for (const c of cams) {
      const id = c.id.match(/^wv-([A-Za-z0-9_-]+)$/)?.[1];
      expect(id).toBeTruthy();
      expect(c.lat).toBeGreaterThan(37.1);
      expect(c.lat).toBeLessThan(40.7);
      expect(c.lng).toBeGreaterThan(-82.7);
      expect(c.lng).toBeLessThan(-77.6);
      expect(c.stream_type).toBe('hls');
      expect(c.stream_url).toBe(`/api/cctv/stream?src=wv&cam=${id}`);
      expect(c.name).not.toMatch(/^\[/);
    }
  });
});
