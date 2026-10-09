/**
 * OSIRIS OI Assist: the scripted assistant behind the dev-only Demo provider.
 *
 * Reads the reader's last message for what they want (go somewhere, find
 * quakes, flights, fires, news, quotes, a forecast) and answers with the
 * actions a model would choose; once the results are back, it summarises
 * them. No model, no key, no cost: for trying the whole loop on a
 * development server, never in production (the provider does not exist there).
 */

/** Words that come before a place, in any case. */
const TRIGGER_RX = /\b(?:take me to|go to|fly to|show me|zoom (?:in )?(?:to|on)|head to|over|around|near|in|at)\s+(?:the\s+)?/gi;
/** The place itself: capitalised words, "of" allowed between them. */
const NAME_RX = /^([A-Z][\w'’.-]*(?:\s+(?:of\s+)?[A-Z][\w'’.-]*){0,4})/;
const NOT_PLACES = /^(Earthquakes?|Flights?|Military|Ships?|Fires?|News|Markets?|OI|Oil|Gold|The)$/i;

/** A place named in the text, if any: the capitalised words after "go to", "near", "over"… */
export function placeIn(text: string): string | null {
  for (const m of text.matchAll(TRIGGER_RX)) {
    const name = text.slice((m.index ?? 0) + m[0].length).match(NAME_RX)?.[1].trim().replace(/[.,!?]+$/, '');
    if (name && !NOT_PLACES.test(name)) return name;
  }
  return null;
}

function lastTurn(prompt: string): { mode: string; text: string; after: string } {
  const re = /^USER \(mode (\w+)\): (.*)$/gm;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(prompt))) last = m;
  if (!last) return { mode: 'auto', text: '', after: '' };
  return { mode: last[1], text: last[2], after: prompt.slice(last.index + last[0].length) };
}

const json = (say: string, actions: { tool: string; args: Record<string, unknown> }[] = [], done = true) => JSON.stringify({ say, actions, done });

