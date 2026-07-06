import { describe, it, expect, vi, afterEach } from 'vitest';
import { noaaTsunami } from './noaaTsunami';

afterEach(() => vi.unstubAllGlobals());

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#">
  <entry>
    <title>185 miles SW of Eugene, Oregon</title>
    <updated>2026-06-29T11:39:40Z</updated>
    <link rel="alternate" href="https://www.tsunami.gov/events/PAAQ/2026/06/29/x/1/WEAK51/WEAK51.txt"/>
    <geo:lat>43.502</geo:lat>
    <geo:long>-127.5</geo:long>
    <summary>Tsunami Information Statement Number 1</summary>
  </entry>
</feed>`;

describe('noaaTsunami adapter', () => {
  it('parses an Atom entry into a tsunami event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_ATOM }));
    const result = await noaaTsunami.fetch({ signal: new AbortController().signal });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: '185 miles SW of Eugene, Oregon', lat: 43.502, lng: -127.5 });
  });

  it('skips entries missing coordinates', async () => {
    const noCoords = SAMPLE_ATOM.replace(/<geo:lat>.*?<\/geo:lat>/, '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => noCoords }));
    const result = await noaaTsunami.fetch({ signal: new AbortController().signal });
    expect(result).toEqual([]);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(noaaTsunami.fetch({ signal: new AbortController().signal })).rejects.toThrow('500');
  });
});
