/**
 * OSIRIS OI: the types the engine, the API, the MCP server and the panel share.
 *
 * OI is a prediction engine. It researches a question, maps the world that
 * decides it, casts the actors that shape the outcome as agents, and lets
 * them act against each other over simulated time (dated periods from today
 * to the question's horizon) in several parallel worlds. A world engine turns
 * each period's moves into what actually happens. The prediction is the
 * story the worlds tell, with the probability their outcomes add up to.
 *
 * A run is a stream of events. Everything a viewer sees (the panel, the arcs on
 * the globe, the API snapshot, an MCP tool result) is folded out of the same
 * events by `applyEvent` in ./state, so the views cannot disagree.
 */

export type Depth = 'quick' | 'standard' | 'deep';

export type Phase = 'context' | 'graph' | 'agents' | 'simulate' | 'report' | 'done';

export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled';

/**
 * What kind of answer the question wants.
 *   binary  will it happen: a probability of YES
 *   choice  which of a few named outcomes: a share for each
 *   number  how much: an estimate with an 80% range
 */
export type ForecastKind = 'binary' | 'choice' | 'number';

/** A number with its 80% range. */
export interface Estimate {
  value: number;
  low: number;
  high: number;
}

/** A point on Earth, or none: a node the model could not place stays off the globe. */
export interface Located {
  place: string;
  lat: number | null;
  lng: number | null;
}

/** The question, pinned down to something that will resolve. */
export interface Frame {
  question: string;
  kind: ForecastKind;
  /** binary: the YES/NO statement. choice and number: the exact question. */
  proposition: string;
  /** How a reader will judge the outcome. */
  resolution: string;
  /** YYYY-MM-DD, or '' when the question has no natural date. */
  horizon: string;
  /** choice: the mutually exclusive outcomes, in order. Empty otherwise. */
  outcomes: string[];
  /** number: the unit the answer is in, e.g. "USD per barrel". */
  unit: string;
  /** binary: the base rate of YES. */
  baseRate: number;
  /** choice: the prior share of each outcome, summing to 1. */
  prior: number[];
  /** number: the current or reference value, when there is one. */
  anchor: number | null;
  /** The reference class or reading behind the prior. */
  baseRateReason: string;
  focus: Located | null;
  /** The market price the question turns on, when it turns on one: the simulation then prices it in every world. */
  measure?: Measure | null;
  /** The id of the prediction market (an `odds` source) that asks this same question, when one does. */
  market?: string | null;
}

/**
 * A price the markets set every day that a question turns on: a coin, a
 * share, an index, a commodity, a currency, a yield.
 */
export interface Measure {
  /** The market's ticker, as Yahoo Finance writes it: "SOL-USD", "^GSPC", "BZ=F", "EURUSD=X". */
  symbol: string;
  /** binary: the level the proposition is about. */
  threshold?: number;
  /** binary: YES at or above the level, or at or below it. */
  direction?: 'above' | 'below';
  /** binary: YES the first time it trades there (true), or only if that is where it stands at the horizon (false). */
  touch?: boolean;
}

/** The statistical baseline for a price question: what the instrument's own history says, before any actor moves. */
export interface Quant {
  symbol: string;
  name: string;
  currency: string;
  /** The last close, and its date. */
  price: number;
  asOf: string;
  /** Annualised volatility. */
  vol: number;
  /** Calendar days from today to the horizon. */
  days: number;
  /** binary: the share of resampled paths that meet the level. */
  probability?: number;
  /** The price at the horizon: 10th, 50th and 90th percentile of the paths. */
  p10: number;
  p50: number;
  p90: number;
  /** How it was worked out, in a sentence. */
  method: string;
  /**
   * Once the simulation has run: the same market paths with each world's
   * events applied (the push they gave the price), pooled across the worlds.
   */
  simulated?: { probability?: number; p10: number; p50: number; p90: number; curve?: { level: number; probability: number }[] };
  /** The chance the price trades at each level (touches it) before the horizon: a touch curve to set beside a market's ladder. */
  curve?: { level: number; probability: number }[];
  /**
   * The baseline scored on the instrument's own past: forecasts made on past
   * days from the year of prices before each, against what happened.
   */
  backtest?: {
    n: number; starts: number; from: string; to: string; days: number;
    brier: number; reference: number; skill: number; gap: number;
    bins: { lo: number; hi: number; said: number; happened: number; n: number }[];
  };
  /** The cone of what the market's own moves allow, at the end of each simulated period. */
  fan?: { date: string; p10: number; p50: number; p90: number }[];
}

