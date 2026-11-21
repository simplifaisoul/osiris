#!/usr/bin/env node
/**
 * Builds the Mississippi DOT (MDOTtraffic) camera catalogue.
 *
 *   node tools/generate-mississippi-catalogue.mjs
 *
 * mdottraffic.com lists its camera sites in one call (the map's
 * LoadCameraData page method: about 470 sites with their positions), but
 * names each site's cameras and their live streams only in that site's map
 * bubble, mapbubbles/camerasite.aspx?site=N. That is one request per site, far
 * too many for a CCTV region at request time, so it is read here instead and
 * written to src/app/api/cctv/mississippi.generated.ts.
 *
 * Each site becomes one pin, showing the first of its cameras whose stream
 * answers (as with Alaska's and South Dakota's sites). Streams are HLS from
 * MDOT's Wowza servers, keyless, with Access-Control-Allow-Origin: *; the
 * still is a frame of the same stream, taken when it is asked for.
 *
 * MDOT moves streams between those servers (130 of them in one night), so
 * the catalogue keeps only the site and the stream's name, and points at
 * /api/cctv/stream, which asks the site's page which server has it at the
 * moment it is opened. Re-run this when MDOT adds or removes camera sites.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.mdottraffic.com';
const OUT = fileURLToPath(new URL('../src/app/api/cctv/mississippi.generated.ts', import.meta.url));
const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const TIMEOUT_MS = 20_000;
const CONCURRENCY = 4;
/** Mississippi, padded; a site outside it is mis-geocoded. */
const BOUNDS = { minLat: 30.0, maxLat: 35.1, minLng: -91.7, maxLng: -88.0 };
/** The only hosts a stream may come from: MDOT's own Wowza servers. */
const STREAM_HOST = /^streaming[a-z0-9]*\.mdottraffic\.com$/;

async function request(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...init.headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return res;
    } catch (err) {
      if (attempt >= 2) throw err;
    }
  }
}

const decodeHtml = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

/** The cameras one bubble lists, in the order the site shows them: { title, host, app, stream }. */
function parseBubble(html) {
  const cams = [];
  const add = (src, title) => {
    let url;
    try { url = new URL(decodeHtml(src)); } catch { return; }
    const app = url.searchParams.get('application');
    const stream = url.searchParams.get('streamname');
    if (url.protocol !== 'https:' || !STREAM_HOST.test(url.hostname)) return;
    if (!app || !/^[A-Za-z0-9_-]+$/.test(app) || !stream || !/^[A-Za-z0-9_-]+\.stream$/.test(stream)) return;
    if (cams.some(c => c.stream === stream && c.host === url.hostname)) return;
    cams.push({ title: decodeHtml(title).replace(/\\'/g, "'").replace(/\s+/g, ' ').trim(), host: url.hostname, app, stream });
  };
  // A site with several cameras has a button for each: switchImage('<still>', '<id>', '<title>', …).
  for (const m of html.matchAll(/switchImage\('([^']+)',\s*'[^']*',\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1], m[2]);
  // A site with one camera has only the picture.
  if (!cams.length) {
    const img = html.match(/<img[^>]*id="camimg"[^>]*>/)?.[0] ?? '';
    const src = img.match(/src='([^']+)'|src="([^"]+)"/);
    const alt = img.match(/alt='([^']*)'|alt="([^"]*)"/);
    if (src) add(src[1] ?? src[2], (alt?.[1] ?? alt?.[2]) || '');
  }
  return cams;
}

const hlsUrl = c => `https://${c.host}/${c.app}/${c.stream}/playlist.m3u8`;
/** What the catalogue holds instead: see src/app/api/cctv/stream/route.ts. */
const located = (site, c) => `/api/cctv/stream?src=ms&site=${site}&cam=${c.stream.replace(/\.stream$/, '')}`;

async function plays(c) {
  try {
    const res = await fetch(hlsUrl(c), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
    return res.ok && (await res.text()).startsWith('#EXTM3U');
  } catch {
    return false;
  }
}

async function main() {
  const listRes = await request(`${BASE}/default.aspx/LoadCameraData`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
    body: '{}',
  });
  const markers = (await listRes.json())?.d;
  if (!Array.isArray(markers)) throw new Error('LoadCameraData: no site list');

  const sites = [];
  for (const m of markers) {
    const site = String(m?.markerid ?? '').match(/^camsite_(\d+)$/)?.[1];
    const { lat, lon: lng } = m ?? {};
    if (!site || typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) continue;
    if (sites.some(s => s.site === site)) continue;
    sites.push({ site, lat, lng, tooltip: String(m.tooltip ?? '').trim() });
  }
  console.log(`${sites.length} sites listed`);

  const cameras = [];
  let done = 0, silent = 0;
  const queue = [...sites];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        const html = await (await request(`${BASE}/mapbubbles/camerasite.aspx?site=${s.site}`)).text();
        let chosen = null;
        for (const c of parseBubble(html)) if (await plays(c)) { chosen = c; break; }
        if (!chosen) { silent++; continue; }
        cameras.push({
          id: `ms-${s.site}`,
          lat: Math.round(s.lat * 1e6) / 1e6,
          lng: Math.round(s.lng * 1e6) / 1e6,
          name: chosen.title || s.tooltip || `Mississippi camera ${s.site}`,
          city: 'Mississippi',
          country: 'US',
          feed_url: `${located(s.site, chosen)}&still=1`,
          stream_url: located(s.site, chosen),
          stream_type: 'hls',
          source: 'Mississippi DOT',
        });
      } catch (err) {
        console.warn(`site ${s.site}: ${err.message}`);
      } finally {
        if (++done % 50 === 0) console.log(`${done}/${sites.length}`);
      }
    }
  }));
  if (cameras.length < sites.length / 2) throw new Error(`only ${cameras.length} of ${sites.length} sites play; not writing the catalogue`);
  cameras.sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));

  const body = cameras.map(c => `  ${JSON.stringify(c)},`).join('\n');
  writeFileSync(OUT, `import type { CctvCamera } from './types';

/**
 * OSIRIS — Mississippi DOT (MDOTtraffic) cameras (GENERATED).
 *
 * Written by tools/generate-mississippi-catalogue.mjs from mdottraffic.com — do
 * not edit by hand. One camera per site; each stream_url leads to that
 * camera's live HLS stream and each feed_url to a frame of it, on whichever
 * MDOT server has it when it is opened (see ../stream/route.ts).
 */
export const MISSISSIPPI_CAMERAS: CctvCamera[] = [
${body}
];
`);
  console.log(`wrote ${cameras.length} cameras (${silent} sites with no stream answering) to ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
