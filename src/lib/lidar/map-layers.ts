import type { Map as MapLibreMap, GeoJSONSource, ImageSource, RasterTileSource } from 'maplibre-gl';
import type { LidarMapOverlay } from './store';
import { onReliefTile, RELIEF_MAX_ZOOM, RELIEF_MIN_ZOOM } from './relief-tiles';

/**
 * Puts the terrain tools' overlay on the map: lidar relief tiles under the
 * data layers (above satellite imagery), and the field picture and its lines
 * on top, where the operator is working.
 */

const RELIEF = 'lidar-relief';
const IMG = 'lidar-field-img';
const FIELD = 'lidar-field';
const PROFILE = 'lidar-profile';
const FONT = ['JetBrains Mono Bold', 'Open Sans Bold'];
const GOLD = '#FFD54A';

const FIELD_LAYERS = [
  'lidar-field-contour-existing', 'lidar-field-contour-design', 'lidar-field-stream-casing', 'lidar-field-stream',
  'lidar-field-split', 'lidar-cutout', 'lidar-field-outline', 'lidar-field-arrow', 'lidar-field-arrow-label',
  'lidar-field-outlet', 'lidar-field-outlet-label', 'lidar-field-vertex', 'lidar-field-vertex-label',
];
const PROFILE_LAYERS = ['lidar-profile-line', 'lidar-profile-cursor', 'lidar-profile-label'];

const kind = (k: string) => ['==', ['get', 'kind'], k] as ['==', ['get', string], string];

