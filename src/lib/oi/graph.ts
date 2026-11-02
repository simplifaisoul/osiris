/**
 * OSIRIS OI: the research as a network, after MiroFish's knowledge graph.
 *
 * The globe puts every piece of the run where it happens, which also means
 * half of it is round the back of the planet and much of it sits on top of
 * itself in Europe. The graph lets go of geography: every actor and cited
 * source is a node, every relation, piece of evidence, move and quote an
 * edge, laid out by a small force simulation so nothing hides behind
 * anything else. The actors cast to play stand out; each of their moves is an
 * edge to the actor it was aimed at, in every world it was made; each quote a
 * thread from the actor to its source; and the report joins at the end with
 * a thread to each source its drivers rest on, so a reader can follow any
 * conclusion back to the words it came from.
 *
 * The layout starts from the map (a node is seeded where it sits on an
 * equirectangular world), so the graph's first frame reads like the globe it
 * came from before the forces untangle it. Everything here is pure and
 * client-safe; the workspace's GraphView draws it.
 */
import type { RunState } from './state';
import type { LinkKind, Tone } from './types';

/** The report's node: the end of every thread. */
export const REPORT_KEY = 'r:report';

export type GraphNodeKind = 'actor' | 'evidence' | 'report';

export interface GraphNode {
  /** The research key: `a:` or `c:` and the id, or `r:report`. */
  key: string;
  kind: GraphNodeKind;
  /** An actor cast to play in the simulation. */
  cast?: boolean;
  /** The actor's kind or the source's (state, company, news, quake…): what its icon is drawn from. */
  subtype: string;
  label: string;
  /** How many edges touch it: bigger hubs draw bigger. */
  degree: number;
  radius: number;
  lat: number | null;
  lng: number | null;
}

export interface GraphEdge {
  /** The research key, `link:<id>`, the same as clicking its arc on the globe. */
  key: string;
  id: string;
  from: string;
  to: string;
  kind: LinkKind;
  tone: Tone;
  strength: number;
  label: string;
  round: number;
  /** Sideways bend as a share of its length: edges between the same two nodes fan out instead of overlapping. */
  curve: number;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphFilter {
  /** Kinds of node left off. */
  hideNodes?: ReadonlySet<GraphNodeKind>;
  /** Kinds of link left off. */
  hideEdges?: ReadonlySet<LinkKind>;
  /** If given, only these nodes (an isolated selection and its neighbours). */
  only?: ReadonlySet<string> | null;
}

/** The run as nodes and edges. A source that nothing cites stays off the graph: it would only drift. */
export function buildGraph(s: RunState, filter: GraphFilter = {}): Graph {
  const nodes = new Map<string, GraphNode>();
  const add = (key: string, kind: GraphNodeKind, subtype: string, label: string, lat: number | null, lng: number | null, cast = false) => {
    if (filter.hideNodes?.has(kind) || (filter.only && !filter.only.has(key))) return;
    nodes.set(key, { key, kind, subtype, label, degree: 0, radius: 0, lat, lng, ...(cast ? { cast } : {}) });
  };
  for (const a of s.actors) add(`a:${a.id}`, 'actor', a.kind, a.name, a.lat, a.lng, Boolean(a.persona));
  const cited = new Set(s.links.filter(l => l.from.startsWith('c:') || l.to.startsWith('c:')).flatMap(l => [l.from, l.to]));
  for (const c of s.context) if (cited.has(`c:${c.id}`)) add(`c:${c.id}`, 'evidence', c.kind, c.title, c.lat, c.lng);
  if (s.report && s.links.some(l => l.from === REPORT_KEY)) add(REPORT_KEY, 'report', 'report', 'Report', null, null);

  const edges: GraphEdge[] = [];
  const perPair = new Map<string, number>();
  for (const l of s.links) {
    const a = nodes.get(l.from), b = nodes.get(l.to);
    if (!a || !b || a === b || filter.hideEdges?.has(l.kind)) continue;
    a.degree++;
    b.degree++;
    const pair = [l.from, l.to].sort().join('|');
    const n = perPair.get(pair) ?? 0;
    perPair.set(pair, n + 1);
    // The first edge of a pair bends a little (straight lines read as a wiring diagram); each
    // further one bends further. Opposite directions already land on opposite sides.
    edges.push({ key: `link:${l.id}`, id: l.id, from: l.from, to: l.to, kind: l.kind, tone: l.tone, strength: l.strength, label: l.label, round: l.round, curve: 0.12 + 0.2 * n });
  }
  for (const n of nodes.values()) n.radius = radiusOf(n);
  return { nodes: [...nodes.values()], edges };
}

/** Big enough to carry the node's icon; hubs a little bigger. */
function radiusOf(n: GraphNode): number {
  if (n.kind === 'report') return 15;
  if (n.kind === 'actor') return (n.cast ? 14 : 11) + Math.min(5, n.degree * 0.3);
  return 8.5;
}

/* ───────────────────────── Layout ───────────────────────── */

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Held by a drag: the simulation leaves it where the pointer has it. */
  fx: number | null;
  fy: number | null;
}

