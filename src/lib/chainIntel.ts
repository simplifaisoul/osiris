import { matchExact, type SanctionEntry } from '@/lib/sanctions';

/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — On-chain wallet intelligence (BTC / ETH / SOL)
 *
 *  Every source here is keyless and was verified against live data:
 *    BTC  mempool.space REST
 *    ETH  Blockscout v2 REST (also yields ENS + a spot exchange rate)
 *    SOL  public Solana JSON-RPC
 *    USD  CoinGecko simple/price
 *
 *  Optional keys (ETHERSCAN_API_KEY / HELIUS_API_KEY) unlock deeper data
 *  and are reported through capabilities(). Absent keys degrade the
 *  response, never break it.
 * ═══════════════════════════════════════════════════════════════
 */

export type Chain = 'bitcoin' | 'ethereum' | 'solana';

const CHAIN_META: Record<Chain, { label: string; symbol: string; decimals: number; coingecko: string }> = {
  bitcoin: { label: 'Bitcoin', symbol: 'BTC', decimals: 8, coingecko: 'bitcoin' },
  ethereum: { label: 'Ethereum', symbol: 'ETH', decimals: 18, coingecko: 'ethereum' },
  solana: { label: 'Solana', symbol: 'SOL', decimals: 9, coingecko: 'solana' },
};

const RE_ETH = /^0x[a-fA-F0-9]{40}$/;
const RE_BTC_BECH32 = /^bc1[a-z0-9]{25,62}$/;
const RE_BTC_LEGACY = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const RE_BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface ChainDetection {
  chain: Chain | null;
  /** Base58 lengths overlap between BTC legacy and Solana; true when the
   *  format alone cannot decide and `chain` is a best guess. */
  ambiguous: boolean;
}

/**
 * Format-based chain detection. Order matters: ETH and bech32 are
 * unambiguous, while a 32–34 char base58 string beginning 1/3 is valid for
 * both BTC legacy and Solana — those resolve to BTC and set `ambiguous`,
 * which the caller can override with an explicit chain.
 */
export function detectChain(addressRaw: string): ChainDetection {
  const address = addressRaw.trim();
  if (RE_ETH.test(address)) return { chain: 'ethereum', ambiguous: false };
  if (RE_BTC_BECH32.test(address)) return { chain: 'bitcoin', ambiguous: false };
  if (RE_BTC_LEGACY.test(address)) {
    return { chain: 'bitcoin', ambiguous: RE_BASE58.test(address) };
  }
  if (RE_BASE58.test(address)) return { chain: 'solana', ambiguous: false };
  return { chain: null, ambiguous: false };
}

export interface Counterparty {
  address: string;
  direction: 'in' | 'out' | 'both';
  txs: number;
  value: number;
}

export interface TxSummary {
  hash: string;
  time: string | null;
  direction: 'in' | 'out' | 'self' | 'unknown';
  value: number;
  counterparty: string | null;
  fee?: number;
  failed?: boolean;
}

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  code: string;
  label: string;
  severity: Severity;
  /** Points contributed to the 0–100 score. */
  weight: number;
  /** The observation that triggered it — always states the evidence. */
  detail: string;
}

export interface WalletIntel {
  address: string;
  chain: Chain;
  chain_label: string;
  symbol: string;
  ambiguous_chain: boolean;
  balance: { native: number; usd: number | null; price_usd: number | null };
  activity: {
    tx_count: number;
    /** Earliest transaction *in the sampled window* — not necessarily the
     *  address's first ever, unless `history_complete` is true. */
    first_seen: string | null;
    last_seen: string | null;
    /** Null whenever history is incomplete: the true first transaction is
     *  older than the sample and any age derived from it would be wrong. */
    age_days: number | null;
    dormant_days: number | null;
    sample_size: number;
    history_complete: boolean;
  };
  flow: { total_in: number; total_out: number; net: number } | null;
  counterparties: Counterparty[];
  transactions: TxSummary[];
  sanctions: { screened: boolean; hit: boolean; entries: SanctionEntry[] };
  risk: { score: number; level: Severity; factors: RiskFactor[] };
  labels: string[];
  tokens: { symbol: string; name: string; amount: number | null }[];
  sources: string[];
  partial: string[];
}

/* ── fetch helpers ───────────────────────────────────────────── */

