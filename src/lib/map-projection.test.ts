import { describe, expect, it, vi } from 'vitest';
import type { Map, ProjectionSpecification } from 'maplibre-gl';

import { applyMapProjection, GLOBE_PROJECTION, TERRAIN_GLOBE_PROJECTION } from './map-projection';
import { TERRAIN_MIN_ZOOM } from './map-terrain';

function fixture(initial?: ProjectionSpecification) {
  let current = initial;
  const map = { getProjection: () => current, setProjection: vi.fn((next: ProjectionSpecification) => { current = next; }) };
  return { map: map as unknown as Pick<Map, 'getProjection' | 'setProjection'>, set: map.setProjection };
}

describe('map projection', () => {
  /* #330 applied a zoom-interpolated projection to every session at every
     zoom, so the overview globe ran the terrain code path with terrain
     switched off — and in production the basemap stopped drawing there while
     the entity layers kept rendering. The terrain variant belongs to
     terrain. */
  it("uses MapLibre's own adaptive globe when terrain is off", () => {
    const { map, set } = fixture();
    expect(applyMapProjection(map, 'globe')).toBe(true);
    expect(set).toHaveBeenCalledWith({ type: 'globe' });
    expect(GLOBE_PROJECTION.type).toBe('globe');
  });

  it('reaches for the terrain projection only when terrain is on', () => {
    const { map, set } = fixture();
    applyMapProjection(map, 'globe', true);
    expect(set).toHaveBeenCalledWith(TERRAIN_GLOBE_PROJECTION);
    expect(TERRAIN_GLOBE_PROJECTION.type)
      .toEqual(['interpolate', ['linear'], ['zoom'], 7, 'vertical-perspective', 9, 'mercator']);
  });

  it('finishes the terrain transition before elevation can activate', () => {
    expect(9).toBeLessThan(TERRAIN_MIN_ZOOM - 0.5);
  });

  /* Deliberately the inverse of the old behaviour, which held one projection
     across a terrain toggle. Terrain now owns its projection, so switching it
     swaps them — and switching it back restores the plain globe. */
  it('swaps projections when terrain is toggled under the globe', () => {
    const { map, set } = fixture();
    applyMapProjection(map, 'globe');
    expect(applyMapProjection(map, 'globe', true)).toBe(true);
    expect(applyMapProjection(map, 'globe', true)).toBe(false);
    expect(applyMapProjection(map, 'globe')).toBe(true);
    expect(set).toHaveBeenCalledTimes(3);
  });

  it('handles styles with an omitted projection without crashing', () => {
    const { map, set } = fixture();
    expect(applyMapProjection(map, 'mercator')).toBe(false);
    expect(applyMapProjection(map, 'globe')).toBe(true);
    expect(set).toHaveBeenCalledWith(GLOBE_PROJECTION);
  });

  it('switches flat and globe views without a new map', () => {
    const { map, set } = fixture(GLOBE_PROJECTION);
    expect(applyMapProjection(map, 'mercator')).toBe(true);
    expect(applyMapProjection(map, 'mercator')).toBe(false);
    expect(applyMapProjection(map, 'globe')).toBe(true);
    expect(set).toHaveBeenCalledTimes(2);
  });
});
