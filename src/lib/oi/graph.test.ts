import { describe, it, expect } from 'vitest';
import { buildGraph, createLayout, edgePath, fitView, litSet, seed } from './graph';
import { initialState, type RunState } from './state';
import type { Link, Report } from './types';

const link = (over: Partial<Link>): Link => ({ id: 'l', from: 'a:usa', to: 'a:cn', kind: 'relation', tone: 'oppose', strength: 0.8, label: 'trade war', round: 0, ...over });

const persona = { goal: 'Win', levers: ['Tariffs'], redLines: '', style: '' };

const s: RunState = {
  ...initialState(),
  actors: [
    { id: 'usa', name: 'United States', kind: 'state', role: 'Sets tariffs', lean: 0.2, place: '', lat: 38, lng: -77, persona },
    { id: 'cn', name: 'China', kind: 'state', role: 'Responds', lean: -0.3, place: '', lat: 39, lng: 116, persona },
    { id: 'eu', name: 'European Union', kind: 'organisation', role: 'Mediates', lean: 0, place: '', lat: null, lng: null },
  ],
  context: [
    { id: 'c1', kind: 'news', title: 'Tariff talks stall', source: 'Wire', published: '', place: 'Geneva', lat: 46, lng: 6 },
    { id: 'c2', kind: 'news', title: 'Unrelated headline', source: 'Wire', published: '', place: '', lat: null, lng: null },
  ],
  worlds: ['A', 'B'],
  links: [
    link({ id: 'rel:cn|usa' }),
    link({ id: 'ev:c1:cn:0', from: 'c:c1', to: 'a:cn', kind: 'evidence', tone: 'oppose', label: 'talks stalled' }),
    link({ id: 'mv:A:usa:cn', from: 'a:usa', to: 'a:cn', kind: 'move', tone: 'oppose', round: 1, label: 'Raises tariffs' }),
    link({ id: 'mv:B:usa:cn', from: 'a:usa', to: 'a:cn', kind: 'move', tone: 'support', round: 1, label: 'Offers a truce' }),
    link({ id: 'mv:A:cn:mars', from: 'a:cn', to: 'a:mars', kind: 'move', tone: 'neutral', round: 1 }),
  ],
};

const report: Report = {
  headline: 'Talks stall', answer: '30% YES', probability: 0.3, swarm: 0.3, confidence: 'medium', summary: '',
  drivers: [], scenarios: [], signposts: [], dissent: '', caveats: [], deviation: '', path: [], actorMoves: [], worlds: [],
};

describe('the research as a graph', () => {
  const g = buildGraph(s);

  it('has every actor, the cast marked, and only the sources something cites', () => {
    expect(g.nodes.map(n => n.key).sort()).toEqual(['a:cn', 'a:eu', 'a:usa', 'c:c1']);
    expect(g.nodes.find(n => n.key === 'c:c1')?.kind).toBe('evidence');
    expect(g.nodes.filter(n => n.cast).map(n => n.key).sort()).toEqual(['a:cn', 'a:usa']);
  });

  it('threads every quote to its source, and joins the report to the sources its drivers rest on', () => {
    const quoted: RunState = {
      ...s,
      report,
      links: [
        ...s.links,
        link({ id: 'qt:A:usa:c2:1', from: 'a:usa', to: 'c:c2', kind: 'cite', tone: 'neutral', round: 1, label: 'Unrelated headline' }),
        link({ id: 'rq:0:c2', from: 'r:report', to: 'c:c2', kind: 'cite', tone: 'oppose', round: 2, label: 'Talks stall' }),
      ],
    };
    const q = buildGraph(quoted);
    // A source only quoted (never cited by the world model) is on the graph, and so is the report.
    expect(q.nodes.find(n => n.key === 'c:c2')?.kind).toBe('evidence');
    expect(q.nodes.find(n => n.key === 'r:report')?.kind).toBe('report');
    expect(q.edges.filter(e => e.kind === 'cite').map(e => [e.from, e.to])).toEqual([['a:usa', 'c:c2'], ['r:report', 'c:c2']]);
    // Without threads from it, the report stays off the graph.
    expect(buildGraph({ ...quoted, links: s.links }).nodes.some(n => n.key === 'r:report')).toBe(false);
  });

  it('keeps every link whose two ends are on it, under the same key as its arc on the globe', () => {
    expect(g.edges.map(e => e.key)).toEqual(['link:rel:cn|usa', 'link:ev:c1:cn:0', 'link:mv:A:usa:cn', 'link:mv:B:usa:cn']);
  });

  it('fans out the same move made in two worlds, and sizes the cast and hubs larger', () => {
    const [a, b] = g.edges.filter(e => e.kind === 'move');
    expect(b.curve).toBeGreaterThan(a.curve);
    const cn = g.nodes.find(n => n.key === 'a:cn')!, eu = g.nodes.find(n => n.key === 'a:eu')!;
    expect(cn.degree).toBe(4);
    expect(cn.radius).toBeGreaterThan(eu.radius);
  });

  it('lights a node with its edges and neighbours, or an edge with its two ends', () => {
    expect(litSet(g, 'c:c1')).toEqual({ nodes: new Set(['c:c1', 'a:cn']), edges: new Set(['link:ev:c1:cn:0']) });
    expect(litSet(g, 'link:mv:A:usa:cn')).toEqual({ nodes: new Set(['a:usa', 'a:cn']), edges: new Set(['link:mv:A:usa:cn']) });
    expect(litSet(g, null)).toBeNull();
    expect(litSet(g, 's:0')).toBeNull();
  });
});