/** What a prediction market prices a question at: real money on the outcome. */
export interface Odds {
  platform: 'Polymarket' | 'Manifold';
  /** The market's own question. */
  question: string;
  /** The price of YES, 0..1. */
  probability: number;
  /** Traded volume, in USD (Polymarket) or mana (Manifold). */
  volume: number;
  /** When the market closes, ISO, or ''. */
  closes: string;
  /**
   * When the market is one rung of a price ladder (an event that asks about
   * level after level, up and down), the whole ladder: each level's price.
   */
  ladder?: { level: number; direction: 'above' | 'below'; probability: number }[];
}

/**
 * A source the run was given, by id:
 *   w…  the research: a news article found for the question (`web`)
 *   q…  market data for a price the question turns on (`series`)
 *   m…  a prediction market's price on the question (`odds`)
 *   b…  background from Wikipedia (`wiki`)
 *   c…  the live OSIRIS feeds: a headline (`news`), a post on a social
 *       network (`social`), a quake, the market board (`market`)
 *   d…  a passage of the asker's own data, or `data` for all of it (`data`)
 */
export interface ContextItem extends Located {
  id: string;
  kind: 'news' | 'social' | 'quake' | 'market' | 'series' | 'odds' | 'data' | 'web' | 'wiki' | 'camera';
  title: string;
  /** The outlet, site or file it came from. */
  source: string;
  /** ISO time, or '' */
  published: string;
  /** Where it was published, to open and check. Only http(s). */
  url?: string;
  /** What it says that bears on the question, as the actors read it. */
  excerpt?: string;
  /** `odds`: the market's price. */
  odds?: Odds;
  /** `series`: the ticker, as Yahoo Finance writes it. */
  symbol?: string;
}

export type ActorKind = 'state' | 'leader' | 'organisation' | 'company' | 'market' | 'group' | 'place';

/** Something in the world that will shape the outcome. */
export interface Actor extends Located {
  id: string;
  name: string;
  kind: ActorKind;
  role: string;
  /** −1 pushes toward NO, +1 toward YES. */
  lean: number;
  /** Set when the actor plays in the simulation. */
  persona?: Persona;
}

/** Who an actor is when it plays in the simulation: what it wants, what it can do, what it will not accept. */
export interface Persona {
  goal: string;
  /** The concrete things it can do. */
  levers: string[];
  redLines: string;
  /** How it decides. */
  style: string;
}

/** A stretch of simulated time: the simulation moves one period at a time, from today to the horizon. */
export interface Period {
  /** 1-based. */
  index: number;
  /** "3 Oct – 2 Nov 2026" */
  label: string;
  /** ISO dates, inclusive. */
  start: string;
  end: string;
}

/** What an actor does in one period of one world. */
export interface Move {
  /** `<world>:<actor>:<period>` */
  id: string;
  world: string;
  period: number;
  actor: string;
  /** What it does, concretely. */
  action: string;
  /** What it says in public, or ''. */
  statement: string;
  /** The actors it is aimed at. */
  targets: string[];
  /** Toward its targets. */
  stance: 'cooperate' | 'pressure' | 'oppose' | 'hold';
  /** Which way it pushes the question: toward YES (or higher), NO (or lower), or neither. */
  push: 'yes' | 'no' | 'neutral';
  /** choice: the outcome it helps. */
  favors?: string;
  /** Its private reasoning, in a line. */
  why: string;
  /** What it quoted from the sources, when they shaped the move. */
  cites?: Citation[];
}

/** Something that happened in a simulated world: the result of the actors' moves, a surprise, or an injected event. */
export interface SimEvent extends Located {
  /** `<world>:<period>:<n>` */
  id: string;
  world: string;
  period: number;
  /** ISO date within the period. */
  date: string;
  title: string;
  detail: string;
  actors: string[];
  push: 'yes' | 'no' | 'neutral';
  favors?: string;
  kind: 'event' | 'shock' | 'injected';
}

/** Where the question stands in one world at the end of a period. */
export interface WorldPoint {
  world: string;
  period: number;
  /** binary: P(YES) by the horizon as this world stands. choice: the leader's share. number: unused, 0.5. */
  probability: number;
  /** choice: the share of every outcome. */
  shares?: number[];
  /** number: the quantity's value now, in this world. */
  value?: number;
  /** A price question: the price in this world at the end of the period, and its highest and lowest in it. */
  price?: { close: number; high: number; low: number };
  /** The question has resolved in this world: 'yes', 'no', or the winning outcome. */
  resolved: string | null;
  /** Where things stand, in a line. */
  note: string;
}

/**
 * An arc. Node keys are prefixed by what they point at:
 * `a:` an actor, `c:` a source, `r:report` the report.
 * A `move` runs from an actor to the actor its move was aimed at; a
 * `cite` from an actor (or the report) to the source it quotes.
 */
export type LinkKind = 'relation' | 'evidence' | 'move' | 'cite';
export type Tone = 'support' | 'oppose' | 'neutral';

