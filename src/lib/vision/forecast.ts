/**
 * OSIRIS vision for a forecast: looking through the cameras its plan asked for.
 *
 * When a question turns on something a street camera can show (traffic, a
 * crowd, a queue, floodwater, snow), the research plan names the places to
 * look. Each is found on the map, the nearest still cameras that answer are
 * counted by the same detector the overlay uses, and what they show becomes a
 * dated source the actors and the report can quote and cite, like any article.
 * Two cameras a place, four at most: a glimpse of the ground, not a survey.
 */
import { nominatim } from '@/lib/nominatim';
import type { ContextItem } from '@/lib/oi/types';
import { describeFrame, type FrameAnalysis } from './analysis';
import { frameOf, stillsNear, type CatalogueCamera, type Frame } from './frames';

export interface CameraDeps {
  geocode(place: string): Promise<{ lat: number; lng: number } | null>;
  near(lat: number, lng: number, radiusKm: number, limit: number): Promise<(CatalogueCamera & { km: number })[]>;
  frame(camera: CatalogueCamera): Promise<Frame>;
  analyse(bytes: Buffer, at: string): Promise<FrameAnalysis>;
}

interface NominatimRow { lat?: string; lon?: string }

const live: CameraDeps = {
  async geocode(place) {
    const rows = await nominatim<NominatimRow[]>('search', { q: place, limit: '1' });
    const lat = Number(rows?.[0]?.lat), lng = Number(rows?.[0]?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  },
  near: stillsNear,
  frame: frameOf,
  // Loaded only when a forecast actually looks: the detector is a few megabytes of WebAssembly.
  analyse: async (bytes, at) => (await import('./server')).analyseImage(bytes, at),
};

const PER_PLACE = 2;
const MAX = 4;
const RADIUS_KM = 25;

/** What a camera showed, as a source a forecast can quote. */
export function cameraItem(camera: CatalogueCamera & { km: number }, a: FrameAnalysis, place: string, id: string): ContextItem {
  const when = `${a.at.slice(0, 16).replace('T', ' ')} UTC`;
  const counted = Object.values(a.counts).some(n => (n ?? 0) > 0);
  // A model cannot see the picture: nothing counted must not read as "the road is empty".
  const saw = counted
    ? `showed ${describeFrame(a)}`
    : `showed nothing the detector could count: an empty scene, a camera showing a placeholder card, or a picture too dark or distant to read (it was ${a.light === 'bright' ? 'well lit' : a.light === 'dim' ? 'dim' : 'dark'})`;
  return {
    id,
    kind: 'camera',
    title: `Live camera: ${camera.name}`,
    source: camera.source || 'Public camera',
    published: a.at,
    ...(camera.page ? { url: camera.page } : {}),
    excerpt: `At ${when} this camera, ${camera.km} km from ${place}, ${saw}. Counted by OSIRIS's built-in detector, which misses small, distant or hidden objects, so the counts are a floor.`,
    place: [camera.city, camera.country].filter(Boolean).join(', ') || place,
    lat: camera.lat,
    lng: camera.lng,
  };
}

export async function cameraEvidence(places: string[], signal?: AbortSignal, deps: CameraDeps = live): Promise<ContextItem[]> {
  const items: ContextItem[] = [];
  const tried = new Set<string>();
  for (const place of places.slice(0, 2)) {
    if (signal?.aborted || items.length >= MAX) break;
    const at = await deps.geocode(place).catch(() => null);
    if (!at) continue;
    // A few spares: cameras go dark, and one that does not answer is passed over.
    const cameras = (await deps.near(at.lat, at.lng, RADIUS_KM, PER_PLACE * 3)).filter(c => !tried.has(c.id));
    let taken = 0;
    for (const camera of cameras) {
      if (taken >= PER_PLACE || items.length >= MAX || signal?.aborted) break;
      tried.add(camera.id);
      try {
        const frame = await deps.frame(camera);
        const analysis = await deps.analyse(frame.bytes, frame.at);
        items.push(cameraItem(camera, analysis, place, `v${items.length + 1}`));
        taken++;
      } catch {
        // Skipped: the next nearest camera is tried instead.
      }
    }
  }
  return items;
}
