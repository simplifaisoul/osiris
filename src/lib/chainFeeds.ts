import { allEntries, type SanctionEntry } from '@/lib/sanctions';

/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — Daily chain-threat brief
 *
 *  Three independent keyless feeds, each verified against live data:
 *    exploits   DefiLlama /hacks       — dated on-chain incidents + losses
 *    cves       NVD 2.0 keyword+range  — crypto/blockchain vulnerabilities
 *    sanctions  OpenSanctions OFAC SDN — designated wallet addresses
 *
 *  Sections degrade independently: one dead upstream must never blank the
 *  brief, so every collector resolves to an empty section plus a stated
 *  reason rather than rejecting.
 * ═══════════════════════════════════════════════════════════════
 */

export interface Exploit {
  name: string;
  date: string;
  amount_usd: number | null;
  chain: string;
  classification: string;
  technique: string;
  target_type: string;
  bridge_hack: boolean;
  returned_funds: number | null;
  source: string | null;
}

export interface CveItem {
  id: string;
  published: string;
  cvss: number | null;
  severity: string | null;
  description: string;
  matched: string;
  url: string;
}

export interface SanctionedWallet {
  address: string;
  asset: 'BTC' | 'ETH' | 'XMR' | 'TRX' | 'OTHER';
  entity: string;
  programs: string[];
  first_seen: string | null;
}

export interface DailyBrief {
  generated_at: string;
  window_days: number;
  exploits: Exploit[];
  cves: CveItem[];
  sanctioned_wallets: SanctionedWallet[];
  totals: {
    exploit_count: number;
    exploit_losses_usd: number;
    cve_count: number;
    critical_cves: number;
    sanctioned_wallet_count: number;
  };
  /** Sections that failed or are incomplete, with the reason. */
  degraded: string[];
  sources: string[];
}

/* ── cache ───────────────────────────────────────────────────── */

/** The underlying feeds move on a daily cadence; NVD also rate-limits
 *  keyless callers hard, so anything shorter than this is wasted work. */
const TTL = 30 * 60_000;
/** A brief that lost a source is cached only briefly, so one flaky minute
 *  cannot leave the panel showing an empty day for the next half hour. */
const DEGRADED_TTL = 90_000;
let cache: { at: number; days: number; brief: DailyBrief } | null = null;

/* ── collectors ──────────────────────────────────────────────── */

async function getJson(url: string, timeoutMs = 20000): Promise<any> {
  // Outbound connections here intermittently hit UND_ERR_CONNECT_TIMEOUT on a
  // long-lived server even while the network is healthy. One retry on a fresh
  // connection clears it; without it a blip blanks a whole section.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
      return await res.json();
    } catch (e) {
      lastError = e;
      if (attempt === 0) await new Promise(r => setTimeout(r, 750));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('request failed');
}

async function collectExploits(days: number): Promise<{ items: Exploit[]; degraded: string[] }> {
  try {
    const raw = await getJson('https://api.llama.fi/hacks', 25000);
    const list: any[] = Array.isArray(raw) ? raw : raw?.hacks || [];
    const cutoff = Date.now() - days * 864e5;

    const items = list
      // DefiLlama dates are unix seconds.
      .filter(h => typeof h?.date === 'number' && h.date * 1000 >= cutoff)
      .sort((a, b) => b.date - a.date)
      .map((h): Exploit => ({
        name: String(h.name || 'Unnamed incident'),
        date: new Date(h.date * 1000).toISOString(),
        amount_usd: typeof h.amount === 'number' ? h.amount : null,
        chain: Array.isArray(h.chain) ? h.chain.join(', ') : String(h.chain || 'unknown'),
        classification: String(h.classification || 'Unclassified'),
        technique: String(h.technique || 'Unspecified'),
        target_type: String(h.targetType || 'unknown'),
        bridge_hack: !!h.bridgeHack,
        returned_funds: typeof h.returnedFunds === 'number' ? h.returnedFunds : null,
        source: typeof h.source === 'string' ? h.source : null,
      }));

    return { items, degraded: [] };
  } catch (e) {
    return { items: [], degraded: [`Exploit feed unavailable (${e instanceof Error ? e.message : 'error'})`] };
  }
}

/** Terms that surface crypto-relevant CVEs in NVD's full-text index. */
const CVE_KEYWORDS = ['blockchain', 'cryptocurrency', 'wallet', 'smart contract'];

