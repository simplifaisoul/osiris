import { describe, it, expect, vi, afterEach } from 'vitest';
import { shodanExposed } from './shodanExposed';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SHODAN_API_KEY;
});

describe('shodanExposed adapter', () => {
  describe('isEnabled', () => {
    it('is disabled when SHODAN_API_KEY is unset', () => {
      delete process.env.SHODAN_API_KEY;
      expect(shodanExposed.isEnabled()).toBe(false);
    });

    it('is enabled when SHODAN_API_KEY is set', () => {
      process.env.SHODAN_API_KEY = 'test-key';
      expect(shodanExposed.isEnabled()).toBe(true);
    });
  });

  describe('fetch', () => {
    it('normalizes a match with a resolved location', async () => {
      process.env.SHODAN_API_KEY = 'test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          matches: [{
            ip_str: '1.2.3.4', port: 8080, org: 'Acme ISP', product: 'Webcam XYZ',
            timestamp: '2026-01-01T00:00:00', location: { latitude: 10, longitude: 20, country_name: 'Testland', city: 'Testville' },
          }],
        }),
      }));
      const result = await shodanExposed.fetch({ signal: new AbortController().signal });
      expect(result).toEqual([{
        id: 'shodan-1.2.3.4-8080', lat: 10, lng: 20, ip: '1.2.3.4', port: 8080,
        org: 'Acme ISP', product: 'Webcam XYZ', country: 'Testland', city: 'Testville', timestamp: '2026-01-01T00:00:00',
      }]);
    });

    it('skips matches with no resolved location', async () => {
      process.env.SHODAN_API_KEY = 'test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ matches: [{ ip_str: '1.2.3.4', port: 80, location: {} }] }),
      }));
      const result = await shodanExposed.fetch({ signal: new AbortController().signal });
      expect(result).toEqual([]);
    });

    it('throws on a non-ok response', async () => {
      process.env.SHODAN_API_KEY = 'test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
      await expect(shodanExposed.fetch({ signal: new AbortController().signal })).rejects.toThrow('401');
    });
  });
});
