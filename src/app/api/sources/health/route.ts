import { NextResponse } from 'next/server';
import { sourceRegistry, sourceHealth } from '@/lib/sources';
import { buildSourceHealthReport, type SourceDisplayStatus } from '@/lib/sources/healthReport';

export const dynamic = 'force-dynamic';

/**
 * Osiris — Source health & provenance
 * Enumerates every registered source with its live health status, so the
 * SOURCES panel can show what's up, degraded, down, or disabled.
 */

const EMPTY_SUMMARY: Record<SourceDisplayStatus, number> = {
  ok: 0, degraded: 0, down: 0, unknown: 0, disabled: 0,
};

export async function GET() {
  const sources = buildSourceHealthReport(
    sourceRegistry.listAll(),
    (id) => sourceHealth.get(id),
  );

  const summary = { ...EMPTY_SUMMARY };
  for (const s of sources) summary[s.status] += 1;

  return NextResponse.json({
    sources,
    total: sources.length,
    summary,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
