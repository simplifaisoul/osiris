import { describe, it, expect } from 'vitest';
import { parseNzXml, fetchNewZealandCameras } from './newzealand';

/** A representative <camera> block, including the nested blocks that repeat <id>/<name>. */
function camera(overrides = '') {
  return `<camera><description>South along Hinds Highway</description><direction>Southbound</direction>` +
    `<group>NA</group><highway>SH1</highway><id>714</id><imageUrl>/camera/714.jpg</imageUrl>` +
    `<journey><id>86</id><name>SH1</name></journey>` +
    `<journeyLeg><name>Ashburton to Rangitata</name></journeyLeg>` +
    `<latitude>-43.919632</latitude><longitude>171.721055</longitude><name>SH1 Tinwald </name>` +
    `<offline>false</offline><region><id>11</id><name>Canterbury</name></region>` +
    `<underMaintenance>false</underMaintenance><viewUrl>/camera/view/714</viewUrl>` +
    `<way><id>805</id><name>01S</name></way>${overrides}</camera>`;
}
const wrap = (inner: string) => `<?xml version="1.0"?><response>${inner}</response>`;

describe('parseNzXml', () => {
  it('maps a camera block, preferring the top-level id/name over nested ones', () => {
    expect(parseNzXml(wrap(camera()))[0]).toEqual({
      id: 'nz-714',
      lat: -43.919632,
      lng: 171.721055,
      name: 'SH1 Tinwald (Southbound)',
      city: 'Canterbury',
      country: 'New Zealand',
      feed_url: 'https://trafficnz.info/camera/714.jpg',
      external_url: 'https://trafficnz.info/camera/view/714',
      source: 'NZTA',
    });
  });

  it('omits the direction suffix when it is absent or NA', () => {
    const na = camera().replace('<direction>Southbound</direction>', '<direction>NA</direction>');
    expect(parseNzXml(wrap(na))[0].name).toBe('SH1 Tinwald');
  });

  it('skips offline and under-maintenance cameras', () => {
    const offline = camera().replace('<offline>false</offline>', '<offline>true</offline>');
    const maint = camera().replace(
      '<underMaintenance>false</underMaintenance>',
      '<underMaintenance>true</underMaintenance>',
    );
    expect(parseNzXml(wrap(offline))).toEqual([]);
    expect(parseNzXml(wrap(maint))).toEqual([]);
  });

  it('falls back to description then a default name', () => {
    const noName = camera().replace('<name>SH1 Tinwald </name>', '');
    expect(parseNzXml(wrap(noName))[0].name).toBe('South along Hinds Highway (Southbound)');
    const bare = camera().replace('<name>SH1 Tinwald </name>', '').replace(
      '<description>South along Hinds Highway</description>',
      '',
    );
    expect(parseNzXml(wrap(bare))[0].name).toBe('NZTA Camera 714 (Southbound)');
  });

  it('skips entries missing an id, image, or coordinates', () => {
    expect(parseNzXml(wrap(''))).toEqual([]);
    expect(parseNzXml(wrap(camera().replace('<id>714</id>', '')))).toEqual([]);
    expect(parseNzXml(wrap(camera().replace('<imageUrl>/camera/714.jpg</imageUrl>', '')))).toEqual([]);
    expect(parseNzXml(wrap(camera().replace('<latitude>-43.919632</latitude>', '')))).toEqual([]);
  });

  it('drops coordinates outside the New Zealand bounding box', () => {
    // London — well outside NZ
    const bad = camera()
      .replace('<latitude>-43.919632</latitude>', '<latitude>51.5072</latitude>')
      .replace('<longitude>171.721055</longitude>', '<longitude>-0.1276</longitude>');
    expect(parseNzXml(wrap(bad))).toEqual([]);
  });

  it('de-duplicates repeated ids', () => {
    expect(parseNzXml(wrap(camera() + camera()))).toHaveLength(1);
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real NZTA endpoint).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchNewZealandCameras (live)', () => {
  liveIt('fetches well-formed New Zealand cameras', async () => {
    const cams = await fetchNewZealandCameras();
    expect(cams.length).toBeGreaterThan(100);
    expect(new Set(cams.map((c) => c.id)).size).toBe(cams.length);

    for (const cam of cams) {
      expect(cam.country).toBe('New Zealand');
      expect(cam.source).toBe('NZTA');
      expect(cam.feed_url).toMatch(/^https:\/\/trafficnz\.info\/camera\/.+\.jpg$/);
      expect(cam.lat).toBeGreaterThan(-47.5);
      expect(cam.lat).toBeLessThan(-34);
      expect(cam.lng).toBeGreaterThan(166);
      expect(cam.lng).toBeLessThan(179);
    }
  });
});
