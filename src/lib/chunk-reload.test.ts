import { afterEach, describe, it, expect, vi } from 'vitest';
import { claimChunkReload, isChunkLoadError } from './chunk-reload';

afterEach(() => vi.unstubAllGlobals());

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v); },
  };
}

describe('isChunkLoadError', () => {
  it('recognises Turbopack’s chunk failure', () => {
    // As thrown by the Turbopack browser runtime when a chunk answers 404.
    const err = new Error('Failed to load chunk /_next/static/chunks/2grtubo9tv1cd.js from module 95643');
    err.name = 'ChunkLoadError';
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('recognises the browsers’ own wording for a failed dynamic import', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://osirisai.live/_next/static/chunks/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 412 failed.'))).toBe(true);
  });

  it('leaves every other error alone', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError('Failed to load chunk')).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('claimChunkReload', () => {
  it('allows one reload, then refuses another within the minute', () => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    expect(claimChunkReload(1_000_000)).toBe(true);
    expect(claimChunkReload(1_030_000)).toBe(false);
  });

  it('allows another once the minute has passed', () => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    expect(claimChunkReload(1_000_000)).toBe(true);
    expect(claimChunkReload(1_061_000)).toBe(true);
  });

  it('refuses when storage is blocked, rather than risk a reload loop', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} });
    expect(claimChunkReload()).toBe(false);
  });
});
