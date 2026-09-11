/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — Rate limiter condiviso (in-memory, per processo)
 *  Stesso schema delle route ai/* esistenti, ma in un posto solo
 *  invece che copiato in ogni file.
 * ═══════════════════════════════════════════════════════════════
 */

interface Entry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Map<string, Entry>>();

export function rateLimit(bucket: string, ip: string, max = 10, windowMs = 60_000): boolean {
  let m = buckets.get(bucket);
  if (!m) {
    m = new Map<string, Entry>();
    buckets.set(bucket, m);
  }
  const now = Date.now();
  const e = m.get(ip);
  if (!e || now > e.resetAt) {
    m.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

// pulizia periodica, altrimenti la mappa cresce con gli IP visti
setInterval(() => {
  const now = Date.now();
  for (const m of buckets.values()) {
    for (const [ip, e] of m.entries()) if (now > e.resetAt) m.delete(ip);
  }
}, 120_000);