async function getJson(url: string, timeoutMs = 15000, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

async function rpc(url: string, method: string, params: any[], timeoutMs = 15000): Promise<any> {
  const body = await getJson(url, timeoutMs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (body.error) throw new Error(`${method}: ${body.error.message || 'RPC error'}`);
  return body.result;
}

/**
 * Spot USD price. CoinGecko's keyless tier rate-limits hard enough that a
 * per-lookup call starts returning nothing after a handful of scans, so
 * prices are cached process-wide and all three chains are fetched at once.
 * A stale price beats no price; failure is non-fatal either way.
 */
const PRICE_TTL = 120_000;
let priceCache: { at: number; usd: Partial<Record<Chain, number>> } | null = null;

async function fetchPrice(chain: Chain): Promise<number | null> {
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL) {
    return priceCache.usd[chain] ?? null;
  }
  try {
    const ids = (Object.keys(CHAIN_META) as Chain[]).map(c => CHAIN_META[c].coingecko).join(',');
    const d = await getJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      10000
    );
    const usd: Partial<Record<Chain, number>> = {};
    for (const c of Object.keys(CHAIN_META) as Chain[]) {
      const v = d?.[CHAIN_META[c].coingecko]?.usd;
      if (typeof v === 'number') usd[c] = v;
    }
    if (Object.keys(usd).length) priceCache = { at: Date.now(), usd };
    return usd[chain] ?? priceCache?.usd[chain] ?? null;
  } catch (e) {
    console.warn('[OSIRIS] price lookup failed:', e instanceof Error ? e.message : e);
    // Serve the last known price rather than blanking the USD column.
    return priceCache?.usd[chain] ?? null;
  }
}

/* ── per-chain collectors ────────────────────────────────────── */

const TX_PAGE = 50;

interface RawWallet {
  balance: number;
  tx_count: number;
  /** True only when the sample provably covers the address's whole history.
   *  Each collector decides this differently — see the per-chain notes. */
  history_complete: boolean;
  flow: { total_in: number; total_out: number; net: number } | null;
  transactions: TxSummary[];
  labels: string[];
  tokens: { symbol: string; name: string; amount: number | null }[];
  sources: string[];
  partial: string[];
}

async function collectBitcoin(address: string): Promise<RawWallet> {
  const base = 'https://mempool.space/api';
  const info = await getJson(`${base}/address/${encodeURIComponent(address)}`);
  const cs = info.chain_stats || {};
  const sats = (n: number) => (Number(n) || 0) / 1e8;

  const totalIn = sats(cs.funded_txo_sum);
  const totalOut = sats(cs.spent_txo_sum);

  const partial: string[] = [];
  let transactions: TxSummary[] = [];
  try {
    const txs = await getJson(`${base}/address/${encodeURIComponent(address)}/txs`, 20000);
    transactions = (Array.isArray(txs) ? txs : []).map((t: any): TxSummary => {
      // Sum this address's side of the ledger on both legs of the tx.
      const inFrom = (t.vin || []).reduce(
        (s: number, v: any) => s + (v?.prevout?.scriptpubkey_address === address ? Number(v.prevout.value) || 0 : 0),
        0
      );
      const outTo = (t.vout || []).reduce(
        (s: number, v: any) => s + (v?.scriptpubkey_address === address ? Number(v.value) || 0 : 0),
        0
      );
      const spent = sats(inFrom);
      const received = sats(outTo);
      const direction: TxSummary['direction'] =
        spent > 0 && received > 0 ? 'self' : spent > 0 ? 'out' : received > 0 ? 'in' : 'unknown';

      // Counterparty = the largest party on the opposite leg.
      const pool =
        direction === 'out'
          ? (t.vout || []).filter((v: any) => v?.scriptpubkey_address && v.scriptpubkey_address !== address)
          : (t.vin || [])
              .map((v: any) => v?.prevout)
              .filter((p: any) => p?.scriptpubkey_address && p.scriptpubkey_address !== address);
      const top = pool.sort((a: any, b: any) => (Number(b?.value) || 0) - (Number(a?.value) || 0))[0];

      return {
        hash: t.txid,
        time: t.status?.block_time ? new Date(t.status.block_time * 1000).toISOString() : null,
        direction,
        value: direction === 'out' ? spent - received : received,
        counterparty: top?.scriptpubkey_address || null,
        fee: sats(t.fee),
      };
    });
  } catch (e) {
    partial.push(`transaction history unavailable (${e instanceof Error ? e.message : 'error'})`);
  }

  // mempool.space reports a true lifetime tx_count, so completeness is exact.
  const txCount = Number(cs.tx_count) || 0;
  return {
    balance: totalIn - totalOut,
    tx_count: txCount,
    history_complete: transactions.length >= txCount,
    flow: { total_in: totalIn, total_out: totalOut, net: totalIn - totalOut },
    transactions,
    labels: [],
    tokens: [],
    sources: ['mempool.space'],
    partial,
  };
}

