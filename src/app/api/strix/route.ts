import { NextResponse } from 'next/server';
import { validateHost, isRateLimited, getClientIp } from '@/lib/ssrf-guard';

/**
 * OSIRIS — Strix Proxy (autonomous pentesting)
 *
 * Proxies to a private, self-hosted Strix backend (see strix-backend/), the same
 * way /api/scanner proxies to the RECON scanner backend. This feature is:
 *   • OFF by default — returns 503 unless STRIX_URL + STRIX_KEY + OPERATOR_KEY
 *     are all set, so a public/anonymous deployment never exposes it.
 *   • Operator-gated — the caller must present `x-operator-key: OPERATOR_KEY`,
 *     so anonymous users of a public demo cannot reach it even if envs leak.
 *   • Target-guarded — reuses the SSRF guard to block internal/metadata targets
 *     by default (STRIX_ALLOW_INTERNAL=1 to permit your own internal assets).
 *
 * Strix actively exploits vulnerabilities. Only test targets you own or are
 * authorized to test. See SECURITY.md.
 */

const STRIX_URL = process.env.STRIX_URL || '';
const STRIX_KEY = process.env.STRIX_KEY || '';
const OPERATOR_KEY = process.env.OPERATOR_KEY || '';
const ALLOW_INTERNAL = process.env.STRIX_ALLOW_INTERNAL === '1';

const VALID_MODES = new Set(['quick', 'standard']);

export function isConfigured(): boolean {
  return Boolean(STRIX_URL && STRIX_KEY && OPERATOR_KEY);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Pull a network hostname out of a Strix target for SSRF validation. Handles
// full URLs (http://host:port/path), bracketed IPv6, and bare host/IP strings.
// Returns null for non-network targets (e.g. a local directory path), which
// carry no SSRF risk against a third party.
function extractHost(target: string): string | null {
  try {
    const u = new URL(target.includes('://') ? target : `http://${target}`);
    return u.hostname.replace(/^\[|\]$/g, '') || null;
  } catch {
    return null;
  }
}

function requireOperator(req: Request): NextResponse | null {
  const provided = req.headers.get('x-operator-key') || '';
  if (!provided || !timingSafeEqual(provided, OPERATOR_KEY)) {
    return NextResponse.json({ error: 'Unauthorized', detail: 'Valid operator key required.' }, { status: 401 });
  }
  return null;
}

// GET — configuration probe. Returns whether the feature is available so the UI
// can hide itself entirely on deployments where it isn't set up. Never leaks keys.
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ ok: false, configured: false, error: 'Strix not configured' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, configured: true, allow_internal: ALLOW_INTERNAL });
}

// POST — start a pentest job. Operator-authenticated, rate-limited, target-guarded.
export async function POST(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'Strix not configured', hint: 'Set STRIX_URL, STRIX_KEY and OPERATOR_KEY in .env' },
      { status: 503 },
    );
  }

  const authError = requireOperator(req);
  if (authError) return authError;

  const clientIp = getClientIp(req);
  if (isRateLimited(`strix:${clientIp}`, 3, 60_000)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', detail: 'Maximum 3 pentest launches per minute.' },
      { status: 429 },
    );
  }

  let body: { target?: string; mode?: string; instruction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const target = (body.target || '').trim();
  const mode = (body.mode || 'quick').trim().toLowerCase();
  const instruction = typeof body.instruction === 'string' ? body.instruction.slice(0, 8000) : undefined;

  if (!target) {
    return NextResponse.json({ error: 'Missing target' }, { status: 400 });
  }
  if (!VALID_MODES.has(mode)) {
    return NextResponse.json({ error: 'Invalid mode', detail: 'mode must be "quick" or "standard".' }, { status: 400 });
  }

  // Block internal/RFC1918/cloud-metadata targets unless explicitly allowed.
  // Strix targets are typically URLs (http://host/…) or GitHub repo URLs, but
  // the SSRF guard validates a bare host — so extract the hostname first. A
  // non-network target (e.g. a local directory path) has no host to guard.
  if (!ALLOW_INTERNAL) {
    const host = extractHost(target);
    if (host) {
      const guard = await validateHost(host);
      if (!guard.ok) {
        return NextResponse.json(
          { error: 'Target blocked', detail: `Target validation failed: ${guard.reason}. Set STRIX_ALLOW_INTERNAL=1 to test your own internal assets.` },
          { status: 403 },
        );
      }
    }
  }

  try {
    const res = await fetch(`${STRIX_URL}/pentest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OSIRIS-KEY': STRIX_KEY },
      body: JSON.stringify({ target, mode, instruction }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: 'Strix backend unreachable', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
