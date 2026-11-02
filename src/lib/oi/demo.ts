/**
 * A scripted model for the tests and for local development: it answers every
 * stage of a run with plausible JSON, so the whole pipeline (engine, API,
 * MCP, panel and globe) can be exercised without anyone's key or money.
 *
 * It is offered as a provider only outside production (see providers.ts).
 */
import type { ChatFn, ChatRequest } from './providers';
import { demoAssist } from './assist/demo';
import { ASSIST_SYSTEM_START } from './assist/protocol';
import { IDENTIFY_SYSTEM_START } from '../vision/identify';
import { planFallback } from './plan';

const ACTORS = [
  { id: 'usa', name: 'United States', kind: 'state', country: 'US', place: 'Washington', lat: 38.9, lng: -77.04, lean: 0.3 },
  { id: 'china', name: 'China', kind: 'state', country: 'CN', place: 'Beijing', lat: 39.9, lng: 116.4, lean: -0.4 },
  { id: 'eu', name: 'European Union', kind: 'organisation', country: 'BE', place: 'Brussels', lat: 50.85, lng: 4.35, lean: 0.2 },
  { id: 'russia', name: 'Russia', kind: 'state', country: 'RU', place: 'Moscow', lat: 55.75, lng: 37.62, lean: -0.5 },
  { id: 'opec', name: 'OPEC+', kind: 'organisation', country: 'AT', place: 'Vienna', lat: 48.21, lng: 16.37, lean: -0.1 },
  { id: 'india', name: 'India', kind: 'state', country: 'IN', place: 'New Delhi', lat: 28.61, lng: 77.21, lean: 0.1 },
  { id: 'gulf', name: 'Gulf states', kind: 'group', country: 'SA', place: 'Riyadh', lat: 24.71, lng: 46.68, lean: 0 },
  { id: 'markets', name: 'Global bond markets', kind: 'market', country: 'GB', place: 'London', lat: 51.51, lng: -0.13, lean: 0.2 },
  { id: 'brazil', name: 'Brazil', kind: 'state', country: 'BR', place: 'Brasília', lat: -15.79, lng: -47.88, lean: 0.1 },
  { id: 'japan', name: 'Japan', kind: 'state', country: 'JP', place: 'Tokyo', lat: 35.68, lng: 139.69, lean: 0.3 },
];

const RELATIONS: [string, string, string, number][] = [
  ['usa', 'china', 'rivalry', 0.9], ['usa', 'eu', 'alliance', 0.8], ['usa', 'japan', 'alliance', 0.8], ['russia', 'china', 'alliance', 0.6],
  ['eu', 'russia', 'sanctions', 0.7], ['opec', 'gulf', 'alliance', 0.9], ['opec', 'russia', 'negotiation', 0.6], ['india', 'russia', 'trade', 0.5],
  ['markets', 'usa', 'influence', 0.7], ['brazil', 'china', 'trade', 0.6], ['japan', 'china', 'rivalry', 0.5], ['india', 'usa', 'negotiation', 0.4],
];

