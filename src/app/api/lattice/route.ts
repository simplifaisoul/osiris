import { NextResponse } from 'next/server';
import { configFromEnv, snapshotLattice } from '@/lib/lattice';

export const dynamic = 'force-dynamic';

/**
 * Optional Anduril Lattice entity layer.
 * Default off. Requires LATTICE_ENABLED=1 plus sandbox OAuth env vars.
 * Connector: https://github.com/Polybolos-Institute/osiris-lattice
 * Independent sample, not an Anduril product.
 */

function latticeExplicitlyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.LATTICE_ENABLED?.trim().toLowerCase();
  return flag === '1' || flag === 'true';
}

function isConfigured(): boolean {
  return latticeExplicitlyEnabled() && configFromEnv() !== null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('probe') === '1') {
    return NextResponse.json({
      configured: isConfigured(),
      source: 'Anduril Lattice (optional)',
    });
  }

  if (!isConfigured()) {
    return NextResponse.json(
      {
        type: 'FeatureCollection',
        features: [],
        total_entities: 0,
        connected: false,
        configured: false,
        error: 'Lattice not configured',
        hint: 'Set LATTICE_ENABLED=1 and LATTICE_ENDPOINT / LATTICE_CLIENT_ID / LATTICE_CLIENT_SECRET / LATTICE_ENV_TOKEN',
      },
      { status: 503 },
    );
  }

  const collection = await snapshotLattice({ enabled: true });
  const status = collection.connected ? 200 : 502;
  return NextResponse.json(
    { ...collection, configured: true },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
