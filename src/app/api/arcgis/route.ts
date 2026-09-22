import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { safeFetch, isRateLimited, getClientIp } from '@/lib/ssrf-guard';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — ArcGIS Public Data Integration
 *
 * Two query modes:
 *   1. Search:  ?q=keyword&bbox=-105,35,-94,42
 *      Searches the ArcGIS Online catalog for public Feature Services.
 *
 *   2. Query:   ?service=<FeatureServiceURL>&bbox=-105,35,-94,42
 *      Runs a spatial query against a specific Feature Service layer and
 *      returns raw GeoJSON.
 *
 * No API key required — all requests target public data only.
 */

const ARCGIS_SEARCH_URL = 'https://www.arcgis.com/sharing/rest/search';

/*
 * `service` is a URL the caller chooses: the panel takes it from a catalog
 * search result, and organisations self-host ArcGIS Server on their own
 * domains, so there is no single host to pin. What can be pinned is the
 * shape — https, a genuine ArcGIS REST service path — and the target being
 * somewhere other than our own network, which safeFetch enforces on every
 * hop including redirects.
 *
 * This route previously passed `service` to fetch() with no checks at all, so
 * it would fetch any address the caller named and hand back the body: a
 * loopback service, another container, or a cloud metadata endpoint. The
 * mandatory "/query" suffix was no obstacle either, because it was appended to
 * the raw string — a trailing "#" made it part of a fragment, which is dropped
 * before the request goes out, so "http://127.0.0.1/internal#" fetched
 * /internal unchanged. The URL is therefore rebuilt through the URL object
 * here, never by concatenation.
 */
const ARCGIS_SERVICE_ROOT = /\/rest\/services\/.+\/(?:Feature|Map)Server$/i;

export interface ServiceTarget {
  /** The service itself, with no layer and no /query. */
  root: URL;
  /** The layer the caller asked for, or null if they named the service root. */
  layer: number | null;
}