function addFieldLayers(map: MapLibreMap) {
  map.addLayer({ id: 'lidar-field-contour-existing', type: 'line', source: FIELD, filter: kind('contour-existing'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#101010', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 17, 1.1] } });
  map.addLayer({ id: 'lidar-field-contour-design', type: 'line', source: FIELD, filter: kind('contour-design'), layout: { 'line-cap': 'round' }, paint: { 'line-color': '#FF9D2E', 'line-opacity': 0.95, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 1.8] } });
  map.addLayer({ id: 'lidar-field-stream-casing', type: 'line', source: FIELD, filter: kind('stream'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#E8F3FF', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['get', 'ac'], 0.25, 2, 5, 3.5, 50, 6.5] } });
  map.addLayer({ id: 'lidar-field-stream', type: 'line', source: FIELD, filter: kind('stream'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1554D6', 'line-width': ['interpolate', ['linear'], ['get', 'ac'], 0.25, 0.9, 5, 2, 50, 4.2] } });
  map.addLayer({ id: 'lidar-field-split', type: 'line', source: FIELD, filter: kind('split'), layout: { 'line-cap': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 2.2 } });
  map.addLayer({ id: 'lidar-cutout', type: 'line', source: FIELD, filter: kind('cutout'), layout: { 'line-join': 'miter' }, paint: { 'line-color': GOLD, 'line-width': 2.5, 'line-dasharray': [3, 1.5] } });
  map.addLayer({ id: 'lidar-field-outline', type: 'line', source: FIELD, filter: kind('outline'), layout: { 'line-join': 'round' }, paint: { 'line-color': GOLD, 'line-width': 2, 'line-dasharray': [2.2, 1.6] } });
  map.addLayer({ id: 'lidar-field-arrow', type: 'line', source: FIELD, filter: kind('arrow'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['get', 'selected'], GOLD, '#FFFFFF'], 'line-width': 3 } });
  map.addLayer({ id: 'lidar-field-arrow-label', type: 'symbol', source: FIELD, filter: kind('arrow-label'), layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1.6], 'text-allow-overlap': true }, paint: { 'text-color': '#000', 'text-halo-color': ['case', ['get', 'selected'], GOLD, '#FFFFFF'], 'text-halo-width': 3 } });
  map.addLayer({ id: 'lidar-field-outlet', type: 'circle', source: FIELD, filter: kind('outlet'), paint: { 'circle-radius': 6, 'circle-color': '#1554D6', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'lidar-field-outlet-label', type: 'symbol', source: FIELD, filter: kind('outlet'), layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11, 'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF', 'text-halo-color': '#0B2A6B', 'text-halo-width': 2.5 } });
  map.addLayer({ id: 'lidar-field-vertex', type: 'circle', source: FIELD, filter: kind('vertex'), paint: { 'circle-radius': 7, 'circle-color': GOLD, 'circle-stroke-color': '#000', 'circle-stroke-width': 1 } });
  map.addLayer({ id: 'lidar-field-vertex-label', type: 'symbol', source: FIELD, filter: kind('vertex'), layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 10, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#000' } });
}

function addProfileLayers(map: MapLibreMap) {
  map.addLayer({ id: 'lidar-profile-line', type: 'line', source: PROFILE, filter: kind('profile'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#00E5FF', 'line-width': 3 } });
  map.addLayer({ id: 'lidar-profile-cursor', type: 'circle', source: PROFILE, filter: kind('profile-cursor'), paint: { 'circle-radius': 6, 'circle-color': '#00E5FF', 'circle-stroke-color': '#000', 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'lidar-profile-label', type: 'symbol', source: PROFILE, filter: kind('profile-cursor'), layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11, 'text-anchor': 'bottom', 'text-offset': [0, -1], 'text-allow-overlap': true }, paint: { 'text-color': '#00E5FF', 'text-halo-color': '#000', 'text-halo-width': 2 } });
}

/** Redraw relief tiles as their heights arrive, a batch at a time. */
function listenForTiles(map: MapLibreMap) {
  let ids: { x: number; y: number; z: number }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  onReliefTile((z, x, y) => {
    ids.push({ x, y, z });
    timer ??= setTimeout(() => {
      timer = null;
      const batch = ids;
      ids = [];
      if (map.getSource(RELIEF)) map.refreshTiles(RELIEF, batch);
    }, 150);
  });
}

export function syncLidarLayers(map: MapLibreMap, overlay: LidarMapOverlay | null | undefined, prev: LidarMapOverlay | null): void {
  const o = overlay ?? null;

  // Relief tiles.
  if (o?.relief) {
    const src = map.getSource(RELIEF) as RasterTileSource | undefined;
    if (!src) {
      listenForTiles(map);
      map.addSource(RELIEF, { type: 'raster', tiles: [o.relief.url], tileSize: 256, minzoom: RELIEF_MIN_ZOOM, maxzoom: RELIEF_MAX_ZOOM, attribution: 'Elevation: USGS 3DEP' });
      map.addLayer({ id: RELIEF, type: 'raster', source: RELIEF, paint: { 'raster-opacity': o.relief.opacity, 'raster-fade-duration': 0 } }, map.getLayer('day-night-fill') ? 'day-night-fill' : undefined);
    } else if (prev?.relief?.url !== o.relief.url) src.setTiles([o.relief.url]);
    map.setPaintProperty(RELIEF, 'raster-opacity', o.relief.opacity);
  } else if (map.getSource(RELIEF)) {
    onReliefTile(null);
    if (map.getLayer(RELIEF)) map.removeLayer(RELIEF);
    map.removeSource(RELIEF);
  }

  // Field picture.
  if (o?.image) {
    const coordinates = o.image.coordinates as [[number, number], [number, number], [number, number], [number, number]];
    const src = map.getSource(IMG) as ImageSource | undefined;
    if (!src) {
      map.addSource(IMG, { type: 'image', url: o.image.url, coordinates });
      map.addLayer({ id: IMG, type: 'raster', source: IMG, paint: { 'raster-opacity': o.image.opacity, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });
    } else if (prev?.image?.url !== o.image.url || JSON.stringify(prev?.image?.coordinates) !== JSON.stringify(coordinates)) {
      src.updateImage({ url: o.image.url, coordinates });
    }
    if (map.getLayer(IMG)) {
      map.setPaintProperty(IMG, 'raster-opacity', o.image.opacity);
      map.moveLayer(IMG);
    }
  } else if (map.getSource(IMG)) {
    if (map.getLayer(IMG)) map.removeLayer(IMG);
    map.removeSource(IMG);
  }

  // Field lines and labels, then the profile above them.
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const field = o?.field ?? empty;
  const profile = o?.profile ?? empty;
  if (!map.getSource(FIELD)) { map.addSource(FIELD, { type: 'geojson', data: field }); addFieldLayers(map); }
  else if (prev?.field !== field) (map.getSource(FIELD) as GeoJSONSource).setData(field);
  if (!map.getSource(PROFILE)) { map.addSource(PROFILE, { type: 'geojson', data: profile }); addProfileLayers(map); }
  else if (prev?.profile !== profile) (map.getSource(PROFILE) as GeoJSONSource).setData(profile);
  // Keep our work on top of layers other effects add later.
  if (o?.image || field.features.length || profile.features.length) {
    for (const id of [...FIELD_LAYERS, ...PROFILE_LAYERS]) if (map.getLayer(id)) map.moveLayer(id);
  }
}
