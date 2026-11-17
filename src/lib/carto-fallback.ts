/**
 * OSIRIS — the basemap's files: through our tile proxy, or from CARTO itself.
 *
 * The map's style, sprites, fonts and tiles come from CARTO's CDN and are asked
 * for through /api/proxy-tiles, so tiles already in our caches are served from
 * there. CARTO refuses that proxy at times, and a refused style file leaves the
 * whole map black. So if the proxy can't deliver a file (an error, no answer
 * in time, or an answer cut off), the browser asks CARTO for it directly:
 * CARTO's CDN serves browsers on any site.
 */
import type { AddProtocolAction, GetResourceResponse, RequestParameters } from 'maplibre-gl';

/** CARTO URLs are handed to MapLibre under this scheme, so they load through cartoLoader. */
export const CARTO_PROTOCOL = 'osiris-carto';

/** How long the proxy has to start answering. Only the wait is limited, never the download: a low-zoom tile can be 500 KB on a slow phone. */
export const PROXY_WAIT_MS = 5_000;

const CARTO_URL = /^https:\/\/([a-z0-9-]+\.)*cartocdn\.com\//i;

/** The URL the map should ask for: CARTO's files under CARTO_PROTOCOL, anything else unchanged. */
export function cartoRequestUrl(url: string): string {
  return CARTO_URL.test(url) ? `${CARTO_PROTOCOL}://${url.slice('https://'.length)}` : url;
}

async function read(res: Response, url: string, type: RequestParameters['type']): Promise<GetResourceResponse<unknown>> {
  if (!res.ok) throw new Error(`CARTO answered ${res.status} for ${url}`);
  return {
    data: type === 'json' ? await res.json() : type === 'string' ? await res.text() : await res.arrayBuffer(),
    cacheControl: res.headers.get('Cache-Control'),
    expires: res.headers.get('Expires'),
  };
}

/** Loads a CARTO_PROTOCOL URL: from the tile proxy, or from CARTO if the proxy fails. */
export function cartoLoader(fetcher: typeof fetch = (input, init) => fetch(input, init), waitMs = PROXY_WAIT_MS): AddProtocolAction {
  return async (params, abortController) => {
    const url = `https://${params.url.slice(`${CARTO_PROTOCOL}://`.length)}`;
    const mapSignal = abortController.signal;
    // The proxy's try stops when the map cancels the file, or when the proxy hasn't started answering in time.
    const proxyTry = new AbortController();
    const stop = () => proxyTry.abort();
    if (mapSignal.aborted) stop();
    mapSignal.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, waitMs);
    try {
      const res = await fetcher(`/api/proxy-tiles?url=${encodeURIComponent(url)}`, { signal: proxyTry.signal, headers: params.headers });
      clearTimeout(timer);
      return await read(res, url, params.type);
    } catch (err) {
      if (mapSignal.aborted) throw err;
    } finally {
      clearTimeout(timer);
      mapSignal.removeEventListener('abort', stop);
    }
    return read(await fetcher(url, { signal: mapSignal, headers: params.headers }), url, params.type);
  };
}
