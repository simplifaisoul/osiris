import { describe, it, expect } from 'vitest';
import { DEPTHS, askRun, estimateCalls, limiter, pooled, runEngine, type EngineDeps } from './engine';
import { PANEL_SEED_MAX, SEED_MAX, seedCost, simulationCalls } from './depths';
import { createDemoChat } from './demo';
import { ProviderError, type ChatFn } from './providers';
import { applyEvent, castOf, initialState, type RunState } from './state';
import { seriesItem } from './web';
import type { Series } from './quant';
import type { ContextItem, OiEvent } from './types';

/** What the research finds: articles with their links and what they say, and background. */
const WEB: ContextItem[] = [
  { id: 'w1', kind: 'web', title: 'Envoys close in on framework text', source: 'Wire Daily', published: '2026-10-01T08:00:00Z', place: 'Switzerland', lat: null, lng: null, url: 'https://wire.example/envoys', excerpt: 'Negotiators said seven of nine chapters of the framework are agreed, with verification still open.' },
  { id: 'w2', kind: 'web', title: 'Sanctions row threatens talks', source: 'Policy Post', published: '2026-09-30T08:00:00Z', place: '', lat: null, lng: null, url: 'https://policy.example/row', excerpt: 'A new sanctions package has angered one delegation, which threatened to walk out of the Geneva round.' },
  { id: 'b1', kind: 'wiki', title: 'Framework agreement', source: 'Wikipedia', published: '', place: '', lat: null, lng: null, url: 'https://en.wikipedia.org/wiki/Framework_agreement', excerpt: 'A framework agreement sets out the terms under which later agreements are made.' },
];

const CONTEXT: ContextItem[] = [
  { id: 'c1', kind: 'news', title: 'Envoys due in Geneva', source: 'Wire', published: '2026-10-02T09:00:00Z', place: 'Geneva', lat: 46.2, lng: 6.14 },
  { id: 'c2', kind: 'news', title: 'New export controls floated', source: 'Wire', published: '2026-10-02T08:00:00Z', place: 'Washington', lat: 38.9, lng: -77 },
];

function harness(chat: ChatFn, injects: string[][] = []) {
  const events: OiEvent[] = [];
  const prompts: string[] = [];
  const recording: ChatFn = req => { prompts.push(req.user); return chat(req); };
  const deps: EngineDeps = {
    chat: recording,
    concurrency: 3,
    emit: e => events.push(e),
    signal: new AbortController().signal,
    takeInjects: () => injects.shift() ?? [],
    gather: async () => CONTEXT,
    research: async () => ({ items: WEB, series: [] }),
    today: '2026-10-02',
  };
  return { events, prompts, deps };
}

const fold = (events: OiEvent[]): RunState =>
  events.reduce((s, e, seq) => applyEvent(s, { ...e, seq, at: seq } as never), initialState());

const Q = 'Will the envoys sign a framework deal by year end?';
const isMove = (u: string) => u.includes('Decide your move for this period');
const isStep = (u: string) => u.includes('You are the world engine');

