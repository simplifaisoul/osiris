/**
 * OSIRIS OI: the model against the crowd, level by level.
 *
 * A prediction market often prices a price question as a ladder: will it
 * reach $140, $160, $180, $200…, will it dip to $90, $80, $70…, all by the
 * same date. The statistical baseline (and the simulation, priced) gives the
 * same thing as a curve: the chance of trading at every level. Set side by
 * side, rung by rung, they say where the model and the crowd agree, and where
 * one of them sees more upside or more downside than the other. Pure and
 * client-safe.
 */

export interface CurvePoint { level: number; probability: number }
export interface Rung { level: number; direction: 'above' | 'below'; probability: number }

/** A rung beside the model: the crowd's price, the model's chance, and the gap between them (model minus crowd). */
export interface Gap { level: number; direction: 'above' | 'below'; crowd: number; model: number; gap: number }

/** The curve's chance at a level: exact where the curve has the level, else read between its neighbours on a log scale. */
export function curveAt(curve: CurvePoint[], level: number): number {
  if (!curve.length) return NaN;
  const hit = curve.find(c => Math.abs(c.level / level - 1) < 1e-6);
  if (hit) return hit.probability;
  const below = [...curve].reverse().find(c => c.level < level);
  const above = curve.find(c => c.level > level);
  if (!below) return above!.probability;
  if (!above) return below.probability;
  const t = Math.log(level / below.level) / Math.log(above.level / below.level);
  return below.probability + (above.probability - below.probability) * t;
}

/**
 * Each rung of the crowd's ladder beside the model's curve. A rung on the
 * wrong side of today's price (a "reach" below it, a "dip" above it) has, in
 * effect, already happened, and is left out.
 */
export function ladderGaps(curve: CurvePoint[], ladder: Rung[], price: number): Gap[] {
  return ladder
    .filter(r => (r.direction === 'above' ? r.level > price : r.level < price))
    .map(r => {
      const model = curveAt(curve, r.level);
      return { level: r.level, direction: r.direction, crowd: r.probability, model, gap: model - r.probability };
    })
    .filter(g => Number.isFinite(g.model));
}

export interface LadderReading {
  /** The model minus the crowd, on average, over the rungs above today's price and below it. */
  upside?: number;
  downside?: number;
  /** The rung where they disagree most. */
  widest?: Gap;
  rungs: number;
}

export function readLadder(gaps: Gap[]): LadderReading {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : undefined);
  const widest = gaps.reduce<Gap | undefined>((w, g) => (!w || Math.abs(g.gap) > Math.abs(w.gap) ? g : w), undefined);
  return {
    upside: mean(gaps.filter(g => g.direction === 'above').map(g => g.gap)),
    downside: mean(gaps.filter(g => g.direction === 'below').map(g => g.gap)),
    ...(widest ? { widest } : {}),
    rungs: gaps.length,
  };
}

const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 1000) / 10)} pts`;
const pc = (p: number) => `${p < 0.1 ? Math.round(p * 1000) / 10 : Math.round(p * 100)}%`;

/** The reading in a sentence, for the report agent and the panel. `say` writes a price. */
export function ladderSentence(r: LadderReading, say: (n: number) => string, crowd = 'the crowd'): string {
  if (!r.rungs) return '';
  const side = (x: number | undefined, name: string) => (x === undefined ? '' : `${Math.abs(x) < 0.01 ? `level with ${crowd}` : `${x > 0 ? 'above' : 'below'} ${crowd} (${pts(x)} on average)`} on the ${name}`);
  const parts = [side(r.upside, 'upside'), side(r.downside, 'downside')].filter(Boolean);
  const w = r.widest;
  const where = w ? (w.direction === 'below' ? `a dip to ${say(w.level)}` : say(w.level)) : '';
  return `Across ${r.rungs} rungs of ${crowd}'s ladder, the model is ${parts.join(' and ')}${w ? `; they differ most at ${where}: model ${pc(w.model)}, ${crowd} ${pc(w.crowd)}` : ''}.`;
}
