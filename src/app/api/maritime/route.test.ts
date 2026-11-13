import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMaritimeSnapshot, GET } from './route';
import { NextRequest } from 'next/server';

function ships(): Map<number, any> {
  const g = globalThis as any;
  if (!g.shipsCache) g.shipsCache = new Map();
  return g.shipsCache;
}

function makeReq(url = 'http://localhost/api/maritime') {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  ships().clear();
  clearMaritimeSnapshot();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('maritime', () => {
  it('still counts the ships sitting off a port', async () => {
    ships().set(1, { id: 1, mmsi: 1, lat: -12, lng: -77, speed: 0, type: 'Fishing', name: 'A', timestamp: Date.now() });
    ships().set(2, { id: 2, mmsi: 2, lat: -12.1, lng: -77.1, speed: 0, type: 'Cargo', name: 'B', timestamp: Date.now() });
    const res = await GET(makeReq());
    const data = await res.json();
    expect(data.length).toBe(2);
  });

  it('serves one snapshot to every caller inside the TTL', async () => {
    ships().set(1, { id: 1, mmsi: 1, lat: -12, lng: -77, speed: 0, type: 'Fishing', name: 'A', timestamp: Date.now() });
    const res1 = await GET(makeReq());
    const data1 = await res1.json();
    ships().set(2, { id: 2, mmsi: 2, lat: -12.1, lng: -77.1, speed: 0, type: 'Cargo', name: 'B', timestamp: Date.now() });
    const res2 = await GET(makeReq());
    const data2 = await res2.json();
    expect(data1.length).toBe(data2.length);
  });

  it('rebuilds once the TTL has passed', async () => {
    ships().set(1, { id: 1, mmsi: 1, lat: -12, lng: -77, speed: 0, type: 'Fishing', name: 'A', timestamp: Date.now() });
    const res1 = await GET(makeReq());
    await res1.json();
    vi.advanceTimersByTime(6000);
    ships().set(2, { id: 2, mmsi: 2, lat: -12.1, lng: -77.1, speed: 0, type: 'Cargo', name: 'B', timestamp: Date.now() });
    const res2 = await GET(makeReq());
    const data2 = await res2.json();
    expect(data2.length).toBe(2);
  });

  it('lets the browser and any CDN reuse the response', async () => {
    const res = await GET(makeReq());
    expect(res.headers.get('Cache-Control')).toContain('public');
    expect(res.headers.get('Cache-Control')).toContain('s-maxage');
  });
});