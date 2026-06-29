// ═══════════════════════════════════════════════════════════════════════════
//  OSIRIS — Prisma client (Neon serverless, HTTP driver)
//
//  Uses @prisma/adapter-neon's `PrismaNeonHttp`, which runs every query as a
//  short HTTPS call to Neon's pooled endpoint via Neon's stateless HTTP
//  driver. This is the recommended setup for Vercel serverless:
//    • no TCP sockets / WebSocket pool to leak,
//    • no `ws` dependency at runtime,
//    • no connection-pool exhaustion under concurrency.
//
//  DATABASE_URL must be the POOLER connection string (contains "-pooler").
//  If DATABASE_URL is unset, `prisma` is `null` and every caller must treat
//  DB access as optional (the app still runs fully keyless). See callers in
//  /api/scanner and /api/db-health.
// ═══════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

type Db = PrismaClient | null;

const globalForDb = globalThis as unknown as { __osirisPrisma?: Db };

function createPrisma(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  // Stateless HTTP adapter — one short HTTPS request per query.
  // `PrismaNeonHttp` requires an options arg (all fields optional); `{}` keeps
  // the defaults (object rows, non-full results).
  const adapter = new PrismaNeonHttp(connectionString, {});
  return new PrismaClient({ adapter });
}

// Reuse a single client across hot-reloads in dev to avoid creating new
// adapters on every file change. On Vercel each serverless invocation gets
// its own isolated instance — this cache is harmless there.
export const prisma: Db = globalForDb.__osirisPrisma ?? createPrisma();

if (process.env.NODE_ENV !== 'production' && !globalForDb.__osirisPrisma) {
  globalForDb.__osirisPrisma = prisma;
}

export default prisma;

/** True when a Neon DATABASE_URL is configured and the client initialised. */
export const dbEnabled = (): boolean => prisma !== null;