describe('runEngine', () => {
  it('researches, casts the actors, and simulates them period by period in parallel worlds', async () => {
    const h = harness(createDemoChat());
    await runEngine({ question: Q, seed: '', depth: 'quick', useFeeds: true }, h.deps);
    const s = fold(h.events);
    const d = DEPTHS.quick;

    const phases = h.events.filter(e => e.t === 'phase').map(e => (e as { phase: string }).phase);
    expect(phases).toEqual(['context', 'graph', 'agents', ...Array(d.periods).fill('simulate'), 'report']);
    // The live feed's headline about something else (export controls) is no evidence for this question.
    expect(s.context.map(c => c.id)).toEqual(['w1', 'w2', 'b1', 'c1']);

    // The clock: dated periods from today to the horizon, end to end, and the worlds that run on it.
    expect(s.periods).toHaveLength(d.periods);
    expect(s.periods[0].start).toBe('2026-10-02');
    expect(s.periods[d.periods - 1].end).toBe('2026-12-31');
    expect(s.worlds).toEqual(['A', 'B']);

    // The cast: actors from the world model, each with what it wants and can do.
    const cast = castOf(s);
    expect(cast).toHaveLength(d.actors);
    expect(cast.every(a => a.persona!.goal && a.persona!.levers.length > 0)).toBe(true);

    // Every cast actor moves in every world and period; the world engine resolves each.
    expect(s.moves).toHaveLength(d.worlds * d.periods * d.actors);
    expect(s.points).toHaveLength(d.worlds * d.periods);
    expect(s.rounds.map(r => [r.round, r.n])).toEqual(s.periods.map(p => [p.index, d.worlds]));
    for (const e of s.events) {
      const p = s.periods[e.period - 1];
      expect(e.date >= p.start && e.date <= p.end).toBe(true);
    }
    // First moves are grounded in the real world, word for word; later ones need not be.
    expect(s.moves.filter(m => m.period === 1).every(m => m.cites?.length && m.cites.every(c => c.exact))).toBe(true);
    const kinds = new Set(s.links.map(l => l.kind));
    expect(kinds).toEqual(new Set(['relation', 'evidence', 'move', 'cite']));

    // The prediction: a probability, and the story, date by date.
    const r = s.report!;
    expect(r.probability).toBeCloseTo(s.rounds[d.periods - 1].consensus, 1);
    expect(r.path.length).toBeGreaterThan(0);
    expect(r.path.map(p => p.date)).toEqual([...r.path.map(p => p.date)].sort());
    expect(r.worlds.map(w => w.world)).toEqual(['A', 'B']);
    expect(r.drivers.every(dr => (dr.sources?.length ?? 0) > 0)).toBe(true);
    expect(s.links.some(l => l.kind === 'cite' && l.from === 'r:report')).toBe(true);
    expect(s.usage.calls).toBe(estimateCalls('quick'));
    expect(h.prompts.length).toBe(estimateCalls('quick'));
  });

  it('predicts a choice between outcomes as shares, and a quantity as an estimate across the worlds', async () => {
    const choice = harness(createDemoChat());
    await runEngine({ question: 'Who will win the runoff in December?', seed: '', depth: 'quick', useFeeds: false }, choice.deps);
    const c = fold(choice.events);
    expect(c.frame?.kind).toBe('choice');
    expect(c.points.every(p => p.shares?.length === c.frame!.outcomes.length)).toBe(true);
    expect(c.report?.shares).toHaveLength(c.frame!.outcomes.length);

    const number = harness(createDemoChat());
    await runEngine({ question: 'How much will Brent crude cost on 31 December?', seed: '', depth: 'quick', useFeeds: false }, number.deps);
    const n = fold(number.events);
    expect(n.frame?.kind).toBe('number');
    expect(n.points.every(p => typeof p.value === 'number')).toBe(true);
    const v = n.rounds[n.rounds.length - 1].value!;
    // The range is the spread between the worlds.
    expect(v.low).toBe(v.min);
    expect(v.high).toBe(v.max);
    // The report reads the median as the prompt prints it, to a tenth.
    expect(n.report?.estimate?.value).toBeCloseTo(v.median, 1);
  });

  it('puts the sources in front of the world model and every actor', async () => {
    const h = harness(createDemoChat());
    await runEngine({ question: Q, seed: 'Leaked draft text.', depth: 'quick', useFeeds: true }, h.deps);
    const world = h.prompts.find(p => p.includes('Build the world model'))!;
    expect(world).toContain('[c1]');
    expect(world).toContain('seven of nine chapters of the framework are agreed');
    expect(world).toContain('Leaked draft text.');
    expect(h.prompts.filter(isMove).every(p => p.includes('[w1]') && p.includes('YOUR GOAL:'))).toBe(true);
  });

  it('lifts passages of the asker data for the actors to quote; the whole of it only when the whole simulation reads it', async () => {
    const brief = harness(createDemoChat());
    await runEngine({ question: Q, seed: 'Our channel check: 7 of 9 delegations ready.\nThe hosts expect a signing in November.', depth: 'quick', useFeeds: false }, brief.deps);
    const b = fold(brief.events);
    expect(b.context.map(c => c.id)).toEqual(['d1', 'd2']);
    expect(b.moves.filter(m => m.period === 1).every(m => m.cites?.some(c => c.source.startsWith('d') && c.exact))).toBe(true);
    expect(brief.prompts.filter(p => p.includes('SEED [data]'))).toHaveLength(0);

    const panel = harness(createDemoChat());
    const seed = `Our channel check: 7 of 9 delegations ready.${' More rows.'.repeat(2_000)}`;
    await runEngine({ question: Q, seed, seedScope: 'panel', depth: 'quick', useFeeds: false }, panel.deps);
    const moves = panel.prompts.filter(isMove);
    expect(moves.every(p => p.includes('SEED [data]') && p.includes('7 of 9 delegations'))).toBe(true);
    // Every move reads the head of the data, not all of it.
    expect(moves[0].length).toBeLessThan(seed.length);
    expect(fold(panel.events).report).not.toBeNull();
  });

  it('sends a first move that quotes nothing back once, and asks nothing of later moves', async () => {
    const demo = createDemoChat();
    const forgetful: ChatFn = async req => {
      const out = await demo(req);
      if (!isMove(req.user) || req.user.includes('quoted no source')) return out;
      const j = JSON.parse(out.text);
      delete j.cites;
      return { ...out, text: JSON.stringify(j) };
    };
    const d = DEPTHS.quick;
    const h = harness(forgetful);
    await runEngine({ question: Q, seed: '', depth: 'quick', useFeeds: true }, h.deps);
    const s = fold(h.events);
    expect(s.moves.filter(m => m.period === 1).every(m => (m.cites?.length ?? 0) > 0)).toBe(true);
    // One more call for each first move, and none for the rest.
    expect(s.usage.calls).toBe(estimateCalls('quick') + d.worlds * d.actors);
  });

  it('asks for no quotes when there is nothing to quote', async () => {
    const h = harness(createDemoChat());
    await runEngine({ question: Q, seed: '', depth: 'quick', useFeeds: false }, h.deps);
    expect(h.prompts.filter(isMove).every(p => !p.includes('"cites"'))).toBe(true);
    // Without the live feeds there is no research either, so no research plan.
    expect(fold(h.events).usage.calls).toBe(estimateCalls('quick', false));
  });

  it('leaves out the feed headlines about something else, and the market board on a question that is not about markets', async () => {
    const h = harness(createDemoChat());
    h.deps.gather = async () => [...CONTEXT, { id: 'c3', kind: 'market', title: 'Markets now: S&P 500 7,777', source: 'OSIRIS Markets', published: '', place: '', lat: null, lng: null }];
    await runEngine({ question: 'Will the envoys sign a deal?', seed: '', depth: 'quick', useFeeds: true }, h.deps);
    const ids = fold(h.events).context.map(c => `${c.id}:${c.title}`);
    expect(ids.filter(x => x.startsWith('c'))).toEqual(['c1:Envoys due in Geneva']);
  });

  it('prices a question about a price: a baseline from its history, a course for the price in every world, and the price settles it', async () => {
    // Two years of a coin swinging about 4% a day around 120.
    const dates: string[] = [], closes: number[] = [];
    let p = 120;
    for (let i = 0; i < 730; i++) {
      dates.push(new Date(Date.UTC(2024, 9, 2) + i * 86_400_000).toISOString().slice(0, 10));
      closes.push(p);
      p *= [1.04, 0.96, 1.05, 0.955, 1.02, 0.98][i % 6];
    }
    const coin: Series = { symbol: 'SOL-USD', name: 'Solana USD', currency: 'USD', dates, closes };
    const odds: ContextItem = {
      id: 'm1', kind: 'odds', title: 'Will Solana reach $200 by December 31, 2026?', source: 'Polymarket', published: '', place: '', lat: null, lng: null,
      url: 'https://polymarket.com/event/x', excerpt: 'Polymarket traders price YES at 9.5% ($2.1M traded).', odds: { platform: 'Polymarket', question: 'q', probability: 0.095, volume: 2_100_000, closes: '' },
    };
    const h = harness(createDemoChat());
    h.deps.research = async () => ({ items: [WEB[0], seriesItem(coin, 'q1')!, odds], series: [coin] });
    await runEngine({ question: 'Will Solana reach $200 before the end of 2026?', seed: '', depth: 'quick', useFeeds: true }, h.deps);
    const s = fold(h.events);

    // The world model named the price and the market on the same question; the baseline replaced the base rate.
    expect(s.frame?.measure).toEqual({ symbol: 'SOL-USD', threshold: 200, direction: 'above', touch: true });
    expect(s.frame?.market).toBe('m1');
    expect(s.quant).toMatchObject({ symbol: 'SOL-USD', price: closes[729] });
    expect(s.frame?.baseRate).toBeCloseTo(Math.min(0.99, Math.max(0.01, s.quant!.probability!)), 6);
    expect(s.context.find(c => c.id === 'q1')?.excerpt).toMatch(/Statistical baseline to 2026-12-31: 4,000 paths/);

    // Only actors that can act are cast: the bond market is the world, not a player.
    expect(castOf(s).map(a => a.kind)).not.toContain('market');

    // Every world has a price every period, and a world is settled exactly when its price reaches the level.
    for (const p of s.points) {
      expect(p.price!.low).toBeLessThanOrEqual(p.price!.close);
      expect(p.price!.high).toBeGreaterThanOrEqual(p.price!.close);
    }
    for (const w of s.worlds) {
      const pts = s.points.filter(p => p.world === w);
      const hit = pts.findIndex(p => p.price!.high >= 200);
      const settled = pts.findIndex(p => p.resolved === 'yes');
      expect(settled).toBe(hit);
      if (hit < 0) expect(pts[pts.length - 1].resolved).toBe('no');
    }
    // The actors know where the price stands in their world; the world engine knows its own course.
    expect(h.prompts.filter(isMove).every(u => u.includes('THE MARKET IN THIS WORLD: SOL-USD is at'))).toBe(true);
    expect(h.prompts.filter(isStep).every(u => u.includes('On its own course') && u.includes('"price_push"'))).toBe(true);
    // They know how far the level is, and from the second period on, where the price went in their world.
    expect(h.prompts.filter(isMove).every(u => /The level the question is about is \$200\.00, [+−]\d+% from here/.test(u))).toBe(true);
    const later = h.prompts.filter(u => isMove(u) && /PERIOD 2 OF/.test(u));
    expect(later.length).toBeGreaterThan(0);
    expect(later.every(u => /- The market: SOL-USD ended the period at \$[\d,.]+, trading between/.test(u))).toBe(true);
    // The report weighs it against the baseline and the market on the same question.
    const report = h.prompts[h.prompts.length - 1];
    expect(report).toContain('WHAT THE PREDICTION RESTS ON');
    expect(report).toContain('Statistical baseline (SOL-USD');
    expect(report).toContain('[m1] Prediction market on THIS question');
    // The worlds' events, priced across the market's own paths, are the simulation's probability, and the report's starting point.
    expect(s.quant?.simulated?.probability).toBeGreaterThan(0);
    expect(report).toContain('The simulation, priced');
    expect(s.report?.swarm).toBeCloseTo(s.quant!.simulated!.probability!, 6);
  });

  it('lands an injected event in every world from the next period on, and in the report', async () => {
    const h = harness(createDemoChat(), [[], ['A ceasefire is announced in Geneva']]);
    await runEngine({ question: Q, seed: '', depth: 'quick', useFeeds: false }, h.deps);
    const s = fold(h.events);
    const p1 = h.prompts.filter(u => (isMove(u) || isStep(u)) && /PERIOD 1 OF/.test(u));
    const p2 = h.prompts.filter(u => (isMove(u) || isStep(u)) && /PERIOD 2 OF/.test(u));
    expect(p1.every(u => !u.includes('ceasefire'))).toBe(true);
    expect(p2.every(u => u.includes('A ceasefire is announced in Geneva'))).toBe(true);
    expect(s.events.filter(e => e.kind === 'injected').map(e => [e.world, e.period])).toEqual([['A', 2], ['B', 2]]);
    expect(h.prompts[h.prompts.length - 1]).toContain('A ceasefire is announced in Geneva');
    expect(s.injects).toEqual([{ text: 'A ceasefire is announced in Geneva', round: 2 }]);
  });

  it('stops spending calls on a world once the question has resolved there', async () => {
    const demo = createDemoChat();
    const early: ChatFn = async req => {
      const out = await demo(req);
      if (!isStep(req.user) || !/simulated world A /.test(req.user)) return out;
      const j = JSON.parse(out.text);
      j.state = { resolved: 'yes', probability: 1, note: 'Signed.' };
      return { ...out, text: JSON.stringify(j) };
    };
    const h = harness(early);
    await runEngine({ question: Q, seed: '', depth: 'quick', useFeeds: false }, h.deps);
    const s = fold(h.events);
    const d = DEPTHS.quick;
    expect(s.moves.filter(m => m.world === 'A').every(m => m.period === 1)).toBe(true);
    expect(s.points.filter(p => p.world === 'A').map(p => p.resolved)).toEqual(Array(d.periods).fill('yes'));
    expect(s.usage.calls).toBe(estimateCalls('quick', false) - (d.periods - 1) * (d.actors + 1));
  });

  it('lets an actor miss a move when its call fails, and carries on', async () => {
    const demo = createDemoChat();
    let failed = 0;
    const flaky: ChatFn = async req => {
      if (isMove(req.user) && failed++ === 0) throw new ProviderError('upstream', 'boom');
      return demo(req);
    };
    const h = harness(flaky);
    await runEngine({ question: Q, seed: '', depth: 'quick', useFeeds: false }, h.deps);
    const s = fold(h.events);
    expect(s.warnings.join(' ')).toMatch(/did not move in world/);
    expect(s.moves).toHaveLength(simulationCalls('quick') - DEPTHS.quick.worlds * DEPTHS.quick.periods - 1);
    expect(s.report).not.toBeNull();
  });

  it('stops everything on a rejected key', async () => {
    let calls = 0;
    const h = harness(async () => { calls++; throw new ProviderError('auth', 'OpenAI rejected the key'); });
    await expect(runEngine({ question: Q, seed: '', depth: 'deep', useFeeds: false }, h.deps)).rejects.toThrow(/rejected the key/);
    expect(calls).toBe(1);
  });

  it('gives up when no world can play a period', async () => {
    const demo = createDemoChat();
    const h = harness(async req => {
      if (isStep(req.user)) throw new ProviderError('upstream', 'overloaded');
      return demo(req);
    });
    await expect(runEngine({ question: Q, seed: '', depth: 'quick', useFeeds: false }, h.deps)).rejects.toThrow(/No world could play/);
  });

  it('retries a reply that does not parse, once', async () => {
    const demo = createDemoChat();
    let garbled = 0;
    const h = harness(async req => {
      if (req.user.includes('Build the world model') && garbled++ === 0) return { text: 'I think the answer is complicated.', input: 1, output: 1 };
      return demo(req);
    });
    await runEngine({ question: Q, seed: '', depth: 'quick', useFeeds: false }, h.deps);
    expect(h.prompts[1]).toContain('could not be parsed');
  });

  it('stops when cancelled', async () => {
    const ac = new AbortController();
    const demo = createDemoChat();
    const h = harness(async req => {
      if (isMove(req.user)) ac.abort(new Error('cancelled'));
      return demo(req);
    });
    h.deps.signal = ac.signal;
    await expect(runEngine({ question: Q, seed: '', depth: 'quick', useFeeds: false }, h.deps)).rejects.toThrow('cancelled');
    expect(fold(h.events).report).toBeNull();
  });
});

