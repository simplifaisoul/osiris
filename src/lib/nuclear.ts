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

export const NUCLEAR_STATES: Record<NuclearState, StateStyle> = {
  conflict: { label: 'CONFLICT', color: '#FF1744', urgent: true },
  seismic: { label: 'SEISMIC', color: '#FF9500', urgent: true },
  construction: { label: 'BUILDING', color: '#00E5FF', urgent: false },
  offline: { label: 'OFFLINE', color: '#8A8880', urgent: false },
  online: { label: 'ONLINE', color: '#76FF03', urgent: false },
};

/** Rank used for sorting; lower sorts first. */
const STATE_ORDER: NuclearState[] = ['conflict', 'seismic', 'construction', 'online', 'offline'];

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

export interface NuclearSummary {
  total: number;
  /** Reactors at sites that are actually running. */
  reactors: number;
  /** Installed electrical capacity in MW, across running sites. */
  capacityMW: number;
  byState: Record<NuclearState, number>;
  countries: number;
  /** Sites needing attention — conflict or seismic. */
  alerts: number;
}

export function summarise(facilities: NuclearFacility[]): NuclearSummary {
  const byState: Record<NuclearState, number> = {
    conflict: 0, seismic: 0, construction: 0, offline: 0, online: 0,
  };
  let reactors = 0;
  let capacityMW = 0;
  const countries = new Set<string>();

  for (const f of facilities) {
    const state = nuclearState(f.status);
    byState[state]++;
    countries.add(f.country);
    // A decommissioned site's reactors are not generating anything.
    if (state !== 'offline') {
      reactors += f.reactors || 0;
      capacityMW += f.capacityMW || 0;
    }
  }

  return {
    total: facilities.length,
    reactors,
    capacityMW,
    byState,
    countries: countries.size,
    alerts: byState.conflict + byState.seismic,
  };
}

export type NuclearFilter = 'all' | 'alerts' | NuclearState;

/**
 * Filter by state and free-text query, then order worst-first so anything that
 * needs attention is at the top without the operator sorting for it.
 */
export function selectFacilities(
  facilities: NuclearFacility[],
  filter: NuclearFilter,
  query: string,
): NuclearFacility[] {
  const q = query.trim().toLowerCase();

  return facilities
    .filter(f => {
      const state = nuclearState(f.status);
      if (filter === 'alerts' && !NUCLEAR_STATES[state].urgent) return false;
      if (filter !== 'all' && filter !== 'alerts' && state !== filter) return false;
      if (!q) return true;
      return `${f.name} ${f.city} ${f.country} ${f.owner}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const rank = STATE_ORDER.indexOf(nuclearState(a.status)) - STATE_ORDER.indexOf(nuclearState(b.status));
      if (rank !== 0) return rank;
      // Within a state, the biggest sites first — they matter most.
      return (b.capacityMW || 0) - (a.capacityMW || 0);
    });
}

/** "5,700 MW" / "12.4 GW" — capacity spans three orders of magnitude. */
export function formatCapacity(mw: number): string {
  if (!mw) return '—';
  return mw >= 10_000 ? `${(mw / 1000).toFixed(1)} GW` : `${mw.toLocaleString()} MW`;
}