export interface Link {
  id: string;
  from: string;
  to: string;
  kind: LinkKind;
  tone: Tone;
  /** 0..1 */
  strength: number;
  label: string;
  /** 0 for the world model, else the period of simulated time that drew it. */
  round: number;
}

/** Words an actor quoted, the source they came from, and which way they pushed its move. */
export interface Citation {
  /** The source's id: an article (w2), background (b1), a feed item (c3), a passage of the asker's data (d2), or `data`. */
  source: string;
  quote: string;
  /** The words were found in the source as quoted. */
  exact: boolean;
  /** Which way it pushed the actor: toward YES (or higher), toward NO (or lower), or context only. */
  push?: 'yes' | 'no' | 'neutral';
  /** choice: the outcome it helps. */
  favors?: string;
  /** How it bears on their figure, in their words. */
  why?: string;
}

/**
 * Where the worlds stood together at the end of a period. The scalar fields
 * describe a binary question's P(YES), and a choice question's share for its
 * leader; a number question carries its figures in `value`.
 */
export interface RoundStat {
  /** The period. */
  round: number;
  /** binary: the pool of the worlds' P(YES). choice: the leader's pooled share. */
  consensus: number;
  /** choice: the pooled share of every outcome, summing to 1. */
  shares?: number[];
  /** choice: how many worlds put each outcome first. */
  votes?: number[];
  /** number: the worlds' values. */
  value?: { median: number; p25: number; p75: number; min: number; max: number; low: number; high: number };
  median: number;
  mean: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  /** p75 − p25 */
  spread: number;
  n: number;
  /** Ten bins, 0–10% … 90–100%. */
  histogram: number[];
}

export interface Driver {
  text: string;
  /** binary: toward YES or NO. number: up or down. choice: see `favors`. */
  push: 'yes' | 'no';
  /** choice: the outcome this helps. */
  favors: string;
  weight: number;
  actor: string | null;
  /** The ids of the sources it rests on. */
  sources?: string[];
}

export interface Scenario extends Located {
  name: string;
  probability: number;
  description: string;
}

export interface Signpost extends Located {
  text: string;
  /** As for drivers: YES/NO, or up/down for a number. */
  means: 'yes' | 'no';
  /** choice: the outcome it would point to. */
  favors: string;
}

/** One dated step of the predicted path. */
export interface PathStep {
  date: string;
  title: string;
  detail: string;
  actors: string[];
}

export interface Report {
  headline: string;
  /** The answer in a phrase: "62% YES", "Lula (45%)", "86.4 USD per barrel (80–92)". */
  answer: string;
  /** binary: the calibrated P(YES). choice: the leader's calibrated share. number: 0.5, unused. */
  probability: number;
  /** The simulation's own figure (the worlds pooled), on the same footing as `probability`. */
  swarm: number;
  /** choice: the calibrated share of every outcome. */
  shares?: number[];
  /** number: the calibrated estimate. */
  estimate?: Estimate;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  drivers: Driver[];
  scenarios: Scenario[];
  signposts: Signpost[];
  dissent: string;
  caveats: string[];
  /** Why the report moved away from the simulation, when it did. */
  deviation: string;
  /** The predicted path: how it most likely unfolds, date by date. */
  path: PathStep[];
  /** What each actor is predicted to do. */
  actorMoves: { actor: string; prediction: string }[];
  /** How each world ended. */
  worlds: { world: string; outcome: string; summary: string }[];
}

export interface Usage {
  calls: number;
  input: number;
  output: number;
}

export type OiEvent =
  | { t: 'start'; question: string; depth: Depth; provider: string; model: string; actors: number; periods: number; worlds: number }
  | { t: 'phase'; phase: Phase; label: string }
  | { t: 'context'; items: ContextItem[] }
  | { t: 'frame'; frame: Frame }
  | { t: 'quant'; quant: Quant }
  | { t: 'actor'; actor: Actor }
  | { t: 'link'; link: Link }
  | { t: 'cast'; actor: string; persona: Persona }
  | { t: 'clock'; periods: Period[]; worlds: string[] }
  | { t: 'thinking'; world: string; actor: string; period: number }
  | { t: 'move'; move: Move }
  | { t: 'event'; event: SimEvent }
  | { t: 'point'; point: WorldPoint }
  | { t: 'round'; stat: RoundStat }
  | { t: 'inject'; text: string; round: number }
  | { t: 'report'; report: Report }
  | { t: 'usage'; usage: Usage }
  | { t: 'warn'; message: string }
  | { t: 'end'; status: Exclude<RunStatus, 'running'>; message?: string };

/** An event as stored and streamed: numbered, and timed in ms since the epoch. */
export type Stamped = OiEvent & { seq: number; at: number };
