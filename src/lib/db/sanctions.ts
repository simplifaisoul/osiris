import { getDb } from './client';

const EXPOSURE_BUCKET_MS = 24 * 60 * 60 * 1000; // matches the OFAC SDN cache TTL in src/lib/sanctions.ts

/** Best-effort, throttled write — no-ops if a snapshot for this entity was
    already recorded within the current 24h bucket. */
export function insertSnapshot(
  entityId: string,
  tradeVolume: number | null,
  domainActive: boolean,
  exposureScore: number
): void {
  const db = getDb();
  const last = db
    .prepare('SELECT ts FROM sanctions_history WHERE entity_id = ? ORDER BY ts DESC LIMIT 1')
    .get(entityId) as { ts: number } | undefined;

  const now = Date.now();
  if (last && now - last.ts < EXPOSURE_BUCKET_MS) return;

  db.prepare(
    'INSERT INTO sanctions_history (entity_id, ts, trade_volume, domain_active, exposure_score) VALUES (?, ?, ?, ?, ?)'
  ).run(entityId, now, tradeVolume, domainActive ? 1 : 0, exposureScore);
}

export function getExposureTrend(entityId: string, days: number): { ts: number; exposure_score: number }[] {
  const db = getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db
    .prepare('SELECT ts, exposure_score FROM sanctions_history WHERE entity_id = ? AND ts > ? ORDER BY ts ASC')
    .all(entityId, since) as { ts: number; exposure_score: number }[];
}
