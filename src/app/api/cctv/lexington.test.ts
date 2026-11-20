import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchLexingtonCameras, mapLexingtonCamera, type LexingtonCameraFeature } from './lexington';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const frame = (stream: string) =>
  `https://6855e4345af72.streamlock.net:1935/thumbnail?application=lexington-live&streamname=${stream}.stream&fitmode=stretch&size=600x400`;

const lex = (stream: string, extra: Partial<LexingtonCameraFeature> = {}): LexingtonCameraFeature => ({
  attributes: { location: 'Alumni/New Circle', still_url: frame(stream) },
  geometry: { x: -84.4645713, y: 37.9951737 },
  ...extra,
});

describe('Lexington (LFUCG) cameras', () => {
  it('maps a camera by its stream name to a frame of its live stream', () => {
    expect(mapLexingtonCamera(lex('lex-cam-014'))).toEqual({
      id: 'lexky-lex-cam-014',
      lat: 37.995174,
      lng: -84.464571,
      name: 'Alumni/New Circle',
      city: 'Lexington',
      country: 'US',
      feed_url: frame('lex-cam-014'),
      source: 'LFUCG Traffic',
    });
  });

  it('leaves out frames from any other server and misplaced rows', () => {
    expect(mapLexingtonCamera(lex('a', { attributes: { location: 'X', still_url: 'https://elsewhere.example/thumbnail?streamname=a.stream' } }))).toBeNull();
    expect(mapLexingtonCamera(lex('lex-cam-001', { geometry: { x: 0, y: 0 } }))).toBeNull();
  });

  it('lists each camera once', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ features: [lex('lex-cam-001'), lex('lex-cam-001'), lex('lex-cam-002')] })));
    expect((await fetchLexingtonCameras()).map(c => c.id)).toEqual(['lexky-lex-cam-001', 'lexky-lex-cam-002']);
  });
});
