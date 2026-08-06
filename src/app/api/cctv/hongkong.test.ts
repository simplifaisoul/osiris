import { describe, it, expect } from 'vitest';
import { parseTdXml, fetchHongKongCameras } from './hongkong';

// Two representative <image> blocks from the TD location index.
const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<image-list>
	<image>
		<key>H429F</key>
		<region>Hong Kong Island</region>
		<district>Southern</district>
		<description>Aberdeen Praya Road near Fish Market [H429F]</description>
		<easting>833549</easting>
		<northing>812187</northing>
		<latitude>22.24845</latitude>
		<longitude>114.1505</longitude>
		<url>https://tdcctv.data.one.gov.hk/H429F.JPG</url>
	</image>
	<image>
		<key>K101F</key>
		<region>Kowloon</region>
		<district>Sham Shui Po</district>
		<description>Kwai Chung Road &amp; Container Port Road [K101F]</description>
		<latitude>22.3372</latitude>
		<longitude>114.1542</longitude>
		<url>https://tdcctv.data.one.gov.hk/K101F.JPG</url>
	</image>
</image-list>`;

describe('parseTdXml', () => {
  it('maps an image block to a CctvCamera', () => {
    expect(parseTdXml(sampleXml)[0]).toEqual({
      id: 'hk-H429F',
      lat: 22.24845,
      lng: 114.1505,
      name: 'Aberdeen Praya Road near Fish Market',
      city: 'Southern',
      country: 'Hong Kong',
      feed_url: 'https://tdcctv.data.one.gov.hk/H429F.JPG',
      source: 'HK Transport Dept',
    });
  });

  it('strips the trailing [key] from the description and decodes entities', () => {
    const names = parseTdXml(sampleXml).map((c) => c.name);
    expect(names).toEqual([
      'Aberdeen Praya Road near Fish Market',
      'Kwai Chung Road & Container Port Road',
    ]);
  });

  it('falls back to region when district is missing', () => {
    const xml = sampleXml.replace('<district>Southern</district>', '');
    expect(parseTdXml(xml)[0].city).toBe('Hong Kong Island');
  });

  it('falls back to a default name when description is missing', () => {
    const xml = sampleXml.replace(
      '<description>Aberdeen Praya Road near Fish Market [H429F]</description>',
      '',
    );
    expect(parseTdXml(xml)[0].name).toBe('HK Camera H429F');
  });

  it('skips entries missing a key, url, or coordinates', () => {
    expect(parseTdXml('<image-list></image-list>')).toEqual([]);
    expect(parseTdXml(sampleXml.replace('<key>H429F</key>', ''))).toHaveLength(1);
    expect(
      parseTdXml(sampleXml.replace('<url>https://tdcctv.data.one.gov.hk/H429F.JPG</url>', '')),
    ).toHaveLength(1);
    expect(parseTdXml(sampleXml.replace('<latitude>22.24845</latitude>', ''))).toHaveLength(1);
  });

  it('drops coordinates outside the Hong Kong bounding box', () => {
    // London — well outside Hong Kong
    const xml = sampleXml
      .replace('<latitude>22.24845</latitude>', '<latitude>51.5072</latitude>')
      .replace('<longitude>114.1505</longitude>', '<longitude>-0.1276</longitude>');
    expect(parseTdXml(xml).map((c) => c.id)).toEqual(['hk-K101F']);
  });

  it('de-duplicates repeated keys', () => {
    const doubled = sampleXml.replace('</image-list>', '') +
      `<image>
        <key>H429F</key><district>Southern</district>
        <latitude>22.24845</latitude><longitude>114.1505</longitude>
        <url>https://tdcctv.data.one.gov.hk/H429F.JPG</url>
      </image></image-list>`;
    expect(parseTdXml(doubled)).toHaveLength(2);
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real data.gov.hk index).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchHongKongCameras (live)', () => {
  liveIt('fetches the full set of well-formed Hong Kong cameras', async () => {
    const cams = await fetchHongKongCameras();
    expect(cams.length).toBeGreaterThan(500);

    // No duplicate ids
    expect(new Set(cams.map((c) => c.id)).size).toBe(cams.length);

    for (const cam of cams) {
      expect(cam.country).toBe('Hong Kong');
      expect(cam.source).toBe('HK Transport Dept');
      expect(cam.feed_url).toMatch(/^https:\/\/tdcctv\.data\.one\.gov\.hk\/.+\.JPG$/i);
      expect(cam.lat).toBeGreaterThan(22.1);
      expect(cam.lat).toBeLessThan(22.6);
      expect(cam.lng).toBeGreaterThan(113.8);
      expect(cam.lng).toBeLessThan(114.5);
    }
  });
});
