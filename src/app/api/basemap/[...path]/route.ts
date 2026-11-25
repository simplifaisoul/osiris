import { NextResponse } from 'next/server';
import style from '@/lib/basemap/dark-matter.json';

/**
 * OSIRIS — the basemap: CARTO's Dark Matter style over the Protomaps
 * OpenStreetMap world map, from our own tile server (Martin), kept on a
 * private network. Cloudflare caches what this route answers.
 *
 * GET /api/basemap/style                          the map style
 * GET /api/basemap/tiles/{tileset}/{z}/{x}/{y}    a vector tile
 * GET /api/basemap/fonts/{fontstack}/{range}      label glyphs, the stack's fonts merged in order
 * GET /api/basemap/sprite[@2x].{json,png}         the icon sheet
 *
 * BASEMAP_URL is the tile server and BASEMAP_TILESET the world map on it.
 * Tile addresses carry the tileset, so a new world map gets new addresses and
 * every tile can be cached for a year. Without BASEMAP_URL the style is
 * OpenFreeMap's Dark Matter, which browsers load from OpenFreeMap.
 */
export const dynamic = 'force-dynamic';

const FALLBACK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const YEAR = 'public, max-age=31536000, immutable';
const MONTH = 'public, max-age=2592000';
const SHORT = 'public, max-age=60';
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
const HOST = /^[a-z0-9.-]+(?::\d{1,5})?$/i;
const TILESET = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const FONTSTACK = /^[A-Za-z0-9 ,-]{1,1500}$/;
const SPRITE = /^sprite(@2x)?\.(json|png)$/;

/** This site's address as visitors see it. Only Host is read: Cloudflare sets it, and a forwarded header could be forged into the cached style. */
function publicOrigin(req: Request): string {
  const host = req.headers.get('host') ?? '';
  if (LOCAL_HOST.test(host)) return `http://${host}`;
  return `https://${HOST.test(host) ? host : 'osirisai.live'}`;
}

const styles = new Map<string, string>();
function styleFor(origin: string, tileset: string): string {
  const key = `${origin} ${tileset}`;
  let text = styles.get(key);
  if (!text) {
    text = JSON.stringify(style).replaceAll('@origin@', origin).replaceAll('@tileset@', tileset);
    if (styles.size > 16) styles.clear();
    styles.set(key, text);
  }
  return text;
}

/** Fetches one file from the tile server and answers with it, cached for `cache` when it exists. */
async function relay(url: string, contentType: string, cache: string): Promise<Response> {
  let res: Response;
  try {
    // No Next fetch cache: tiles stored there filled the servers' disks before.
    res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  } catch {
    return new NextResponse(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  // An empty tile (204) stays empty for this tileset, so it is cached like a full one.
  if (res.status === 204) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': cache } });
  if (res.status === 404) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': SHORT } });
  if (!res.ok) return new NextResponse(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(await res.arrayBuffer(), {
    headers: { 'Content-Type': res.headers.get('content-type') || contentType, 'Cache-Control': cache },
  });
}

const notFound = () => new NextResponse(null, { status: 404, headers: { 'Cache-Control': SHORT } });

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.map(part => { try { return decodeURIComponent(part); } catch { return ''; } });
  const server = process.env.BASEMAP_URL?.trim().replace(/\/+$/, '');
  const tileset = process.env.BASEMAP_TILESET?.trim() ?? '';
  const configured = !!server && /^https?:\/\//.test(server) && TILESET.test(tileset);

  if (path.length === 1 && path[0] === 'style') {
    if (!configured) {
      return NextResponse.redirect(FALLBACK_STYLE, { status: 307, headers: { 'Cache-Control': 'public, max-age=300' } });
    }
    return new NextResponse(styleFor(publicOrigin(req), tileset), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
    });
  }
  if (!configured) return notFound();

  const [kind, ...rest] = path;
  if (kind === 'tiles' && rest.length === 4) {
    const [set, ...zxy] = rest;
    const [z, x, y] = zxy.map(n => (/^\d{1,8}$/.test(n) ? Number(n) : -1));
    if (!TILESET.test(set) || z < 0 || z > 14 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return notFound();
    return relay(`${server}/${set}/${z}/${x}/${y}`, 'application/x-protobuf', YEAR);
  }
  if (kind === 'fonts' && rest.length === 2) {
    const [stack, range] = rest;
    const m = /^(\d{1,5})-(\d{1,5})$/.exec(range);
    if (!FONTSTACK.test(stack) || !m || Number(m[1]) % 256 !== 0 || Number(m[2]) !== Number(m[1]) + 255 || Number(m[2]) > 65535) return notFound();
    return relay(`${server}/font/${encodeURIComponent(stack)}/${range}`, 'application/x-protobuf', MONTH);
  }
  if (kind && SPRITE.test(kind) && rest.length === 0) {
    const [, retina, ext] = SPRITE.exec(kind)!;
    return relay(`${server}/sprite/osiris${retina ?? ''}.${ext}`, ext === 'png' ? 'image/png' : 'application/json', MONTH);
  }
  return notFound();
}
