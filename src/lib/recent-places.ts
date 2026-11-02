/**
 * Places this browser has flown to or routed to, newest first, so Search and
 * Directions can offer them before anything is typed. Kept in this browser's
 * localStorage only; nothing leaves the device.
 */

export interface RecentPlace {
  label: string;
  context?: string;
  lat: number;
  lng: number;
  /** poi | address | street | city | region | country | coordinate */
  kind?: string;
  at: number;
}

const KEY = 'osiris.recent-places';
export const RECENT_CAP = 6;

/** The same place, by name and position to about a hundred metres. */
const same = (a: Pick<RecentPlace, 'label' | 'lat' | 'lng'>, b: Pick<RecentPlace, 'label' | 'lat' | 'lng'>) =>
  a.label.toLowerCase() === b.label.toLowerCase() && Math.abs(a.lat - b.lat) < 0.001 && Math.abs(a.lng - b.lng) < 0.001;

/** The list with a place put at the front: once, newest first, at most RECENT_CAP long. */
export function withRecent(list: RecentPlace[], place: Omit<RecentPlace, 'at'>, at: number): RecentPlace[] {
  if (!place.label.trim() || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return list;
  return [{ ...place, at }, ...list.filter(p => !same(p, place))].slice(0, RECENT_CAP);
}

/** What a stored list may hold: anything malformed is dropped rather than shown. */
export function parseRecent(raw: string | null): RecentPlace[] {
  try {
    const v: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((p): p is RecentPlace =>
      Boolean(p) && typeof p.label === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.at),
    ).slice(0, RECENT_CAP);
  } catch {
    return [];
  }
}

export function loadRecent(): RecentPlace[] {
  try { return parseRecent(window.localStorage.getItem(KEY)); } catch { return []; }
}

export function rememberPlace(place: Omit<RecentPlace, 'at'>): RecentPlace[] {
  const next = withRecent(loadRecent(), place, Date.now());
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: the list just does not persist */ }
  return next;
}

export function forgetRecent(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}
