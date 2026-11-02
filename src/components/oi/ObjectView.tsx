'use client';
/**
 * OSIRIS OI: an object's view.
 *
 * Whatever is selected, from the globe, the graph, the timeline, the table or
 * a list, opens here as an object: its type and identity, its properties, and
 * everything it is linked to, grouped by kind of link, each a way on to the
 * next object. An actor shows who it is in the simulation and every move it
 * made, world by world, with the quotes behind them; a world shows how it
 * unfolded period by period; an event shows the moves that led to it; a
 * source shows who quoted it and what the report rests on it; a link shows
 * the move it was drawn from. Together they make a thread a reader can follow
 * from the prediction back to the words it came from.
 */
import { type ReactNode } from 'react';
import { ArrowLeft, LocateFixed, MessageSquare, Network, X } from 'lucide-react';
import { directionWord } from '@/lib/oi/forecast';
import { LINK_LABEL, TYPE_LABEL } from '@/lib/oi/objects';
import { moveFor, nodeName, relatedLinks, type Selection } from '@/lib/oi/research';
import { worldName, type RunState } from '@/lib/oi/state';
import type { Link, Move } from '@/lib/oi/types';
import { ANCHOR, LABEL, T, ago, gold, leanTo, pct, tint, toneInk } from './theme';
import { Avatar, IconButton, Mentions, Overline, PointTag, STANCE, StanceTag, TypeIcon, accentFor } from './atoms';
import { EventRow, LineGlyph, MoveRow, periodReached } from './lists';
import { PushTag, Quotes, SOURCE_KIND, SourceLink, Verbatim, sourceLabel } from './quotes';
import { evidenceLedger } from '@/lib/oi/sources';
import { priceText } from '@/lib/oi/quant';

export interface ObjectViewProps {
  s: RunState;
  sel: Selection;
  onSelect: (key: string | null) => void;
  onLocate: (lat: number, lng: number, zoom?: number) => void;
  onAsk: (actorId: string) => void;
  /** Open the selection in the graph view, where the workspace has one. */
  onGraph?: () => void;
  /** 'panel' fills a workspace column; 'card' sits inline in the docked panel. */
  variant?: 'panel' | 'card';
  /** Back to whatever the column showed before (the workspace's lists). */
  onBack?: () => void;
}

const TONE_WORD = { support: 'Aligned', oppose: 'Opposed', neutral: 'Between' } as const;
const STANCE_VERB: Record<Move['stance'], string> = { cooperate: 'cooperates with', pressure: 'presses', oppose: 'opposes', hold: 'holds toward' };

/** A link to another object: its icon and its name. */
function ObjectChip({ s, k, onSelect }: { s: RunState; k: string; onSelect: (k: string | null) => void }) {
  const source = k.startsWith('c:') ? s.context.find(c => `c:${c.id}` === k) : undefined;
  const subtype = k.startsWith('a:') ? s.actors.find(a => `a:${a.id}` === k)?.kind : k.startsWith('e:') ? s.events.find(e => `e:${e.id}` === k)?.kind : source?.kind ?? '';
  return (
    <button onClick={() => onSelect(k)} title={nodeName(s, k)}
      className="inline-flex items-center gap-1.5 max-w-full h-[26px] px-2 rounded-md border border-[var(--border-secondary)] bg-white/[0.02] text-[11.5px] text-[var(--text-primary)] hover:border-[var(--border-active)] hover:text-[var(--gold-light)] transition-colors">
      <TypeIcon k={k} subtype={subtype} className="w-3 h-3 flex-shrink-0" style={{ color: accentFor(k) }} />
      <span className="truncate">{nodeName(s, k)}</span>
      {source && <span className="font-mono text-[9px] text-[var(--text-muted)] flex-shrink-0">[{source.id}]</span>}
    </button>
  );
}

/** Whether the words a quote link carries were found in its source. */
const exactOf = (s: RunState, l: Link) => moveFor(s, l)?.cites?.find(c => `c:${c.source}` === l.to)?.exact ?? false;

/** "World A · P2": where in the simulation a move or a quote link was drawn. */
const whereOf = (l: Link) => `${worldName(l.id.split(':')[1] ?? '')} · P${l.round}`;

