/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — Nuclear facility classification
 *
 *  /api/infrastructure returns a flat list whose `status` is free text, and
 *  which the route rewrites in place when a quake lands near a site
 *  ("SEISMIC RISK (M5.2)"). Everything that needs to colour, group, sort or
 *  count a facility goes through here so the map dots, the popup and the panel
 *  cannot drift apart.
 * ═══════════════════════════════════════════════════════════════
 */

export interface NuclearFacility {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  status: string;
  reactors: number;
  capacityMW: number;
  owner: string;
  /** Reference page for this specific site. Absent if none is known. */
  sourceUrl?: string;
}

/** Operational condition, worst-first — this order is the panel's sort order. */
export type NuclearState = 'conflict' | 'seismic' | 'construction' | 'offline' | 'online';

export interface StateStyle {
  /** Short label for tags and the popup. */
  label: string;
  color: string;
  /** Draws attention on the map and pulses in the panel. */
  urgent: boolean;
}

const NUCLEAR_STATES: Record<NuclearState, StateStyle> = {
  conflict: { label: 'CONFLICT', color: '#FF1744', urgent: true },
  seismic: { label: 'SEISMIC', color: '#FF9500', urgent: true },
  construction: { label: 'BUILDING', color: '#00E5FF', urgent: false },
  offline: { label: 'OFFLINE', color: '#8A8880', urgent: false },
  online: { label: 'ONLINE', color: '#76FF03', urgent: false },
};

/**
 * Reads the free-text status into a state.
 *
 * Order matters: the route overwrites `status` wholesale with the seismic
 * string, so a site that is both in a conflict zone and near a quake arrives
 * carrying only the seismic text. Conflict is still checked first for the case
 * where it survives.
 */
export function nuclearState(status: string): NuclearState {
  const s = (status || '').toLowerCase();
  if (s.includes('conflict')) return 'conflict';
  if (s.includes('seismic')) return 'seismic';
  if (s.includes('construction')) return 'construction';
  if (/decommission|destroyed|shutdown|suspended|exclusion|safe enclosure/.test(s)) return 'offline';
  return 'online';
}

export function nuclearStyle(status: string): StateStyle {
  return NUCLEAR_STATES[nuclearState(status)];
}

/** The magnitude the route embedded in a seismic status, if there is one. */
export function seismicMagnitude(status: string): number | null {
  const m = (status || '').match(/M(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/** "5,700 MW" / "12.4 GW" — capacity spans three orders of magnitude. */
export function formatCapacity(mw: number): string {
  if (!mw) return '—';
  return mw >= 10_000 ? `${(mw / 1000).toFixed(1)} GW` : `${mw.toLocaleString()} MW`;
}
