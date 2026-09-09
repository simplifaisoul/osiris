import type { Map, ProjectionSpecification } from 'maplibre-gl';

// Keep the globe at overview zooms, but finish its local-plane transition
// before terrain can turn on (10) or remain on during zoom-out (9.5).
// This avoids compiling both globe+terrain and mercator+terrain GPU programs.
export const GLOBE_PROJECTION: ProjectionSpecification = {
  type: ['interpolate', ['linear'], ['zoom'], 7, 'vertical-perspective', 9, 'mercator'],
};

export function applyMapProjection(map: Pick<Map, 'getProjection' | 'setProjection'>, mode: 'globe' | 'mercator') {
  const next: ProjectionSpecification = mode === 'globe' ? GLOBE_PROJECTION : { type: 'mercator' };
  // An omitted style projection is mercator, despite the library's return type.
  if (JSON.stringify(map.getProjection()?.type ?? 'mercator') === JSON.stringify(next.type)) return false;
  map.setProjection(next);
  return true;
}
