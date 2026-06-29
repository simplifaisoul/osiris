import { NextResponse } from 'next/server';
import { validateHost, isRateLimited, getClientIp } from '@/lib/ssrf-guard';
import { prisma } from '@/lib/db';

/**
 * OSIRIS — Scanner Proxy (Hardened)
 * Rate-limited, target-validated, scope-restricted
 *
 * When a Neon DATABASE_URL is configured, every scan outcome is persisted to
 * the `scan_records` table (best-effort, never blocks/fails the scan). If the
 * DB is not configured, logging silently no-ops and scanning works as before.
 */

const SCANNER_URL = process.env.SCANNER_URL || '';
const SCANNER_KEY = process.env.SCANNER_KEY || '';

// The string-based regex previously here matched only literal dotted-quad
// IPv4, missed every IPv6 form, and never resolved hostnames — so an attacker
// could bypass it with `target=metadata.example.com` (DNS A → 169.254.169.254),
// `target=2130706433` (decimal 127.0.0.1), or `target=::1`. Validation now
// canonicalises the input and resolves hostnames before deciding. See
// `src/lib/ssrf-guard.ts`.

// ── ALLOWED SCAN TYPES (safe subset only) ──
const ALLOWED_SCANS: Record<string, { endpoint: string; timeout: number }> = {
  quick:      { endpoint: '/scan/quick',      timeout: 15000 },
  ssl:        { endpoint: '/scan/ssl',        timeout: 10000 },
  headers:    { endpoint: '/scan/headers',    timeout: 10000 },
  rdns:       { endpoint: '/scan/rdns',       timeout: 8000  },
  subdomains: { endpoint: '/scan/subdomains', timeout: 15000 },
  tech:       { endpoint: '/scan/tech',       timeout: 15000 },
  whois:      { endpoint: '/scan/whois',      timeout: 10000 },
  geoloc:     { endpoint: '/scan/geoloc',     timeout: 8000  },
  vuln:       { endpoint: '/scan/vuln',       timeout: 90000 },
};

// REMOVED from public access: deep, ports, banner, traceroute
// These are dangerous in an unauthenticated context:
//   deep     → scans 65,535 ports (DDoS amplifier)
//   banner   → harvests software versions from targets using our IP
//   traceroute → reveals hosting infrastructure
//   ports    → arbitrary port range scanning

/**
 * Best-effort persistence of a scan outcome to Neon. Awaits the (fast, HTTP)
 * write so it actually completes within the serverless invocation, but wraps
 * everything in try/catch so a DB issue can never alter the scan response.
 */
async function recordScan(opts: {
  target: string;
  scanType: string;
  status: 'success' | 'error' | 'blocked' | 'ratelimited';
  sourceIp?: string;
  httpStatus?: number;
  result?: unknown;
  error?: string;
  durationMs?: number;
}): Promise<void> {
  if (!prisma) return; // DB not configured — no-op
  try {
    await prisma.scanRecord.create({
      data: {
        target: opts.target,
        scanType: opts.scanType,
        status: opts.status,
        sourceIp: opts.sourceIp ?? null,
        httpStatus: opts.httpStatus ?? null,
        result: (opts.result ?? null) as never,
        error: opts.error ?? null,
        durationMs: opts.durationMs ?? null,
      },
    });
  } catch {
    // Never let a DB failure break a scan.
  }
}

export async function GET(req: Request) {
  // 1. Check scanner is configured
  if (!SCANNER_KEY) {
    return NextResponse.json({ error: 'Scanner not configured', hint: 'Set SCANNER_URL and SCANNER_KEY in .env' }, { status: 503 });
  }

  // 2. Rate limit by client IP
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 5, 60_000)) {
    return NextResponse.json({
      error: 'Rate limit exceeded',
      detail: `Maximum 5 scans per minute. Please wait before scanning again.`,
    }, { status: 429 });
  }

  // 3. Validate params
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('target')?.trim();
  const scanType = searchParams.get('type') || 'quick';

  if (!target) {
    return NextResponse.json({ error: 'Missing target parameter' }, { status: 400 });
  }

  // 4. Block private/internal targets (DNS-resolves before deciding so a
  //    hostname pointing at a reserved range is rejected, and IPv6 + non-
  //    canonical IPv4 forms are no longer free bypasses).
  const guard = await validateHost(target);
  if (!guard.ok) {
    await recordScan({
      target,
      scanType,
      status: 'blocked',
      sourceIp: clientIp,
      error: `Target validation failed: ${guard.reason}`,
    });
    return NextResponse.json({
      error: 'Target blocked',
      detail: `Target validation failed: ${guard.reason}`,
    }, { status: 403 });
  }

  // 5. Validate scan type (only safe scans allowed)
  const scanConfig = ALLOWED_SCANS[scanType];
  if (!scanConfig) {
    await recordScan({
      target,
      scanType,
      status: 'blocked',
      sourceIp: clientIp,
      error: `Scan type not available: ${scanType}`,
    });
    return NextResponse.json({
      error: 'Scan type not available',
      detail: `"${scanType}" is restricted. Available: ${Object.keys(ALLOWED_SCANS).join(', ')}`,
      available_scans: Object.keys(ALLOWED_SCANS),
    }, { status: 403 });
  }

  // 6. Execute scan with tight timeout
  const startedAt = Date.now();
  try {
    const params = new URLSearchParams({ key: SCANNER_KEY, target });
    const res = await fetch(`${SCANNER_URL}${scanConfig.endpoint}?${params.toString()}`, {
      signal: AbortSignal.timeout(scanConfig.timeout),
    });
    const data = await res.json();
    await recordScan({
      target,
      scanType,
      status: 'success',
      sourceIp: clientIp,
      httpStatus: res.status,
      result: data,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    await recordScan({
      target,
      scanType,
      status: 'error',
      sourceIp: clientIp,
      error: e?.message ?? String(e),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      error: 'Scanner unreachable',
      detail: e.message,
    }, { status: 502 });
  }
}