/** A caller-supplied service URL, split and validated, or null if it is not one. */
export function featureServiceTarget(service: string): ServiceTarget | null {
  let url: URL;
  try {
    url = new URL(service);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  /* A published Feature Service is always on a name, never a bare address.
     Refusing literals here means a target like https://127.0.0.1/rest/services
     /x/FeatureServer/0 is turned away before a request is attempted, rather
     than relying on safeFetch to catch it at the socket. Names still go
     through safeFetch, which resolves them and re-checks every redirect. */
  if (isIP(url.hostname.replace(/^\[|\]$/g, ''))) return null;

  // Anything the caller hung off the end is dropped rather than carried along.
  url.hash = '';
  url.search = '';

  let path = url.pathname.replace(/\/+$/, '');
  if (/\/query$/i.test(path)) path = path.replace(/\/query$/i, '');

  let layer: number | null = null;
  const named = /\/(\d+)$/.exec(path);
  if (named) {
    layer = Number(named[1]);
    path = path.slice(0, -named[0].length);
  }
  if (!ARCGIS_SERVICE_ROOT.test(path)) return null;

  url.pathname = path;
  return { root: url, layer };
}

/*
 * ArcGIS publishes several kinds of service and the catalogue returns them all
 * side by side — a wildfire search comes back with eleven ImageServers among
 * the feature layers. An ImageServer serves rasters, so there is nothing to
 * import from it, but answering "must be an https ArcGIS Feature Service layer
 * URL" reads like a security refusal or a typo. Name the kind instead. This
 * only chooses the wording; no request is made either way.
 */
export function unsupportedServiceKind(service: string): string | null {
  const kind = /\/rest\/services\/.+\/(\w+Server)(?:\/\d+)?\/?(?:[?#].*)?$/i.exec(service)?.[1];
  if (!kind || /^(?:Feature|Map)Server$/i.test(kind)) return null;
  return kind;
}

/** Where a layer's features are asked for. */
export const layerQueryUrl = (root: URL, layer: number): URL => {
  const url = new URL(root.toString());
  url.pathname = `${root.pathname}/${layer}`;
  url.pathname += '/query';
  return url;
};

/*
 * Which layer to query when the caller named a service root.
 *
 * This used to be layer 0, always. Layer ids are assigned by whoever published
 * the service and frequently do not start at zero — a tiled MapServer in the
 * catalogue numbers its three layers 15, 16 and 17 — so "/0/query" returned
 * 404 and the panel reported "Feature Service query failed (404)". Ask the
 * service what it has instead.
 *
 * It also answers the other half of that failure: a tile cache
 * ("Map,TilesOnly,Tilemap") serves pictures, not features, and can never
 * answer a query at all. That is worth saying plainly rather than passing a
 * 404 through.
 */
interface ServiceInfo {
  capabilities?: string;
  layers?: { id?: number; name?: string; subLayerIds?: number[] | null }[];
  error?: { message?: string };
}
interface Discovered {
  layer?: number;
  error?: string;
  status?: number;
}
const SERVICE_INFO_TTL_MS = 30 * 60 * 1000;

async function discoverLayer(root: URL): Promise<Discovered> {
  const info = await cachedSource<Discovered>(
    `arcgis:info:${root.toString()}`,
    async () => {
      const probe = new URL(root.toString());
      probe.search = 'f=json';
      const res = await safeFetch(probe.toString(), { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return [{ error: `Service description unavailable (${res.status})`, status: 502 }];

      const body = (await res.json()) as ServiceInfo;

      /* Say what the service said. Some catalogue entries are subscription
         content and answer "Token Required for subscription content"; that is
         a far more useful thing to show than a guess of our own. */
      if (body.error?.message) {
        return [{ error: `The service refused the request: ${body.error.message}`, status: 422 }];
      }

      const capabilities = String(body.capabilities ?? '');
      if (capabilities && !/(^|,)\s*Query\s*(,|$)/i.test(capabilities)) {
        return [{
          error: 'This service publishes map tiles only, so it has no features to import.',
          status: 422,
        }];
      }
      /* Skip group layers. A group is a folder in the service's table of
         contents — it carries subLayerIds and no features of its own, and
         querying one is answered "Invalid or missing input parameters". One
         flood service in the catalogue leads with a group at id 0 and keeps
         its real parcels on 1..5. */
      const layer = (body.layers ?? []).find(
        l => typeof l.id === 'number' && !(Array.isArray(l.subLayerIds) && l.subLayerIds.length > 0),
      );
      /* A description we cannot read is not proof there is nothing there —
         fall back to the layer this route always used, and let the query
         itself report the outcome. */
      if (!layer) return [{ layer: 0 }];
      return [{ layer: layer.id }];
    },
    SERVICE_INFO_TTL_MS,
  )();
  return info[0] ?? { error: 'Service description unavailable', status: 502 };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get('q');
  const service = searchParams.get('service');
  const bbox = searchParams.get('bbox'); // "west,south,east,north"

  // ── Mode 1: Catalog Search ──────────────────────────────────────────
  if (q) {
    try {
      const params = new URLSearchParams({
        q,
        type: 'Feature Service',
        filter: 'access:public',
        num: '20',
        f: 'json',
      });
      if (bbox) params.set('bbox', bbox);

      const fetchWithRetry = async (url: string, attempts = 2) => {
        for (let i = 0; i < attempts; i++) {
          try {
            const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
            return r;
          } catch (e) {
            if (i === attempts - 1) throw e;
          }
        }
        throw new Error('All retries exhausted');
      };

      const res = await fetchWithRetry(`${ARCGIS_SEARCH_URL}?${params.toString()}`);

      if (!res.ok) {
        return NextResponse.json(
          { error: `ArcGIS search failed (${res.status})` },
          { status: res.status },
        );
      }

      const data = await res.json();

      if (data.error) {
        return NextResponse.json(
          { error: data.error.message || 'ArcGIS error' },
          { status: 502 },
        );
      }

      const results = (data.results || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        snippet: item.snippet || '',
        owner: item.owner,
        numViews: item.numViews ?? 0,
        extent: item.extent,
        tags: item.tags || [],
      }));

      return NextResponse.json(
        { results },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
          },
        },
      );
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return NextResponse.json({ error: 'ArcGIS search timed out' }, { status: 504 });
      }
      return NextResponse.json({ error: err.message || 'Search failed' }, { status: 500 });
    }
  }

  // ── Mode 2: Feature Service Spatial Query ───────────────────────────
  if (service) {
    const target = featureServiceTarget(service);
    if (!target) {
      const kind = unsupportedServiceKind(service);
      if (kind) {
        return NextResponse.json(
          { error: `This is an ArcGIS ${kind} — it serves imagery or tiles rather than map features, so there is nothing to import.` },
          { status: 422 },
        );
      }
      return NextResponse.json(
        { error: 'service must be an https ArcGIS Feature Service layer URL' },
        { status: 403 },
      );
    }
    if (isRateLimited(getClientIp(request), 30)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    try {
      let layer = target.layer;
      if (layer === null) {
        const found = await discoverLayer(target.root);
        if (found.layer === undefined) {
          return NextResponse.json({ error: found.error }, { status: found.status ?? 502 });
        }
        layer = found.layer;
      }
      const queryUrl = layerQueryUrl(target.root, layer);

      const params = new URLSearchParams({
        where: '1=1',
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        inSR: '4326',
        outSR: '4326',
        outFields: '*',
        returnGeometry: 'true',
        resultRecordCount: '2000',
        f: 'geojson',
      });

      if (bbox) {
        // bbox format: "west,south,east,north"
        params.set('geometry', bbox);
      }

      queryUrl.search = params.toString();
      const res = await safeFetch(queryUrl.toString(), {
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: `Feature Service query failed (${res.status})` },
          { status: res.status },
        );
      }

      const geojson = await res.json();

      if (geojson.error) {
        return NextResponse.json(
          { error: geojson.error.message || 'Feature Service error' },
          { status: 502 },
        );
      }

      return NextResponse.json(geojson, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      });
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return NextResponse.json({ error: 'Feature Service query timed out' }, { status: 504 });
      }
      // A target that resolved into a reserved range is refused, not a 500.
      if (String(err.message).startsWith('safeFetch: blocked')) {
        return NextResponse.json({ error: 'Forbidden target' }, { status: 403 });
      }
      return NextResponse.json({ error: err.message || 'Query failed' }, { status: 500 });
    }
  }

  // ── No valid mode ───────────────────────────────────────────────────
  return NextResponse.json(
    { error: 'Provide ?q=keyword or ?service=URL' },
    { status: 400 },
  );
}