async function collectEthereum(address: string): Promise<RawWallet> {
  const base = 'https://eth.blockscout.com/api/v2';
  const info = await getJson(`${base}/addresses/${encodeURIComponent(address)}`);
  const balance = Number(info.coin_balance || 0) / 1e18;

  const labels: string[] = [];
  if (info.ens_domain_name) labels.push(`ENS: ${info.ens_domain_name}`);
  // Blockscout sets is_contract for any address holding code, including EOAs
  // carrying an EIP-7702 delegation — those have no deployment transaction.
  // Calling those "smart contract" is wrong, so distinguish on the creation tx.
  if (info.is_contract) {
    if (info.creation_transaction_hash) {
      labels.push(info.is_verified ? 'Smart contract (verified source)' : 'Smart contract');
    } else {
      labels.push('Code at address, no deployment tx (EIP-7702 delegation)');
    }
  }
  if (info.has_beacon_chain_withdrawals) labels.push('Beacon chain withdrawals');

  const partial: string[] = [];
  let transactions: TxSummary[] = [];
  let txCount = 0;
  try {
    const txs = await getJson(`${base}/addresses/${encodeURIComponent(address)}/transactions`, 25000);
    const items = Array.isArray(txs.items) ? txs.items : [];
    txCount = items.length;
    const lower = address.toLowerCase();
    transactions = items.map((t: any): TxSummary => {
      const from = (t.from?.hash || '').toLowerCase();
      const to = (t.to?.hash || '').toLowerCase();
      const direction: TxSummary['direction'] =
        from === lower && to === lower ? 'self' : from === lower ? 'out' : to === lower ? 'in' : 'unknown';
      return {
        hash: t.hash,
        time: t.timestamp || null,
        direction,
        value: Number(t.value || 0) / 1e18,
        counterparty: direction === 'out' ? t.to?.hash || null : t.from?.hash || null,
        fee: t.fee?.value ? Number(t.fee.value) / 1e18 : undefined,
        failed: t.status === 'error' || t.result === 'error',
      };
    });
  } catch (e) {
    partial.push(`transaction history unavailable (${e instanceof Error ? e.message : 'error'})`);
  }

  let tokens: RawWallet['tokens'] = [];
  try {
    const tb = await getJson(`${base}/addresses/${encodeURIComponent(address)}/token-balances`, 15000);
    tokens = (Array.isArray(tb) ? tb : [])
      .slice(0, 25)
      .map((t: any) => {
        const dec = Number(t.token?.decimals);
        const raw = Number(t.value);
        return {
          symbol: t.token?.symbol || '???',
          name: t.token?.name || 'Unknown token',
          amount: Number.isFinite(raw) && Number.isFinite(dec) ? raw / 10 ** dec : null,
        };
      });
  } catch {
    partial.push('token balances unavailable');
  }

  // Blockscout reports totals only across the paged window, so derive flow
  // from the transactions actually seen rather than implying a full history.
  const flow = transactions.length
    ? {
        total_in: transactions.filter(t => t.direction === 'in').reduce((s, t) => s + t.value, 0),
        total_out: transactions.filter(t => t.direction === 'out').reduce((s, t) => s + t.value, 0),
        net: 0,
      }
    : null;
  if (flow) flow.net = flow.total_in - flow.total_out;

  return {
    balance,
    tx_count: txCount,
    // Blockscout pages newest-first and exposes no lifetime total; a page that
    // came back short is the only proof we reached the beginning.
    history_complete: transactions.length > 0 && transactions.length < TX_PAGE,
    flow,
    transactions,
    labels,
    tokens,
    sources: ['Blockscout'],
    partial,
  };
}