describe('askRun', () => {
  it('talks to the report agent and to an actor that played, about what it did', async () => {
    const h = harness(createDemoChat());
    await runEngine({ question: Q, seed: '', depth: 'quick', useFeeds: false }, h.deps);
    const s = fold(h.events);
    const seen: string[] = [];
    const chat: ChatFn = async req => { seen.push(req.user); return { text: 'Because.', input: 1, output: 1 }; };
    expect((await askRun(s, 'report', 'Why so low?', chat)).reply).toBe('Because.');
    expect(seen[0]).toContain(s.report!.headline);
    const actor = castOf(s)[0];
    await askRun(s, actor.id, 'What would change your mind?', chat);
    expect(seen[1]).toContain(`You are ${actor.name}`);
    expect(seen[1]).toContain('WHAT YOU DID IN THE SIMULATED WORLDS');
    const bystander = s.actors.find(a => !a.persona)!;
    await expect(askRun(s, bystander.id, 'hi', chat)).rejects.toThrow(/No actor/);
  });
});

describe('pooled', () => {
  it('weighs the worlds equally, counting one where the question resolved as certain', () => {
    const stat = pooled(2, [
      { world: 'A', period: 2, probability: 0.99, resolved: 'yes', note: '' },
      { world: 'B', period: 2, probability: 0.3, resolved: null, note: '' },
      { world: 'C', period: 2, probability: 0.2, resolved: null, note: '' },
    ], 'binary', 0);
    expect(stat.n).toBe(3);
    expect(stat.max).toBeCloseTo(0.99, 2);
    expect(stat.consensus).toBeCloseTo(0.5, 3);
  });
});

