/**
 * OSIRIS — the basemap's files: through our tile proxy, or from CARTO itself.
 *
 * The map's style, sprites, fonts and tiles come from CARTO's CDN and are asked
 * for through /api/proxy-tiles, so tiles already in our caches are served from
 * there. CARTO refuses that proxy at times, and a refused style file leaves the
 * whole map black. So if the proxy can't deliver a file, the browser asks CARTO
 * for it directly: CARTO's CDN serves browsers on any site.
 */
import type { AddProtocolAction } from 'maplibre-gl';

/** CARTO URLs are handed to MapLibre under this scheme, so they load through cartoLoader. */
export const CARTO_PROTOCOL = 'osiris-carto';

const CARTO_URL = /^https:\/\/([a-z0-9-]+\.)*cartocdn\.com\//i;

/** The URL the map should ask for: CARTO's files under CARTO_PROTOCOL, anything else unchanged. */
export function cartoRequestUrl(url: string): string {
  return CARTO_URL.test(url) ? `${CARTO_PROTOCOL}://${url.slice('https://'.length)}` : url;
}

/** Loads a CARTO_PROTOCOL URL: from the tile proxy, or from CARTO if the proxy fails. */
export function cartoLoader(fetcher: typeof fetch = (input, init) => fetch(input, init)): AddProtocolAction {
  return async (params, abortController) => {
    const url = `https://${params.url.slice(`${CARTO_PROTOCOL}://`.length)}`;
    const init: RequestInit = { signal: abortController.signal, headers: params.headers };
    let res: Response | undefined;
    try {
      res = await fetcher(`/api/proxy-tiles?url=${encodeURIComponent(url)}`, init);
    } catch (err) {
      if (abortController.signal.aborted) throw err;
    }
    if (!res?.ok) res = await fetcher(url, init);
    if (!res.ok) throw new Error(`CARTO answered ${res.status} for ${url}`);
    return {
      data: params.type === 'json' ? await res.json() : params.type === 'string' ? await res.text() : await res.arrayBuffer(),
      cacheControl: res.headers.get('Cache-Control'),
      expires: res.headers.get('Expires'),
    };
  };
}