/** Force: the network finds its own shape. Flow: the sources, then the actors, then the report, left to right. */
export type LayoutMode = 'force' | 'flow';

/** Where each kind of node settles across in the flow layout. */
export const FLOW_X: Record<GraphNodeKind, number> = { evidence: -300, actor: 0, report: 300 };

export interface Layout {
  bodies: Map<string, Body>;
  readonly mode: LayoutMode;
  /** Switches layout, and warms up so the graph moves into it. */
  setMode(m: LayoutMode): void;
  /** Heat: 1 when things are moving, decaying toward 0 as the graph settles. */
  alpha: number;
  /** Takes in a new graph: new nodes are seeded, gone ones dropped, and the layout warms up again. */
  sync(g: Graph): void;
  /** One tick. Returns whether anything is still moving. */
  step(g: Graph): boolean;
  /** Warms the layout up, e.g. while a node is dragged. */
  heat(to: number): void;
}

/** Where a node starts: on a flat world map, so the first frame echoes the globe. */
export function seed(n: GraphNode, near?: Body): { x: number; y: number } {
  const h = hash(n.key);
  const jitter = () => ((h % 997) / 997 - 0.5) * 24;
  if (n.lat !== null && n.lng !== null && Number.isFinite(n.lat) && Number.isFinite(n.lng)) {
    return { x: (n.lng / 180) * 420 + jitter(), y: (-n.lat / 90) * 230 + jitter() * 0.7 };
  }
  // Somewhere off the map: beside whatever it is linked to, or on a ring around the middle.
  if (near) return { x: near.x + jitter() * 2, y: near.y + 30 + jitter() };
  const angle = ((h % 360) * Math.PI) / 180;
  return { x: Math.cos(angle) * 160, y: Math.sin(angle) * 160 };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** How far apart linked nodes like to sit, by what links them. */
const DISTANCE: Record<LinkKind, number> = { relation: 150, move: 135, evidence: 85, cite: 140 };
/** How hard each kind of node pushes the others away. */
const CHARGE: Record<GraphNodeKind, number> = { actor: -620, evidence: -160, report: -700 };

export function createLayout(): Layout {
  const bodies = new Map<string, Body>();
  let alpha = 1;
  let mode: LayoutMode = 'force';

  return {
    bodies,
    get alpha() { return alpha; },
    set alpha(v: number) { alpha = v; },
    get mode() { return mode; },
    setMode(m) { if (m !== mode) { mode = m; alpha = Math.max(alpha, 0.9); } },

    sync(g) {
      const keep = new Set(g.nodes.map(n => n.key));
      for (const k of bodies.keys()) if (!keep.has(k)) bodies.delete(k);
      let added = 0;
      for (const n of g.nodes) {
        if (bodies.has(n.key)) continue;
        const edge = g.edges.find(e => (e.from === n.key && bodies.has(e.to)) || (e.to === n.key && bodies.has(e.from)));
        const near = edge ? bodies.get(edge.from === n.key ? edge.to : edge.from) : undefined;
        const p = seed(n, near);
        bodies.set(n.key, { x: p.x, y: p.y, vx: 0, vy: 0, fx: null, fy: null });
        added++;
      }
      if (added) alpha = Math.max(alpha, added > 3 ? 0.9 : 0.5);
    },

    heat(to) { alpha = Math.max(alpha, to); },

    step(g) {
      if (alpha < 0.002) return false;
      const list = g.nodes.map(n => ({ n, b: bodies.get(n.key)! })).filter(x => x.b);
      const index = new Map(list.map((x, i) => [x.n.key, i]));
      const degree = list.map(x => Math.max(1, x.n.degree));

      // Links pull toward their rest length; a pair of hubs pulls more gently than a leaf on a hub.
      for (const e of g.edges) {
        // In the flow, a quote runs across the columns by design: it is drawn, not pulled tight.
        if (mode === 'flow' && e.kind === 'cite') continue;
        const i = index.get(e.from), j = index.get(e.to);
        if (i === undefined || j === undefined) continue;
        const a = list[i].b, b = list[j].b;
        const dx = b.x + b.vx - a.x - a.vx || 0.01, dy = b.y + b.vy - a.y - a.vy || 0.01;
        const d = Math.sqrt(dx * dx + dy * dy);
        const k = ((d - DISTANCE[e.kind]) / d) * alpha * (0.6 / Math.min(degree[i], degree[j]));
        const share = degree[i] / (degree[i] + degree[j]);
        b.vx -= dx * k * share; b.vy -= dy * k * share;
        a.vx += dx * k * (1 - share); a.vy += dy * k * (1 - share);
      }

      // Every pair repels, and never overlaps: with a few dozen nodes the plain O(n²) pass is cheap.
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          let dx = b.b.x - a.b.x, dy = b.b.y - a.b.y;
          if (dx === 0 && dy === 0) { dx = (hash(a.n.key + b.n.key) % 7) - 3 || 1; dy = 1; }
          const d2 = dx * dx + dy * dy;
          if (d2 < 640 * 640) {
            const w = ((CHARGE[a.n.kind] + CHARGE[b.n.kind]) / 2) * alpha / Math.max(d2, 36);
            a.b.vx += dx * w; a.b.vy += dy * w;
            b.b.vx -= dx * w; b.b.vy -= dy * w;
          }
          const min = a.n.radius + b.n.radius + 14;
          if (d2 < min * min) {
            const d = Math.sqrt(d2);
            const push = ((min - d) / d) * 0.5;
            a.b.vx -= dx * push; a.b.vy -= dy * push;
            b.b.vx += dx * push; b.b.vy += dy * push;
          }
        }
      }

      for (const { n, b } of list) {
        if (mode === 'flow') {
          // Each kind to its column, firmly; up and down only a gentle pull.
          b.vx += (FLOW_X[n.kind] - b.x) * 0.3 * alpha;
          b.vy -= b.y * 0.02 * alpha;
        } else {
          // A gentle pull to the middle keeps islands from drifting off.
          b.vx -= b.x * 0.035 * alpha;
          b.vy -= b.y * 0.035 * alpha;
        }
        if (b.fx !== null && b.fy !== null) { b.x = b.fx; b.y = b.fy; b.vx = 0; b.vy = 0; continue; }
        b.vx *= 0.6; b.vy *= 0.6;
        b.x += b.vx; b.y += b.vy;
      }
      alpha += (0 - alpha) * 0.022;
      return alpha >= 0.002;
    },
  };
}

