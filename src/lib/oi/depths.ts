/** How big a run is. Kept apart from the engine so the browser can read it without the server code. */
import type { Depth } from './types';

/**
 * How big a simulation is: the actors who play as agents, the periods of
 * simulated time from today to the horizon, the parallel worlds, the items
 * from the live OSIRIS feeds, and the articles the research reads.
 */
export const DEPTHS: Record<Depth, { label: string; actors: number; periods: number; worlds: number; feed: number; research: number }> = {
  quick: { label: 'Quick', actors: 4, periods: 3, worlds: 2, feed: 10, research: 6 },
  standard: { label: 'Standard', actors: 6, periods: 4, worlds: 3, feed: 12, research: 8 },
  deep: { label: 'Deep', actors: 7, periods: 4, worlds: 4, feed: 16, research: 10 },
};

/** Model calls the simulation makes: in every world and period, each actor's move and the world engine's step. */
export function simulationCalls(depth: Depth): number {
  const d = DEPTHS[depth];
  return d.worlds * d.periods * (d.actors + 1);
}

/**
 * Model calls a run makes, before any retries: the research plan (when it
 * researches), the world model, the cast, the simulation, the report.
 */
export function estimateCalls(depth: Depth, research = true): number {
  return (research ? 4 : 3) + simulationCalls(depth);
}

/** The most of the caller's own data a run reads: about 25,000 tokens, read once by the world model. */
export const SEED_MAX = 100_000;
/** How much of it every actor's move and the report also read when the whole simulation reads it. */
export const PANEL_SEED_MAX = 8_000;

/** Where the caller's data goes: the world model only, or every actor's move and the report too. */
export type SeedScope = 'brief' | 'panel';

/** Rough tokens in a text: about four characters each, for English prose and tables alike. */
export const tokensIn = (chars: number) => Math.ceil(chars / 4);

/**
 * The input tokens the caller's data adds to a run, before retries: the
 * world model reads all of it once; with the whole simulation reading it,
 * every actor's move and the report read the first PANEL_SEED_MAX characters too.
 */
export function seedCost(chars: number, depth: Depth, scope: SeedScope): { tokens: number; calls: number } {
  const n = Math.min(Math.max(0, chars), SEED_MAX);
  if (!n) return { tokens: 0, calls: 0 };
  const once = tokensIn(n);
  if (scope === 'brief') return { tokens: once, calls: 1 };
  const d = DEPTHS[depth];
  const reads = d.worlds * d.periods * d.actors + 1;
  return { tokens: once + tokensIn(Math.min(n, PANEL_SEED_MAX)) * reads, calls: 1 + reads };
}
