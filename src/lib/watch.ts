import type { AoiReport } from './aoi';

/**
 * OSIRIS — AOI tripwires
 *
 * Turns a repeated "what is inside" sweep into "what just changed". Draw a box
 * over an airfield and the panel stops being a measurement and starts being a
 * watch: this aircraft entered, that vessel left, at these times.
 *
 * The mechanism is a set difference between consecutive sweeps, which puts two
 * constraints on the design:
 *
 *   - Identity has to be stable. An aircraft is the same aircraft between
 *     refreshes even though its position changed, so entities are keyed by a
 *     stable id and never by coordinates.
 *   - The first sweep is not an event. Everything is "new" the moment a watch
 *     starts, and reporting a hundred arrivals for a box you just drew is
 *     noise. The first pass seeds the baseline silently.
 */

export type WatchEventKind = 'enter' | 'exit';

export interface WatchEvent {
  id: string;
  kind: WatchEventKind;
  /** Which AOI fired it. */
  aoiId: string;
  /** Layer the object belongs to, e.g. military_flights. */
  layer: string;
  layerLabel: string;
  color: string;
  label: string;
  at: number;
}

/** Per-AOI membership, keyed by layer then by entity id. */
export type WatchBaseline = Record<string, Set<string>>;

export interface WatchDiff {
  baseline: WatchBaseline;
  events: WatchEvent[];
}


let seq = 0;

/**
 * Compare a fresh sweep against the previous membership.
 *
 * `previous` of null means this is the first pass: the baseline is recorded and
 * no events are produced. That distinction is what separates "started watching
 * a busy airport" from "forty aircraft just arrived".
 */
export function diffSweep(
  aoiId: string,
  report: AoiReport,
  previous: WatchBaseline | null,
  now: number = Date.now(),
): WatchDiff {
  const baseline: WatchBaseline = {};
  const events: WatchEvent[] = [];

  for (const group of report.groups) {
    // memberIds is uncapped. group.items is a 50-item display sample, and
    // diffing that makes the truncation window shifting look like arrivals
    // and departures the moment an area holds more than 50 of anything.
    const ids = new Set<string>();
    for (const id of group.memberIds) ids.add(`${group.key}:${id}`);
    baseline[group.key] = ids;

    if (!previous) continue;

    // Labels only exist for the sampled items; anything beyond the sample is
    // reported by id, which is still stable and still correct.
    const labelById = new Map(group.items.map(i => [i.id, i.label]));
    const before = previous[group.key] ?? new Set<string>();
    for (const id of group.memberIds) {
      const k = `${group.key}:${id}`;
      if (!before.has(k)) {
        events.push({
          id: `w${++seq}`, kind: 'enter', aoiId,
          layer: group.key, layerLabel: group.label, color: group.color,
          label: labelById.get(id) ?? id, at: now,
        });
      }
    }
  }

  if (previous) {
    // Layers that vanished entirely still have to report their departures, so
    // walk the previous baseline rather than only the layers present now.
    for (const [layer, before] of Object.entries(previous)) {
      const after = baseline[layer] ?? new Set<string>();
      const group = report.groups.find(g => g.key === layer);
      for (const k of before) {
        if (!after.has(k)) {
          events.push({
            id: `w${++seq}`, kind: 'exit', aoiId,
            layer,
            layerLabel: group?.label ?? layer,
            color: group?.color ?? '#9B978E',
            label: k.slice(layer.length + 1),
            at: now,
          });
        }
      }
    }
  }

  return { baseline, events };
}

/**
 * Newest first, capped.
 *
 * A watch left running over a busy area generates events indefinitely; the log
 * is a rolling window, not a record, and says so by dropping the oldest.
 */
export const MAX_EVENTS = 100;

export function appendEvents(log: WatchEvent[], incoming: WatchEvent[]): WatchEvent[] {
  if (incoming.length === 0) return log;
  return [...incoming.reverse(), ...log].slice(0, MAX_EVENTS);
}

/** Compact "2m ago" style stamp for the log. */
export function formatAgo(ms: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
