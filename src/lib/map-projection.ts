import type { Map, ProjectionSpecification } from 'maplibre-gl';

/* MapLibre's own adaptive globe, which is what shipped before #330 and what
   production last ran successfully. It holds a true globe at overview zooms
   and switches to mercator internally as you zoom in, so the library owns the
   transition rather than the app. */
export const GLOBE_PROJECTION: ProjectionSpecification = { type: 'globe' };

/* Terrain only. Finishing the local-plane transition by zoom 9 — before
   elevation can activate at 10, and while it stays on down to 9.5 — spares the
   renderer from compiling both globe+terrain and mercator+terrain GPU
   programs. That is a terrain optimisation, so it belongs to terrain. #330
   applied it to every session at every zoom and also baked it into the style,
   so the overview globe ran this path with terrain switched off, and the
   basemap stopped drawing there in production. */
export const TERRAIN_GLOBE_PROJECTION: ProjectionSpecification = {
  type: ['interpolate', ['linear'], ['zoom'], 7, 'vertical-perspective', 9, 'mercator'],
};

export function applyMapProjection(
  map: Pick<Map, 'getProjection' | 'setProjection'>,
  mode: 'globe' | 'mercator',
  terrainEnabled = false,
) {
  const next: ProjectionSpecification = mode === 'mercator'
    ? { type: 'mercator' }
    : terrainEnabled ? TERRAIN_GLOBE_PROJECTION : GLOBE_PROJECTION;
  // An omitted style projection is mercator, despite the library's return type.
  if (JSON.stringify(map.getProjection()?.type ?? 'mercator') === JSON.stringify(next.type)) return false;
  map.setProjection(next);
  return true;
}
