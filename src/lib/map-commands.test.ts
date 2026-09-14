import { describe, expect, it } from 'vitest';
import { parseMapCommand } from './map-commands';

describe('map commands', () => {
  it.each(['show cameras in London', '/show cameras near London', 'Please show CCTV in London.'])(
    'finds cameras without depending on a regional adapter: %s', text =>
      expect(parseMapCommand(text)).toEqual({ type: 'locate', query: 'london', cameras: true }),
  );
  it('distinguishes camera locations, layer controls, and panels', () => {
    expect(parseMapCommand('show cameras in Houston')).toEqual({ type: 'locate', query: 'houston', cameras: true });
    expect(parseMapCommand('hide cameras')).toEqual({ type: 'layer', layer: 'cctv', enabled: false });
    expect(parseMapCommand('show camera grid')).toEqual({ type: 'layer', layer: 'cctv_previews', enabled: true });
    expect(parseMapCommand('open layers')).toEqual({ type: 'panel', panel: 'layers', open: true });
    expect(parseMapCommand('close markets panel')).toEqual({ type: 'panel', panel: 'markets', open: false });
  });
  it('handles destinations and coordinates without confusing negative longitude', () => {
    expect(parseMapCommand('Fly to Austin, Texas')).toEqual({ type: 'locate', query: 'austin, texas', cameras: false });
    expect(parseMapCommand('go to 30.2672, -97.7431')).toEqual({ type: 'coordinates', lat: 30.2672, lng: -97.7431 });
    expect(parseMapCommand('go to 91, -97')).toBeNull();
    expect(parseMapCommand('go to 30, -181')).toBeNull();
  });
  it('rejects unknown or ambiguous actions', () => {
    for (const text of ['', 'delete everything', 'show constructor', 'show __proto__', 'fly to', 'zoom in and hide flights']) {
      expect(parseMapCommand(text)).toBeNull();
    }
    expect(parseMapCommand('zoom out')).toEqual({ type: 'zoom', delta: -1 });
    expect(parseMapCommand('reset view')).toEqual({ type: 'reset' });
  });
});
