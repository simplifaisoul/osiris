import { describe, it, expect } from 'vitest';
import { US_SKYLINE_CAMERAS, fetchUsSkylineCameras } from './us-skyline.generated';
import { inferStreamType } from './types';

/** Rough box for each state this file claims cameras in. */
const BOXES: Record<string, [number, number, number, number]> = {
  California: [32.5, 42.1, -124.5, -114.1], Florida: [24.4, 31.1, -87.7, -79.9],
  Hawaii: [18.9, 22.3, -160.3, -154.7], Maryland: [37.9, 39.8, -79.5, -75.0],
  Massachusetts: [41.2, 42.9, -73.6, -69.9], Michigan: [41.6, 48.3, -90.5, -82.3],
  Minnesota: [43.4, 49.4, -97.3, -89.4], 'New Jersey': [38.9, 41.4, -75.6, -73.8],
  'New York': [40.4, 45.1, -79.8, -71.8], Oregon: [41.9, 46.3, -124.6, -116.4],
  Tennessee: [34.9, 36.7, -90.4, -81.6], Texas: [25.8, 36.6, -106.7, -93.4],
  Wisconsin: [42.4, 47.4, -93.0, -86.2],
};

describe('US Skyline cameras', () => {
  it('is a non-trivial set, all in the US', () => {
    expect(US_SKYLINE_CAMERAS.length).toBeGreaterThan(100);
    for (const c of US_SKYLINE_CAMERAS) expect(c.country, c.name).toBe('US');
  });

  /* The whole point of this file: these are broadcasts, not the frozen poster
     frames the other Skyline lists fall back on. Every one of the 90 US posters
     without a broadcast id was byte-identical 30s apart, so a `feed_url` here
     would be a still picture pretending to be a camera. */
  it('carries a live embed and never a snapshot url', () => {
    for (const c of US_SKYLINE_CAMERAS) {
      expect(c.stream_url, c.name).toMatch(/^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}\?/);
      expect(c.stream_type, c.name).toBe('iframe');
      expect(inferStreamType(c.stream_url!), c.name).toBe('iframe');
      expect(c.feed_url, c.name).toBeUndefined();
    }
  });

  it('lands every camera inside the continental US bounds', () => {
    for (const c of US_SKYLINE_CAMERAS) {
      // Hawaii reaches to -160; the rest sit well inside these.
      expect(c.lat, c.name).toBeGreaterThan(18);
      expect(c.lat, c.name).toBeLessThan(49.5);
      expect(c.lng, c.name).toBeGreaterThan(-161);
      expect(c.lng, c.name).toBeLessThan(-66);
    }
  });

  it('has no duplicate ids, streams, or same-name pins on one spot', () => {
    const ids = US_SKYLINE_CAMERAS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const streams = US_SKYLINE_CAMERAS.map((c) => c.stream_url);
    expect(new Set(streams).size).toBe(streams.length);
    const pins = US_SKYLINE_CAMERAS.map((c) => `${c.name}|${c.lat}|${c.lng}`);
    expect(new Set(pins).size).toBe(pins.length);
  });

  /* Skyline files every New York State camera under one /new-york/new-york/
     path, so those caption as the state. That is the only bucket where the
     path does not name a town, and it is true of all of them — Sag Harbor and
     East Hampton are in New York State as much as the Brooklyn Bridge is. Any
     OTHER state appearing as a city would mean the path parse had failed. */
  it('names a real town, except in the one bucket that has none', () => {
    const states = new Set(Object.keys(BOXES));
    const stateAsCity = US_SKYLINE_CAMERAS.filter((c) => states.has(c.city));
    expect([...new Set(stateAsCity.map((c) => c.city))]).toEqual(['New York']);
  });

  it('serves the same set through the fetcher', async () => {
    await expect(fetchUsSkylineCameras()).resolves.toEqual(US_SKYLINE_CAMERAS);
  });
});
