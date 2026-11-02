/**
 * OSIRIS — Live Clouds worker: fetches NOAA's imagery and draws cloud tiles off
 * the main thread, so a globe's worth of tiles never stalls the map.
 *
 * Messages in: { type: 'tile', id, tile } and { type: 'cancel', id }.
 * Messages out: { id, rgba, height } or { id, error }; nothing for a cancelled tile.
 */

import {
  PADDED, REF_HEIGHT, REF_WIDTH,
  applyLut, clearSky, isCloudTile, matchLut, referenceFootprint, referenceHistogram, referenceUrl,
  renderClouds, tileClearSky, tileDaylight, tileHistogram, tileUrl,
  type Band, type ClearSky, type CloudImage, type Tile,
} from './live-clouds';

type Request = { type: 'tile'; id: number; tile: Tile } | { type: 'cancel'; id: number };

// The DOM typings describe a window; this file runs in a worker.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const jobs = new Map<number, AbortController>();

async function pixels(url: string, signal?: AbortSignal): Promise<Uint8ClampedArray> {
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`NOAA HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** A tile's pixels, refused unless NOAA sent the size asked for: anything else is an error page, not imagery. */
async function tilePixels(url: string, signal: AbortSignal): Promise<Uint8ClampedArray> {
  const rgba = await pixels(url, signal);
  if (rgba.length !== PADDED * PADDED * 4) throw new Error('Tile came back the wrong size');
  return rgba;
}

/** Each band's world reference for a frame, fetched once and shared by every tile of it. */
const references = new Map<string, Promise<Uint8Array | null>>();

function reference(band: Band, time: string): Promise<Uint8Array | null> {
  const key = `${band}@${time}`;
  let ref = references.get(key);
  if (!ref) {
    for (const old of references.keys()) if (!old.endsWith(`@${time}`)) references.delete(old);
    ref = pixels(referenceUrl(band, time)).then(rgba => {
      if (rgba.length !== REF_WIDTH * REF_HEIGHT * 4) throw new Error('Reference came back the wrong size');
      const grey = new Uint8Array(REF_WIDTH * REF_HEIGHT);
      for (let i = 0; i < grey.length; i++) grey[i] = rgba[i * 4];
      return grey;
    }).catch(() => {
      // Tiles still draw, unmatched, and the next one asks again.
      references.delete(key);
      return null;
    });
    references.set(key, ref);
  }
  return ref;
}

/** The frame's clear-sky grid, worked out once from its infrared reference. */
let sky: { time: string; grid: ClearSky } | null = null;
function clearSkyFor(time: string, ref: Uint8Array): ClearSky {
  if (sky?.time !== time) sky = { time, grid: clearSky(ref) };
  return sky.grid;
}

/** Put a tile's greys on the reference's scale, when there is a reference to match. */
function match(rgba: Uint8ClampedArray, ref: Uint8Array | null, tile: Tile) {
  if (!ref) return;
  const lut = matchLut(tileHistogram(rgba), referenceHistogram(ref, referenceFootprint(tile.z, tile.x, tile.y)));
  if (lut) applyLut(rgba, lut);
}

async function draw(tile: Tile, signal: AbortSignal): Promise<CloudImage> {
  if (!isCloudTile(tile)) throw new Error('Invalid clouds tile');
  const time = Date.parse(tile.time);
  // The visible band is black at night; a tile with no daylight skips it.
  const daylit = tileDaylight(tile.z, tile.x, tile.y, time) > 0;
  const [ir, vis, refIr, refVis] = await Promise.all([
    tilePixels(tileUrl('ir', tile), signal),
    daylit ? tilePixels(tileUrl('vis', tile), signal) : null,
    reference('ir', tile.time),
    daylit ? reference('vis', tile.time) : null,
  ]);
  match(ir, refIr, tile);
  if (vis) match(vis, refVis, tile);
  const clear = refIr ? tileClearSky(tile.z, tile.x, tile.y, clearSkyFor(tile.time, refIr)) : undefined;
  return renderClouds({ ir, clear, vis, z: tile.z, x: tile.x, y: tile.y, time });
}

scope.onmessage = async ({ data }) => {
  if (data.type === 'cancel') {
    jobs.get(data.id)?.abort();
    jobs.delete(data.id);
    return;
  }
  const controller = new AbortController();
  jobs.set(data.id, controller);
  try {
    const { rgba, height } = await draw(data.tile, controller.signal);
    if (!controller.signal.aborted) scope.postMessage({ id: data.id, rgba, height }, [rgba.buffer, height.buffer]);
  } catch (error) {
    if (!controller.signal.aborted) scope.postMessage({ id: data.id, error: String(error) });
  } finally {
    jobs.delete(data.id);
  }
};
