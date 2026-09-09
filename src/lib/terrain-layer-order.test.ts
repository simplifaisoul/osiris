import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { batchTerrainLayers } from './terrain-layer-order';

type Layer = { id: string; type: string };

// Representative ordering from OsirisMap: live circles and symbols separate
// day/night, network lines, scan connections, SDK paths and drawn regions.
const layers: Layer[] = [
  { id: 'background', type: 'background' },
  { id: 'roads', type: 'line' },
  { id: 'places', type: 'symbol' },
  { id: 'day-night-fill', type: 'fill' },
  { id: 'eq-circles', type: 'circle' },
  { id: 'cyber-arcs', type: 'line' },
  { id: 'satellites', type: 'custom' },
  { id: 'sweep-connections', type: 'line' },
  { id: 'news-dots', type: 'circle' },
  { id: 'sdk-air', type: 'line' },
  { id: 'buildings', type: 'fill-extrusion' },
];
const groundIds = ['background', 'roads', 'day-night-fill', 'cyber-arcs', 'sweep-connections', 'sdk-air'];
const overlayIds = ['places', 'eq-circles', 'satellites', 'news-dots', 'buildings'];

function createMap(initialLayers = layers) {
  let order = initialLayers.map(layer => layer.id);
  const byId = new Map(initialLayers.map(layer => [layer.id, layer]));
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());
  const map = {
    getLayersOrder: () => [...order],
    getLayer: (id: string) => byId.get(id),
    moveLayer: vi.fn((id: string, before?: string) => {
      if (!byId.has(id) || (before && !byId.has(before))) throw new Error('Layer missing');
      order = order.filter(item => item !== id);
      order.splice(before ? order.indexOf(before) : order.length, 0, id);
      // Exercise the guard even if a style implementation emits synchronously.
      emit();
    }),
    on: (_: string, callback: () => void) => listeners.add(callback),
    off: (_: string, callback: () => void) => listeners.delete(callback),
  };
  return {
    map: map as unknown as MapLibreMap, methods: map, emit, listeners,
    add: (layer: Layer, before?: string) => {
      byId.set(layer.id, layer);
      order.splice(before ? order.indexOf(before) : order.length, 0, layer.id);
      emit();
    },
    remove: (id: string) => {
      order = order.filter(item => item !== id);
      byId.delete(id);
      emit();
    },
  };
}

function terrainPasses(order: string[], ground: string[]) {
  const draped = new Set(ground);
  return order.filter((id, i) => draped.has(id) && (i === 0 || !draped.has(order[i - 1]))).length;
}

describe('terrain layer batching', () => {
  it('reduces five separated terrain stacks to one, preserving every layer and within-group order', () => {
    const fixture = createMap();
    const original = fixture.map.getLayersOrder();
    expect(terrainPasses(original, groundIds)).toBe(5);
    const restore = batchTerrainLayers(fixture.map);
    expect(fixture.map.getLayersOrder()).toEqual([...groundIds, ...overlayIds]);
    expect(terrainPasses(fixture.map.getLayersOrder(), groundIds)).toBe(1);
    restore();
    expect(fixture.map.getLayersOrder()).toEqual(original);
  });

  it('does not reorder on repeated paint or source updates', () => {
    const fixture = createMap();
    const restore = batchTerrainLayers(fixture.map);
    fixture.methods.moveLayer.mockClear();
    for (let i = 0; i < 100; i++) fixture.emit();
    expect(fixture.methods.moveLayer).not.toHaveBeenCalled();
    restore();
  });

  it('batches dynamically drawn areas and preserves satellite imagery insertion when leaving terrain', () => {
    const fixture = createMap();
    const restore = batchTerrainLayers(fixture.map);
    fixture.add({ id: 'satellite-layer', type: 'raster' }, 'day-night-fill');
    fixture.add({ id: 'drawn-fill', type: 'fill' });
    fixture.add({ id: 'drawn-label', type: 'symbol' });
    expect(terrainPasses(fixture.map.getLayersOrder(), [...groundIds, 'satellite-layer', 'drawn-fill'])).toBe(1);
    expect(fixture.map.getLayersOrder().at(-1)).toBe('drawn-label');
    restore();
    const expected = layers.map(layer => layer.id);
    expected.splice(expected.indexOf('day-night-fill'), 0, 'satellite-layer');
    expect(fixture.map.getLayersOrder()).toEqual([...expected, 'drawn-fill', 'drawn-label']);
  });

  it('does not restore deleted layers, handles re-entry, and cleans up listeners', () => {
    const fixture = createMap();
    const restore = batchTerrainLayers(fixture.map);
    fixture.remove('cyber-arcs');
    restore();
    restore();
    expect(fixture.map.getLayersOrder()).toEqual(layers.filter(layer => layer.id !== 'cyber-arcs').map(layer => layer.id));
    expect(fixture.listeners.size).toBe(0);
    const secondRestore = batchTerrainLayers(fixture.map);
    expect(terrainPasses(fixture.map.getLayersOrder(), groundIds)).toBe(1);
    secondRestore();
    expect(fixture.listeners.size).toBe(0);
  });

  it('does no work on an already batched style', () => {
    const fixture = createMap([{ id: 'ground', type: 'fill' }, { id: 'label', type: 'symbol' }]);
    const restore = batchTerrainLayers(fixture.map);
    expect(fixture.methods.moveLayer).not.toHaveBeenCalled();
    restore();
    expect(fixture.methods.moveLayer).not.toHaveBeenCalled();
  });
});