/** What the cast actors want, and what they can do, in turn. */
const GOALS = [
  'Keep its leverage and avoid being blamed for a breakdown.',
  'Lock in gains before the window closes.',
  'Protect its economy from the fallout.',
  'Be seen as the indispensable broker.',
];
const LEVERS = [
  ['Sign or refuse a framework', 'Impose or lift sanctions', 'Call a summit'],
  ['Cut or raise output', 'Set prices', 'Delay a decision'],
  ['Veto in council', 'Offer guarantees', 'Recall its envoy'],
  ['Host talks', 'Mediate', 'Offer financing'],
];
const ACTIONS = ['Opens back-channel talks with', 'Puts public pressure on', 'Offers a limited concession to', 'Threatens sanctions against', 'Delays its reply to'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** The kind of question, judged the way a model would: from how it is asked. */
function kindOf(question: string): 'binary' | 'choice' | 'number' {
  if (/^\s*(how (much|many|high|low|far)|what (price|level|share|rate|percentage|will .* (cost|be worth|trade at|reach))|at what)/i.test(question)) return 'number';
  if (/^\s*(who|which)\b/i.test(question)) return 'choice';
  return 'binary';
}

const DEMO_OUTCOMES = ['Front-runner', 'Challenger', 'Outsider', 'Other'];

/** A figure from a prompt line such as "ANCHOR: 86.4 USD per barrel". */
const figure = (u: string, label: string) => {
  const m = u.match(new RegExp(`^${label}: ([-0-9.,]+)`, 'm'));
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
};

/** The first words of a text, cut at a word, as a quote copied from it. */
const opening = (t: string, words = 9) => t.split(/\s+/).slice(0, words).join(' ').replace(/[,;:]$/, '');

/** The sources a prompt lists, by id, with the words each says: its excerpt where it has one, else its headline. */
function feedSources(u: string): { id: string; says: string }[] {
  return [...u.matchAll(/^\[([cdwbqm]\d+)\] (.*)$(?:\n {4}"(.*)")?/gm)].map(m => {
    const rest = m[2];
    const quoted = /— "(.*)"$/.exec(rest);
    return { id: m[1], says: m[3] || (quoted ? quoted[1] : rest.split(' — ').slice(1).join(' — ')) };
  }).filter(x => x.says.trim());
}

/**
 * Vehicle identification, scripted: the demo has no eyes, so every answer says
 * "(demo)" in its model name, and one in three is the honest "unclear".
 */
const DEMO_VEHICLES = [
  { make: 'Toyota', model: 'Corolla (demo)', body: 'car', confidence: 'possible' },
  { make: 'Ford', model: 'Transit (demo)', body: 'van', confidence: 'likely' },
  { make: null, model: null, body: 'car', confidence: 'unclear' },
];
function demoIdentify(count: number): string {
  return JSON.stringify({ vehicles: Array.from({ length: count }, (_, i) => ({ n: i + 1, colour: null, ...DEMO_VEHICLES[i % DEMO_VEHICLES.length] })) });
}

function answer(req: ChatRequest): string {
  // OI Assist has its own script: the conversation, not the forecast pipeline.
  if (req.system.startsWith(ASSIST_SYSTEM_START)) return demoAssist(req.user);
  if (req.system.startsWith(IDENTIFY_SYSTEM_START)) return demoIdentify(req.images?.length ?? 0);
  const u = req.user;
  if (u.includes('Plan the research')) {
    const question = (u.match(/QUESTION: (.*)/)?.[1] ?? '').trim();
    return JSON.stringify(planFallback(question));
  }
  if (u.includes('Build the world model')) {
    const cites = [...u.matchAll(/^\[([cwbqm]\d+)\]/gm)].map(m => m[1]).slice(0, 5);
    const question = (u.match(/QUESTION: (.*)/)?.[1] ?? 'The event happens').trim();
    // Passages of the asker's data, copied as they are: its longer lines, headings left out.
    const seed = /SEED \(material[^\n]*\n<<<\n([\s\S]*?)\n>>>/.exec(u)?.[1] ?? '';
    const passages = seed === '(none)' ? [] : seed.split('\n').map(l => l.trim()).filter(l => l.length >= 20 && !l.startsWith('###')).slice(0, 3).map(l => opening(l, 24));
    const kind = kindOf(question);
    // A price in the market data: the question turns on it; a level in the question ("$200", "200$") is what it is about.
    const priced = /^\[q\d+\] market data[^—]*— .*\(([A-Za-z0-9^=.-]+)\): [^\d]*([\d,.]+)/m.exec(u);
    const level = parseFloat((/\$\s?([\d,.]+)|([\d,.]+)\s?\$/.exec(question)?.slice(1).find(Boolean) ?? '').replace(/,/g, ''));
    const price = priced ? parseFloat(priced[2].replace(/,/g, '')) : NaN;
    const measure = priced ? {
      symbol: priced[1],
      ...(kind === 'binary' ? { threshold: Number.isFinite(level) ? level : Math.round(price * 1.25), direction: /\b(fall|drop|below|under|crash)\b/i.test(question) ? 'below' : 'above', touch: true } : {}),
    } : null;
    const market = /^\[(m\d+)\]/m.exec(u)?.[1] ?? null;
    return JSON.stringify({
      kind,
      measure,
      market,
      ...(kind === 'choice' ? { outcomes: DEMO_OUTCOMES, prior: [0.4, 0.3, 0.2, 0.1] } : {}),
      ...(kind === 'number' ? { unit: 'USD per barrel', anchor: 84.2 } : {}),
      proposition: question,
      resolution: 'Resolves YES if credible reporting confirms it by the horizon.',
      horizon: '2026-12-31',
      base_rate: 0.3,
      base_rate_reason: 'Comparable episodes resolved this way about three times in ten.',
      focus: { place: 'Geneva', lat: 46.2, lng: 6.14 },
      actors: ACTORS.map(a => ({ ...a, role: `${a.name} sets the pace on this question.` })),
      relations: RELATIONS.map(([from, to, kind, strength]) => ({ from, to, kind, strength, note: `${from} and ${to}: ${kind}` })),
      evidence: [...cites, ...passages.map((_, i) => `d${i + 1}`)].map((c, i) => ({ source: c, actor: ACTORS[i % ACTORS.length].id, effect: i % 2 ? 'no' : 'yes', note: 'Bears on the outcome.' })),
      ...(passages.length ? { quotes: passages.map(text => ({ text, note: 'From your data.' })) } : {}),
    });
  }
  if (u.includes('"cast"') && u.includes('Cast the')) {
    const n = Number(u.match(/Cast the (\d+) actors/)?.[1] ?? 4);
    return JSON.stringify({
      cast: ACTORS.slice(0, n).map((a, i) => ({
        id: a.id,
        goal: GOALS[i % GOALS.length],
        levers: LEVERS[i % LEVERS.length],
        red_lines: 'Any deal that weakens it at home.',
        style: i % 2 ? 'Cautious, bound by procedure.' : 'Opportunistic, moves on leverage.',
      })),
    });
  }
  if (u.includes('Decide your move for this period')) {
    const name = /^You are (.+?) \(/m.exec(u)?.[1] ?? 'Someone';
    const me = ACTORS.find(a => a.name === name)?.id ?? slug(name);
    const [, world = 'A', periodRaw = '1'] = /SIMULATED WORLD (\w+), PERIOD (\d+) OF/.exec(u) ?? [];
    const period = Number(periodRaw);
    const kind = /^KIND: (\w+)/m.exec(u)?.[1] ?? 'binary';
    const others = [...u.matchAll(/^- ([a-z0-9_]+): /gm)].map(m => m[1]).filter(id => id !== me && ACTORS.some(a => a.id === id));
    const seed = `${me}${world}${period}`;
    const target = others[Math.floor(hash(seed) * others.length)];
    const up = hash(seed + 'u') > 0.5;
    const stance = target ? (['cooperate', 'pressure', 'oppose'] as const)[Math.floor(hash(seed + 's') * 3)] : 'hold';
    // Quote a source when grounding is asked for, preferring the research and the asker's data.
    const listed = u.includes('"cites"') ? feedSources(u) : [];
    const preferred = listed.filter(x => /^[wqmbd]/.test(x.id));
    const pool = preferred.length ? preferred : listed;
    const src = pool[Math.floor(hash(seed + 'c') * pool.length)];
    const first = /^OUTCOMES: 1\. (.+?)(?:  2\.|$)/m.exec(u)?.[1]?.trim();
    const effect = kind === 'choice' ? 'yes' : kind === 'number' ? (up ? 'up' : 'down') : (up ? 'yes' : 'no');
    return JSON.stringify({
      action: target ? `${ACTIONS[Math.floor(hash(seed + 'a') * ACTIONS.length)]} ${ACTORS.find(a => a.id === target)?.name ?? target}` : 'Holds its position and waits for the others to move',
      statement: period === 1 ? 'We will act in our own interest, and we are ready to talk.' : 'Our position is unchanged.',
      targets: target ? [target] : [],
      stance,
      effect,
      ...(kind === 'choice' && first ? { favors: first } : {}),
      why: up ? 'The moment favours pressing ahead.' : 'Waiting costs less than moving now.',
      ...(src ? { cites: [{ source: src.id, quote: opening(src.says, 12), effect: up ? 'yes' : 'no', why: 'It shows where things stand today.' }] } : {}),
    });
  }
  if (u.includes('You are the world engine')) {
    const [, world = 'A', periodRaw = '1', ofRaw = '1'] = /simulated world (\w+) \(\d+ of \d+\)[\s\S]*?PERIOD (\d+) OF (\d+)/.exec(u) ?? [];
    const period = Number(periodRaw);
    const last = period === Number(ofRaw);
    const [, start = '2026-10-03', end = '2026-12-31'] = /\((\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\)/.exec(u) ?? [];
    const kind = /^KIND: (\w+)/m.exec(u)?.[1] ?? 'binary';
    const movers = [...u.matchAll(/^- ([a-z0-9_]+) \((.+?)\): /gm)].map(m => ({ id: m[1], name: m[2] }));
    const day = (offset: number) => new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
    const span = Math.max(1, (Date.parse(end) - Date.parse(start)) / 86_400_000);
    const pair = movers.slice(0, 2);
    const seed = `${world}${period}`;
    const up = hash(seed) > 0.5;
    const events = [
      {
        date: day(Math.round(span * 0.3)),
        title: pair.length === 2 ? `${pair[0].name} and ${pair[1].name} meet, without a breakthrough` : 'Talks continue without a breakthrough',
        detail: 'Both sides restate their positions; officials say work continues at a technical level.',
        actors: pair.map(p => p.id), effect: kind === 'number' ? (up ? 'up' : 'down') : up ? 'yes' : 'no', kind: 'event', place: 'Geneva', lat: 46.2, lng: 6.14,
      },
      ...(world === 'C' && period === 2 ? [{
        date: day(Math.round(span * 0.6)), title: 'A tanker is seized near the Strait of Hormuz', detail: 'Shipping insurers raise rates; markets jump.',
        actors: [], effect: kind === 'number' ? 'up' : 'no', kind: 'shock', place: 'Strait of Hormuz', lat: 26.57, lng: 56.25,
      }] : []),
    ];
    const prior = Number(/(\d+)% YES/.exec(u)?.[1] ?? 30) / 100;
    const drift = (hash(seed + 'd') - 0.5) * 0.16;
    const p = Math.min(0.92, Math.max(0.08, prior + drift));
    const state = kind === 'choice'
      ? { resolved: null, shares: [0.42 + drift, 0.3, 0.18, 0.1 - drift].map(v => Math.max(0.02, Math.round(v * 100) / 100)) }
      : kind === 'number'
        ? { value: Math.round((figure(u, 'ANCHOR') ?? 80) * (1 + drift * 0.3) * 10) / 10 }
        : { resolved: last && world === 'B' && p > 0.45 ? 'yes' : last && p < 0.2 ? 'no' : null, probability: Math.round(p * 100) / 100 };
    // A price in play: the events push it a little beyond its own course, up or down.
    const push = u.includes('THE MARKET IN THIS WORLD') ? { price_push: Math.round((hash(seed + 'p') - 0.5) * 0.12 * 1000) / 1000 } : {};
    return JSON.stringify({ events, state: { ...state, note: up ? 'Momentum builds, slowly.' : 'Positions harden.' }, ...push });
  }
  if (u.includes('You are the OSIRIS report agent') && u.includes('JSON shape')) {
    const swarm = Number(u.match(/The worlds pooled give (\d+)%/)?.[1] ?? 35) / 100;
    const kind = /^KIND: (\w+)/m.exec(u)?.[1] ?? 'binary';
    const median = parseFloat(u.match(/median is ([-0-9.,]+)/)?.[1]?.replace(/,/g, '') ?? '');
    const listedIds = feedSources(u).map(x => x.id);
    const ids = listedIds.filter(id => /^[wqmbd]/.test(id)).length ? listedIds.filter(id => /^[wqmbd]/.test(id)) : listedIds;
    const sourced = (k: number) => (ids.length ? { sources: [ids[k % ids.length], ids[(k + 2) % ids.length]].filter((v, i, a) => a.indexOf(v) === i) } : {});
    // The path: the first world's events, as the most likely course.
    const firstWorld = /WORLD A: [^\n]*\n([\s\S]*?)(?:\n\nWORLD |\n\nTHE WORLDS POOLED)/.exec(u)?.[1] ?? '';
    const path = [...firstWorld.matchAll(/^- (\d{4}-\d{2}-\d{2}): ([^.]+)\./gm)].slice(0, 6).map(m => ({ date: m[1], title: m[2], detail: 'As the simulation played it out.', actors: [] }));
    const worlds = [...u.matchAll(/^WORLD (\w+): ended (.+)$/gm)].map(m => ({ world: m[1], outcome: m[2], summary: 'Talks dragged on; neither side moved first.' }));
    const answerFields = kind === 'choice'
      ? { shares: [0.46, 0.29, 0.17, 0.08] }
      : kind === 'number' && Number.isFinite(median)
        ? { estimate: { value: median, low: Math.round(median * 0.9 * 10) / 10, high: Math.round(median * 1.1 * 10) / 10 } }
        : { probability: swarm };
    return JSON.stringify({
      headline: kind === 'choice' ? 'The front-runner holds, the challenger stays close' : kind === 'number' ? 'A narrow range, slightly below today' : 'No deal by the horizon, but talks keep it alive',
      ...answerFields,
      confidence: 'medium',
      summary: 'In most worlds the actors kept talking without anyone moving first: positions hardened, deadlines slipped, and the question was still open at the horizon. One world found a late path to agreement. The base rate and the actors\' red lines point the same way.',
      path,
      actor_moves: ACTORS.slice(0, 3).map(a => ({ actor: a.id, prediction: `${a.name} keeps its position and waits for the others.` })),
      worlds,
      drivers: [
        { text: 'Great-power rivalry limits room for a deal', push: 'no', weight: 0.7, actor: 'china', ...sourced(0) },
        { text: 'Allied coordination is unusually tight', push: 'yes', weight: 0.5, actor: 'eu', ...sourced(1) },
        { text: 'Energy prices raise the cost of escalation', push: 'no', weight: 0.4, actor: 'opec', ...sourced(2) },
      ],
      scenarios: [
        { name: 'Stalemate', probability: 0.6, description: 'Talks continue; nobody moves first before the horizon.', place: 'Brussels', lat: 50.85, lng: 4.35 },
        { name: 'Late deal', probability: swarm, description: 'A deal lands late in the window.', place: 'Geneva', lat: 46.2, lng: 6.14 },
        { name: 'Shock', probability: 0.1, description: 'A crisis overtakes the agenda.', place: 'Strait of Hormuz', lat: 26.57, lng: 56.25 },
      ],
      signposts: [
        { text: 'Envoys meet in person', means: 'yes', place: 'Geneva', lat: 46.2, lng: 6.14 },
        { text: 'New export controls announced', means: 'no', place: 'Washington', lat: 38.9, lng: -77.04 },
        { text: 'Tanker traffic falls in the Strait of Hormuz', means: 'no', place: 'Strait of Hormuz', lat: 26.57, lng: 56.25 },
      ],
      dissent: 'One world found a late path to agreement if the main actors align.',
      caveats: ['Demo model: scripted answers, not analysis.'],
      deviation_reason: null,
    });
  }
  return 'This is the demo model talking. With a real provider, the actor or the report agent would answer here in character.';
}

/** A chat function that answers from the script, after `delay` ms (a range, to look like a live model). */
export function createDemoChat(delay: [number, number] = [0, 0]): ChatFn {
  return async req => {
    const wait = delay[0] + Math.random() * (delay[1] - delay[0]);
    if (wait > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, wait);
        req.signal?.addEventListener('abort', () => { clearTimeout(t); reject(req.signal!.reason); }, { once: true });
      });
    }
    if (req.signal?.aborted) throw req.signal.reason;
    const text = answer(req);
    return { text, input: Math.round(req.user.length / 4), output: Math.round(text.length / 4) };
  };
}