/** Who quoted a source, and in which words: each row opens the quote, with where in the simulation. */
function QuoteRows({ s, links, onSelect }: { s: RunState; links: Link[]; onSelect: (k: string | null) => void }) {
  return (
    <div className="flex flex-col gap-1">
      {links.map(l => (
        <button key={l.id} onClick={() => onSelect(`link:${l.id}`)}
          className="group -mx-1.5 px-1.5 py-1.5 rounded text-left transition-colors hover:bg-[var(--hover-accent)]">
          <span className="flex items-center gap-2">
            <Avatar name={nodeName(s, l.from)} size={18} />
            <span className="text-[11.5px] font-medium truncate text-[var(--text-primary)]">{nodeName(s, l.from)}</span>
            <span className="text-[9.5px] font-mono tracking-[0.08em] uppercase whitespace-nowrap text-[var(--text-muted)]">{whereOf(l)}</span>
            <span className="ml-auto"><Verbatim exact={exactOf(s, l)} /></span>
          </span>
          <span className="mt-1 block pl-[26px] text-[11.5px] leading-relaxed text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">“{l.label}”</span>
        </button>
      ))}
    </div>
  );
}

function Props({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 items-baseline">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className={`${LABEL} text-[var(--oi-label)] pt-px`}>{k}</dt>
          <dd className="text-[12px] leading-relaxed text-[var(--text-primary)] min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Group({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Overline>{label}</Overline>
        {count !== undefined && <span className="text-[10px] font-mono tabular-nums text-[var(--gold-primary)]">{count}</span>}
        <span className="flex-1 h-px bg-[var(--border-secondary)]" />
      </div>
      {children}
    </section>
  );
}

/** A lean from −1 (NO, lower) to +1 (YES, higher), on a centred track. */
function LeanBar({ lean, words }: { lean: number; words: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="relative w-24 h-[3px] rounded-full bg-white/[0.08]">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />
        <span className="absolute -top-[5px] w-[2px] h-[13px] -ml-px rounded-full" style={{ left: `${(0.5 + lean / 2) * 100}%`, background: T.goldLight, boxShadow: `0 0 8px ${gold(0.8)}` }} />
      </span>
      <span className="text-[9.5px] font-mono tracking-[0.1em] uppercase text-[var(--text-secondary)]">{words}</span>
    </span>
  );
}

function StrengthBar({ value, color }: { value: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-20 h-[3px] rounded-full overflow-hidden bg-white/[0.08]"><span className="block h-full rounded-full" style={{ width: `${value * 100}%`, background: color }} /></span>
      <span className="text-[10.5px] font-mono tabular-nums text-[var(--text-secondary)]">{Math.round(value * 100)}</span>
    </span>
  );
}