describe('laying it out', () => {
  it('starts from the map: west is left, north is up', () => {
    const at = (key: string) => seed(buildGraph(s).nodes.find(n => n.key === key)!);
    expect(at('a:usa').x).toBeLessThan(at('a:cn').x);
    expect(at('c:c1').y).toBeLessThan(at('a:usa').y);
  });

  it('settles with nothing on top of anything, linked nodes nearer than strangers', () => {
    const g = buildGraph(s);
    const layout = createLayout();
    layout.sync(g);
    for (let i = 0; i < 600 && layout.step(g); i++);
    expect(layout.alpha).toBeLessThan(0.01);
    const b = layout.bodies;
    for (const v of b.values()) { expect(Number.isFinite(v.x)).toBe(true); expect(Number.isFinite(v.y)).toBe(true); }
    const dist = (p: string, q: string) => Math.hypot(b.get(p)!.x - b.get(q)!.x, b.get(p)!.y - b.get(q)!.y);
    const keys = [...b.keys()];
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) expect(dist(keys[i], keys[j])).toBeGreaterThan(14);
    expect(dist('c:c1', 'a:cn')).toBeLessThan(dist('c:c1', 'a:eu'));
  });

  it('takes in new nodes without moving the old ones far, and warms up for them', () => {
    const layout = createLayout();
    const first = buildGraph({ ...s, links: s.links.filter(l => l.kind === 'relation') });
    layout.sync(first);
    for (let i = 0; i < 600 && layout.step(first); i++);
    const before = { ...layout.bodies.get('a:usa')! };
    const g = buildGraph(s);
    layout.sync(g);
    expect(layout.bodies.size).toBe(g.nodes.length);
    expect(Math.hypot(layout.bodies.get('a:usa')!.x - before.x, layout.bodies.get('a:usa')!.y - before.y)).toBe(0);
    layout.sync(first);
    expect(layout.bodies.has('c:c1')).toBe(false);
  });

  it('holds a dragged node where the pointer has it', () => {
    const g = buildGraph(s);
    const layout = createLayout();
    layout.sync(g);
    const usa = layout.bodies.get('a:usa')!;
    usa.fx = 300; usa.fy = -40;
    for (let i = 0; i < 20; i++) layout.step(g);
    expect([usa.x, usa.y]).toEqual([300, -40]);
  });
});

describe('drawing it', () => {
  it('fits every node in the box', () => {
    const v = fitView([{ x: -100, y: -50, vx: 0, vy: 0, fx: null, fy: null }, { x: 300, y: 150, vx: 0, vy: 0, fx: null, fy: null }], 600, 400, 50);
    expect(-100 * v.k + v.x).toBeGreaterThanOrEqual(49.9);
    expect(300 * v.k + v.x).toBeLessThanOrEqual(550.1);
    expect((-50 * v.k + v.y + 150 * v.k + v.y) / 2).toBeCloseTo(200);
    expect(fitView([], 600, 400)).toEqual({ x: 300, y: 200, k: 1 });
  });

  it('bends an edge to one side, and puts its label on the curve', () => {
    const p = edgePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.2);
    expect(p.d).toBe('M0,0 Q50,20 100,0');
    expect([p.mx, p.my]).toEqual([50, 10]);
    expect(edgePath({ x: 100, y: 0 }, { x: 0, y: 0 }, 0.2).my).toBe(-10);
  });
});

describe('filtering and flowing it', () => {
  it('leaves off kinds of node and link, or everything but an isolated few', () => {
    const noSources = buildGraph(s, { hideNodes: new Set(['evidence']) });
    expect(noSources.nodes.some(n => n.kind === 'evidence')).toBe(false);
    expect(noSources.edges.some(e => e.kind === 'evidence')).toBe(false);
    const noMoves = buildGraph(s, { hideEdges: new Set(['move']) });
    expect(noMoves.nodes).toHaveLength(4);
    expect(noMoves.edges.some(e => e.kind === 'move')).toBe(false);
    const only = buildGraph(s, { only: new Set(['a:cn', 'c:c1']) });
    expect(only.nodes.map(n => n.key).sort()).toEqual(['a:cn', 'c:c1']);
    expect(only.edges.map(e => e.id)).toEqual(['ev:c1:cn:0']);
    expect(buildGraph(s).nodes.find(n => n.key === 'a:cn')?.subtype).toBe('state');
  });

  it('lines the sources, then the actors, then the report up left to right in the flow layout', () => {
    const g = buildGraph({ ...s, report, links: [...s.links, link({ id: 'rq:0:c1', from: 'r:report', to: 'c:c1', kind: 'cite', tone: 'oppose', round: 2 })] });
    const layout = createLayout();
    layout.setMode('flow');
    layout.sync(g);
    for (let i = 0; i < 600 && layout.step(g); i++);
    const meanX = (kind: string) => {
      const xs = g.nodes.filter(n => n.kind === kind).map(n => layout.bodies.get(n.key)!.x);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(meanX('evidence')).toBeLessThan(meanX('actor'));
    expect(meanX('actor')).toBeLessThan(meanX('report'));
  });
});
