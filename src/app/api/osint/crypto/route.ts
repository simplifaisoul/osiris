import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';
import { analyseAddress, capabilities, detectChain, type Chain } from '@/lib/chainIntel';

/**
 * OSIRIS — On-chain wallet intelligence.
 *
 * Takes a BTC, ETH or SOL address and returns balance, activity profile,
 * counterparty breakdown, OFAC screening and a transparent risk score.
 * All baseline sources are keyless; ETHERSCAN_API_KEY / HELIUS_API_KEY
 * deepen the result and are reported via `?probe=1`.
 */

export const maxDuration = 60;

const CHAINS: Chain[] = ['bitcoin', 'ethereum', 'solana'];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Capability probe — lets the UI decide what to offer without an upstream call.
  if (searchParams.get('probe') === '1') {
    return NextResponse.json({ configured: true, ...capabilities() });
  }

  const address = (searchParams.get('address') || '').trim();
  if (!address) {
    return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 });
  }
  if (address.length > 128) {
    return NextResponse.json({ error: 'Address too long' }, { status: 400 });
  }

  const chainParam = searchParams.get('chain');
  if (chainParam && !CHAINS.includes(chainParam as Chain)) {
    return NextResponse.json(
      { error: `Invalid chain. Allowed: ${CHAINS.join(', ')}` },
      { status: 400 }
    );
  }

  if (!chainParam && !detectChain(address).chain) {
    return NextResponse.json(
      { error: 'Unrecognised address format. Expected a Bitcoin, Ethereum or Solana address.' },
      { status: 400 }
    );
  }

  if (isRateLimited(getClientIp(req), 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const intel = await analyseAddress(address, (chainParam as Chain) || undefined);
    return NextResponse.json(
      { ...intel, capabilities: capabilities(), timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    );
  } catch (e) {
    console.error('[OSIRIS] crypto intel failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Wallet lookup failed' },
      { status: 502 }
    );
  }
}
