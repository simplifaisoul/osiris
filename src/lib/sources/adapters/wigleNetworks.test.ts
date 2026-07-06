import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wigleNetworks } from './wigleNetworks';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WIGLE_API_NAME;
  delete process.env.WIGLE_API_TOKEN;
});

describe('wigleNetworks adapter', () => {
  describe('isEnabled', () => {
    it('is disabled when neither credential is set', () => {
      expect(wigleNetworks.isEnabled()).toBe(false);
    });

    it('is disabled when only the API name is set', () => {
      process.env.WIGLE_API_NAME = 'name';
      expect(wigleNetworks.isEnabled()).toBe(false);
    });

    it('is enabled when both credentials are set', () => {
      process.env.WIGLE_API_NAME = 'name';
      process.env.WIGLE_API_TOKEN = 'token';
      expect(wigleNetworks.isEnabled()).toBe(true);
    });
  });

  describe('fetch', () => {
    beforeEach(() => {
      process.env.WIGLE_API_NAME = 'name';
      process.env.WIGLE_API_TOKEN = 'token';
    });

    it('throws when lat/lng params are missing', async () => {
      await expect(wigleNetworks.fetch({ signal: new AbortController().signal })).rejects.toThrow('lat/lng');
    });

    it('sends HTTP Basic auth built from the configured credentials', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
      vi.stubGlobal('fetch', fetchMock);
      await wigleNetworks.fetch({ signal: new AbortController().signal, params: { lat: '10', lng: '20' } });
      const [, init] = fetchMock.mock.calls[0];
      const expectedAuth = 'Basic ' + Buffer.from('name:token').toString('base64');
      expect(init.headers.Authorization).toBe(expectedAuth);
    });

    it('normalizes a result with a resolved location', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ trilat: 10.1, trilong: 20.1, ssid: 'MyNetwork', netid: 'AA:BB:CC:DD:EE:FF', encryption: 'wpa2', type: 'infra', lastupdt: '2026-01-01' }],
        }),
      }));
      const result = await wigleNetworks.fetch({ signal: new AbortController().signal, params: { lat: '10', lng: '20' } });
      expect(result).toEqual([{
        id: 'wigle-AA:BB:CC:DD:EE:FF', lat: 10.1, lng: 20.1, ssid: 'MyNetwork', bssid: 'AA:BB:CC:DD:EE:FF',
        encryption: 'wpa2', type: 'infra', lastUpdate: '2026-01-01',
      }]);
    });

    it('skips results with no resolved location or netid', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ ssid: 'NoCoords' }] }) }));
      const result = await wigleNetworks.fetch({ signal: new AbortController().signal, params: { lat: '10', lng: '20' } });
      expect(result).toEqual([]);
    });

    it('throws on a non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
      await expect(wigleNetworks.fetch({ signal: new AbortController().signal, params: { lat: '10', lng: '20' } })).rejects.toThrow('403');
    });
  });
});
