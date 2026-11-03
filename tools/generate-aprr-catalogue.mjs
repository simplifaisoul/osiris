#!/usr/bin/env node
/**
 * Builds the APRR / AREA motorway webcam catalogue.
 *
 *   node tools/generate-aprr-catalogue.mjs
 *
 * voyage.aprr.fr lists its webcams in two steps: one call for every camera's
 * position, then one call per camera for its name and video. That second step
 * is 124 requests, and from outside France it takes 25 seconds, far past what
 * a CCTV region is allowed at request time. So it is read here instead and
 * written to src/app/api/cctv/aprr.generated.ts.
 *
 * Nothing in the catalogue goes stale between runs except the camera list
 * itself. Each video address is a Viewsurf redirect that always lands on the
 * camera's newest 25-second clip, so a camera added a year ago still plays
 * today's traffic. Whether a camera is up right now is checked at refresh time
 * in france.ts, not here. Re-run it when APRR adds or moves cameras.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://voyage.aprr.fr';
const OUT = fileURLToPath(new URL('../src/app/api/cctv/aprr.generated.ts', import.meta.url));
const UA = 'OSIRIS-CCTV/1.0 (+https://osirisai.live)';
const TIMEOUT_MS = 20_000;
const CONCURRENCY = 4;

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return res.json();
}

/** "A31/A6|KM 304|sens Paris-Lyon" → { road: "A31/A6", heading: "sens Paris-Lyon" } */
function readTags(tags) {
  const parts = String(tags ?? '').split('|').map(s => s.trim()).filter(Boolean);
  return {
    road: parts[0] ?? '',
    heading: parts.find(p => /^sens\b/i.test(p)) ?? '',
  };
}

const list = await getJson('/api/aprr/pois/webcam');
const details = new Map();
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < list.length) {
    const poi = list[next++];
    try {
      const [row] = await getJson(`/api/aprr/pois/popin/webcam/${poi.id}`);
      if (row?.data) details.set(poi.id, row.data);
    } catch (e) {
      console.warn(`camera ${poi.id}: ${e.message}`);
    }
  }
}));

const cameras = [];
for (const poi of list) {
  const d = details.get(poi.id);
  const viewsurf = /[?&]id=(\d+)/.exec(d?.video ?? '')?.[1];
  const lat = Number(poi.coords?.lat);
  const lng = Number(poi.coords?.lon);
  if (!d?.title || !viewsurf || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  const { road, heading } = readTags(d.tags);
  cameras.push({
    id: `aprr-${poi.id}`,
    lat,
    lng,
    name: heading ? `${d.title.trim()} (${heading})` : d.title.trim(),
    city: road || 'France',
    country: 'France',
    stream_url: `https://gieat.viewsurf.com/?id=${viewsurf}&action=mediaRedirect`,
    stream_type: 'mp4',
    external_url: `${BASE}/node/${poi.id}`,
    source: 'APRR',
  });
}
cameras.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

const body = cameras.map(c => `  ${JSON.stringify(c)},`).join('\n');
writeFileSync(OUT, `import type { CctvCamera } from './types';

/**
 * OSIRIS — APRR / AREA motorway webcams (GENERATED).
 *
 * Written by tools/generate-aprr-catalogue.mjs from voyage.aprr.fr — do not
 * edit by hand. Each stream_url is a Viewsurf redirect to that camera's newest
 * 25-second clip, so the video stays live between regenerations.
 */
export const APRR_CAMERAS: CctvCamera[] = [
${body}
];
`);
console.log(`${cameras.length} of ${list.length} APRR cameras written to ${OUT}`);
