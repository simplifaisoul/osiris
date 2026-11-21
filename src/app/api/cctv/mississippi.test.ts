import { describe, expect, it } from 'vitest';
import { fetchMississippiCameras } from './mississippi';

describe('Mississippi DOT cameras (generated catalogue)', () => {
  it('lists one camera per site, each inside the state, with a unique id', async () => {
    const cams = await fetchMississippiCameras();
    expect(cams.length).toBeGreaterThan(300);
    expect(new Set(cams.map(c => c.id)).size).toBe(cams.length);
    for (const c of cams) {
      expect(c.id).toMatch(/^ms-\d+$/);
      expect(c.lat).toBeGreaterThan(30.0);
      expect(c.lat).toBeLessThan(35.1);
      expect(c.lng).toBeGreaterThan(-91.7);
      expect(c.lng).toBeLessThan(-88.0);
      expect(c.source).toBe('Mississippi DOT');
    }
  });

  it("plays each site's live stream, and a frame of the same stream as its still, wherever MDOT has it when opened", async () => {
    for (const c of await fetchMississippiCameras()) {
      expect(c.stream_type).toBe('hls');
      const site = c.id.slice('ms-'.length);
      expect(c.stream_url).toMatch(new RegExp(`^/api/cctv/stream\\?src=ms&site=${site}&cam=[\\w-]+$`));
      expect(c.feed_url).toBe(`${c.stream_url}&still=1`);
    }
  });
});
