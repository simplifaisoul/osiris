#!/usr/bin/env node
/**
 * Builds the West Virginia DOT (WV511) camera catalogue.
 *
 *   node tools/generate-west-virginia-catalogue.mjs
 *
 * wv511.org lists its cameras in one file, wsvc/gmap.asmx/buildCamerasJSONjs
 * (about 130, with their positions), but names each camera's stream server
 * (vtc1, vtc2 or vtc3.roadsummary.com) only in that camera's player page,
 * flowplayeri.aspx?CAMID=<id>. That is one request per camera, too many for a
 * CCTV region at request time, so it is read here instead and written to
 * src/app/api/cctv/west-virginia.generated.ts.
 *
 * The streams are HLS, keyless, with Access-Control-Allow-Origin: *. There is
 * no still picture: the cameras are video only. A camera can move to another
 * stream server, so the catalogue keeps only its id and points at
 * /api/cctv/stream, which asks the player page where it is when it is opened.
 * Re-run this when WVDOT adds or removes cameras.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.wv511.org';
const OUT = fileURLToPath(new URL('../src/app/api/cctv/west-virginia.generated.ts', import.meta.url));
const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const TIMEOUT_MS = 20_000;
const CONCURRENCY = 4;
/** West Virginia, padded; a camera outside it is mis-geocoded. */
const BOUNDS = { minLat: 37.1, maxLat: 40.7, minLng: -82.7, maxLng: -77.6 };
/** The only place a stream may come from: WVDOT's stream servers. */
const STREAM = /https:\/\/(vtc\d+\.roadsummary\.com)\/rtplive\/([A-Za-z0-9_-]+)\/playlist\.m3u8/;

async function text(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 2) throw err;
    }
  }
}

const decodeHtml = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

/** `<div id="camDescription">[BER]I-81 @ 13 King Street<span …>West Virginia DOT</span></div>` → name and owner. */
function describe(html) {
  const m = String(html ?? '').match(/<div id="camDescription">([\s\S]*?)<span[^>]*>([\s\S]*?)<\/span>/);
  const clean = s => decodeHtml(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return {
    // The bracketed county code ("[BER]") is WV511's sort key, not part of the name.
    name: clean(m?.[1]).replace(/^\[[A-Z]{2,4}\]\s*/, ''),
    owner: clean(m?.[2]),
  };
}

async function plays(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
    return res.ok && (await res.text()).startsWith('#EXTM3U');
  } catch {
    return false;
  }
}

async function main() {
  const js = await text(`${BASE}/wsvc/gmap.asmx/buildCamerasJSONjs`);
  const at = js.indexOf('var camera_data = ');
  if (at < 0) throw new Error('buildCamerasJSONjs: no camera_data');
  // camera_data is the last thing in the file.
  const list = JSON.parse(js.slice(at + 'var camera_data = '.length).trim().replace(/;$/, ''))?.cams;
  if (!Array.isArray(list)) throw new Error('buildCamerasJSONjs: no cams');

  const sites = [];
  for (const c of list) {
    const id = String(c?.md5 ?? '');
    const lat = parseFloat(c?.start_lat), lng = parseFloat(c?.start_lng);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) continue;
    if (sites.some(s => s.id === id)) continue;
    sites.push({ id, lat, lng, ...describe(c.description), road: String(c.title ?? '').trim() });
  }
  console.log(`${sites.length} cameras listed`);

  const cameras = [];
  let silent = 0;
  const queue = [...sites];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        const page = await text(`${BASE}/flowplayeri.aspx?CAMID=${encodeURIComponent(s.id)}`);
        const m = page.match(STREAM);
        // The stream must be this camera's own.
        if (!m || m[2] !== s.id || !(await plays(m[0]))) { silent++; continue; }
        cameras.push({
          id: `wv-${s.id}`,
          lat: Math.round(s.lat * 1e6) / 1e6,
          lng: Math.round(s.lng * 1e6) / 1e6,
          name: s.name || s.road || `West Virginia camera ${s.id}`,
          city: 'West Virginia',
          country: 'US',
          stream_url: `/api/cctv/stream?src=wv&cam=${s.id}`,
          stream_type: 'hls',
          source: /^[\w .&'-]{3,40}$/.test(s.owner) ? s.owner : 'West Virginia DOT',
        });
      } catch (err) {
        console.warn(`${s.id}: ${err.message}`);
      }
    }
  }));
  if (cameras.length < sites.length / 2) throw new Error(`only ${cameras.length} of ${sites.length} cameras play; not writing the catalogue`);
  cameras.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

  const body = cameras.map(c => `  ${JSON.stringify(c)},`).join('\n');
  writeFileSync(OUT, `import type { CctvCamera } from './types';

/**
 * OSIRIS — West Virginia DOT (WV511) cameras (GENERATED).
 *
 * Written by tools/generate-west-virginia-catalogue.mjs from wv511.org — do not
 * edit by hand. Each stream_url leads to that camera's live HLS stream, on
 * whichever server has it when it is opened (see ../stream/route.ts); WV511
 * has no still pictures.
 */
export const WEST_VIRGINIA_CAMERAS: CctvCamera[] = [
${body}
];
`);
  console.log(`wrote ${cameras.length} cameras (${silent} with no stream answering) to ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