export function demoAssist(prompt: string): string {
  const { mode, text, after } = lastTurn(prompt);
  const t = text.toLowerCase();

  // Results are back: answer from them.
  if (after.includes('RESULTS:')) {
    const lines = [...after.matchAll(/^\s{2}(\w+) (✓|✗) (.*)$/gm)].map(m => ({ tool: m[1], ok: m[2] === '✓', summary: m[3] }));
    const failed = lines.find(l => !l.ok);
    if (failed) return json(`That did not work: ${failed.summary}. Try a different place or layer.`);
    const found = after.match(/"items":(\[.*?\])\s*}?\s*$/m);
    let names: string[] = [];
    try { names = found ? (JSON.parse(found[1]) as { name: string }[]).slice(0, 4).map(i => i.name) : []; } catch { /* a clipped list */ }
    const quotes = [...after.matchAll(/"name":"([^"]+)","symbol":"[^"]*","price":([\d.]+),"change_pct":(-?[\d.]+|null)/g)].slice(0, 4);
    if (quotes.length) {
      return json(quotes.map(q => `- ${q[1]}: ${Number(q[2]).toLocaleString('en-US')}${q[3] !== 'null' ? ` (${Number(q[3]) >= 0 ? '+' : ''}${q[3]}%)` : ''}`).join('\n'));
    }
    const looked = lines.find(l => l.tool === 'camera');
    if (looked) return json(`${looked.summary}. The boxes are on the camera now: counted by OSIRIS on your device.`);
    const summary = lines.find(l => l.tool === 'find')?.summary ?? lines.map(l => l.summary).join('; ');
    return json(names.length ? `${summary}. The top ones: ${names.join(', ')}. They are marked on the map; click any in the list to fly to it.` : `${summary}.`);
  }

  if (!text) return json('Ask me anything about the map.');
  const place = placeIn(text);
  const near = place ? { near: place } : {};

  if (mode === 'forecast' || /\b(forecast|predict|odds|chance of|probability)\b/.test(t)) {
    const q = text.replace(/^(forecast|predict)[:\s-]*/i, '').trim();
    return json('Starting a prediction. OI casts the actors who decide it and plays them out in parallel worlds; follow it in the Forecast tab.', [{ tool: 'forecast', args: { question: q.endsWith('?') ? q : `${q}?`, depth: 'quick' } }]);
  }
  if (/\b(clear|reset|remove)\b.*\b(highlights?|marks?|map)\b/.test(t)) return json('Cleared.', [{ tool: 'clear', args: {} }]);
  if (/what('s| is) (here|in view|on (the|my) screen|happening here)|what am i looking at|\bscan\b/.test(t)) return json('Looking at what is in view.', [{ tool: 'scan', args: {} }], false);
  const view = t.match(/\b(graph|timeline|table)\b/)?.[1];
  if (/\b(full ?screen|workspace)\b/.test(t) || (view && /\b(show|open|switch)\b/.test(t))) {
    const close = /\b(close|exit|leave)\b/.test(t);
    const actions: { tool: string; args: Record<string, unknown> }[] = [{ tool: 'workspace', args: close ? { open: false } : { open: true, ...(view ? { view } : {}) } }];
    const pick = text.match(/\b(?:and )?(?:open|select)\s+(?!the (?:graph|timeline|table|workspace))([A-Z][\w'’.+-]*(?:\s+[A-Z][\w'’.+-]*){0,3})/)?.[1];
    if (pick && !close) actions.push({ tool: 'select', args: { name: pick } });
    return json(close ? 'Closing the workspace.' : `Opening the workspace${view ? ` on the ${view}` : ''}${pick ? ` with ${pick}` : ''}.`, actions);
  }
  const sel = text.match(/^(?:[Oo]pen|[Ss]elect|[Ss]how me)\s+([A-Z][\w'’.+-]*(?:\s+[A-Z][\w'’.+-]*){0,3})\s*$/)?.[1];
  if (sel && !/\bon the map\b/.test(t)) return json(`Opening ${sel}.`, [{ tool: 'select', args: { name: sel } }]);
  if (/\bsatellite (view|map|basemap)\b/.test(t)) return json('Switching to the satellite basemap.', [{ tool: 'map_view', args: { style: 'satellite' } }]);
  if (/\bflat map\b|\b2d\b/.test(t)) return json('Switching to the flat map.', [{ tool: 'map_view', args: { projection: 'flat' } }]);
  if (/\b(markets?|stocks?|oil|brent|gold|bitcoin|btc|s&p|nasdaq|prices?)\b/.test(t)) {
    const symbols = ['brent', 'gold', 'bitcoin', 's&p 500', 'nasdaq', 'wti', 'silver'].filter(s => t.includes(s.split(' ')[0]));
    return json('Reading the markets.', [{ tool: 'markets', args: symbols.length ? { symbols } : {} }], false);
  }
  if (/\b(earthquakes?|quakes?|seismic)\b/.test(t)) {
    const min = Number(t.match(/\bm\s?(\d(?:\.\d)?)|above (\d(?:\.\d)?)/)?.slice(1).find(Boolean) ?? 4.5);
    return json('Looking at the last day of earthquakes.', [{ tool: 'find', args: { layer: 'earthquakes', min, sort: 'largest', limit: 8, ...near } }], false);
  }
  if (/\bmilitary\b/.test(t)) return json('Checking military aircraft.', [{ tool: 'find', args: { layer: 'military_flights', limit: 10, ...near, ...(place ? { radius_km: 800 } : {}) } }], false);
  if (/\b(flights?|planes?|aircraft|airliners?)\b/.test(t)) return json('Checking flights.', [{ tool: 'find', args: { layer: 'flights', limit: 10, ...near, ...(place ? { radius_km: 300 } : {}) } }], false);
  if (/\b(fires?|wildfires?)\b/.test(t)) return json('Checking active fires.', [{ tool: 'find', args: { layer: 'fires', sort: 'largest', limit: 10, ...near } }], false);
  if (/\b(how busy|traffic|congest\w*|crowds?|crowded|look through|analy[sz]e|watch)\b/.test(t) && place) {
    const watch = /\b(watch|moving|flow\w*)\b/.test(t) ? 20 : 0;
    return json(`Looking through a camera near ${place}.`, [{ tool: 'camera', args: { near: place, ...(watch ? { watch_seconds: watch } : {}) } }], false);
  }
  if (/\b(cameras?|cctv|webcams?)\b/.test(t)) return json('Looking for live cameras.', [{ tool: 'find', args: { layer: 'cameras', limit: 10, ...near, ...(place ? { radius_km: 50 } : {}) } }], false);
  if (/\b(ships?|vessels?|ports?|shipping)\b/.test(t)) {
    const actions = [...(place ? [{ tool: 'go_to', args: { place } }] : []), { tool: 'layers', args: { on: ['maritime'] } }, { tool: 'find', args: { layer: 'chokepoints', limit: 10, show: !place } }];
    return json(place ? `Taking you to ${place} with shipping on.` : 'Turning on shipping.', actions, false);
  }
  if (/\b(news|happening|latest|going on|reports?)\b/.test(t)) {
    const topic = place ?? text.replace(/.*\b(about|on|in)\b/i, '').replace(/[?.!]+$/, '').trim();
    return json(`Reading the latest on ${topic}.`, [{ tool: 'find', args: { layer: 'news', text: topic.split(/\s+/).slice(0, 2).join(' '), sort: 'newest', limit: 8 } }], false);
  }
  if (place) return json(`Taking you to ${place}.`, [{ tool: 'go_to', args: { place } }]);
  return json('I can take you anywhere on the map, find live flights, ships, quakes, fires and news, read the markets, or start a forecast. Try "Take me to the Strait of Hormuz" or "Earthquakes above M5".');
}
