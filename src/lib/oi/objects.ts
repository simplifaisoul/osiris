/**
 * OSIRIS OI: the run as objects.
 *
 * Everything a run produces is an object of a type, under the same research
 * key the globe, the graph and the lists use: actors (`a:`), sources from the
 * research, the live feeds and the asker's data (`c:`), the simulated worlds
 * (`w:`) and their events (`e:`), the report (`r:report`), its scenarios (`s:`) and
 * signposts (`p:`), and the links between them (`link:`). This module lists
 * them, finds them by name, and finds them in text, so a sentence that
 * mentions "China" can open China.
 */
import type { RunState } from './state';
import type { LinkKind } from './types';

export type ObjectType = 'actor' | 'source' | 'world' | 'event' | 'report' | 'scenario' | 'signpost';

export interface OiObject {
  key: string;
  type: ObjectType;
  /** The actor's kind, or the source's: what the icon is drawn from. */
  subtype: string;
  title: string;
  subtitle: string;
}

export const TYPE_LABEL: Record<ObjectType, string> = {
  actor: 'Actor', source: 'Source', world: 'World', event: 'Event', report: 'Report', scenario: 'Scenario', signpost: 'Signpost',
};

export const LINK_LABEL: Record<LinkKind, string> = {
  relation: 'Relation', evidence: 'Evidence', move: 'Move', cite: 'Quote',
};

/** Every object in the run, in a stable order: actors, sources, worlds, events, the report, scenarios, signposts. */
export function objectsOf(s: RunState): OiObject[] {
  return [
    ...s.actors.map(a => ({ key: `a:${a.id}`, type: 'actor' as const, subtype: a.kind, title: a.name, subtitle: a.persona ? `Plays: ${a.persona.goal}` : a.role })),

    ...s.context.map(c => ({ key: `c:${c.id}`, type: 'source' as const, subtype: c.kind, title: c.title, subtitle: [c.source, c.place].filter(Boolean).join(' · ') })),
    ...s.worlds.map(w => ({ key: `w:${w}`, type: 'world' as const, subtype: 'world', title: `World ${w}`, subtitle: [...s.points].reverse().find(p => p.world === w)?.note ?? 'Simulated world' })),
    ...s.events.map(e => ({ key: `e:${e.id}`, type: 'event' as const, subtype: e.kind, title: e.title, subtitle: `World ${e.world} · ${e.date}` })),
    ...(s.report ? [{ key: 'r:report', type: 'report' as const, subtype: 'report', title: s.report.headline, subtitle: s.report.answer }] : []),
    ...(s.report?.scenarios ?? []).map((sc, i) => ({ key: `s:${i}`, type: 'scenario' as const, subtype: 'scenario', title: sc.name, subtitle: `${Math.round(sc.probability * 100)}% · ${sc.description}` })),
    ...(s.report?.signposts ?? []).map((sp, i) => ({ key: `p:${i}`, type: 'signpost' as const, subtype: 'signpost', title: sp.text, subtitle: sp.place })),
  ];
}

const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Objects matching a query, best first: a title that starts with it, then a
 * word in the title that does, then anywhere in the title, then the subtitle.
 * Accents and case are ignored, so "lucia" finds Lucía.
 */
export function searchObjects(s: RunState, query: string, limit = 12): OiObject[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: { o: OiObject; score: number; i: number }[] = [];
  objectsOf(s).forEach((o, i) => {
    const t = fold(o.title), sub = fold(o.subtitle);
    let score = -1;
    if (t.startsWith(q)) score = 0;
    else if (t.split(/[^\p{L}\p{N}]+/u).some(w => w.startsWith(q))) score = 1;
    else if (t.includes(q)) score = 2;
    else if (sub.includes(q)) score = 3;
    if (score >= 0) scored.push({ o, score, i });
  });
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).slice(0, limit).map(x => x.o);
}

export type Mention = string | { key: string; text: string };

/**
 * Text split into plain runs and mentions of the run's actors and sources,
 * by full name, whole words only, case-insensitive. The longest name wins
 * where names overlap ("European Union" over "Union").
 */
export function mentions(text: string, s: RunState): Mention[] {
  const names = [
    ...s.actors.map(a => ({ key: `a:${a.id}`, name: a.name })),
    // Actors refer to each other by id too: "opec_plus".
    ...s.actors.map(a => ({ key: `a:${a.id}`, name: a.id })),
    // And name their sources by id: "w2 still keeps me up".
    ...s.context.filter(c => /^[cwbd]\d+$/.test(c.id)).map(c => ({ key: `c:${c.id}`, name: c.id })),
  ].filter(n => n.name.trim().length >= 3 || n.key.startsWith('c:')).sort((a, b) => b.name.length - a.name.length);
  if (!text || !names.length) return text ? [text] : [];
  const escape = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(n => escape(n.name)).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const byName = new Map(names.map(n => [n.name.toLowerCase(), n.key]));
  const out: Mention[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push({ key: byName.get(m[0].toLowerCase()) ?? '', text: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