async function collectCves(days: number): Promise<{ items: CveItem[]; degraded: string[] }> {
  const iso = (d: Date) => `${d.toISOString().slice(0, 19)}.000`;
  // NVD caps a single query at a 120-day publication window.
  const span = Math.min(days, 119);
  const start = iso(new Date(Date.now() - span * 864e5));
  const end = iso(new Date());

  const byId = new Map<string, CveItem>();
  const degraded: string[] = [];

  for (const kw of CVE_KEYWORDS) {
    try {
      const url =
        `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(kw)}` +
        `&pubStartDate=${encodeURIComponent(start)}&pubEndDate=${encodeURIComponent(end)}&resultsPerPage=40`;
      const d = await getJson(url, 25000);

      for (const v of d?.vulnerabilities || []) {
        const c = v?.cve;
        if (!c?.id || byId.has(c.id)) continue;
        const m =
          c.metrics?.cvssMetricV31?.[0] || c.metrics?.cvssMetricV30?.[0] || c.metrics?.cvssMetricV2?.[0];
        byId.set(c.id, {
          id: c.id,
          published: c.published || '',
          cvss: typeof m?.cvssData?.baseScore === 'number' ? m.cvssData.baseScore : null,
          severity: m?.cvssData?.baseSeverity || m?.baseSeverity || null,
          description: ((c.descriptions || []).find((x: any) => x.lang === 'en')?.value || '').slice(0, 400),
          matched: kw,
          url: `https://nvd.nist.gov/vuln/detail/${c.id}`,
        });
      }
      // Keyless NVD allows ~5 requests / 30s; space them out.
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      degraded.push(`CVE term "${kw}" unavailable (${e instanceof Error ? e.message : 'error'})`);
    }
  }

  const items = [...byId.values()].sort(
    (a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0)
  );
  return { items, degraded };
}

/** Address shapes used to classify a designated wallet by asset. */
const ASSET_PATTERNS: [SanctionedWallet['asset'], RegExp][] = [
  ['ETH', /^0x[a-fA-F0-9]{40}$/],
  ['BTC', /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/],
  ['XMR', /^4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}$/],
  ['TRX', /^T[1-9A-HJ-NP-Za-km-z]{33}$/],
];

function classifyAsset(name: string): SanctionedWallet['asset'] | null {
  for (const [asset, re] of ASSET_PATTERNS) if (re.test(name)) return asset;
  return null;
}

/**
 * OFAC designates crypto wallets as standalone entries whose *name* is the
 * address itself, so scanning names by address shape is the correct filter.
 */
async function collectSanctionedWallets(days: number): Promise<{ items: SanctionedWallet[]; degraded: string[] }> {
  try {
    const entries = await allEntries();
    const cutoff = Date.now() - days * 864e5;
    const items: SanctionedWallet[] = [];

    for (const e of entries as SanctionEntry[]) {
      const asset = classifyAsset(e.name);
      if (!asset) continue;
      const seen = e.first_seen ? Date.parse(e.first_seen) : NaN;
      if (Number.isFinite(seen) && seen < cutoff) continue;
      items.push({
        address: e.name,
        asset,
        entity: e.aliases[0] || e.sanctions || 'OFAC SDN designation',
        programs: e.programs,
        first_seen: e.first_seen ?? null,
      });
    }

    items.sort((a, b) => (Date.parse(b.first_seen || '') || 0) - (Date.parse(a.first_seen || '') || 0));
    return { items, degraded: [] };
  } catch (e) {
    return { items: [], degraded: [`Sanctions list unavailable (${e instanceof Error ? e.message : 'error'})`] };
  }
}

/* ── entry point ─────────────────────────────────────────────── */

export async function buildDailyBrief(days = 30, force = false): Promise<DailyBrief> {
  if (!force && cache && cache.days === days) {
    const ttl = cache.brief.degraded.length ? DEGRADED_TTL : TTL;
    if (Date.now() - cache.at < ttl) return cache.brief;
  }

  // Deliberately sequential. The result is cached for TTL, so total latency
  // barely matters, and firing six concurrent connections alongside the app's
  // existing feed polling is enough to exhaust the connection pool — outbound
  // connects then time out and whole sections drop out of the brief.
  const ex = await collectExploits(days);
  const cve = await collectCves(days);
  const sanc = await collectSanctionedWallets(days);

  const brief: DailyBrief = {
    generated_at: new Date().toISOString(),
    window_days: days,
    exploits: ex.items.slice(0, 40),
    cves: cve.items.slice(0, 40),
    sanctioned_wallets: sanc.items.slice(0, 40),
    totals: {
      exploit_count: ex.items.length,
      exploit_losses_usd: ex.items.reduce((s, e) => s + (e.amount_usd || 0), 0),
      cve_count: cve.items.length,
      critical_cves: cve.items.filter(c => (c.cvss ?? 0) >= 9).length,
      sanctioned_wallet_count: sanc.items.length,
    },
    degraded: [...ex.degraded, ...cve.degraded, ...sanc.degraded],
    sources: ['DefiLlama', 'NVD (NIST)', 'OpenSanctions / US OFAC SDN'],
  };

  cache = { at: Date.now(), days, brief };
  return brief;
}
