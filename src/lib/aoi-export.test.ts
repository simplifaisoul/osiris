import { describe, it, expect } from 'vitest';
import {
  shapesToGeoJSON, contentsToGeoJSON, contentsToCSV,
  serializeShapes, deserializeShapes,
} from './aoi-export';
import { toShape } from './draw';
import type { AoiReport } from './aoi';

const area = toShape({ kind: 'polygon', coords: [[0, 0], [1, 0], [1, 1]] }, [], 0);
const path = toShape({ kind: 'line', coords: [[0, 0], [1, 0]] }, [], 1);
const circle = toShape(
  { kind: 'circle', coords: [[0, 0], [0, 0.5], [0, 1]], meta: { center: [0, 0], radiusKm: 111.19 } },
  [], 2,
);

const report: AoiReport = {
  total: 2,
  groups: [{
    key: 'military_flights', label: 'Military aircraft', color: '#FF3D3D', count: 2,
    items: [
      { id: 'a', label: 'RCH01', lat: 0.5, lng: 0.5, detail: 'C-17' },
      { id: 'b', label: 'BAD,"NAME"', lat: 0.25, lng: 0.25 },
    ],
    memberIds: ['a', 'b'],
  }],
};

describe('shapesToGeoJSON', () => {
  it('emits one feature per shape with measurements in properties', () => {
    const fc = shapesToGeoJSON([area, path]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties).toMatchObject({ name: area.name, kind: 'polygon' });
    expect(typeof fc.features[0].properties!.area_km2).toBe('number');
  });

  it('carries radius only for shapes that have one', () => {
    const fc = shapesToGeoJSON([circle, area]);
    expect(fc.features[0].properties!.radius_km).toBeCloseTo(111.19, 2);
    expect(fc.features[1].properties!.radius_km).toBeUndefined();
  });

  it('records creation time as ISO, not a raw epoch', () => {
    const fc = shapesToGeoJSON([area]);
    expect(String(fc.features[0].properties!.created)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('contentsToGeoJSON', () => {
  it('emits a point per found object, tagged with its layer and AOI', () => {
    const fc = contentsToGeoJSON(area, report);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [0.5, 0.5] });
    expect(fc.features[0].properties).toMatchObject({ aoi: area.name, layer: 'military_flights', label: 'RCH01' });
  });

  it('is empty when nothing was found', () => {
    expect(contentsToGeoJSON(area, { total: 0, groups: [] }).features).toHaveLength(0);
  });
});

describe('contentsToCSV', () => {
  it('writes a header and one row per object', () => {
    const lines = contentsToCSV(area, report).split('\r\n');
    expect(lines[0]).toBe('aoi,layer,label,detail,lat,lng');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('RCH01');
  });

  it('quotes fields containing commas or quotes, per RFC 4180', () => {
    // A label of BAD,"NAME" must not shift the columns of the row.
    const row = contentsToCSV(area, report).split('\r\n')[2];
    expect(row).toContain('"BAD,""NAME"""');
    // header has 6 columns; a naive split would give more if quoting were wrong
    expect(row.match(/,/g)!.length).toBeGreaterThanOrEqual(5);
  });

  it('writes coordinates at fixed precision', () => {
    expect(contentsToCSV(area, report)).toContain('0.500000,0.500000');
  });
});

describe('persistence', () => {
  it('round-trips shapes through storage', () => {
    const back = deserializeShapes(serializeShapes([area, path, circle]));
    expect(back).toHaveLength(3);
    expect(back[0].name).toBe(area.name);
    expect(back[0].geojson.geometry.type).toBe('Polygon');
    expect(back[1].geojson.geometry.type).toBe('LineString');
    expect(back[2].meta?.radiusKm).toBeCloseTo(111.19, 2);
  });

  it('returns nothing for absent or unparseable storage', () => {
    expect(deserializeShapes(null)).toEqual([]);
    expect(deserializeShapes('not json')).toEqual([]);
    expect(deserializeShapes('{"not":"an array"}')).toEqual([]);
  });

  it('drops only the malformed record, keeping the rest', () => {
    // Losing every AOI because one entry is broken is the worse failure.
    const good = JSON.parse(serializeShapes([area]));
    const raw = JSON.stringify([
      ...good,
      { id: 'x', name: 'no geometry' },
      { geojson: { geometry: { type: 'Polygon', coordinates: [[[0, 0]]] } } }, // no id/name
      { id: 'y', name: 'bad type', geojson: { geometry: { type: 'Point', coordinates: [0, 0] } } },
      null,
    ]);
    const back = deserializeShapes(raw);
    expect(back).toHaveLength(1);
    expect(back[0].name).toBe(area.name);
  });

  it('supplies defaults for missing derived values rather than NaN', () => {
    const raw = JSON.stringify([{
      id: 'z', name: 'sparse',
      geojson: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
    }]);
    const [s] = deserializeShapes(raw);
    expect(s.areaKm2).toBe(0);
    expect(s.color).toBe('#00E5FF');
    expect(Number.isFinite(s.createdAt)).toBe(true);
  });
});
