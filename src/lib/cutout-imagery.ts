import type { Bbox } from './lidar/usgs';
import { tileRange } from './cutout-terrain';

/**
 * Satellite imagery for a cut-out, stitched from the same Esri World Imagery
 * tiles the SAT basemap shows. The service's one-shot `export` takes seconds
 * at 2048 px and never answers at 4096; its tiles come off a cache at once.
 */

const ESRI_TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const WORLD = 2 * Math.PI * 6378137;
const HALF = WORLD / 2;
const TILE = 256;
const MAX_ZOOM = 18;

/** The finest zoom whose picture of the box stays within `maxPx` and `maxTiles`. */
export function imageryZoom(merc: Bbox, maxPx: number, maxTiles: number): number {
  const span = Math.max(merc[2] - merc[0], merc[3] - merc[1]);
  for (let z = MAX_ZOOM; z > 0; z--) {
    const px = (span / WORLD) * TILE * 2 ** z;
    if (px <= maxPx && tileRange(merc, z).count <= maxTiles) return z;
  }
  return 0;
}

/** A canvas holding exactly the box, north up; null when no tile arrived. */
export async function loadImagery(merc: Bbox, maxPx = 4096, maxTiles = 180, signal?: AbortSignal): Promise<HTMLCanvasElement | null> {
  const z = imageryZoom(merc, maxPx, maxTiles);
  const r = tileRange(merc, z);
  const n = 2 ** z;
  const px = (x: number) => ((x + HALF) / WORLD) * n * TILE;
  const py = (y: number) => ((HALF - y) / WORLD) * n * TILE;
  const left = px(merc[0]), top = py(merc[3]);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(px(merc[2]) - left));
  canvas.height = Math.max(1, Math.round(py(merc[1]) - top));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#20251d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let drawn = 0;
  const jobs: Promise<void>[] = [];
  for (let ty = r.y0; ty <= r.y1; ty++) for (let tx = r.x0; tx <= r.x1; tx++) {
    jobs.push((async () => {
      try {
        const res = await fetch(`${ESRI_TILE}/${z}/${ty}/${tx}`, { signal, credentials: 'omit' });
        if (!res.ok) return;
        const bmp = await createImageBitmap(await res.blob());
        ctx.drawImage(bmp, tx * TILE - left, ty * TILE - top);
        bmp.close();
        drawn++;
      } catch { /* a missing tile leaves its square plain */ }
    })());
  }
  await Promise.all(jobs);
  return drawn ? canvas : null;
}