/** One of an actor's own moves, without its name: the period, the act, what it said, why, and what it quoted. */
function OwnMove({ s, move, onSelect }: { s: RunState; move: Move; onSelect: (k: string | null) => void }) {
  const targets = move.targets.map(t => s.actors.find(a => a.id === t)?.name).filter(Boolean);
  const period = s.periods.find(p => p.index === move.period);
  return (
    <div className="flex gap-2.5">
      <span className="mt-[3px] w-6 flex-shrink-0 text-[10px] font-mono tabular-nums text-[var(--gold-primary)]" title={period?.label}>P{move.period}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <StanceTag stance={move.stance} />
          {targets.length > 0 && <span className="text-[10.5px] truncate text-[var(--text-muted)]">→ {targets.join(', ')}</span>}
        </div>
        <p className="mt-1 text-[12px] leading-[1.55] text-[var(--text-primary)]"><Mentions text={move.action} s={s} onSelect={onSelect} /></p>
        {move.statement && <p className="mt-1 text-[11.5px] leading-relaxed italic text-[var(--text-secondary)]">“{move.statement}”</p>}
        {move.why && <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">Why: {move.why}</p>}
        <Quotes s={s} cites={move.cites} onSelect={onSelect} />
      </div>
    </div>
  );
}

/** A list of links from one object, each with its line, the object at the other end, and what the link says. */
function LinkRows({ s, links, from, onSelect }: { s: RunState; links: Link[]; from: string; onSelect: (k: string | null) => void }) {
  return (
    <div className="flex flex-col">
      {links.map(l => {
        const other = l.from === from ? l.to : l.from;
        return (
          <button key={l.id} onClick={() => onSelect(`link:${l.id}`)}
            className="group flex items-center gap-2.5 -mx-1.5 px-1.5 py-1 rounded text-left transition-colors hover:bg-[var(--hover-accent)]">
            <LineGlyph link={l} />
            <span className="flex-1 min-w-0 text-[11.5px] truncate text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
              {nodeName(s, other)}{l.label && <span className="text-[var(--text-muted)]"> · {l.label}</span>}
            </span>
            <span className="text-[9.5px] font-mono tracking-[0.1em] uppercase flex-shrink-0" style={{ color: toneInk(l.tone) }}>{TONE_WORD[l.tone]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Where a world stood after a period, with the line that says why. */
function Standing({ s, point, onSelect }: { s: RunState; point: RunState['points'][number]; onSelect: (k: string | null) => void }) {
  return (
    <div className="flex items-start gap-2.5">
      <PointTag point={point} frame={s.frame} />
      <span className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]"><Mentions text={point.note} s={s} onSelect={onSelect} /></span>
    </div>
  );
}

export function ObjectView({ s, sel, onSelect, onLocate, onAsk, onGraph, variant = 'card', onBack }: ObjectViewProps) {
  const place = (k: string) => {
    const [prefix, ...rest] = k.split(':');
    const id = rest.join(':');
    const n = prefix === 'a' ? s.actors.find(a => a.id === id) : prefix === 'e' ? s.events.find(e => e.id === id) : prefix === 'c' ? s.context.find(c => c.id === id) : null;
    return n && n.lat !== null && n.lng !== null ? { lat: n.lat, lng: n.lng } : null;
  };

  let type = '';
  let subtype = '';
  let title: ReactNode = null;
  let accent = accentFor(sel.key);
  let iconSub = '';
  let iconLink: Link['kind'] | undefined;
  let props: [string, ReactNode][] = [];
  let body: ReactNode = null;
  let locate: { lat: number; lng: number; zoom: number } | null = null;
  let inGraph = false;

  switch (sel.type) {
    case 'link': {
      const l = sel.link;
      accent = l.kind === 'cite' ? T.body : toneInk(l.tone);
      iconLink = l.kind;
      type = 'Link';
      subtype = LINK_LABEL[l.kind];
      inGraph = true;
      const a = place(l.from), b = place(l.to);
      if (a && b) locate = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2, zoom: 2.2 };
      const fromReport = l.from === 'r:report';
      const mv = moveFor(s, l);
      const verb = l.kind === 'cite' ? (fromReport ? 'rests on' : 'quotes')
        : l.kind === 'relation' ? '⇄' : l.kind === 'evidence' ? '→' : mv ? STANCE_VERB[mv.stance] : 'moves on';
      const quotedSource = l.kind === 'cite' ? s.context.find(c => `c:${c.id}` === l.to) : undefined;
      title = <>{nodeName(s, l.from)} <span className="font-normal text-[var(--text-muted)]">{verb}</span> {l.kind === 'cite' ? sourceLabel(quotedSource, l.to.slice(2)) : nodeName(s, l.to)}</>;
      const evidenceEffect = s.frame?.kind === 'number' ? (l.tone === 'support' ? 'Points higher' : l.tone === 'oppose' ? 'Points lower' : 'Bears on')
        : l.tone === 'support' ? 'Points toward YES' : l.tone === 'oppose' ? 'Points toward NO' : 'Bears on';
      const period = l.round ? s.periods.find(p => p.index === l.round) : undefined;
      props = [
        ['Tone', l.kind === 'cite' ? null : <span key="t" className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: accent }} />{l.kind === 'evidence' ? evidenceEffect : l.kind === 'move' && mv ? STANCE[mv.stance].word : TONE_WORD[l.tone]}</span>],
        ['Strength', l.kind === 'cite' ? null : <StrengthBar key="s" value={l.strength} color={accent} />],
        ['When', l.kind === 'cite' && fromReport ? 'The report' : l.round ? <span key="w">{whereOf(l)}{period && <span className="text-[var(--text-muted)]"> · {period.label}</span>}</span> : 'World model'],
        ['From', <ObjectChip key="f" s={s} k={l.from} onSelect={onSelect} />],
        ['To', <ObjectChip key="o" s={s} k={l.to} onSelect={onSelect} />],
      ];
      const item = l.kind === 'evidence' ? s.context.find(c => `c:${c.id}` === l.from) : undefined;
      body = (
        <>
          {l.kind === 'cite' && !fromReport && (
            <div className="flex flex-col gap-1.5">
              <blockquote className="pl-2.5 text-[12.5px] leading-relaxed text-[var(--text-heading)] border-l-2" style={{ borderColor: accent }}>“{l.label}”</blockquote>
              <span className="pl-3"><Verbatim exact={exactOf(s, l)} /></span>
            </div>
          )}
          {l.kind === 'cite' && quotedSource && (
            <Group label={fromReport ? 'The source' : 'Where it comes from'}>
              <div className="rounded-md border border-[var(--border-secondary)] bg-black/25 px-3 py-2">
                <p className="text-[11.5px] leading-snug text-[var(--text-primary)]">{quotedSource.kind === 'data' && quotedSource.id !== 'data' ? `“${quotedSource.title}”` : quotedSource.title}</p>
                <p className="mt-1 text-[9.5px] font-mono tracking-[0.08em] text-[var(--text-muted)]">{[`[${quotedSource.id}]`, sourceLabel(quotedSource, quotedSource.id), quotedSource.place, ago(quotedSource.published)].filter(Boolean).join(' · ')}</p>
              </div>
            </Group>
          )}
          {l.label && !(l.kind === 'cite' && !fromReport) && !(l.kind === 'move' && mv) && (
            <blockquote className="pl-2.5 text-[12px] leading-relaxed text-[var(--text-primary)] border-l-2" style={{ borderColor: accent }}>{l.label}</blockquote>
          )}
          {item && <p className="text-[9.5px] font-mono tracking-[0.08em] text-[var(--text-muted)]">{[item.source, item.place, ago(item.published)].filter(Boolean).join(' · ')}</p>}
          {mv && (
            <Group label={l.kind === 'cite' ? 'The move it shaped' : 'The move it was drawn from'}>
              <div className="rounded-md border border-[var(--border-secondary)] bg-black/25 px-2.5 py-2"><MoveRow s={s} move={mv} on={false} onSelect={onSelect} showWorld /></div>
            </Group>
          )}
        </>
      );
      break;
    }
    case 'actor': {
      const a = sel.actor;
      type = TYPE_LABEL.actor;
      subtype = a.persona ? `${a.kind} · plays` : a.kind;
      iconSub = a.kind;
      title = a.name;
      inGraph = true;
      if (a.lat !== null && a.lng !== null) locate = { lat: a.lat, lng: a.lng, zoom: 3.5 };
      const touching = s.links.filter(l => l.from === sel.key || l.to === sel.key);
      const rel = touching.filter(l => l.kind === 'relation');
      const ev = touching.filter(l => l.kind === 'evidence');
      const moves = s.moves.filter(m => m.actor === a.id);
      const aimedBy = [...new Set(s.moves.filter(m => m.actor !== a.id && m.targets.includes(a.id)).map(m => `a:${m.actor}`))];
      // What moved it: every source it quoted, and which way.
      const moved = evidenceLedger(moves);
      const deciding = s.worlds.filter(w => `${w}:${a.id}` in s.thinking);
      const predicted = s.report?.actorMoves.find(m => m.actor === a.id)?.prediction;
      const leanWords = s.frame?.kind === 'number' ? (a.lean > 0.15 ? 'pushes higher' : a.lean < -0.15 ? 'pushes lower' : 'balanced') : a.lean > 0.15 ? 'toward YES' : a.lean < -0.15 ? 'toward NO' : 'balanced';
      props = [
        ['Role', a.role],
        ['Wants', a.persona?.goal],
        ['Can', a.persona?.levers.length ? a.persona.levers.join(' · ') : null],
        ['Will not', a.persona?.redLines],
        ['Decides', a.persona?.style],
        ['Location', a.place],
        ['Lean', s.frame?.kind === 'choice' ? null : <LeanBar key="l" lean={a.lean} words={leanWords} />],
        ['Now', deciding.length ? <span key="d" className="text-[var(--oi-alt)]">Deciding in {deciding.map(worldName).join(', ')}…</span> : null],
      ];
      body = (
        <>
          {predicted && (
            <Group label="Predicted to">
              <blockquote className="pl-2.5 text-[12px] leading-relaxed text-[var(--text-heading)] border-l-2" style={{ borderColor: T.goldLight }}><Mentions text={predicted} s={s} onSelect={onSelect} /></blockquote>
            </Group>
          )}
          {s.worlds.map(w => {
            const own = moves.filter(m => m.world === w);
            if (!own.length) return null;
            return (
              <Group key={w} label={`Its moves · ${worldName(w)}`} count={own.length}>
                <div className="flex flex-col gap-2.5">{own.map(m => <OwnMove key={m.id} s={s} move={m} onSelect={onSelect} />)}</div>
              </Group>
            );
          })}
          {moved.length > 0 && (
            <Group label="What moved it" count={moved.length}>
              <div className="flex flex-col">
                {moved.map(r => {
                  const c = s.context.find(x => x.id === r.source);
                  const last = moves.flatMap(m => m.cites ?? []).filter(x => x.source === r.source).at(-1);
                  return (
                    <div key={r.source} className="flex items-center gap-2 -mx-1.5 px-1.5 py-1 rounded hover:bg-[var(--hover-accent)]">
                      <button onClick={() => onSelect(`c:${r.source}`)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                        <TypeIcon k={`c:${r.source}`} subtype={c?.kind} className="w-3 h-3 flex-shrink-0 text-[var(--text-muted)]" />
                        <span className="text-[11px] truncate text-[var(--text-secondary)]">{c?.title ?? r.source}</span>
                      </button>
                      {last && <PushTag c={last} frame={s.frame} />}
                      <span className="text-[9px] font-mono tabular-nums text-[var(--text-muted)]">{r.quoted}×</span>
                      <SourceLink url={c?.url} />
                    </div>
                  );
                })}
              </div>
            </Group>
          )}
          {aimedBy.length > 0 && (
            <Group label="Moved against it or with it" count={aimedBy.length}>
              <div className="flex flex-wrap gap-1.5">{aimedBy.map(k => <ObjectChip key={k} s={s} k={k} onSelect={onSelect} />)}</div>
            </Group>
          )}
          {rel.length > 0 && <Group label="Relations" count={rel.length}><LinkRows s={s} links={rel} from={sel.key} onSelect={onSelect} /></Group>}
          {ev.length > 0 && <Group label="Evidence" count={ev.length}><LinkRows s={s} links={ev} from={sel.key} onSelect={onSelect} /></Group>}
          {a.persona && (
            <button onClick={() => onAsk(a.id)} className="oi-btn self-start">
              <MessageSquare className="w-3 h-3" /> Ask {a.name.split(' ').slice(0, 2).join(' ')}
            </button>
          )}
        </>
      );
      break;
    }
    case 'event': {
      const e = sel.event;
      type = TYPE_LABEL.event;
      subtype = e.kind === 'shock' ? 'surprise' : e.kind === 'injected' ? 'injected' : '';
      iconSub = e.kind;
      title = e.title;
      if (e.lat !== null && e.lng !== null) locate = { lat: e.lat, lng: e.lng, zoom: 4 };
      const period = s.periods.find(p => p.index === e.period);
      const point = s.points.find(p => p.world === e.world && p.period === e.period);
      // The moves behind it: what the actors it involves did in that world and period.
      const behind = s.moves.filter(m => m.world === e.world && m.period === e.period && (e.actors.length === 0 || e.actors.includes(m.actor)));
      props = [
        ['World', <ObjectChip key="w" s={s} k={`w:${e.world}`} onSelect={onSelect} />],
        ['Date', <span key="d">{e.date}{period && <span className="text-[var(--text-muted)]"> · P{period.index}, {period.label}</span>}</span>],
        ['Pushes', <PushTag key="p" c={e} frame={s.frame} />],
        ['Where', e.place],
        ['Involves', e.actors.length ? <div key="a" className="flex flex-wrap gap-1.5">{e.actors.map(id => <ObjectChip key={id} s={s} k={`a:${id}`} onSelect={onSelect} />)}</div> : null],
      ];
      body = (
        <>
          {e.detail && <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]"><Mentions text={e.detail} s={s} onSelect={onSelect} /></p>}
          {point && <Group label="Where it left the question"><Standing s={s} point={point} onSelect={onSelect} /></Group>}
          {e.kind !== 'injected' && behind.length > 0 && (
            <Group label="The moves behind it" count={behind.length}>
              <div className="flex flex-col gap-2.5">{behind.map(m => <MoveRow key={m.id} s={s} move={m} on={false} onSelect={onSelect} />)}</div>
            </Group>
          )}
        </>
      );
      break;
    }
    case 'world': {
      const w = sel.world;
      type = TYPE_LABEL.world;
      subtype = 'simulated';
      title = worldName(w);
      const points = s.points.filter(p => p.world === w);
      const last = points.at(-1);
      const ended = s.report?.worlds.find(x => x.world === w);
      const reached = periodReached(s);
      props = [
        ['Stands', last ? <PointTag key="p" point={last} frame={s.frame} /> : <span key="p" className="text-[var(--text-muted)]">Not started</span>],
        ['Outcome', ended?.outcome],
        ['Events', <span key="e" className="font-mono tabular-nums">{s.events.filter(e => e.world === w).length}</span>],
        ['Moves', <span key="m" className="font-mono tabular-nums">{s.moves.filter(m => m.world === w).length}</span>],
      ];
      body = (
        <>
          {ended?.summary && <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]"><Mentions text={ended.summary} s={s} onSelect={onSelect} /></p>}
          {s.periods.filter(p => p.index <= reached).map(p => {
            const point = points.find(x => x.period === p.index);
            const events = s.events.filter(e => e.world === w && e.period === p.index);
            if (!point && !events.length) return null;
            return (
              <Group key={p.index} label={`P${p.index} · ${p.label}`}>
                {events.length > 0 && <div className="flex flex-col gap-1">{events.map(e => <EventRow key={e.id} s={s} event={e} on={false} onSelect={onSelect} />)}</div>}
                {point && <Standing s={s} point={point} onSelect={onSelect} />}
              </Group>
            );
          })}
        </>
      );
      break;
    }
    case 'context': {
      const c = sel.item;
      type = TYPE_LABEL.source;
      subtype = SOURCE_KIND[c.kind] ?? c.kind;
      iconSub = c.kind;
      title = c.kind === 'data' && c.id !== 'data' ? `“${c.title}”` : c.title;
      if (c.lat !== null && c.lng !== null) locate = { lat: c.lat, lng: c.lng, zoom: 4 };
      const bears = s.links.filter(l => l.kind === 'evidence' && l.from === sel.key);
      const quotedBy = s.links.filter(l => l.kind === 'cite' && l.to === sel.key && l.from.startsWith('a:')).sort((a, b) => a.round - b.round);
      const inReport = s.links.filter(l => l.kind === 'cite' && l.to === sel.key && l.from === 'r:report');
      const quoters = new Set(quotedBy.map(l => l.from)).size;
      inGraph = bears.length + quotedBy.length + inReport.length > 0;
      const q = c.kind === 'series' && s.quant?.symbol === c.symbol ? s.quant : null;
      props = [
        ['Id', <span key="i" className="font-mono">[{c.id}]</span>],
        ['Price of YES', c.odds ? <span key="o" className="font-mono" style={{ color: ANCHOR.market }}>{pct(c.odds.probability)}{s.frame?.market === c.id ? <span className="text-[var(--text-muted)]"> · the market on this question</span> : null}</span> : null],
        ['Traded', c.odds ? (c.odds.platform === 'Polymarket' ? `$${Math.round(c.odds.volume).toLocaleString('en-US')}` : `${Math.round(c.odds.volume).toLocaleString('en-US')} mana`) : null],
        ['Closes', c.odds?.closes ? new Date(c.odds.closes).toLocaleDateString() : null],
        ['Swings', q ? `${Math.round(q.vol * 100)}% a year` : null],
        ['Baseline', q ? (q.probability !== undefined ? <span key="b" className="font-mono" style={{ color: ANCHOR.baseline }}>{pct(q.probability)} by the horizon</span> : `${priceText(q.p10, q.currency)}–${priceText(q.p90, q.currency)} at the horizon (80%)`) : null],
        ['Priced sim.', q?.simulated ? (q.simulated.probability !== undefined ? <span key="sp" className="font-mono" style={{ color: ANCHOR.simulation }}>{pct(q.simulated.probability)}</span> : `${priceText(q.simulated.p10, q.currency)}–${priceText(q.simulated.p90, q.currency)} (80%)`) : null],
        [c.kind === 'data' ? 'From' : 'Source', <span key="s" className="inline-flex items-center gap-1.5">{sourceLabel(c, c.id)}<SourceLink url={c.url} /></span>],
        ['Location', c.place],
        ['Published', c.published ? `${new Date(c.published).toLocaleString()} · ${ago(c.published)}` : ''],
        ['Quoted', quotedBy.length ? <span key="q" className="font-mono tabular-nums">{quotedBy.length}× by {quoters} actor{quoters === 1 ? '' : 's'}</span> : null],
      ];
      body = (
        <>
          {c.excerpt && (
            <Group label="What it says">
              <blockquote className="pl-2.5 border-l-2 border-[var(--border-primary)] text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{c.excerpt}</blockquote>
            </Group>
          )}
          {c.kind === 'social' && (
            <p className="rounded-md pl-3 pr-2.5 py-2 text-[11.5px] leading-snug border-l-2" style={{ color: T.text, background: 'rgba(255,255,255,0.03)', borderColor: T.alt }}>
              A post on a social network: an unverified claim, not reporting. The actors were told to weigh it as one.
            </p>
          )}
          {q && <p className="text-[10.5px] leading-snug text-[var(--text-muted)]">{q.method}</p>}
          {c.url && (
            <a href={c.url} target="_blank" rel="noopener noreferrer nofollow"
              className="oi-btn self-start">
              Open the {c.kind === 'wiki' ? 'article on Wikipedia' : c.kind === 'web' ? 'article' : c.kind === 'odds' ? `market on ${c.source}` : c.kind === 'series' ? 'quote on Yahoo Finance' : c.kind === 'social' ? 'post' : c.kind === 'camera' ? "camera's page" : 'source'} ↗
            </a>
          )}
          {inReport.length > 0 && (
            <Group label="The report rests on it" count={inReport.length}>
              <div className="flex flex-col gap-1">
                {inReport.map(l => (
                  <button key={l.id} onClick={() => onSelect(`link:${l.id}`)} className="group flex items-start gap-2 -mx-1.5 px-1.5 py-1 rounded text-left hover:bg-[var(--hover-accent)]">
                    <TypeIcon k="r:report" className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: T.goldLight }} />
                    <span className="text-[11px] leading-snug text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{l.label}</span>
                  </button>
                ))}
              </div>
            </Group>
          )}
          {quotedBy.length > 0 && <Group label="Quoted by" count={quotedBy.length}><QuoteRows s={s} links={quotedBy} onSelect={onSelect} /></Group>}
          {bears.length > 0 && <Group label="Cited against" count={bears.length}><LinkRows s={s} links={bears} from={sel.key} onSelect={onSelect} /></Group>}
          {!inGraph && <p className="text-[11px] text-[var(--text-muted)]">Read by the actors; nobody quoted it.</p>}
        </>
      );
      break;
    }
    case 'scenario': {
      const sc = sel.scenario;
      type = TYPE_LABEL.scenario;
      title = sc.name;
      if (sc.lat !== null && sc.lng !== null) locate = { lat: sc.lat, lng: sc.lng, zoom: 4 };
      props = [['Probability', <span key="p" className="font-mono text-[var(--gold-light)]">{pct(sc.probability)}</span>], ['Plays out in', sc.place]];
      body = <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]"><Mentions text={sc.description} s={s} onSelect={onSelect} /></p>;
      break;
    }
    case 'report': {
      const r = sel.report;
      type = TYPE_LABEL.report;
      subtype = `${r.confidence} confidence`;
      title = r.headline;
      inGraph = s.links.some(l => l.from === sel.key);
      const used = [...new Set(r.drivers.flatMap(d => d.sources ?? []))];
      props = [
        ['Answer', <span key="a" className="font-mono text-[var(--gold-light)]">{r.answer}</span>],
        ['Sources', used.length ? <span key="s" className="font-mono tabular-nums">{used.length}</span> : null],
      ];
      body = (
        <>
          <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]"><Mentions text={r.summary} s={s} onSelect={onSelect} /></p>
          {r.drivers.length > 0 && (
            <Group label="Drivers, and what they rest on" count={r.drivers.length}>
              <div className="flex flex-col gap-2.5">
                {r.drivers.map((d, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <span className="text-[11.5px] leading-snug text-[var(--text-primary)]">{d.text}</span>
                    {(d.sources?.length ?? 0) > 0
                      ? <div className="flex flex-wrap gap-1.5">{d.sources!.map(id => <ObjectChip key={id} s={s} k={`c:${id}`} onSelect={onSelect} />)}</div>
                      : <span className={`${LABEL} text-[var(--text-muted)]`}>No source given</span>}
                  </div>
                ))}
              </div>
            </Group>
          )}
        </>
      );
      break;
    }
    case 'signpost': {
      const sp = sel.signpost;
      type = TYPE_LABEL.signpost;
      title = sp.text;
      if (sp.lat !== null && sp.lng !== null) locate = { lat: sp.lat, lng: sp.lng, zoom: 4.5 };
      props = [
        ['If it happens', <span key="m" className="font-mono uppercase text-[10.5px] tracking-[0.1em]" style={{ color: leanTo(sp.means) }}>{directionWord(s.frame, sp.means, sp.favors)}</span>],
        ['Where', sp.place],
      ];
      break;
    }
  }

  const lit = relatedLinks(s, sel.key).size;
  const actions = (
    <>
      {locate && <IconButton title="Show on the globe" onClick={() => onLocate(locate!.lat, locate!.lng, locate!.zoom)}><LocateFixed className="w-3.5 h-3.5" /></IconButton>}
      {onGraph && inGraph && <IconButton title="Show in the graph" onClick={onGraph}><Network className="w-3.5 h-3.5" /></IconButton>}
      <IconButton title="Close" onClick={() => onSelect(null)}><X className="w-3.5 h-3.5" /></IconButton>
    </>
  );
  const header = (
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 border" style={{ color: accent, borderColor: tint(accent, 45), background: tint(accent, 12) }}>
        <TypeIcon k={sel.key} subtype={iconSub} link={iconLink} className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="text-[14.5px] font-semibold leading-snug text-[var(--text-heading)] break-words">{title}</h4>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className={LABEL} style={{ color: accent }}>{type}</span>
          {subtype && <span className={`${LABEL} text-[var(--text-muted)]`}>· {subtype}</span>}
          {lit > 1 && <span className={`${LABEL} text-[var(--text-muted)]`}>· {lit} links</span>}
        </div>
      </div>
      {variant === 'card' && <div className="flex items-center -mr-1.5 -mt-1">{actions}</div>}
    </div>
  );
  const content = (
    <>
      {header}
      <Props rows={props} />
      {body}
    </>
  );

  if (variant === 'panel') {
    return (
      <div className="flex flex-col h-full min-h-0" aria-label={`${type}: ${typeof title === 'string' ? title : ''}`}>
        <div className="flex items-center gap-1 h-11 px-2 border-b border-[var(--border-secondary)] flex-shrink-0 relative">
          {onBack && <button onClick={onBack} className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md ${LABEL} text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-accent)]`}><ArrowLeft className="w-3 h-3" /> Lists</button>}
          <span className={`ml-1 ${LABEL} text-[var(--text-secondary)]`}>Object</span>
          <span className="ml-auto flex items-center">{actions}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar p-4 flex flex-col gap-5">{content}</div>
      </div>
    );
  }

  // In a column or the phone drawer a new selection can sit below the fold: bring it into view.
  const bringIntoView = (el: HTMLElement | null) => {
    if (!el || el.dataset.key === sel.key) return;
    el.dataset.key = sel.key;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  return (
    <section ref={bringIntoView} className="relative overflow-hidden flex flex-col gap-4 rounded-lg border border-[var(--border-primary)] p-4" style={{ background: gold(0.03) }}>
      <span className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${gold(0.6)}, transparent)` }} />
      {content}
    </section>
  );
}
