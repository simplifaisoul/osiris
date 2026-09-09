import { describe, expect, it, vi } from 'vitest';
import { createSatelliteProgramCache } from './satellite-programs';
const shader = (variantName: string) => ({ variantName, vertexShaderPrelude: 'prelude', define: '' });

describe('satellite GPU program lifecycle', () => {
  it('allocates nothing until asked, and reuses programs across view switches', () => {
    const compile = vi.fn((kind: string) => ({ kind }));
    const cache = createSatelliteProgramCache(compile, vi.fn());
    expect(compile).not.toHaveBeenCalled();
    const first = cache.get(shader('globe'), 'marker');
    cache.get(shader('mercator'), 'marker');
    for (let i = 0; i < 30; i++) cache.get(shader(i % 2 ? 'globe' : 'mercator'), 'marker');
    expect(cache.get(shader('globe'), 'marker')).toBe(first);
    expect(compile).toHaveBeenCalledTimes(2);
    // No hidden pick/orbit compilation when merely drawing markers.
    expect(compile.mock.calls.every(args => args[0] === 'marker')).toBe(true);
  });
  it('releases all programs, including pick/orbit, when evicting or removing a map', () => {
    const compile = vi.fn(() => ({})); const destroy = vi.fn();
    const cache = createSatelliteProgramCache(compile, destroy, 2);
    for (const kind of ['marker', 'pick', 'orbit'] as const) cache.get(shader('a'), kind);
    cache.get(shader('b'), 'marker'); cache.get(shader('c'), 'marker');
    expect(destroy).toHaveBeenCalledTimes(3);
    cache.clear(); cache.clear();
    expect(destroy).toHaveBeenCalledTimes(5);
    expect(new Set(destroy.mock.calls.map(args => args[0])).size).toBe(5);
  });
  it('does not cache failed compiles or destroy a working program', () => {
    const compile = vi.fn().mockReturnValueOnce({}).mockImplementationOnce(() => { throw new Error('compile'); }).mockReturnValue({});
    const destroy = vi.fn(); const cache = createSatelliteProgramCache(compile, destroy);
    const first = cache.get(shader('globe'), 'marker');
    expect(() => cache.get(shader('globe'), 'pick')).toThrow('compile');
    expect(cache.get(shader('globe'), 'marker')).toBe(first);
    cache.get(shader('globe'), 'pick');
    expect(compile).toHaveBeenCalledTimes(3);
    expect(destroy).not.toHaveBeenCalled();
  });
});
