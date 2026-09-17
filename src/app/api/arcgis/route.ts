import { NextRequest, NextResponse } from 'next/server';
import { queryableResults } from '@/lib/arcgis-catalog';

/**
 * OSIRIS — ArcGIS Public Data Integration
 *
 * Two query modes:
 *   1. Search:  ?q=keyword&bbox=-105,35,-94,42
 *      Searches the ArcGIS Online catalog for public Feature Services
 *      and returns the ones whose URL can actually be queried.
 *
 *   2. Query:   ?service=<FeatureServiceURL>&bbox=-105,35,-94,42
 *      Runs a spatial query against a specific Feature Service layer and
 *      returns raw GeoJSON.
 *
 * No API key required — all requests target public data only.
 */

const ARCGIS_SEARCH_URL = 'https://www.arcgis.com/sharing/rest/search';
const SEARCH_RESULTS = 20;

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
        // Roughly a third of a page is app pages and URL-less items, which
        // are dropped below, so ask for more than one page shows.
        num: String(SEARCH_RESULTS * 2),
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

      const results = queryableResults(data.results || [], SEARCH_RESULTS).map((item: any) => ({
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
    try {
      // Normalise the URL — ensure it ends with /query
      let serviceUrl = service.replace(/\/+$/, '');
      if (!serviceUrl.endsWith('/query')) {
        // If the URL points at the service root, pick layer 0 by default
        if (!/\/\d+$/.test(serviceUrl)) {
          serviceUrl += '/0';
        }
        serviceUrl += '/query';
      }

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

      const res = await fetch(`${serviceUrl}?${params.toString()}`, {
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
      return NextResponse.json({ error: err.message || 'Query failed' }, { status: 500 });
    }
  }

  // ── No valid mode ───────────────────────────────────────────────────
  return NextResponse.json(
    { error: 'Provide ?q=keyword or ?service=URL' },
    { status: 400 },
  );
}
