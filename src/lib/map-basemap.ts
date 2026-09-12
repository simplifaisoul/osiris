import type { ErrorEvent, Map, MapSourceDataEvent, VectorTileSource } from 'maplibre-gl';

/** The source id CARTO's style.json gives its vector tiles. */
export const BASEMAP_SOURCE = 'carto';
export const BASEMAP_MAX_ATTEMPTS = 8;
export const BASEMAP_RETRY_CAP_MS = 15_000;

export type BasemapStatus =
  | { state: 'loading' }
  | { state: 'retrying'; attempt: number }
  | { state: 'ready' }
  | { state: 'failed'; attempt: number };

/** 1s, 2s, 4s, 8s, then 15s: the proxy's own connect timeout is 10s, so a
 *  retry that lands in the same contention window still has to wait it out. */
export function basemapRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), BASEMAP_RETRY_CAP_MS);
}

/* A request the proxy answered with a 5xx, a rate limit, or no answer at all
   is worth repeating; a 404 or 403 is a fact about the URL and is not. A
   network failure rejects with a TypeError and carries no status. Anything
   else — a style validation error, say — is not a request and is left alone. */
export function isRetryableBasemapError(error: unknown): boolean {
  const status = (error as { status?: unknown } | undefined)?.status;
  if (typeof status === 'number') return status === 0 || status >= 500 || status === 429 || status === 408;
  return error instanceof Error && error.name === 'TypeError';
}

/**
 * Retries the basemap until it draws. MapLibre asks for the style once: a
 * failed style.json means `load` never fires, and a failed tiles.json is
 * treated as a loaded source with no tiles, so either leaves the map black
 * for the rest of the session. Both are single failed requests through
 * /api/proxy-tiles, which turns one connect timeout into a 500 while the
 * cold-start feed fetches are still in flight (#250).
 *
 * Nothing here runs on a timer. A retry is only ever a reply to an error
 * event from a basemap request, and the watcher stands down for good the
 * moment the first basemap tile loads, so a working map is never touched.
 */
export function watchBasemap(map: Map, styleUrl: string, onStatus: (status: BasemapStatus) => void) {
  let disposed = false;
  let styleLoaded = false;
  let ready = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: BasemapStatus | undefined;

  const report = (status: BasemapStatus) => {
    if (disposed) return;
    if (last && last.state === status.state && ('attempt' in last ? last.attempt : 0) === ('attempt' in status ? status.attempt : 0)) return;
    last = status;
    onStatus(status);
  };

  const retry = () => {
    timer = undefined;
    if (disposed || ready) return;
    // Once the style is in, the layers OsirisMap adds on `load` may be too;
    // reloading the source's TileJSON refetches its tiles and keeps them.
    const source = styleLoaded ? map.getSource(BASEMAP_SOURCE) as VectorTileSource | undefined : undefined;
    if (source?.url) {
      source.setUrl(source.url);
    } else {
      styleLoaded = false;
      map.setStyle(styleUrl, { diff: false });
    }
  };

  const schedule = () => {
    if (disposed || ready || timer !== undefined) return;
    if (attempt >= BASEMAP_MAX_ATTEMPTS) {
      report({ state: 'failed', attempt });
      return;
    }
    attempt += 1;
    report({ state: 'retrying', attempt });
    timer = setTimeout(retry, basemapRetryDelay(attempt));
  };

  const onStyleLoad = () => { styleLoaded = true; };
  const onSourceData = (event: MapSourceDataEvent) => {
    if (ready || event.sourceId !== BASEMAP_SOURCE || event.tile?.state !== 'loaded') return;
    ready = true;
    clearTimeout(timer);
    timer = undefined;
    report({ state: 'ready' });
  };
  const onError = (event: ErrorEvent & { sourceId?: string }) => {
    // Registering for `error` stops MapLibre printing these itself.
    console.warn('[OSIRIS] Map resource unavailable:', event.error);
    if (ready || !isRetryableBasemapError(event.error)) return;
    // Entity, terrain and imagery sources are not the basemap. Without a
    // sourceId the request was the style's own: style.json before it loaded,
    // a sprite or glyph range after, and the latter do not stop tiles drawing.
    if (event.sourceId ? event.sourceId !== BASEMAP_SOURCE : styleLoaded) return;
    schedule();
  };

  map.on('style.load', onStyleLoad);
  map.on('sourcedata', onSourceData);
  map.on('error', onError);
  report({ state: 'loading' });

  return {
    /** Starts the attempts over, immediately, for the button on the chip. */
    retry: () => {
      if (disposed || ready) return;
      clearTimeout(timer);
      timer = undefined;
      attempt = 1;
      report({ state: 'retrying', attempt });
      retry();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      map.off('style.load', onStyleLoad);
      map.off('sourcedata', onSourceData);
      map.off('error', onError);
    },
  };
}
