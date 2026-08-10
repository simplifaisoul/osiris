/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — One-Click AI Overview
 *  POST /api/ai/overview   body: { mode: 'alerts' | 'markets' | 'chain', payload }
 *
 *  Generates a punchy intelligence read-out for the Alerts or Markets
 *  panel. Uses Gemini when GEMINI_API_KEY_* is configured, otherwise
 *  falls back to a built-in heuristic analyst so the button ALWAYS
 *  works — no key required. Anyone can click it.
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { createGeminiClient, rotateApiKey } from '@/lib/ai-engine';

export const dynamic = 'force-dynamic';

type Mode = 'alerts' | 'markets' | 'chain';

function getEnvApiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key && key.trim().length > 0) keys.push(key.trim());
  }
  return keys;
}

/* ─────────────────────────── Digest builders ─────────────────────────── */

type Digest = { summaryLine: string; facts: string[]; highlights: string[] };

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && !Number.isNaN(n) ? n : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '');
}

function digestMarkets(payload: any): Digest {
  const markets = payload?.markets || {};
  const space = payload?.spaceWeather;
  const facts: string[] = [];
  const highlights: string[] = [];

  // Flatten every ticker across sections into { name, pct }
  const tickers: { name: string; pct: number; price: number | null }[] = [];
  for (const section of Object.keys(markets)) {
    const group = markets[section];
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    for (const [name, d] of Object.entries<any>(group)) {
      const pct = num(d?.change_percent);
      if (pct === null) continue;
      tickers.push({ name, pct, price: num(d?.price) });
    }
  }

  if (tickers.length) {
    const up = tickers.filter(t => t.pct > 0).length;
    const down = tickers.filter(t => t.pct < 0).length;
    const sorted = [...tickers].sort((a, b) => b.pct - a.pct);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const breadth = up >= down ? 'risk-on' : 'risk-off';

    facts.push(`${tickers.length} instruments tracked — ${up} up / ${down} down (${breadth} breadth).`);
    if (top && top.pct > 0) {
      facts.push(`Top gainer: ${top.name} +${top.pct.toFixed(2)}%.`);
      highlights.push(`▲ ${top.name} +${top.pct.toFixed(2)}%`);
    }
    if (bottom && bottom.pct < 0) {
      facts.push(`Worst performer: ${bottom.name} ${bottom.pct.toFixed(2)}%.`);
      highlights.push(`▼ ${bottom.name} ${bottom.pct.toFixed(2)}%`);
    }
  } else {
    facts.push('No live market instruments available in the current feed.');
  }

  const btc = markets?.crypto?.Bitcoin || markets?.crypto?.BTC || markets?.crypto?.bitcoin;
  const btcPct = num(btc?.change_percent);
  if (btcPct !== null) {
    facts.push(`Bitcoin ${btcPct >= 0 ? 'up' : 'down'} ${btcPct.toFixed(2)}% at $${num(btc?.price)?.toLocaleString() ?? '—'}.`);
    highlights.push(`₿ BTC ${btcPct >= 0 ? '+' : ''}${btcPct.toFixed(2)}%`);
  }

  if (space?.kp_index != null) {
    const kp = num(space.kp_index);
    const geomag = kp !== null && kp >= 5 ? 'geomagnetic storm conditions' : 'quiet geomagnetic field';
    facts.push(`Space weather: Kp ${space.kp_index} (${space.storm_level || geomag}).`);
    if (kp !== null && kp >= 5) highlights.push(`⚡ Kp ${space.kp_index} STORM`);
  }

  const breadthWord = tickers.length && tickers.filter(t => t.pct > 0).length >= tickers.filter(t => t.pct < 0).length ? 'broadly bid' : 'under pressure';
  return {
    summaryLine: tickers.length ? `Global tape is ${breadthWord}.` : 'Market feed is thin right now.',
    facts,
    highlights,
  };
}

