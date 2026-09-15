import { getDb } from './client';

const BASELINE_BUCKET_MS = 15 * 60 * 1000; // one snapshot per chokepoint per 15 minutes

/** Best-effort, throttled write — no-ops if a snapshot for this chokepoint
    was already recorded within the current bucket. */
export function insertSnapshot(chokepointId: string, shipCount: number, riskLevel: string): void {
  const db = getDb();
  const last = db
    .prepare('SELECT ts FROM maritime_snapshots WHERE chokepoint_id = ? ORDER BY ts DESC LIMIT 1')
    .get(chokepointId) as { ts: number } | undefined;

  const now = Date.now();
  if (last && now - last.ts < BASELINE_BUCKET_MS) return;

  db.prepare(
    'INSERT INTO maritime_snapshots (chokepoint_id, ts, ship_count, risk_level) VALUES (?, ?, ?, ?)'
  ).run(chokepointId, now, shipCount, riskLevel);
}

export function getBaseline(chokepointId: string, days: 30 | 90): number {
  const db = getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const row = db
    .prepare('SELECT AVG(ship_count) as avg FROM maritime_snapshots WHERE chokepoint_id = ? AND ts > ?')
    .get(chokepointId, since) as { avg: number | null };
  return row.avg ?? 0;
}

export function getDeviation(chokepointId: string, shipCount: number): number {
  const baseline = getBaseline(chokepointId, 90);
  if (baseline === 0) return 0;
  return (shipCount - baseline) / baseline;
}
