/**
 * OSIRIS — Network Intel's links, drawn with OI's arcs.
 *
 * Each C2 host on the Live Malware layer is joined to the hosts running the
 * same malware family, as a minimum spanning tree over great-circle distance:
 * every host of a family is reachable from every other, through its nearest
 * neighbours, with one line fewer than there are hosts. A line says one thing
 * the feeds record — these two servers run the same family — and is drawn
 * stronger when both sit in the same autonomous system, which can point to a
 * shared operator or hosting provider. It is not observed traffic.
 *
 * The lines are an instance of OI's own arc layer (see lib/oi/globe), so they
 * share its ribbons, glow, draw-in and travelling pulses rather than imitating
 * them. Their colour is their own Style Studio swatch, black by default.
 */
import type { Map as MlMap } from 'maplibre-gl';
import { createArcLayer, stampBirths } from './oi/globe';
import { distanceKm, rgb, type ArcSpec, type LngLat } from './oi/arcs';

export const NET_ARCS = 'net-intel-arcs';

/** The fields of a detection the links read. */
export interface FamilyHost {
  ip: string;
  lng: number;
  lat: number;
  malware: string;
  asn: number | null;
}

export interface FamilyLink {
  from: FamilyHost;
  to: FamilyHost;
  family: string;
  /** Both ends in the same autonomous system. */
  sameAs: boolean;
}

/**
 * Minimum spanning tree per family (Prim's, O(n²) per family: a few hundred
 * hosts at most). Hosts are taken in address order so the same input always
 * yields the same links, and an unchanged feed does not redraw its arcs.
 */
export function familyLinks(hosts: FamilyHost[]): FamilyLink[] {
  const families = new Map<string, FamilyHost[]>();
  for (const h of hosts) {
    if (!h.malware || !Number.isFinite(h.lng) || !Number.isFinite(h.lat)) continue;
    const key = h.malware.trim().toLowerCase();
    const group = families.get(key);
    if (group) group.push(h);
    else families.set(key, [h]);
  }

  const links: FamilyLink[] = [];
  for (const group of families.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.ip.localeCompare(b.ip));

    const n = group.length;
    const pos = group.map(h => [h.lng, h.lat] as LngLat);
    const done = new Array<boolean>(n).fill(false);
    const best = new Array<number>(n).fill(Infinity);
    const parent = new Array<number>(n).fill(-1);
    best[0] = 0;

    for (let step = 0; step < n; step++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || best[i] < best[u])) u = i;
      done[u] = true;
      const p = parent[u];
      if (p >= 0) {
        const from = group[p];
        const to = group[u];
        links.push({ from, to, family: to.malware, sameAs: from.asn !== null && from.asn === to.asn });
      }
      for (let v = 0; v < n; v++) {
        if (done[v]) continue;
        const d = distanceKm(pos[u], pos[v]);
        if (d < best[v]) { best[v] = d; parent[v] = u; }
      }
    }
  }
  return links;
}

export interface NetIntelArcs {
  /** Draws the links between these hosts; an empty list clears them. */
  set(hosts: FamilyHost[]): void;
  /** The links' colour, from the Style Studio. */
  setColor(hex: string): void;
  destroy(): void;
}

export function attachNetIntelArcs(map: MlMap): NetIntelArcs {
  const layer = createArcLayer(NET_ARCS);
  /** When each link started drawing, on the layer's clock. */
  const births = new Map<string, number>();

  // Beneath the malware dots, the way OI's arcs sit beneath its nodes.
  const ensure = () => {
    if (!map.getStyle() || map.getLayer(NET_ARCS)) return;
    map.addLayer(layer, map.getLayer('malware-glow') ? 'malware-glow' : undefined);
  };
  map.on('style.load', ensure);
  ensure();

  return {
    set(hosts) {
      // Hosts that geolocate to the same city share a point: an arc of no length draws nothing.
      const links = familyLinks(hosts).filter(l => l.from.lng !== l.to.lng || l.from.lat !== l.to.lat);
      const keys = links.map(l => `${l.from.ip}>${l.to.ip}`);
      const live = new Set(keys);
      for (const k of [...births.keys()]) if (!live.has(k)) births.delete(k);
      stampBirths(births, keys);

      const arcs: ArcSpec[] = links.map((l, i) => ({
        from: [l.from.lng, l.from.lat],
        to: [l.to.lng, l.to.lat],
        // OI's "aligned" tone, which here carries the links' own colour.
        tone: 0,
        id: i,
        highlight: 0,
        strength: l.sameAs ? 1 : 0.4,
        birth: births.get(keys[i])!,
        // A relation, in OI's terms: a solid line with a pulse travelling along it.
        kind: 0,
      }));
      layer.setArcs(arcs, false);
      layer.setLive(arcs.length > 0);
    },
    setColor(hex) {
      const c = rgb(hex);
      layer.setTones([c, c, c]);
    },
    destroy() {
      map.off('style.load', ensure);
      if (map.getStyle() && map.getLayer(NET_ARCS)) map.removeLayer(NET_ARCS);
    },
  };
}