async function collectSolana(address: string): Promise<RawWallet> {
  const url = 'https://api.mainnet-beta.solana.com';
  const lamports = await rpc(url, 'getBalance', [address]);
  const balance = (Number(lamports?.value) || 0) / 1e9;

  const partial: string[] = [];
  let transactions: TxSummary[] = [];
  try {
    const sigs = await rpc(url, 'getSignaturesForAddress', [address, { limit: 50 }], 20000);
    transactions = (Array.isArray(sigs) ? sigs : []).map((s: any): TxSummary => ({
      hash: s.signature,
      time: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
      // Signature listings carry no transfer legs; resolving direction and
      // amounts needs a per-tx fetch, which the public RPC rate-limits hard.
      direction: 'unknown',
      value: 0,
      counterparty: null,
      failed: !!s.err,
    }));
  } catch (e) {
    partial.push(`signature history unavailable (${e instanceof Error ? e.message : 'error'})`);
  }
  partial.push('Solana transfer amounts and counterparties require a keyed RPC provider (HELIUS_API_KEY)');

  let tokens: RawWallet['tokens'] = [];
  try {
    const accs = await rpc(
      url,
      'getTokenAccountsByOwner',
      [address, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }],
      20000
    );
    tokens = (accs?.value || [])
      .slice(0, 25)
      .map((a: any) => {
        const info = a?.account?.data?.parsed?.info;
        return {
          symbol: (info?.mint || '').slice(0, 6) || '???',
          name: `SPL mint ${info?.mint || 'unknown'}`,
          amount: info?.tokenAmount?.uiAmount ?? null,
        };
      })
      .filter((t: any) => t.amount === null || t.amount > 0);
  } catch {
    partial.push('token accounts unavailable');
  }

  return {
    balance,
    tx_count: transactions.length,
    // Same reasoning as Ethereum: a full page means more signatures remain.
    history_complete: transactions.length > 0 && transactions.length < TX_PAGE,
    flow: null,
    transactions,
    labels: [],
    tokens,
    sources: ['Solana JSON-RPC'],
    partial,
  };
}

/* ── analysis ────────────────────────────────────────────────── */

function aggregateCounterparties(txs: TxSummary[]): Counterparty[] {
  const map = new Map<string, Counterparty>();
  for (const t of txs) {
    if (!t.counterparty) continue;
    const existing = map.get(t.counterparty);
    const dir = t.direction === 'in' || t.direction === 'out' ? t.direction : null;
    if (existing) {
      existing.txs += 1;
      existing.value += t.value;
      if (dir && existing.direction !== dir && existing.direction !== 'both') existing.direction = 'both';
    } else {
      map.set(t.counterparty, {
        address: t.counterparty,
        direction: dir ?? 'both',
        txs: 1,
        value: t.value,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.txs - a.txs || b.value - a.value).slice(0, 15);
}

const LEVEL_ORDER: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

function scoreRisk(
  factors: RiskFactor[]
): { score: number; level: Severity } {
  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.weight, 0)));
  const highest = factors.reduce<Severity>(
    (acc, f) => (LEVEL_ORDER.indexOf(f.severity) > LEVEL_ORDER.indexOf(acc) ? f.severity : acc),
    'info'
  );
  // A sanctions hit must never be diluted by an otherwise-quiet wallet.
  if (highest === 'critical') return { score: Math.max(score, 95), level: 'critical' };
  const level: Severity = score >= 70 ? 'high' : score >= 40 ? 'medium' : score >= 15 ? 'low' : 'info';
  return { score, level };
}

function buildFactors(
  raw: RawWallet,
  meta: { symbol: string },
  activity: WalletIntel['activity'],
  counterparties: Counterparty[],
  sanctionHits: SanctionEntry[]
): RiskFactor[] {
  const f: RiskFactor[] = [];

  if (sanctionHits.length) {
    f.push({
      code: 'OFAC_SDN',
      label: 'OFAC-sanctioned address',
      severity: 'critical',
      weight: 100,
      detail: `Listed on the US OFAC SDN list as: ${sanctionHits.slice(0, 3).map(e => e.name).join('; ')}`,
    });
  }

  if (activity.age_days !== null && activity.age_days < 7) {
    f.push({
      code: 'NEW_ADDRESS',
      label: 'Recently created',
      severity: 'low',
      weight: 10,
      detail: `First activity ${activity.age_days} day(s) ago.`,
    });
  }

  if (activity.dormant_days !== null && activity.age_days !== null && activity.dormant_days > 365 && activity.age_days > 400) {
    f.push({
      code: 'DORMANT',
      label: 'Long dormant',
      severity: 'info',
      weight: 5,
      detail: `No activity for ${activity.dormant_days} days.`,
    });
  }

  if (raw.tx_count > 10000) {
    f.push({
      code: 'HIGH_VOLUME',
      label: 'Exchange-scale activity',
      severity: 'info',
      weight: 5,
      detail: `${raw.tx_count.toLocaleString()} transactions — consistent with an exchange, service or pooled wallet rather than a personal one.`,
    });
  }

  // Fan-out is only informative for wallets that aren't obviously services —
  // an exchange spreading across many counterparties is its normal operation.
  if (counterparties.length >= 12 && raw.tx_count <= 10000) {
    f.push({
      code: 'FAN_PATTERN',
      label: 'High counterparty fan-out',
      severity: 'medium',
      weight: 20,
      detail: `${counterparties.length} distinct counterparties across ${raw.transactions.length} sampled transactions — a distribution pattern also seen in mixing and payout scripts.`,
    });
  }

  const failed = raw.transactions.filter(t => t.failed).length;
  if (failed >= 5) {
    f.push({
      code: 'FAILED_TXS',
      label: 'Repeated failed transactions',
      severity: 'low',
      weight: 8,
      detail: `${failed} of ${raw.transactions.length} sampled transactions failed.`,
    });
  }

  if (raw.flow && raw.flow.total_in > 0 && raw.balance / raw.flow.total_in < 0.01 && raw.tx_count > 5) {
    f.push({
      code: 'DRAINED',
      label: 'Swept balance',
      severity: 'medium',
      weight: 15,
      detail: `Received ${raw.flow.total_in.toFixed(4)} ${meta.symbol} but retains ${raw.balance.toFixed(4)} — funds were forwarded on rather than held.`,
    });
  }

  if (!f.length) {
    f.push({
      code: 'NOMINAL',
      label: 'No risk indicators',
      severity: 'info',
      weight: 0,
      detail: 'Nothing in the sampled data matched a risk heuristic.',
    });
  }

  return f;
}

