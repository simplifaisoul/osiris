/**
 * OSIRIS — the basemap's tiles: from our own tile server, or CARTO's copy when it can't deliver.
 *
 * Tiles come from /api/basemap, which relays our tile server. If that fails,
 * answers with an error, or hasn't started answering in time, the browser asks
 * the old CARTO tile proxy for the same tile of CARTO's Dark Matter, which uses
 * the same Protomaps schema and so draws in the same style. CARTO refuses new
 * requests, so only copies already in the proxy's caches answer: a backup,
 * not a source.
 */
import type { AddProtocolAction, GetResourceResponse } from 'maplibre-gl';

/** Our basemap tiles are handed to MapLibre under this scheme, so they load through basemapTileLoader. */
export const BASEMAP_PROTOCOL = 'osiris-basemap';

/** How long our tile server has to start answering. Only the wait is limited, never the download. */
export const PRIMARY_WAIT_MS = 5_000;

/** CARTO's Dark Matter tiles, in the version the proxy's caches hold. */
export const CARTO_BACKUP_TILES = 'https://tiles.basemaps.cartocdn.com/v/20261001-03/vectortiles/carto.streets/v2';

const TILE_PATH = /^\/api\/basemap\/tiles\/[^/]+\/(\d+)\/(\d+)\/(\d+)$/;

/** The URL the map should ask for: this site's basemap tiles under BASEMAP_PROTOCOL, by path; anything else unchanged. */
export function basemapRequestUrl(url: string, origin: string): string {
  return url.startsWith(`${origin}/api/basemap/tiles/`) ? `${BASEMAP_PROTOCOL}://${url.slice(origin.length)}` : url;
}

/** The old proxy's address for CARTO's copy of a tile, or null for anything that isn't a basemap tile. */
export function cartoBackupUrl(path: string): string | null {
  const m = TILE_PATH.exec(path);
  return m ? `/api/proxy-tiles?url=${encodeURIComponent(`${CARTO_BACKUP_TILES}/${m[1]}/${m[2]}/${m[3]}.mvt`)}` : null;
}

async function read(res: Response, url: string): Promise<GetResourceResponse<ArrayBuffer>> {
  // No content is an empty tile: sea, or nothing mapped there.
  if (res.status === 204) return { data: new ArrayBuffer(0) };
  if (!res.ok) throw new Error(`Basemap answered ${res.status} for ${url}`);
  return { data: await res.arrayBuffer(), cacheControl: res.headers.get('Cache-Control'), expires: res.headers.get('Expires') };
}

/** Loads a BASEMAP_PROTOCOL tile: from our tile server, or CARTO's cached copy if ours fails. */
export function basemapTileLoader(fetcher: typeof fetch = (input, init) => fetch(input, init), waitMs = PRIMARY_WAIT_MS): AddProtocolAction {
  return async (params, abortController) => {
    const path = params.url.slice(`${BASEMAP_PROTOCOL}://`.length);
    const mapSignal = abortController.signal;
    // Our server's try stops when the map cancels the tile, or when it hasn't started answering in time.
    const primary = new AbortController();
    const stop = () => primary.abort();
    if (mapSignal.aborted) stop();
    mapSignal.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, waitMs);
    let failure: unknown;
    try {
      const res = await fetcher(path, { signal: primary.signal });
      clearTimeout(timer);
      return await read(res, path);
    } catch (err) {
      if (mapSignal.aborted) throw err;
      failure = err;
    } finally {
      clearTimeout(timer);
      mapSignal.removeEventListener('abort', stop);
    }
    const backup = cartoBackupUrl(path);
    if (!backup) throw failure;
    return read(await fetcher(backup, { signal: mapSignal }), backup);
  };
}
