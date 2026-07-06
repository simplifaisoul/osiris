import { describe, it, expect, beforeEach } from 'vitest';
import { createRegistry } from './registry';
import type { SourceAdapter } from './types';

function makeAdapter(id: string, category: SourceAdapter<unknown>['meta']['category']): SourceAdapter<unknown> {
  return {
    meta: {
      id,
      name: id,
      category,
      homepage: 'https://example.com',
      requiresKey: false,
      ttlSeconds: 60,
      minIntervalMs: 1000,
      attribution: 'Example',
    },
    isEnabled: () => true,
    fetch: async () => ({}),
  };
}

describe('createRegistry', () => {
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    registry = createRegistry();
  });

  it('returns undefined for an unregistered source id', () => {
    expect(registry.getSource('missing')).toBeUndefined();
  });

  it('registers a source and retrieves it by id', () => {
    const adapter = makeAdapter('usgs-earthquakes', 'seismic');
    registry.registerSource(adapter);
    expect(registry.getSource('usgs-earthquakes')).toBe(adapter);
  });

  it('lists all registered sources', () => {
    registry.registerSource(makeAdapter('a', 'seismic'));
    registry.registerSource(makeAdapter('b', 'weather'));
    expect(registry.listAll().map((a) => a.meta.id).sort()).toEqual(['a', 'b']);
  });

  it('lists sources filtered by category', () => {
    registry.registerSource(makeAdapter('a', 'seismic'));
    registry.registerSource(makeAdapter('b', 'weather'));
    registry.registerSource(makeAdapter('c', 'seismic'));
    expect(registry.listByCategory('seismic').map((a) => a.meta.id).sort()).toEqual(['a', 'c']);
  });

  it('returns an empty array for a category with no registered sources', () => {
    expect(registry.listByCategory('cyber')).toEqual([]);
  });

  it('registering a second adapter with the same id replaces the first', () => {
    const first = makeAdapter('dup', 'seismic');
    const second = makeAdapter('dup', 'weather');
    registry.registerSource(first);
    registry.registerSource(second);
    expect(registry.getSource('dup')).toBe(second);
    expect(registry.listAll()).toHaveLength(1);
  });
});
