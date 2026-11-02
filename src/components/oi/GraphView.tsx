'use client';
/**
 * OSIRIS OI: the graph view.
 *
 * The run as a network, after MiroFish's knowledge graph: every actor and
 * cited source as a node carrying its type's icon (the actors who play the
 * simulation ringed), every relation, move and quote as an edge in the arcs'
 * own colours, all on screen at once. A move runs from the actor that made it
 * to the actor it was aimed at, fanned out where the worlds differ; each
 * quote is a dotted thread from the actor to the source it came from, and the
 * report joins at the end with a thread to every source its drivers rest on.
 * The filter panel turns kinds of node and link on and off and switches
 * between a free (force) layout and a flow from the sources to the actors and
 * the prediction; Isolate keeps only a selection and its neighbours. A click
 * opens the same object as the globe.
 *
 * The layout is a small force simulation (lib/oi/graph). React draws the
 * elements; positions are written straight onto them each frame, so a tick
 * never re-renders the tree. The camera fits the graph as it grows, and
 * frames a selection with its neighbours, until someone pans or zooms.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Filter, Focus, Maximize, Minus, Plus } from 'lucide-react';
import { buildGraph, createLayout, edgePath, fitView, litSet, FLOW_X, type GraphEdge, type GraphNode, type GraphNodeKind, type LayoutMode, type View } from '@/lib/oi/graph';
import { LINK_LABEL } from '@/lib/oi/objects';
import { brief } from '@/lib/oi/research';
import type { RunState } from '@/lib/oi/state';
import type { LinkKind } from '@/lib/oi/types';
import { LABEL, T, toneColor } from './theme';
import { Segmented, TypeIcon } from './atoms';

const BASE_OPACITY: Record<GraphEdge['kind'], number> = { relation: 0.85, move: 0.7, evidence: 0.5, cite: 0.6 };
const NODE_LABEL: Record<GraphNodeKind, string> = { actor: 'Actors', evidence: 'Sources', report: 'Report' };
const COLUMN_LABEL: Record<GraphNodeKind, string> = { evidence: 'SOURCES', actor: 'ACTORS', report: 'PREDICTION' };
const NODE_COLOR: Record<GraphNodeKind, string> = { actor: T.gold, evidence: T.body, report: T.goldLight };
/** A quote's thread: dotted, so it reads apart from the arcs. */
const CITE_DASH = '1.5 3.5';
const LINK_FILTER_LABEL: Record<LinkKind, string> = { relation: 'Relations', evidence: 'Evidence', move: 'Moves', cite: 'Quotes' };
const FILTER_W = 196;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function GraphView({ s, selected, onSelect }: { s: RunState; selected: string | null; onSelect: (key: string | null) => void }) {
  const [hideNodes, setHideNodes] = useState<ReadonlySet<GraphNodeKind>>(new Set());
  const [hideEdges, setHideEdges] = useState<ReadonlySet<LinkKind>>(new Set());
  const [isolate, setIsolate] = useState(false);
  const [mode, setMode] = useState<LayoutMode>('force');
  const [panel, setPanel] = useState(true);

  // The whole graph counts what there is and knows a selection's neighbours; the shown one is filtered.
  const full = useMemo(() => buildGraph(s), [s]);
  const selectedLit = useMemo(() => litSet(full, selected), [full, selected]);
  const isolating = isolate && Boolean(selectedLit);
  const graph = useMemo(
    () => buildGraph(s, { hideNodes, hideEdges, only: isolating ? selectedLit!.nodes : null }),
    [s, hideNodes, hideEdges, isolating, selectedLit],
  );

  const [layout] = useState(createLayout);
  const [hover, setHover] = useState<string | null>(null);
  const [labels, setLabels] = useState(false);
  const [following, setFollowing] = useState(true);

  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const world = useRef<SVGGElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const nodeEls = useRef(new Map<string, SVGGElement>());
  const edgeEls = useRef(new Map<string, SVGPathElement>());
  const hitEls = useRef(new Map<string, SVGPathElement>());
  const labelEls = useRef(new Map<string, SVGTextElement>());
  const columnEls = useRef(new Map<GraphNodeKind, SVGTextElement>());
  const current = useRef(graph);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const follow = useRef(true);
  /** What the camera frames: the selection and its neighbours, or (null) the whole graph. */
  const framed = useRef<Set<string> | null>(null);
  /** Room on the left kept clear for the filter panel. */
  const leftInset = useRef(panel ? FILTER_W : 0);
  /** The layout, for the camera: in flow it frames the column headings too. */
  const modeRef = useRef(mode);
  const size = useRef({ w: 0, h: 0 });
  const frame = useRef(0);
  const drag = useRef<{ key: string | null; x0: number; y0: number; vx: number; vy: number; moved: boolean } | null>(null);

  /** Writes every position onto its element. */
  const paint = useCallback(() => {
    const v = view.current;
    world.current?.setAttribute('transform', `translate(${v.x.toFixed(1)},${v.y.toFixed(1)}) scale(${v.k.toFixed(4)})`);
    // Labels hold their size on screen as the graph zooms out, within reason.
    svg.current?.style.setProperty('--ls', String(Math.min(1.9, Math.max(0.85, 1 / v.k))));
    let top = Infinity;
    for (const [key, el] of nodeEls.current) {
      const b = layout.bodies.get(key);
      if (!b) continue;
      el.setAttribute('transform', `translate(${b.x.toFixed(1)},${b.y.toFixed(1)})`);
      top = Math.min(top, b.y);
    }
    for (const [, el] of columnEls.current) el.setAttribute('y', String(Number.isFinite(top) ? Math.round(top - 48) : -200));
    for (const e of current.current.edges) {
      const a = layout.bodies.get(e.from), b = layout.bodies.get(e.to);
      if (!a || !b) continue;
      const p = edgePath(a, b, e.curve);
      edgeEls.current.get(e.key)?.setAttribute('d', p.d);
      hitEls.current.get(e.key)?.setAttribute('d', p.d);
      const t = labelEls.current.get(e.key);
      if (t) { t.setAttribute('x', p.mx.toFixed(1)); t.setAttribute('y', p.my.toFixed(1)); }
    }
  }, [layout]);

  /** Runs the simulation and the camera until both are still. */
  const kick = useCallback(() => {
    if (frame.current) return;
    const tick = () => {
      const moving = layout.step(current.current);
      let easing = false;
      if (follow.current && size.current.w > 0 && layout.bodies.size) {
        const keys = framed.current;
        const shown = keys ? [...keys].map(k => layout.bodies.get(k)).filter((b): b is NonNullable<typeof b> => Boolean(b)) : [...layout.bodies.values()];
        if (!keys && modeRef.current === 'flow') {
          // The column headings sit above the columns and are as wide as their words.
          const top = Math.min(...shown.map(b => b.y)) - 60;
          for (const n of current.current.nodes) shown.push({ x: FLOW_X[n.kind] - 48, y: top, vx: 0, vy: 0, fx: null, fy: null }, { x: FLOW_X[n.kind] + 48, y: top, vx: 0, vy: 0, fx: null, fy: null });
        }
        const left = leftInset.current;
        const target = fitView(shown.length ? shown : layout.bodies.values(), size.current.w - left, size.current.h - 40, keys ? 90 : 64);
        target.x += left;
        target.y += 20;
        const v = view.current;
        const t = 0.14;
        const next = { x: v.x + (target.x - v.x) * t, y: v.y + (target.y - v.y) * t, k: v.k + (target.k - v.k) * t };
        easing = Math.abs(next.x - v.x) + Math.abs(next.y - v.y) + Math.abs(next.k - v.k) * 200 > 0.15;
        view.current = next;
      }
      paint();
      frame.current = moving || easing || drag.current?.key ? requestAnimationFrame(tick) : 0;
    };
    frame.current = requestAnimationFrame(tick);
  }, [layout, paint]);

  // A new graph: seed what is new and place everything before the browser paints, so nothing flashes at the origin.
  useLayoutEffect(() => {
    current.current = graph;
    layout.sync(graph);
    paint();
    kick();
  }, [graph, layout, paint, kick]);

  useEffect(() => { layout.setMode(mode); modeRef.current = mode; kick(); }, [mode, layout, kick]);
  useEffect(() => { leftInset.current = panel ? FILTER_W : 0; kick(); }, [panel, kick]);

  // Forget the frame as well as cancelling it, or the next kick would think the loop is still running.
  useEffect(() => () => { cancelAnimationFrame(frame.current); frame.current = 0; }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      size.current = { w: el.clientWidth, h: el.clientHeight };
      kick();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [kick]);

  const stopFollowing = useCallback(() => { follow.current = false; setFollowing(false); }, []);
  const refit = () => { framed.current = null; follow.current = true; setFollowing(true); kick(); };

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    const v = view.current;
    const k = Math.min(4, Math.max(0.2, v.k * factor));
    view.current = { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    stopFollowing();
    paint();
  }, [paint, stopFollowing]);

  // Wheel zoom needs a listener that may cancel the page's own scroll.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const toWorld = (clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    const v = view.current;
    return { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k };
  };

  const onPointerDown = (e: React.PointerEvent, key: string | null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    drag.current = { key, x0: e.clientX, y0: e.clientY, vx: view.current.x, vy: view.current.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const t = tip.current, r = box.current?.getBoundingClientRect();
    if (t && r) {
      const x = e.clientX - r.left, y = e.clientY - r.top;
      t.style.left = `${Math.max(8, Math.min(x + 14, r.width - 280))}px`;
      t.style.top = `${Math.max(8, Math.min(y + 16, r.height - 80))}px`;
    }
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
    d.moved = true;
    if (d.key) {
      const body = layout.bodies.get(d.key);
      if (!body) return;
      const p = toWorld(e.clientX, e.clientY);
      body.fx = p.x; body.fy = p.y;
      layout.heat(0.25);
      kick();
    } else {
      view.current = { ...view.current, x: d.vx + e.clientX - d.x0, y: d.vy + e.clientY - d.y0 };
      stopFollowing();
      paint();
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.key) {
      const body = layout.bodies.get(d.key);
      if (body) { body.fx = null; body.fy = null; }
      if (!d.moved) onSelect(d.key === selected ? null : d.key);
    } else if (!d.moved) onSelect(null);
  };

  // A selection, from here, the globe, search or a list, brings the camera round to it and its neighbours.
  // Keyed on which nodes are framed, not on the graph object, so a live run's updates do not take the camera back.
  const framedKey = useMemo(() => (selectedLit ? JSON.stringify([...selectedLit.nodes].sort()) : ''), [selectedLit]);
  const [framedFor, setFramedFor] = useState(framedKey);
  if (framedFor !== framedKey) {
    setFramedFor(framedKey);
    setFollowing(true);
    if (!framedKey) setIsolate(false);
  }
  useEffect(() => {
    framed.current = framedKey ? new Set(JSON.parse(framedKey) as string[]) : null;
    follow.current = true;
    kick();
  }, [framedKey, kick]);

  const active = hover ?? selected;
  const lit = useMemo(() => litSet(graph, active), [graph, active]);
  const hoverBrief = hover ? brief(s, hover) : null;
  // The actors deciding a move right now, in any world.
  const deciding = useMemo(() => new Set(Object.keys(s.thinking).map(k => `a:${k.slice(k.indexOf(':') + 1)}`)), [s.thinking]);

  const nodeCounts = useMemo(() => {
    const c: Record<GraphNodeKind, number> = { actor: 0, evidence: 0, report: 0 };
    for (const n of full.nodes) c[n.kind]++;
    return c;
  }, [full]);
  const edgeCounts = useMemo(() => {
    const c: Record<LinkKind, number> = { relation: 0, evidence: 0, move: 0, cite: 0 };
    for (const e of full.edges) c[e.kind]++;
    return c;
  }, [full]);
  const hidden = hideNodes.size + hideEdges.size;

  const toggle = <K,>(set: ReadonlySet<K>, k: K) => { const next = new Set(set); if (next.has(k)) next.delete(k); else next.add(k); return next; };

  const nodeRef = (key: string) => (el: SVGGElement | null) => { if (el) nodeEls.current.set(key, el); else nodeEls.current.delete(key); };
  const edgeRef = (key: string) => (el: SVGPathElement | null) => { if (el) edgeEls.current.set(key, el); else edgeEls.current.delete(key); };
  const hitRef = (key: string) => (el: SVGPathElement | null) => { if (el) hitEls.current.set(key, el); else hitEls.current.delete(key); };
  const columnRef = (kind: GraphNodeKind) => (el: SVGTextElement | null) => { if (el) columnEls.current.set(kind, el); else columnEls.current.delete(kind); };

  return (
    <div ref={box} className="relative w-full h-full overflow-hidden select-none"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backgroundImage: 'radial-gradient(rgba(var(--gold-rgb),0.10) 1px, transparent 1.2px)', backgroundSize: '22px 22px' }}>
      <svg ref={svg} className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing" role="img" aria-label="Research graph"
        onPointerDown={e => onPointerDown(e, null)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <g ref={world}>
          {mode === 'flow' && (Object.keys(FLOW_X) as GraphNodeKind[]).filter(k => !hideNodes.has(k) && nodeCounts[k] > 0).map(k => (
            <text key={k} ref={columnRef(k)} x={FLOW_X[k]} textAnchor="middle" className="font-mono"
              style={{ fontSize: 'calc(10px * var(--ls, 1))', letterSpacing: '0.24em', fill: NODE_COLOR[k], opacity: 0.55, pointerEvents: 'none' }}>
              {COLUMN_LABEL[k]}
            </text>
          ))}
          {/* Edges first, under the nodes; each has a wide invisible twin that takes the clicks. */}
          <g>
            {graph.edges.map(e => {
              const on = lit?.edges.has(e.key);
              const tone = toneColor(e.tone);
              return (
                <path key={e.key} ref={edgeRef(e.key)} fill="none" vectorEffect="non-scaling-stroke"
                  className="oi-graph-in"
                  strokeLinecap={e.kind === 'cite' ? 'round' : undefined}
                  style={{
                    stroke: e.kind === 'evidence' || e.kind === 'cite' ? `color-mix(in srgb, ${tone} 60%, #e8e6e0)` : tone,
                    strokeWidth: (e.kind === 'relation' ? 1 + e.strength * 1.6 : e.kind === 'move' ? 0.9 + e.strength : e.kind === 'cite' ? 1.4 : 1) + (on ? 0.8 : 0),
                    strokeDasharray: e.kind === 'cite' ? CITE_DASH : undefined,
                    opacity: lit ? (on ? 1 : 0.06) : BASE_OPACITY[e.kind],
                    transition: 'opacity .25s ease',
                  }} />
              );
            })}
          </g>
          <g>
            {graph.edges.map(e => (
              <path key={e.key} ref={hitRef(e.key)} data-oi-edge={e.key} fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke"
                style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                onPointerDown={ev => ev.stopPropagation()}
                onClick={() => onSelect(e.key === selected ? null : e.key)}
                onPointerEnter={() => setHover(e.key)} onPointerLeave={() => setHover(h => (h === e.key ? null : h))} />
            ))}
          </g>
          {/* Edge labels: the edge under the pointer; with LABELS on, every edge in view (or in the focus);
              otherwise the relations and exchanges of whatever is hovered, so a selection stays readable. */}
          <g style={{ pointerEvents: 'none' }}>
            {graph.edges.map(e => {
              const isLit = Boolean(lit?.edges.has(e.key));
              // A quote's words show when its thread is under the pointer or its actor or source is.
              const show = e.label && (active === e.key || (labels
                ? !lit || isLit
                : Boolean(hover) && isLit && e.kind !== 'evidence'));
              if (!show) return null;
              return (
                <text key={e.key} ref={el => {
                  if (!el) { labelEls.current.delete(e.key); return; }
                  labelEls.current.set(e.key, el);
                  // A label can appear without the graph moving (on hover): place it straight away.
                  const a = layout.bodies.get(e.from), b = layout.bodies.get(e.to);
                  if (a && b) { const p = edgePath(a, b, e.curve); el.setAttribute('x', p.mx.toFixed(1)); el.setAttribute('y', p.my.toFixed(1)); }
                }}
                  textAnchor="middle" dy="0.35em" className="font-mono"
                  style={{ fontSize: 'calc(9px * var(--ls, 1))', fill: 'var(--text-secondary)', stroke: 'rgba(0,0,0,0.92)', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                  {e.kind === 'cite' && e.from.startsWith('a:') ? `“${clip(e.label, 34)}”` : clip(e.label, 30)}
                </text>
              );
            })}
          </g>
          <g>
            {graph.nodes.map(n => (
              <GraphNodeMark key={n.key} n={n} refFn={nodeRef(n.key)} selected={selected === n.key} dim={Boolean(lit && !lit.nodes.has(n.key))}
                showLabel={n.kind !== 'evidence' || labels || Boolean(lit?.nodes.has(n.key))} thinking={deciding.has(n.key)}
                onDown={e => onPointerDown(e, n.key)} onEnter={() => setHover(n.key)} onLeave={() => setHover(h => (h === n.key ? null : h))} />
            ))}
          </g>
        </g>
      </svg>

      {/* The graph's own HUD: what it is, what is shown, and the ways to look at it. */}
      <div className="absolute left-3 top-3 flex flex-col gap-2" style={{ width: FILTER_W - 16 }}>
        <div className="px-1 pointer-events-none">
          <div className="hud-text text-[10px] text-[var(--gold-primary)]">Research graph</div>
          <div className="mt-0.5 text-[10px] font-mono tracking-[0.1em] text-[var(--text-muted)]">
            {graph.nodes.length} NODES · {graph.edges.length} LINKS{isolating ? ' · ISOLATED' : ''}
          </div>
        </div>
        {panel && (
          <div className="rounded-lg border border-[var(--border-secondary)] bg-black/60 backdrop-blur-md p-2.5 flex flex-col gap-3">
            <FilterGroup label="Nodes">
              {(Object.keys(NODE_LABEL) as GraphNodeKind[]).map(k => (
                <FilterRow key={k} on={!hideNodes.has(k)} count={nodeCounts[k]} onClick={() => setHideNodes(h => toggle(h, k))}
                  mark={<TypeIcon k={k === 'actor' ? 'a:' : k === 'report' ? 'r:' : 'c:'} subtype={k === 'actor' ? 'state' : 'news'} className="w-3 h-3" style={{ color: NODE_COLOR[k] }} />}>
                  {NODE_LABEL[k]}
                </FilterRow>
              ))}
            </FilterGroup>
            <FilterGroup label="Links">
              {(Object.keys(LINK_LABEL) as LinkKind[]).map(k => (
                <FilterRow key={k} on={!hideEdges.has(k)} count={edgeCounts[k]} onClick={() => setHideEdges(h => toggle(h, k))}
                  mark={<svg width="14" height="6" aria-hidden><line x1="1" x2="13" y1="3" y2="3" strokeWidth="2" strokeLinecap="round" strokeDasharray={k === 'cite' ? '0.5 3' : undefined} style={{ stroke: k === 'evidence' || k === 'cite' ? T.body : T.neutral }} /></svg>}>
                  {LINK_FILTER_LABEL[k]}
                </FilterRow>
              ))}
            </FilterGroup>
            <FilterGroup label="Layout">
              <Segmented id="graph-layout" size="sm" value={mode} onChange={setMode} options={[
                { value: 'force', label: 'Force', title: 'Let the network find its own shape' },
                { value: 'flow', label: 'Flow', title: 'Sources, then the actors, then the prediction, left to right' },
              ]} />
            </FilterGroup>
          </div>
        )}
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-[3px] p-[3px] rounded-lg border border-[var(--border-secondary)] bg-black/50 backdrop-blur-md">
        <ToolButton title={selectedLit ? 'Show only the selection and what it touches' : 'Select something to isolate it'} onClick={() => setIsolate(v => !v)} active={isolating} disabled={!selectedLit}>
          <Focus className="w-3.5 h-3.5" /><span className="hidden 2xl:inline">ISOLATE</span>
        </ToolButton>
        <ToolButton title="Show every link's label" onClick={() => setLabels(v => !v)} active={labels}>LABELS</ToolButton>
        <span className="w-px h-4 mx-0.5 bg-[var(--border-secondary)]" />
        <ToolButton title="Zoom out" onClick={() => zoomAt(size.current.w / 2, size.current.h / 2, 1 / 1.3)}><Minus className="w-3.5 h-3.5" /></ToolButton>
        <ToolButton title="Zoom in" onClick={() => zoomAt(size.current.w / 2, size.current.h / 2, 1.3)}><Plus className="w-3.5 h-3.5" /></ToolButton>
        <ToolButton title="Fit the whole graph and follow it as it grows" onClick={refit} active={following && !framedKey}><Maximize className="w-3.5 h-3.5" /></ToolButton>
        <span className="w-px h-4 mx-0.5 bg-[var(--border-secondary)]" />
        <ToolButton title={panel ? 'Hide the filters' : 'Show the filters'} onClick={() => setPanel(v => !v)} active={panel}>
          <Filter className="w-3.5 h-3.5" />{hidden > 0 && <span className="text-[var(--gold-light)]">{hidden}</span>}
        </ToolButton>
      </div>

      <GraphLegend />

      {full.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] font-mono tracking-[0.2em] text-[var(--text-muted)]">
            {s.status === 'running' ? 'THE GRAPH BUILDS AS THE WORLD IS MAPPED…' : 'NOTHING TO GRAPH IN THIS RUN'}
          </span>
        </div>
      )}

      <div ref={tip} role="tooltip" className="absolute pointer-events-none max-w-[270px] rounded-lg border border-[var(--border-primary)] px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        style={{ background: 'var(--oi-solid)', opacity: hoverBrief ? 1 : 0, transition: 'opacity .15s ease' }}>
        {hoverBrief && (
          <>
            <div className="text-[11.5px] font-medium leading-snug text-[var(--text-heading)]">{hoverBrief.title}</div>
            {hoverBrief.detail && <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--text-secondary)]">{hoverBrief.detail}</div>}
            <div className="mt-1 text-[9.5px] font-mono tracking-[0.14em] text-[var(--gold-primary)]">CLICK TO OPEN</div>
          </>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`${LABEL} text-[var(--oi-label)] px-1`}>{label}</span>
      {children}
    </div>
  );
}

