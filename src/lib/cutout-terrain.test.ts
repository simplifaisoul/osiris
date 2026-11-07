import { describe, expect, it } from 'vitest';
import { decodeTerrarium, gridSize, heightAt, inUnitedStates, tileRange, tileZoom, type CutoutTerrain } from './cutout-terrain';
import { hostsFromC2, hostsFromMalware, hostsInBox } from './cutout-data';
import { toMerc } from './lidar/usgs';

describe('cut-out terrain', () => {
  it('sizes the grid to the box, long side first', () => {
    expect(gridSize(2000, 1000)).toEqual([256, 128]);
    expect(gridSize(500, 4000)).toEqual([32, 256]);
    expect(gridSize(10, 4000)).toEqual([16, 256]);
  });

  it('decodes terrarium heights', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(128, 100, 128)).toBe(100.5);
  });

  it('picks a tile zoom that keeps within the tile budget', () => {
    const [x0, y0] = toMerc(-0.2, 51.45), [x1, y1] = toMerc(0, 51.55);
    const merc: [number, number, number, number] = [x0, y0, x1, y1];
    const z = tileZoom(merc, 50, 51.5);
    expect(z).toBeGreaterThan(8);
    expect(tileRange(merc, z).count).toBeLessThanOrEqual(36);
  });

  it('asks USGS only inside the United States', () => {
    expect(inUnitedStates(-90.16, 35.86)).toBe(true);
    expect(inUnitedStates(-0.1, 51.5)).toBe(false);
  });

  it('reads heights at a point and nothing outside the box', () => {
    const [x0, y0] = toMerc(0, 0), [x1, y1] = toMerc(0.01, 0.01);
    const t = { w: 2, h: 2, z: new Float32Array([10, 20, 30, 40]), merc: [x0, y0, x1, y1] } as CutoutTerrain;
    expect(heightAt(t, 0.005, 0.005)).toBeCloseTo(25, 0);
    expect(heightAt(t, 0.02, 0.005)).toBeNull();
  });
});

describe('cut-out network hosts', () => {
  it('keeps city-placed hosts inside the box, one per address and port', () => {
    const malware = hostsFromMalware([
      { id: 'a', ip: '1.2.3.4', port: 443, lat: 51.5, lng: -0.1, malware: 'Sliver', threat_type: 'c2_server', city: 'London', country: 'GB' },
      { id: 'b', ip: '5.6.7.8', port: 80, lat: 48.8, lng: 2.3, malware: 'Remcos', threat_type: 'c2_panel' },
    ]);
    const c2 = hostsFromC2([
      { id: 'c', ip: '1.2.3.4', port: 443, lat: 51.5, lng: -0.1, malware: 'QakBot', location_precision: 'city' },
      { id: 'd', ip: '9.9.9.9', port: 8080, lat: 51.5, lng: -0.1, malware: 'Emotet', location_precision: 'country' },
    ]);
    expect(c2).toHaveLength(1);
    const inside = hostsInBox([...malware, ...c2], [-0.2, 51.4, 0, 51.6]);
    expect(inside.map(h => `${h.ip} ${h.role} ${h.family}`)).toEqual(['1.2.3.4 C2 server Sliver']);
  });
});
