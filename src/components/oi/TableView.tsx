'use client';
/**
 * OSIRIS OI: the table view.
 *
 * Every object of a kind in one sortable table: the actors with what they
 * did, every move made in every world, the events the worlds produced, the
 * sources with who quoted them, and every link. A row opens its object (a
 * move opens the actor that made it).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { LINK_LABEL } from '@/lib/oi/objects';
import { nodeName } from '@/lib/oi/research';
import { worldName, type RunState } from '@/lib/oi/state';
import { LABEL, SOLID, T, ago, toneColor, toneInk } from './theme';
import { Empty, Segmented, StanceTag, TypeIcon, accentFor } from './atoms';
import { PushTag, SOURCE_KIND } from './quotes';

type Kind = 'actors' | 'moves' | 'events' | 'sources' | 'links';

interface Column<R> {
  id: string;
  label: string;
  /** CSS grid track. */
  width: string;
  align?: 'right';
  sort: (r: R) => number | string;
  cell: (r: R) => ReactNode;
}

interface TableSpec<R> {
  rows: R[];
  /** What a row opens. */
  key: (r: R) => string;
  /** The row's own identity, where several rows open the same object. */
  id?: (r: R) => string;
  text: (r: R) => string;
  columns: Column<R>[];
}

const num = (v: ReactNode) => <span className="font-mono tabular-nums">{v}</span>;

function NameCell({ k, subtype, title, sub }: { k: string; subtype?: string; title: string; sub?: string }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <TypeIcon k={k} subtype={subtype} className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accentFor(k) }} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[var(--text-heading)]">{title}</span>
        {sub && <span className="block truncate text-[10.5px] text-[var(--text-muted)]">{sub}</span>}
      </span>
    </span>
  );
}

