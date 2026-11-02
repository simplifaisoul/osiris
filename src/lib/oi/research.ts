/**
 * Everything on the globe that can be clicked (an arc, an actor, a source, an
 * event of a simulated world, a scenario, a signpost) resolved back into the
 * piece of the research it stands for. The globe's tooltips and the panel's
 * inspector both read through here, so a click always shows exactly what was
 * drawn.
 *
 * Keys: "link:<link id>" for an arc; "a:<actor>", "c:<source>", "e:<event>"
 * for nodes; "w:<world>" for a simulated world; "s:<index>" and "p:<index>" for the report's scenarios and
 * signposts; "r:report" for the report itself, where every thread ends.
 */
import type { RunState } from './state';
import type { Actor, ContextItem, Link, Move, Report, Scenario, Signpost, SimEvent } from './types';

export type Selection =
  | { type: 'link'; key: string; link: Link }
  | { type: 'actor'; key: string; actor: Actor }
  | { type: 'event'; key: string; event: SimEvent }
  | { type: 'world'; key: string; world: string }
  | { type: 'context'; key: string; item: ContextItem }
  | { type: 'scenario'; key: string; scenario: Scenario; index: number }
  | { type: 'signpost'; key: string; signpost: Signpost; index: number }
  | { type: 'report'; key: string; report: Report };

export function resolve(s: RunState, key: string | null): Selection | null {
  if (!key) return null;
  if (key.startsWith('link:')) {
    const link = s.links.find(l => l.id === key.slice(5));
    return link ? { type: 'link', key, link } : null;
  }
  const [prefix, ...rest] = key.split(':');
  const id = rest.join(':');
  if (prefix === 'a') { const actor = s.actors.find(a => a.id === id); return actor ? { type: 'actor', key, actor } : null; }
  if (prefix === 'e') { const event = s.events.find(e => e.id === id); return event ? { type: 'event', key, event } : null; }
  if (prefix === 'w') return s.worlds.includes(id) ? { type: 'world', key, world: id } : null;
  if (prefix === 'c') { const item = s.context.find(c => c.id === id); return item ? { type: 'context', key, item } : null; }
  if (prefix === 's' && s.report) { const i = Number(id); const scenario = s.report.scenarios[i]; return scenario ? { type: 'scenario', key, scenario, index: i } : null; }
  if (prefix === 'p' && s.report) { const i = Number(id); const signpost = s.report.signposts[i]; return signpost ? { type: 'signpost', key, signpost, index: i } : null; }
  if (prefix === 'r' && s.report) return { type: 'report', key, report: s.report };
  return null;
}

/** The arcs that belong to a selection: the arc itself, or every arc touching a selected node. */
export function relatedLinks(s: RunState, key: string | null): Set<string> {
  const out = new Set<string>();
  if (!key) return out;
  if (key.startsWith('link:')) { out.add(key.slice(5)); return out; }
  for (const l of s.links) if (l.from === key || l.to === key) out.add(l.id);
  return out;
}

/** A node's name, from its key. */
export function nodeName(s: RunState, nodeKey: string): string {
  const [prefix, ...rest] = nodeKey.split(':');
  const id = rest.join(':');
  if (prefix === 'a') return s.actors.find(a => a.id === id)?.name ?? id;
  if (prefix === 'e') return s.events.find(e => e.id === id)?.title ?? id;
  if (prefix === 'w') return `World ${id}`;
  if (prefix === 'c') return s.context.find(c => c.id === id)?.title ?? id;
  if (prefix === 'r') return 'The report';
  return id;
}

/**
 * The move a link was drawn from: a move arc, or an actor's quote, belongs to
 * that actor's move in that world and period (the world is in the link's id).
 */
export function moveFor(s: RunState, link: Link): Move | undefined {
  if ((link.kind !== 'move' && link.kind !== 'cite') || !link.from.startsWith('a:')) return undefined;
  const actor = link.from.slice(2);
  const world = link.id.split(':')[1];
  return s.moves.find(m => m.actor === actor && m.world === world && m.period === link.round);
}

const RELATION_WORD = { support: 'aligned', oppose: 'opposed', neutral: 'linked' } as const;
const STANCE_WORD = { support: 'works with', oppose: 'presses', neutral: 'holds toward' } as const;
const EFFECT_WORD = { support: 'points toward YES', oppose: 'points toward NO', neutral: 'bears on' } as const;

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** Two short lines for a tooltip. */
export function brief(s: RunState, key: string): { title: string; detail: string } | null {
  const sel = resolve(s, key);
  if (!sel) return null;
  switch (sel.type) {
    case 'link': {
      const l = sel.link;
      const from = nodeName(s, l.from);
      const to = nodeName(s, l.to);
      if (l.kind === 'relation') return { title: `${from} ⇄ ${to}`, detail: `${RELATION_WORD[l.tone]} · ${clip(l.label, 90)}` };
      if (l.kind === 'evidence') {
        const effect = s.frame?.kind === 'number' ? (l.tone === 'support' ? 'points higher' : l.tone === 'oppose' ? 'points lower' : 'bears on') : EFFECT_WORD[l.tone];
        return { title: clip(from, 80), detail: `${effect}: ${to}` };
      }
      const world = l.id.split(':')[1];
      if (l.kind === 'cite') {
        return l.from === 'r:report'
          ? { title: `The report rests on ${clip(to, 60)}`, detail: clip(l.label, 100) }
          : { title: `${from} quotes ${clip(to, 60)}`, detail: `World ${world}, period ${l.round} · “${clip(l.label, 90)}”` };
      }
      return { title: `${from} ${STANCE_WORD[l.tone]} ${to}`, detail: `World ${world}, period ${l.round} · ${clip(l.label, 90)}` };
    }
    case 'actor': return { title: sel.actor.name, detail: clip(sel.actor.persona ? `Plays to: ${sel.actor.persona.goal}` : sel.actor.role, 90) };
    case 'world': {
      const last = [...s.points].reverse().find(p => p.world === sel.world);
      return { title: `World ${sel.world}`, detail: last ? (last.resolved ? `Resolved ${last.resolved}` : clip(last.note, 90)) : 'Not started' };
    }
    case 'event': return { title: clip(sel.event.title, 90), detail: `World ${sel.event.world} · ${sel.event.date}${sel.event.kind === 'shock' ? ' · surprise' : sel.event.kind === 'injected' ? ' · injected' : ''}` };
    case 'context': return { title: clip(sel.item.title, 90), detail: [sel.item.source, sel.item.place].filter(Boolean).join(' · ') };
    case 'scenario': return { title: `Scenario: ${sel.scenario.name}`, detail: `${Math.round(sel.scenario.probability * 100)}% · ${clip(sel.scenario.description, 70)}` };
    case 'signpost': return { title: 'Signpost', detail: clip(sel.signpost.text, 90) };
    case 'report': return { title: 'The report', detail: `${sel.report.answer} · ${clip(sel.report.headline, 80)}` };
  }
}