function digestAlerts(payload: any): Digest {
  const facts: string[] = [];
  const highlights: string[] = [];

  const quakes: any[] = payload?.earthquakes || payload?.quakes || [];
  const news: any[] = payload?.news || payload?.news_intel || [];
  const weather: any[] = payload?.weather_events || [];
  const conflicts: any[] = payload?.conflicts || payload?.conflict_zones || [];

  if (Array.isArray(quakes) && quakes.length) {
    const mags = quakes
      .map(q => num(q?.mag ?? q?.magnitude ?? q?.properties?.mag))
      .filter((m): m is number => m !== null);
    if (mags.length) {
      const max = Math.max(...mags);
      const strong = mags.filter(m => m >= 5).length;
      facts.push(`${quakes.length} seismic events tracked; strongest M${max.toFixed(1)}${strong ? `, ${strong} at M5.0+` : ''}.`);
      if (max >= 5) highlights.push(`🌐 M${max.toFixed(1)} quake`);
    }
  }

  if (Array.isArray(news) && news.length) {
    const scored = news.map(n => num(n?.risk_score) ?? 0);
    const hot = scored.filter(s => s >= 8).length;
    facts.push(`${news.length} OSINT news items; ${hot} flagged high-priority (risk ≥ 8).`);
    const topItem = [...news].sort((a, b) => (num(b?.risk_score) ?? 0) - (num(a?.risk_score) ?? 0))[0];
    if (topItem?.title) highlights.push(`📰 ${decodeEntities(String(topItem.title)).slice(0, 48)}`);
    if (hot) highlights.push(`🔴 ${hot} hot items`);
  }

  if (Array.isArray(weather) && weather.length) {
    const high = weather.filter(w => (w?.severity || '').toLowerCase() === 'high').length;
    const types = [...new Set(weather.map(w => w?.type).filter(Boolean))].slice(0, 3).join(', ');
    facts.push(`${weather.length} active severe-weather events${high ? `, ${high} high-severity` : ''}${types ? ` (${types})` : ''}.`);
    if (high) highlights.push(`🌪️ ${high} severe`);
  }

  if (Array.isArray(conflicts) && conflicts.length) {
    facts.push(`${conflicts.length} active conflict zones under watch.`);
    highlights.push(`⚔️ ${conflicts.length} zones`);
  }

  if (!facts.length) facts.push('No significant alerts in the current feed window.');

  const level = highlights.some(h => /STORM|hot|severe|M[5-9]/.test(h)) ? 'ELEVATED' : 'NOMINAL';
  return { summaryLine: `Global alert posture: ${level}.`, facts, highlights };
}

/**
 * Chain-threat brief: exploits, crypto CVEs and OFAC wallet designations.
 * Facts are stated with their figures so the heuristic path stays useful
 * when no Gemini key is configured.
 */