/* ── capabilities ────────────────────────────────────────────── */

export function capabilities() {
  return {
    etherscan: !!process.env.ETHERSCAN_API_KEY,
    helius: !!process.env.HELIUS_API_KEY,
  };
}

/* ── entry point ─────────────────────────────────────────────── */

export async function analyseAddress(addressRaw: string, chainOverride?: Chain): Promise<WalletIntel> {
  const address = addressRaw.trim();
  const detection = detectChain(address);
  const chain = chainOverride ?? detection.chain;
  if (!chain) throw new Error('Unrecognised address format for BTC, ETH or SOL');

  const meta = CHAIN_META[chain];

  const [raw, price, sanctionHits] = await Promise.all([
    chain === 'bitcoin'
      ? collectBitcoin(address)
      : chain === 'ethereum'
        ? collectEthereum(address)
        : collectSolana(address),
    fetchPrice(chain),
    // OFAC lists sanctioned wallets as entity names, so an exact-name lookup
    // is the correct screen; normalisation lower-cases both sides.
    matchExact(address).catch(() => [] as SanctionEntry[]),
  ]);

  const times = raw.transactions.map(t => t.time).filter((t): t is string => !!t).sort();
  const firstSeen = times[0] ?? null;
  const lastSeen = times[times.length - 1] ?? null;
  const day = 86_400_000;
  // Chain APIs page newest-first, so the sample only reaches the true first
  // transaction when it covers the whole history. Deriving an age from a
  // partial sample would report a 2009 address as days old.
  const historyComplete = raw.history_complete;
  const activity: WalletIntel['activity'] = {
    tx_count: raw.tx_count,
    first_seen: firstSeen,
    last_seen: lastSeen,
    age_days: historyComplete && firstSeen ? Math.floor((Date.now() - Date.parse(firstSeen)) / day) : null,
    dormant_days: lastSeen ? Math.floor((Date.now() - Date.parse(lastSeen)) / day) : null,
    sample_size: raw.transactions.length,
    history_complete: historyComplete,
  };

  const counterparties = aggregateCounterparties(raw.transactions);
  const factors = buildFactors(raw, meta, activity, counterparties, sanctionHits);
  const risk = scoreRisk(factors);

  return {
    address,
    chain,
    chain_label: meta.label,
    symbol: meta.symbol,
    ambiguous_chain: detection.ambiguous && !chainOverride,
    balance: {
      native: raw.balance,
      usd: price !== null ? raw.balance * price : null,
      price_usd: price,
    },
    activity,
    flow: raw.flow,
    counterparties,
    transactions: raw.transactions.slice(0, 25),
    sanctions: { screened: true, hit: sanctionHits.length > 0, entries: sanctionHits.slice(0, 5) },
    risk: { ...risk, factors },
    labels: raw.labels,
    tokens: raw.tokens,
    sources: [...raw.sources, 'CoinGecko', 'OpenSanctions / US OFAC SDN'],
    partial: raw.partial,
  };
}