function FilterRow({ on, count, onClick, mark, children }: { on: boolean; count: number; onClick: () => void; mark: ReactNode; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} disabled={count === 0}
      className={`flex items-center gap-2 h-6 px-1.5 rounded text-left text-[10.5px] transition-colors hover:bg-[var(--hover-accent)] disabled:opacity-40 disabled:pointer-events-none ${on ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through decoration-[var(--text-muted)]'}`}>
      <span className="w-3.5 flex items-center justify-center" style={{ opacity: on ? 1 : 0.4 }}>{mark}</span>
      <span className="flex-1 truncate">{children}</span>
      <span className="text-[9.5px] font-mono tabular-nums" style={{ color: on ? T.gold : T.mute }}>{count}</span>
    </button>
  );
}

function ToolButton({ children, title, onClick, active, disabled }: { children: ReactNode; title: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} aria-pressed={active} disabled={disabled}
      className={`h-7 min-w-7 px-1.5 rounded-md flex items-center justify-center gap-1 text-[9px] font-mono tracking-[0.16em] border transition-colors disabled:opacity-30 disabled:pointer-events-none ${active ? 'text-[var(--gold-light)] bg-[var(--gold-primary)]/10 border-[var(--border-active)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-accent)] border-transparent'}`}>
      {children}
    </button>
  );
}