function digestChain(payload: any): Digest {
  const b = payload?.brief || payload || {};
  const t = b.totals || {};
  const exploits: any[] = Array.isArray(b.exploits) ? b.exploits : [];
  const cves: any[] = Array.isArray(b.cves) ? b.cves : [];
  const wallets: any[] = Array.isArray(b.sanctioned_wallets) ? b.sanctioned_wallets : [];

  const facts: string[] = [];
  const highlights: string[] = [];

  const losses = num(t.exploit_losses_usd) ?? 0;
  const usd = (n: number) =>
    n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;

  if (exploits.length) {
    facts.push(`${t.exploit_count ?? exploits.length} on-chain exploits in the last ${b.window_days ?? 30} days totalling ${usd(losses)} in losses.`);
    const biggest = [...exploits].sort((a, b2) => (num(b2.amount_usd) ?? 0) - (num(a.amount_usd) ?? 0))[0];
    if (biggest) {
      facts.push(`Largest: ${biggest.name} on ${biggest.chain} — ${usd(num(biggest.amount_usd) ?? 0)} via ${biggest.technique}.`);
      highlights.push(biggest.name);
    }
    // Which attack techniques actually dominate the window.
    const byTech = new Map<string, number>();
    for (const e of exploits) byTech.set(e.technique, (byTech.get(e.technique) || 0) + 1);
    const top = [...byTech.entries()].sort((a, b2) => b2[1] - a[1])[0];
    if (top && top[1] > 1) facts.push(`Most common technique: ${top[0]} (${top[1]} incidents).`);
    const bridges = exploits.filter(e => e.bridge_hack).length;
    if (bridges) facts.push(`${bridges} of these were bridge hacks.`);
  } else {
    facts.push('No on-chain exploits recorded in the window.');
  }

  if (cves.length) {
    const crit = num(t.critical_cves) ?? 0;
    facts.push(`${t.cve_count ?? cves.length} crypto-related CVEs published${crit ? `, ${crit} rated critical (CVSS ≥ 9)` : ''}.`);
    const worst = [...cves].sort((a, b2) => (num(b2.cvss) ?? 0) - (num(a.cvss) ?? 0))[0];
    if (worst?.cvss != null) {
      facts.push(`Highest severity: ${worst.id} at CVSS ${worst.cvss}.`);
      highlights.push(worst.id);
    }
  }

  if (wallets.length) {
    const byAsset = new Map<string, number>();
    for (const w of wallets) byAsset.set(w.asset, (byAsset.get(w.asset) || 0) + 1);
    const spread = [...byAsset.entries()].map(([a, n]) => `${n} ${a}`).join(', ');
    facts.push(`${t.sanctioned_wallet_count ?? wallets.length} OFAC-designated wallets in scope (${spread}).`);
  }

  const summaryLine = exploits.length
    ? `${usd(losses)} lost across ${t.exploit_count ?? exploits.length} on-chain incidents in the last ${b.window_days ?? 30} days.`
    : 'Chain threat surface quiet across the selected window.';

  return { summaryLine, facts, highlights };
}

/* ─────────────────────────── Renderers ─────────────────────────── */

function heuristicOverview(mode: Mode, digest: Digest): string {
  const bullets = digest.facts.map(f => `• ${f}`).join('\n');
  return `${digest.summaryLine}\n\n${bullets}`;
}

async function geminiOverview(mode: Mode, digest: Digest, keys: string[]): Promise<string | null> {
  try {
    const client = createGeminiClient(rotateApiKey(keys));
    const model = client.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction:
        'You are OSIRIS, a terse intelligence analyst. Given structured facts, write a sharp 2-4 sentence situational read-out. No preamble, no markdown headers, no hedging. Lead with the bottom line.',
    });
    const prompt = `MODE: ${mode.toUpperCase()}\nBOTTOM LINE: ${digest.summaryLine}\nFACTS:\n${digest.facts.map(f => `- ${f}`).join('\n')}\n\nWrite the read-out now.`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text || null;
  } catch (e) {
    console.warn('[OSIRIS] Gemini overview failed, using heuristic:', e);
    return null;
  }
}

/* ─────────────────────────── Handler ─────────────────────────── */

export async function POST(request: NextRequest) {
  let body: { mode?: Mode; payload?: any };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mode: Mode =
    body.mode === 'markets' ? 'markets' : body.mode === 'chain' ? 'chain' : 'alerts';
  const digest =
    mode === 'markets' ? digestMarkets(body.payload)
    : mode === 'chain' ? digestChain(body.payload)
    : digestAlerts(body.payload);

  const keys = getEnvApiKeys();
  let overview: string | null = null;
  let generatedBy: 'gemini' | 'analyst' = 'analyst';

  if (keys.length > 0) {
    overview = await geminiOverview(mode, digest, keys);
    if (overview) generatedBy = 'gemini';
  }
  if (!overview) overview = heuristicOverview(mode, digest);

  return NextResponse.json({
    mode,
    overview,
    highlights: digest.highlights,
    generatedBy,
    generatedAt: new Date().toISOString(),
  });
}