/* ───────────────────────── Drawing helpers ───────────────────────── */

export interface View { x: number; y: number; k: number }

/** The view that fits every node in a box of the given size, with a margin. */
export function fitView(bodies: Iterable<Body>, width: number, height: number, margin = 56): View {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of bodies) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x); y1 = Math.max(y1, b.y); }
  if (!Number.isFinite(x0)) return { x: width / 2, y: height / 2, k: 1 };
  const k = Math.min(1.6, Math.max(0.25, Math.min((width - margin * 2) / Math.max(1, x1 - x0), (height - margin * 2) / Math.max(1, y1 - y0))));
  return { x: width / 2 - ((x0 + x1) / 2) * k, y: height / 2 - ((y0 + y1) / 2) * k, k };
}

/** The bent line between two points: a quadratic curve and the point halfway along it, for a label. */
export function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, curve: number): { d: string; mx: number; my: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const cx = (a.x + b.x) / 2 - dy * curve, cy = (a.y + b.y) / 2 + dx * curve;
  const r = (v: number) => Math.round(v * 10) / 10;
  return { d: `M${r(a.x)},${r(a.y)} Q${r(cx)},${r(cy)} ${r(b.x)},${r(b.y)}`, mx: (a.x + 2 * cx + b.x) / 4, my: (a.y + 2 * cy + b.y) / 4 };
}

/** The keys that stay lit when something is selected or hovered: it, its edges, and the nodes at their other ends. */
export function litSet(g: Graph, key: string | null): { nodes: Set<string>; edges: Set<string> } | null {
  if (!key) return null;
  const nodes = new Set<string>();
  const edges = new Set<string>();
  if (key.startsWith('link:')) {
    const e = g.edges.find(x => x.key === key);
    if (!e) return null;
    edges.add(e.key); nodes.add(e.from); nodes.add(e.to);
    return { nodes, edges };
  }
  if (!g.nodes.some(n => n.key === key)) return null;
  nodes.add(key);
  for (const e of g.edges) if (e.from === key || e.to === key) { edges.add(e.key); nodes.add(e.from); nodes.add(e.to); }
  return { nodes, edges };
}
