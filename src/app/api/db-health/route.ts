import { NextResponse } from 'next/server';
import { prisma, dbEnabled } from '@/lib/db';

/**
 * OSIRIS — Database health (Neon)
 *
 * Lightweight liveness probe for the Neon Postgres connection.
 *
 *  • 200 → DB configured AND a round-trip query succeeded.
 *  • 200 (disabled) → DB not configured (no DATABASE_URL); app is running
 *      keyless, which is a valid state — reported as `status: "disabled"`.
 *  • 503 → DB is configured but the round-trip failed (wrong URL, Neon
 *      branch paused, network, etc.) — returns the error message.
 *
 * Vercel: keep this under maxDuration. A `$queryRaw` SELECT 1 over Neon's
 * HTTP driver is a single short HTTPS call, well within limits.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  if (!dbEnabled() || !prisma) {
    return NextResponse.json({
      status: 'disabled',
      database: 'neon',
      message: 'DATABASE_URL not set — running keyless (DB features no-op).',
    }, { status: 200 });
  }

  try {
    const result = await prisma.$queryRaw<[{ ok: number }]>`SELECT 1 AS ok`;
    const ok = Array.isArray(result) && result[0]?.ok === 1;
    if (!ok) throw new Error('Unexpected probe result');

    const count = await prisma.scanRecord.count().catch(() => null);

    return NextResponse.json({
      status: 'ok',
      database: 'neon',
      latencyOk: true,
      scanRecords: count,
    }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({
      status: 'error',
      database: 'neon',
      error: e?.message ?? String(e),
    }, { status: 503 });
  }
}