function GraphNodeMark({ n, refFn, selected, dim, showLabel, thinking, onDown, onEnter, onLeave }: {
  n: GraphNode; refFn: (el: SVGGElement | null) => void; selected: boolean; dim: boolean; showLabel: boolean; thinking: boolean;
  onDown: (e: React.PointerEvent) => void; onEnter: () => void; onLeave: () => void;
}) {
  const color = NODE_COLOR[n.kind];
  const icon = n.radius * 1.05;
  const label = n.kind === 'evidence' ? clip(n.label, 36) : n.label;
  const ring: CSSProperties = { fill: 'var(--oi-raised)', stroke: color, strokeWidth: n.kind === 'evidence' ? 1 : n.kind === 'report' ? 2 : 1.5 };
  return (
    <g ref={refFn} data-oi-node={n.key} style={{ cursor: 'pointer', opacity: dim ? 0.16 : 1, transition: 'opacity .25s ease' }}
      onPointerDown={onDown} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <g className="oi-graph-in">
        {thinking && <circle r={n.radius + 6} className="oi-graph-ping" style={{ fill: 'none', stroke: T.alt, strokeWidth: 1.2 }} vectorEffect="non-scaling-stroke" />}
        {selected && <circle r={n.radius + 5} style={{ fill: 'none', stroke: '#fff', strokeWidth: 1.5, filter: 'drop-shadow(0 0 6px rgba(var(--gold-rgb),0.8))' }} vectorEffect="non-scaling-stroke" />}
        {n.kind === 'report' && <circle r={n.radius + 4} style={{ fill: 'none', stroke: color, strokeWidth: 1, opacity: 0.35 }} vectorEffect="non-scaling-stroke" />}
        {/* The actors who play the simulation wear a champagne ring. */}
        {n.cast && <circle r={n.radius + 3.5} style={{ fill: 'none', stroke: T.alt, strokeWidth: 1.2, opacity: 0.75 }} vectorEffect="non-scaling-stroke" />}
        <circle r={n.radius} style={ring} vectorEffect="non-scaling-stroke" />
        <circle r={n.radius} style={{ fill: color, opacity: 0.12 }} />
        <TypeIcon k={n.key} subtype={n.subtype} x={-icon / 2} y={-icon / 2} width={icon} height={icon} strokeWidth={1.8} style={{ color, pointerEvents: 'none' }} />
        {showLabel && (
          <text y={n.radius} dy="1.3em" textAnchor="middle" className={n.kind === 'evidence' ? 'font-mono' : ''}
            style={{
              fontSize: `calc(${n.kind === 'evidence' ? 9 : 10.5}px * var(--ls, 1))`,
              fontWeight: n.kind === 'evidence' ? 500 : 600,
              fill: n.kind === 'actor' ? (n.cast ? 'var(--text-heading)' : 'var(--text-secondary)') : n.kind === 'report' ? 'var(--gold-light)' : 'var(--text-secondary)',
              stroke: 'rgba(0,0,0,0.92)', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round', pointerEvents: 'none',
            }}>
            {label}
          </text>
        )}
      </g>
    </g>
  );
}

/** What the edges' colours mean (the arcs' own three, from the Style Studio), and the ring the players wear. */
function GraphLegend() {
  const line = (label: string, color: string, dash?: string) => (
    <span className="inline-flex items-center gap-1.5">
      <svg width="16" height="6" aria-hidden><line x1="1" x2="15" y1="3" y2="3" strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" style={{ stroke: color }} /></svg>{label}
    </span>
  );
  return (
    <div className="absolute left-3 bottom-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border-secondary)] bg-black/50 backdrop-blur-md px-3 py-1.5 text-[9.5px] font-mono tracking-[0.1em] text-[var(--text-secondary)] pointer-events-none">
      {line('ALIGNED · COOPERATES', T.support)}
      {line('OPPOSED · PRESSES', T.oppose)}
      {line('BETWEEN', T.neutral)}
      {line('QUOTE', T.body, '0.5 3')}
      <span className="inline-flex items-center gap-1.5">
        <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" fill="none" strokeWidth="1.2" style={{ stroke: T.alt }} /></svg>PLAYS
      </span>
    </div>
  );
}
