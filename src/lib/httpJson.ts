import https from 'https';

/**
 * OSIRIS — JSON fetch over Node's https client.
 *
 * Some upstreams OSIRIS depends on cannot be reached with the bundled undici
 * `fetch` from the Next server runtime — it stalls and throws
 * UND_ERR_CONNECT_TIMEOUT after 10s, while `https.get` to the same URL returns
 * in a few hundred ms. This helper is the shared escape hatch.
 *
 * It also sends a real identifying User-Agent rather than a spoofed browser
 * one: the OSM community endpoints (Nominatim, Overpass) reject browser UAs
 * with 406/429 and ask for contact details in their usage policies.
 */

export const OSIRIS_UA = 'OSIRIS-OSINT/1.0 (+https://github.com/simplifaisoul/osiris)';

export function httpJson<T>(
  url: string,
  { timeoutMs = 20000, headers = {} }: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: { 'User-Agent': OSIRIS_UA, Accept: 'application/json', 'Accept-Language': 'en', ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(body) as T); } catch (e) { reject(e); }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Upstream timed out')));
    req.on('error', reject);
  });
}

/** Resolve a promise to null instead of throwing — for optional enrichment calls. */
export async function optional<T>(p: Promise<T>): Promise<T | null> {
  try { return await p; } catch { return null; }
}
