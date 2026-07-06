import { describe, it, expect } from 'vitest';
import { createCache } from './cache';

describe('createCache', () => {
  it('returns undefined on a miss', () => {
    const cache = createCache(() => 0);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns the value on a hit within the TTL window', () => {
    let now = 1000;
    const cache = createCache(() => now);
    cache.set('k', { a: 1 }, 60);
    now += 30_000;
    expect(cache.get('k')).toEqual({ a: 1 });
  });

  it('returns undefined once the TTL has expired', () => {
    let now = 1000;
    const cache = createCache(() => now);
    cache.set('k', 'v', 60);
    now += 61_000;
    expect(cache.get('k')).toBeUndefined();
  });

  it('getStale returns the value even after expiry', () => {
    let now = 1000;
    const cache = createCache(() => now);
    cache.set('k', 'v', 60);
    now += 61_000;
    expect(cache.getStale('k')).toBe('v');
  });

  it('getStale returns undefined for a key that was never set', () => {
    const cache = createCache(() => 0);
    expect(cache.getStale('never')).toBeUndefined();
  });

  it('a later set overwrites the previous value and TTL', () => {
    let now = 1000;
    const cache = createCache(() => now);
    cache.set('k', 'first', 60);
    cache.set('k', 'second', 60);
    expect(cache.get('k')).toBe('second');
  });
});