describe('limiter', () => {
  it('never runs more than the limit at once, and runs everything', async () => {
    const gate = limiter(3);
    let live = 0;
    let peak = 0;
    const out = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(n => gate(async () => {
      peak = Math.max(peak, ++live);
      await new Promise(r => setTimeout(r, 5));
      live--;
      return n * 2;
    })));
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });
});

describe('seedCost', () => {
  it('counts the data once for the world model, and once per read when the whole simulation reads it', () => {
    expect(seedCost(0, 'standard', 'panel')).toEqual({ tokens: 0, calls: 0 });
    expect(seedCost(4_000, 'standard', 'brief')).toEqual({ tokens: 1_000, calls: 1 });
    const d = DEPTHS.standard;
    const reads = d.worlds * d.periods * d.actors + 1;
    // 4,000 characters once, then the same again in every move and the report.
    expect(seedCost(4_000, 'standard', 'panel')).toEqual({ tokens: 1_000 * (1 + reads), calls: 1 + reads });
    // Each read is capped at PANEL_SEED_MAX; the whole run at SEED_MAX.
    const q = DEPTHS.quick;
    expect(seedCost(SEED_MAX * 2, 'quick', 'panel').tokens).toBe(SEED_MAX / 4 + (PANEL_SEED_MAX / 4) * (1 + q.worlds * q.periods * q.actors));
  });
});