function specs(s: RunState) {
  const touching = (k: string) => s.links.filter(l => l.from === k || l.to === k);
  const movesOf = (id: string) => s.moves.filter(m => m.actor === id);
  const hard = (id: string) => movesOf(id).filter(m => m.stance === 'pressure' || m.stance === 'oppose').length;
  const quotes = (id: string) => movesOf(id).reduce((n, m) => n + (m.cites?.length ?? 0), 0);
  const name = (id: string) => s.actors.find(a => a.id === id)?.name ?? id;
  const actors: TableSpec<RunState['actors'][number]> = {
    // The cast first, in the order they were cast; the rest of the world model after.
    rows: [...s.actors.filter(a => a.persona), ...s.actors.filter(a => !a.persona)], key: a => `a:${a.id}`, text: a => `${a.name} ${a.kind} ${a.role} ${a.place} ${a.persona?.goal ?? ''}`,
    columns: [
      { id: 'name', label: 'Actor', width: 'minmax(170px,2fr)', sort: a => a.name, cell: a => <NameCell k={`a:${a.id}`} subtype={a.kind} title={a.name} sub={a.persona?.goal || a.role} /> },
      { id: 'kind', label: 'Type', width: '96px', sort: a => a.kind, cell: a => <span className={`${LABEL} text-[var(--text-secondary)]`}>{a.kind}</span> },
      { id: 'plays', label: 'Plays', width: '56px', sort: a => (a.persona ? 1 : 0), cell: a => a.persona ? <span className={`${LABEL} text-[var(--gold-primary)]`}>Yes</span> : <span className="text-[var(--text-muted)]">—</span> },
      {
        id: 'lean', label: 'Lean', width: '64px', align: 'right', sort: a => a.lean,
        cell: a => s.frame?.kind === 'choice' ? num('—') : <span className="font-mono tabular-nums" style={{ color: a.lean > 0.15 ? T.gold : a.lean < -0.15 ? T.heading : T.body }}>{a.lean > 0 ? '+' : ''}{a.lean.toFixed(2)}</span>,
      },
      { id: 'moves', label: 'Moves', width: '60px', align: 'right', sort: a => movesOf(a.id).length, cell: a => num(movesOf(a.id).length || '—') },
      { id: 'hard', label: 'Presses', width: '66px', align: 'right', sort: a => hard(a.id), cell: a => num(hard(a.id) || '—') },
      { id: 'quotes', label: 'Quotes', width: '62px', align: 'right', sort: a => quotes(a.id), cell: a => num(quotes(a.id) || '—') },
      { id: 'links', label: 'Links', width: '56px', align: 'right', sort: a => touching(`a:${a.id}`).length, cell: a => num(touching(`a:${a.id}`).length) },
    ],
  };
  const moves: TableSpec<RunState['moves'][number]> = {
    rows: s.moves, key: m => `a:${m.actor}`, id: m => m.id, text: m => `${name(m.actor)} ${m.action} ${m.statement} ${m.targets.map(name).join(' ')} world ${m.world}`,
    columns: [
      { id: 'period', label: 'P', width: '40px', align: 'right', sort: m => m.period * 100 + m.world.charCodeAt(0), cell: m => num(m.period) },
      { id: 'world', label: 'World', width: '64px', sort: m => m.world, cell: m => <span className={`${LABEL} text-[var(--text-secondary)]`}>{m.world}</span> },
      { id: 'actor', label: 'Actor', width: 'minmax(130px,1.2fr)', sort: m => name(m.actor), cell: m => <NameCell k={`a:${m.actor}`} subtype={s.actors.find(a => a.id === m.actor)?.kind} title={name(m.actor)} /> },
      { id: 'stance', label: 'Stance', width: '96px', sort: m => m.stance, cell: m => <StanceTag stance={m.stance} /> },
      { id: 'action', label: 'Does', width: 'minmax(200px,3fr)', sort: m => m.action, cell: m => <span className="truncate text-[var(--text-primary)]" title={m.action}>{m.action}</span> },
      { id: 'targets', label: 'Aimed at', width: 'minmax(100px,1fr)', sort: m => m.targets.map(name).join(', '), cell: m => <span className="truncate text-[var(--text-secondary)]">{m.targets.map(name).join(', ') || '—'}</span> },
      { id: 'quotes', label: 'Quotes', width: '60px', align: 'right', sort: m => m.cites?.length ?? 0, cell: m => num(m.cites?.length || '—') },
    ],
  };
  const events: TableSpec<RunState['events'][number]> = {
    rows: s.events, key: e => `e:${e.id}`, text: e => `${e.title} ${e.detail} ${e.place} world ${e.world}`,
    columns: [
      { id: 'date', label: 'Date', width: '92px', sort: e => e.date, cell: e => <span className="font-mono tabular-nums text-[var(--text-secondary)]">{e.date}</span> },
      { id: 'world', label: 'World', width: '64px', sort: e => e.world, cell: e => <span className={`${LABEL} text-[var(--text-secondary)]`} title={worldName(e.world)}>{e.world}</span> },
      { id: 'title', label: 'Event', width: 'minmax(220px,3fr)', sort: e => e.title, cell: e => <NameCell k={`e:${e.id}`} subtype={e.kind} title={e.title} sub={e.actors.map(name).join(', ')} /> },
      { id: 'kind', label: 'Kind', width: '80px', sort: e => e.kind, cell: e => <span className={`${LABEL}`} style={{ color: e.kind === 'event' ? T.body : T.goldLight }}>{e.kind === 'shock' ? 'Surprise' : e.kind === 'injected' ? 'Injected' : 'Event'}</span> },
      { id: 'push', label: 'Pushes', width: '104px', sort: e => e.push, cell: e => <PushTag c={e} frame={s.frame} /> },
      { id: 'place', label: 'Where', width: 'minmax(80px,1fr)', sort: e => e.place, cell: e => <span className="truncate text-[var(--text-secondary)]">{e.place || '—'}</span> },
    ],
  };
  const sources: TableSpec<RunState['context'][number]> = {
    rows: s.context, key: c => `c:${c.id}`, text: c => `${c.title} ${c.source} ${c.place}`,
    columns: [
      { id: 'title', label: 'Source', width: 'minmax(220px,3fr)', sort: c => c.title, cell: c => <NameCell k={`c:${c.id}`} subtype={c.kind} title={c.title} sub={c.source} /> },
      { id: 'kind', label: 'Kind', width: '84px', sort: c => c.kind, cell: c => <span className={`${LABEL} text-[var(--text-secondary)]`}>{SOURCE_KIND[c.kind] ?? c.kind}</span> },
      { id: 'place', label: 'Location', width: 'minmax(80px,1fr)', sort: c => c.place, cell: c => <span className="truncate text-[var(--text-secondary)]">{c.place || '—'}</span> },
      { id: 'age', label: 'Age', width: '64px', align: 'right', sort: c => Date.parse(c.published) || 0, cell: c => num(ago(c.published) || '—') },
      { id: 'quoted', label: 'Quoted', width: '60px', align: 'right', sort: c => s.links.filter(l => l.kind === 'cite' && l.to === `c:${c.id}`).length, cell: c => num(s.links.filter(l => l.kind === 'cite' && l.to === `c:${c.id}`).length || '—') },
      { id: 'cited', label: 'Cited', width: '54px', align: 'right', sort: c => touching(`c:${c.id}`).length, cell: c => num(touching(`c:${c.id}`).length || '—') },
    ],
  };
  const links: TableSpec<RunState['links'][number]> = {
    rows: s.links, key: l => `link:${l.id}`, text: l => `${nodeName(s, l.from)} ${nodeName(s, l.to)} ${l.kind} ${l.label}`,
    columns: [
      { id: 'from', label: 'From', width: 'minmax(120px,1.4fr)', sort: l => nodeName(s, l.from), cell: l => <span className="truncate text-[var(--text-primary)]">{nodeName(s, l.from)}</span> },
      {
        id: 'kind', label: 'Link', width: '108px', sort: l => `${l.kind}${l.tone}`,
        cell: l => (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-[2px] rounded-full" style={{ background: l.kind === 'cite' ? T.body : toneColor(l.tone), opacity: l.kind === 'evidence' ? 0.6 : 1 }} />
            <span className={LABEL} style={{ color: l.kind === 'cite' ? T.body : toneInk(l.tone) }}>{LINK_LABEL[l.kind]}</span>
          </span>
        ),
      },
      { id: 'to', label: 'To', width: 'minmax(120px,1.4fr)', sort: l => nodeName(s, l.to), cell: l => <span className="truncate text-[var(--text-primary)]">{nodeName(s, l.to)}</span> },
      { id: 'strength', label: 'Str.', width: '52px', align: 'right', sort: l => l.strength, cell: l => num(Math.round(l.strength * 100)) },
      { id: 'round', label: 'When', width: '62px', align: 'right', sort: l => l.round, cell: l => num(l.from === 'r:report' ? 'Report' : l.round ? `${l.id.split(':')[1]} · P${l.round}` : 'Model') },
      { id: 'label', label: 'Says', width: 'minmax(140px,2fr)', sort: l => l.label, cell: l => <span className="truncate text-[var(--text-muted)]" title={l.label}>{l.label || '—'}</span> },
    ],
  };
  return { actors, moves, events, sources, links };
}

