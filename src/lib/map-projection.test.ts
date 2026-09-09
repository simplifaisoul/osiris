import { describe, expect, it, vi } from 'vitest';
import type { Map, ProjectionSpecification } from 'maplibre-gl';
import style from '../../public/dark-matter-style.json';
import { applyMapProjection, GLOBE_PROJECTION } from './map-projection';
import { TERRAIN_MIN_ZOOM } from './map-terrain';

function fixture(initial?: ProjectionSpecification) {
  let current = initial;
  const map = { getProjection: () => current, setProjection: vi.fn((next: ProjectionSpecification) => { current = next; }) };
  return { map: map as unknown as Pick<Map, 'getProjection' | 'setProjection'>, set: map.setProjection };
}

describe('adaptive terrain globe', () => {
  it('starts the local style in the same globe configuration', () => {
    expect(style.projection).toEqual(GLOBE_PROJECTION);
    expect(GLOBE_PROJECTION.type).toEqual(['interpolate', ['linear'], ['zoom'], 7, 'vertical-perspective', 9, 'mercator']);
    expect(9).toBeLessThan(TERRAIN_MIN_ZOOM - 0.5);
  });
  it('handles styles with an omitted projection without crashing', () => {
    const { map, set } = fixture();
    expect(applyMapProjection(map, 'mercator')).toBe(false);
    expect(applyMapProjection(map, 'globe')).toBe(true);
    expect(set).toHaveBeenCalledWith(GLOBE_PROJECTION);
  });
  it('does not reapply the projection when only terrain changes', () => {
    const { map, set } = fixture(structuredClone(GLOBE_PROJECTION));
    expect(applyMapProjection(map, 'globe')).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });
  it('switches flat and globe views without a new map', () => {
    const { map, set } = fixture(GLOBE_PROJECTION);
    expect(applyMapProjection(map, 'mercator')).toBe(true);
    expect(applyMapProjection(map, 'mercator')).toBe(false);
    expect(applyMapProjection(map, 'globe')).toBe(true);
    expect(set).toHaveBeenCalledTimes(2);
  });
});
