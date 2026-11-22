#!/usr/bin/env node
/**
 * Builds the names of SANRAL's i-traffic cameras.
 *
 *   node tools/generate-south-africa-catalogue.mjs
 *
 * i-traffic.co.za, the South African National Roads Agency's traffic site,
 * lists its cameras (about 1,240 around Johannesburg and Pretoria, Durban, Cape
 * Town and Gqeberha) in one keyless file, map/mapIcons/Cameras, with their
 * positions but no names. A camera's name ("GP CCTV N12 711") appears only in
 * its map tooltip, tooltip/Cameras/<id>, one request per camera: too many for a
 * CCTV region at request time, so they are read here instead and written to
 * src/app/api/cctv/south-africa.generated.ts. Positions, and which cameras
 * exist, still come from the live list (see ./south-africa.ts).
 *
 * i-traffic answers 429 when asked faster than about one request a second, so
 * this asks one at a time with a pause, waits when told to, and keeps the names
 * an earlier run already wrote. Re-run it when SANRAL adds cameras.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.i-traffic.co.za';
const OUT = fileURLToPath(new URL('../src/app/api/cctv/south-africa.generated.ts', import.meta.url));
const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const TIMEOUT_MS = 20_000;
/** Between requests, and after a 429 when the answer gives no Retry-After. */
const PAUSE_MS = 400;
const BACKOFF_MS = 30_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function get(url, as) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 429 && attempt < 4) {
        await sleep((Number(res.headers.get('retry-after')) || BACKOFF_MS / 1000) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return as === 'json' ? await res.json() : await res.text();
    } catch (err) {
      if (attempt >= 2) throw err;
    }
  }
}

/** A tooltip's label: "<img …> Camera GP CCTV N12 711" → "GP CCTV N12 711", or null for "Camera Not Found". */
function label(html) {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  if (!text || /Camera Not Found/i.test(text)) return null;
  const name = text.replace(/^Camera\s+/i, '').trim();
  return /^[\w ()./&'-]{2,60}$/.test(name) ? name : null;
}

async function main() {
  const icons = await get(`${BASE}/map/mapIcons/Cameras`, 'json');
  if (!Array.isArray(icons) || icons.length < 100) throw new Error(`expected a camera list, got ${String(icons).slice(0, 80)}`);
  const ids = [...new Set(icons.map(i => String(i.itemId)).filter(id => /^\d+--\d+$/.test(id)))];

  // Names an earlier run wrote, for cameras that are still listed.
  const names = {};
  if (existsSync(OUT)) {
    // A label never holds a quote or a backslash (see label()), so it is written as is.
    for (const [, id, name] of readFileSync(OUT, 'utf8').matchAll(/^  "(\d+--\d+)": "([^"]*)",$/gm)) {
      if (ids.includes(id)) names[id] = name;
    }
  }
  let missing = 0;
  for (const id of ids.filter(id => !names[id])) {
    try {
      const name = label(await get(`${BASE}/tooltip/Cameras/${id}?lang=en`));
      if (name) names[id] = name; else missing++;
    } catch (err) {
      missing++;
      console.warn(`${id}: ${err.message}`);
    }
    await sleep(PAUSE_MS);
  }
  const found = Object.keys(names).length;
  if (found < ids.length / 2) throw new Error(`only ${found} of ${ids.length} cameras named; not writing the catalogue`);

  const sorted = Object.keys(names).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const body = sorted.map(id => `  ${JSON.stringify(id)}: ${JSON.stringify(names[id])},`).join('\n');
  writeFileSync(OUT, `/**
 * OSIRIS — SANRAL i-traffic camera names (GENERATED).
 *
 * Written by tools/generate-south-africa-catalogue.mjs from i-traffic.co.za —
 * do not edit by hand. Keyed by the camera's id in map/mapIcons/Cameras; each
 * value is the label from that camera's map tooltip.
 */
export const SANRAL_CAMERA_LABELS: Record<string, string> = {
${body}
};
`);
  console.log(`wrote ${found} camera names (${missing} without one) to ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
