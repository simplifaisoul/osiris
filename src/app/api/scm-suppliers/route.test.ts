import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const fires = vi.fn();
const disasters = vi.fn();
const conflict = vi.fn();
vi.mock('../fires/route', () => ({ GET: () => fires() }));
vi.mock('../gdelt/route', () => ({ GET: () => disasters() }));
vi.mock('@/lib/gdeltEvents', () => ({ fetchGdeltEvents: () => conflict() }));

import { GET } from './route';

const HSINCHU = { lat: 24.78, lng: 120.99 }; // next to TSMC Fab 12

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ features: [] })));
  fires.mockResolvedValue(NextResponse.json({ fires: [] }));
  disasters.mockResolvedValue(NextResponse.json({ events: [] }));
  conflict.mockResolvedValue({ events: [] });
});

const tsmc = async () => {
  const body = await (await GET()).json();
  return { body, site: body.suppliers.find((s: { id: string }) => s.id === 'sup-tsmc-hsinchu') };
};

describe('GET /api/scm-suppliers', () => {
  it('raises a site with fire hotspots next to it, read from the fires feed in-process', async () => {
    fires.mockResolvedValue(NextResponse.json({ fires: [{ ...HSINCHU, type: 'fire' }, { ...HSINCHU, type: 'fire' }] }));
    const { body, site } = await tsmc();
    expect(site.risk_level).toBe('HIGH');
    expect(site.active_threats).toContain('WILDFIRE PROXIMITY (2 hotspots)');
    expect(body.degraded_signals).toEqual([]);
  });

  it('reports conflict near a site as reported, not as a confirmed war', async () => {
    conflict.mockResolvedValue({ events: [HSINCHU] });
    const { site } = await tsmc();
    expect(site.risk_level).toBe('HIGH');
    expect(site.active_threats).toContain('CONFLICT REPORTED NEARBY (1 GDELT events)');
  });

  it('names a GDACS alert for what it is instead of calling it armed conflict', async () => {
    disasters.mockResolvedValue(NextResponse.json({ events: [{ ...HSINCHU, type: 'weather' }, { ...HSINCHU, type: 'wildfire' }] }));
    const { site } = await tsmc();
    expect(site.active_threats).toEqual(['GDACS ALERT: TROPICAL CYCLONE']);
  });

  it('says which signals did not run instead of passing silence off as safety', async () => {
    fires.mockRejectedValue(new Error('down'));
    disasters.mockResolvedValue(NextResponse.json({ events: [], error: 'GDACS unavailable' }));
    const { body, site } = await tsmc();
    expect(body.degraded_signals).toEqual(['fires', 'disaster_alerts']);
    expect(site.risk_level).toBe('NORMAL');
  });
});
