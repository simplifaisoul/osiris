import { describe, it, expect } from 'vitest';
import { WORLD_LANDMARK_CAMERAS, fetchLandmarkCameras } from './landmarks';
import { inferStreamType } from './types';

describe('world landmark cameras', () => {
  it('puts a camera on Bourbon Street, which no DOT feed covers', async () => {
    const nola = WORLD_LANDMARK_CAMERAS.filter((c) => c.city === 'New Orleans');
    expect(nola.length).toBeGreaterThanOrEqual(2);
    const bourbon = nola.find((c) => c.name === 'Bourbon Street');
    expect(bourbon).toBeDefined();
    // French Quarter, not the I-610 freeway cameras 6km north.
    expect(bourbon!.lat).toBeGreaterThan(29.93);
    expect(bourbon!.lat).toBeLessThan(29.98);
    expect(bourbon!.lng).toBeGreaterThan(-90.09);
    expect(bourbon!.lng).toBeLessThan(-90.04);
  });

  it('gives every camera a playable embed the viewer can render', () => {
    for (const cam of WORLD_LANDMARK_CAMERAS) {
      expect(cam.stream_url, cam.name).toMatch(/^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}\?/);
      expect(cam.stream_type, cam.name).toBe('iframe');
      // The viewer decides how to render from the URL alone, so the URL has to
      // be one it recognises as an embed.
      expect(inferStreamType(cam.stream_url!), cam.name).toBe('iframe');
    }
  });

  it('has no duplicate ids or duplicate streams', () => {
    const ids = WORLD_LANDMARK_CAMERAS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const streams = WORLD_LANDMARK_CAMERAS.map((c) => c.stream_url);
    expect(new Set(streams).size).toBe(streams.length);
  });

  it('places every camera somewhere real', () => {
    for (const cam of WORLD_LANDMARK_CAMERAS) {
      expect(Number.isFinite(cam.lat), cam.name).toBe(true);
      expect(Number.isFinite(cam.lng), cam.name).toBe(true);
      // Null island is the classic bad geocode, and it is in the ocean.
      expect(Math.abs(cam.lat) + Math.abs(cam.lng), cam.name).toBeGreaterThan(0.01);
      expect(Math.abs(cam.lat), cam.name).toBeLessThanOrEqual(90);
      expect(Math.abs(cam.lng), cam.name).toBeLessThanOrEqual(180);
      expect(cam.name.trim(), 'name').not.toBe('');
      expect(cam.city.trim(), cam.name).not.toBe('');
      expect(cam.country.trim(), cam.name).not.toBe('');
    }
  });

  it('serves the same set through the fetcher', async () => {
    await expect(fetchLandmarkCameras()).resolves.toEqual(WORLD_LANDMARK_CAMERAS);
  });
});
