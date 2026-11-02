/**
 * OSIRIS OI: what the actors quote, and where it came from.
 *
 * The actors ground their moves in quotes from numbered sources: a news
 * article the research found (`w2`), background (`b1`), an item of the live
 * feed (`c3`), a passage the world model lifted from the asker's own data
 * (`d2`), or, when the whole simulation reads it, that data itself (`data`).
 * Each quote says which way it pushed the actor and why, so a move is
 * attributed to the evidence behind it. A quote is checked against what its
 * source says here and marked exact when its words are really there, so a
 * reader following the thread from the prediction to an actor's move to a
 * source, and on to the published page, can trust every step. Pure and
 * client-safe.
 */
import type { Citation, ContextItem } from './types';

const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
/** A model's string, on one line, cut to `max`. */
const text = (v: unknown, max: number): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\s\u0000-\u001f]+/g, ' ').trim().slice(0, max) : '';

/** The id of the asker's data as a whole, citable when the whole simulation reads it. */
export const DATA_ID = 'data';

/** Text reduced to its words: case, accents, punctuation and spacing ignored. */
export function foldQuote(t: string): string {
  return t.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Whether a quote is really in a source: its words, in order, allowing an
 * ellipsis between pieces. Too short to mean anything is not a quote.
 */
export function quoteIn(quote: string, source: string): boolean {
  const pieces = quote.split(/\.{3}|…/).map(foldQuote).filter(Boolean);
  if (!pieces.length || pieces.join(' ').length < 8) return false;
  const hay = ` ${foldQuote(source)} `;
  let from = 0;
  for (const p of pieces) {
    const at = hay.indexOf(` ${p} `, from);
    if (at < 0) return false;
    from = at + p.length + 1;
  }
  return true;
}

/** The parts of the asker's data, by the "### name" headings the panel puts above each file. */
function sections(seed: string): { name: string; body: string }[] {
  const parts = seed.split(/^### (.+)$/m);
  if (parts.length < 3) return [{ name: '', body: seed }];
  const out: { name: string; body: string }[] = parts[0].trim() ? [{ name: '', body: parts[0] }] : [];
  for (let i = 1; i < parts.length; i += 2) out.push({ name: parts[i].trim(), body: parts[i + 1] ?? '' });
  return out;
}

/**
 * The passages the world model quoted from the asker's data, as sources the
 * actors can cite: `d1`, `d2`… in the model's own order (so its evidence can
 * point at them), keeping only those really in the data, each under the
 * file it came from.
 */
export function dataExcerpts(raw: unknown, seed: string, max = 8): ContextItem[] {
  if (!seed.trim()) return [];
  const parts = sections(seed);
  const out: ContextItem[] = [];
  list(raw, max).forEach((q, i) => {
    const o = q && typeof q === 'object' ? (q as Record<string, unknown>) : { text: q };
    const passage = text(o.text ?? o.quote, 300);
    if (!passage) return;
    const part = parts.find(p => quoteIn(passage, p.body));
    if (!part) return;
    out.push({
      id: `d${i + 1}`,
      kind: 'data',
      title: passage,
      source: part.name && part.name !== 'Notes' ? part.name : part.name === 'Notes' ? 'Your notes' : 'Your data',
      published: '',
      place: '',
      lat: null,
      lng: null,
    });
  });
  return out;
}

/** The asker's data as one source, for the simulation that reads it whole. */
export function wholeData(seed: string): ContextItem {
  const names = sections(seed).map(p => p.name).filter(n => n && n !== 'Notes');
  return { id: DATA_ID, kind: 'data', title: 'Your data', source: names.length ? names.join(', ') : 'Pasted by you', published: '', place: '', lat: null, lng: null };
}

/**
 * What each citable source says, to check quotes against: a feed item's
 * headline (and its outlet, which an actor may name), a data passage, and
 * the head of the data itself when the whole simulation reads it.
 */
export function sourceTexts(items: ContextItem[], panelData = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of items) out.set(c.id, c.id === DATA_ID ? panelData : c.kind === 'data' ? c.title : [c.title, c.excerpt, c.source].filter(Boolean).join(' '));
  return out;
}

/** Which way a model says something moves a forecast: toward YES or higher, toward NO or lower, or neither. */
export function pushOf(v: unknown): 'yes' | 'no' | 'neutral' {
  const s = typeof v === 'string' ? v.toLowerCase().trim() : '';
  if (!s || /^(neutral|context|none|mixed|both|unclear|n\/a)/.test(s)) return 'neutral';
  return /^(no|down|lower|against|decrease|less|reduce|cut)/.test(s) ? 'no' : 'yes';
}

/** A choice question's outcome, as the model named it. */
function outcomeOf(v: unknown, outcomes: string[]): string {
  const s = text(v, 60).toLowerCase();
  if (!s || !outcomes.length) return '';
  return outcomes.find(o => o.toLowerCase() === s) ?? outcomes.find(o => s.includes(o.toLowerCase()) || o.toLowerCase().includes(s)) ?? '';
}

/**
 * A reply's citations: up to `max`, of known sources only, one per source,
 * each quote checked against what the source says.
 */
export function parseCites(raw: unknown, sources: Map<string, string>, max = 3, outcomes: string[] = []): Citation[] {
  const out: Citation[] = [];
  for (const c of list(raw, 6)) {
    const o = c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
    const source = text(o.source ?? o.id, 12).toLowerCase().replace(/^\[|\]$/g, '');
    const quote = text(o.quote ?? o.text, 240).replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();
    if (!sources.has(source) || !quote || out.some(x => x.source === source)) continue;
    const favors = outcomeOf(o.favors, outcomes);
    const why = text(o.why ?? o.because ?? o.reason, 160);
    out.push({
      source, quote, exact: quoteIn(quote, sources.get(source)!),
      push: pushOf(o.effect ?? o.push ?? o.direction),
      ...(favors ? { favors } : {}),
      ...(why ? { why } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Source ids from a model's list, known ones only, without repeats. */
export function sourceIds(raw: unknown, sources: Set<string>, max = 4): string[] {
  const out: string[] = [];
  for (const v of list(raw, 8)) {
    const id = text(v, 12).toLowerCase().replace(/^\[|\]$/g, '');
    if (sources.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export interface LedgerRow {
  source: string;
  /** Times quoted, across every period of every world. */
  quoted: number;
  /** The actors who quoted it. */
  actors: string[];
  /** Which way it pushed them, quote by quote. */
  yes: number;
  no: number;
  neutral: number;
  /** choice: the outcomes it was quoted for. */
  favors: Record<string, number>;
  /** Quotes found word for word. */
  exact: number;
}

/**
 * The evidence behind the simulation, source by source: how often each was
 * quoted, by whom, and which way it pushed them. Most quoted first. It is
 * what lets a reader attribute the prediction to its evidence.
 */
export function evidenceLedger(moves: { actor: string; cites?: Citation[] }[]): LedgerRow[] {
  const rows = new Map<string, LedgerRow>();
  for (const p of moves) {
    for (const c of p.cites ?? []) {
      const r = rows.get(c.source) ?? { source: c.source, quoted: 0, actors: [], yes: 0, no: 0, neutral: 0, favors: {}, exact: 0 };
      r.quoted++;
      if (!r.actors.includes(p.actor)) r.actors.push(p.actor);
      r[c.push ?? 'neutral']++;
      if (c.favors) r.favors[c.favors] = (r.favors[c.favors] ?? 0) + 1;
      if (c.exact) r.exact++;
      rows.set(c.source, r);
    }
  }
  return [...rows.values()].sort((a, b) => b.quoted - a.quoted || b.actors.length - a.actors.length || a.source.localeCompare(b.source));
}
