// ═══════════════════════════════════════════════════════════════════════════
//  OSIRIS — Prisma 7 config
//
//  Prisma 7 moved connection URLs out of schema.prisma into this file.
//  `datasource.url` here is the DIRECT (non-pooler) Neon connection used by
//  `prisma db push` / `prisma migrate` — NOT the runtime URL.
//
//  Runtime queries use the POOLED connection via @prisma/adapter-neon (see
//  src/lib/db.ts), which is what Vercel serverless functions actually call.
//
//  Env vars (set locally and in Vercel):
//    DATABASE_URL  → pooled:   postgresql://…-pooler.aws.neon.tech/osiris?…
//    DIRECT_URL    → direct:   postgresql://….aws.neon.tech/osiris?…
// ═══════════════════════════════════════════════════════════════════════════

import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  // Early-load .env so `prisma db push` works without an extra --env-file flag.
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    // Prefer the direct connection for migrations; fall back to DATABASE_URL
    // so the schema still validates when only one of the two is set.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