function Table<R>({ spec, selected, onSelect, query }: { spec: TableSpec<R>; selected: string | null; onSelect: (k: string | null) => void; query: string }) {
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const template = spec.columns.map(c => c.width).join(' ');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = q ? spec.rows.filter(r => spec.text(r).toLowerCase().includes(q)) : spec.rows;
    if (!sort) return hit;
    const col = spec.columns.find(c => c.id === sort.id);
    if (!col) return hit;
    return hit.slice().sort((a, b) => {
      const x = col.sort(a), y = col.sort(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [spec, sort, query]);

  return (
    <div role="table" className="min-w-[560px]">
      <div role="row" className="grid sticky top-0 z-10 border-b border-[var(--border-primary)]" style={{ gridTemplateColumns: template, background: SOLID }}>
        {spec.columns.map(c => {
          const on = sort?.id === c.id;
          return (
            <button key={c.id} role="columnheader" aria-sort={on ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none'}
              onClick={() => setSort(on ? (sort!.dir === 1 ? { id: c.id, dir: -1 } : null) : { id: c.id, dir: 1 })}
              className={`flex items-center gap-1 px-3 h-8 ${LABEL} transition-colors hover:text-[var(--text-primary)] ${c.align === 'right' ? 'justify-end' : ''} ${on ? 'text-[var(--gold-light)]' : 'text-[var(--text-muted)]'}`}>
              {c.label}{on && (sort!.dir === 1 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}
            </button>
          );
        })}
      </div>
      {rows.map(r => {
        const k = spec.key(r);
        const on = selected === k;
        return (
          <button key={spec.id?.(r) ?? k} role="row" onClick={() => onSelect(on ? null : k)} aria-selected={on}
            className={`grid w-full items-center text-left text-[11.5px] border-b border-[var(--border-secondary)] transition-colors hover:bg-[var(--hover-accent)] ${on ? 'bg-[var(--hover-accent)]' : ''}`}
            style={{ gridTemplateColumns: template, boxShadow: on ? `inset 2px 0 0 ${T.gold}` : undefined }}>
            {spec.columns.map(c => (
              <span key={c.id} role="cell" className={`px-3 py-2 min-w-0 overflow-hidden flex items-center ${c.align === 'right' ? 'justify-end' : ''}`}>{c.cell(r)}</span>
            ))}
          </button>
        );
      })}
      {!rows.length && <Empty>{query ? 'Nothing matches the filter.' : 'Nothing here yet.'}</Empty>}
    </div>
  );
}

export function TableView({ s, selected, onSelect }: { s: RunState; selected: string | null; onSelect: (k: string | null) => void }) {
  const [kind, setKind] = useState<Kind>('actors');
  const [query, setQuery] = useState('');
  const all = useMemo(() => specs(s), [s]);
  const counts: Record<Kind, number> = { actors: s.actors.length, moves: s.moves.length, events: s.events.length, sources: s.context.length, links: s.links.length };
  // On a narrow stage the tabs drop their counts (the title above still has the current one).
  const head = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = head.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 620));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="h-full flex flex-col">
      <div ref={head} className="flex items-center gap-3 px-4 pt-3 pb-3 border-b border-[var(--border-secondary)]">
        <div className={narrow ? 'hidden' : ''}>
          <div className="hud-text text-[10px] text-[var(--gold-primary)]">Objects</div>
          <div className="mt-0.5 text-[10px] font-mono tracking-[0.1em] text-[var(--text-muted)]">{counts[kind]} {kind.toUpperCase()}</div>
        </div>
        <div className="flex-1 min-w-0 max-w-[560px]">
          <Segmented id="table" size="sm" value={kind} onChange={k => { setKind(k); setQuery(''); }} options={(Object.keys(counts) as Kind[]).map(k => ({ value: k, label: narrow ? k : `${k} ${counts[k]}`, title: `${counts[k]} ${k}` }))} />
        </div>
        <label className={`ml-auto relative flex-shrink-0 ${narrow ? 'w-28' : 'w-44'}`}>
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter rows" aria-label="Filter rows"
            className="w-full h-7 pl-7 pr-2 rounded-md bg-black/50 border border-[var(--border-secondary)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-active)]" />
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-auto styled-scrollbar">
        {kind === 'actors' && <Table spec={all.actors} selected={selected} onSelect={onSelect} query={query} />}
        {kind === 'moves' && <Table spec={all.moves} selected={selected} onSelect={onSelect} query={query} />}
        {kind === 'events' && <Table spec={all.events} selected={selected} onSelect={onSelect} query={query} />}
        {kind === 'sources' && <Table spec={all.sources} selected={selected} onSelect={onSelect} query={query} />}
        {kind === 'links' && <Table spec={all.links} selected={selected} onSelect={onSelect} query={query} />}
      </div>
    </div>
  );
}

