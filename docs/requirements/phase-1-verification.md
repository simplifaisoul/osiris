# Phase 1 Verification Record

Date: 2026-07-18  
Scope: Phase 1 foundation implementation described in the phased roadmap.

## Passed gates

| Gate | Command | Result |
|---|---|---|
| TypeScript type safety | `npm run typecheck` | PASS |
| Production web build | `npm run build` | PASS; 43 static pages generated and all API routes compiled |
| Existing and foundation web tests | `npm test` | PASS; 10 passed, 1 explicitly skipped live-network test |
| New foundation lint scope | `eslint src/proxy.ts src/app/api/ready/route.ts src/lib/foundation/*.ts packages/contracts/src/*.ts` | PASS |
| Python unit and integration tests | `services/api/.venv/bin/pytest -q` | PASS; 20 passed |
| Python dependency consistency | `services/api/.venv/bin/pip check` | PASS |
| Python bytecode compilation | `python -m compileall` | PASS |
| Alembic forward migration | `alembic upgrade head` against an isolated SQLite verification database | PASS |
| Alembic rollback | `alembic downgrade base` against the same database | PASS |
| Docker Compose model | `docker compose -f docker-compose.yml -f infra/docker/docker-compose.foundation.yml config --quiet` with non-secret validation values | PASS |
| Kubernetes rendering | `kubectl kustomize infra/kubernetes/base` | PASS |
| Patch whitespace | `git diff --check` | PASS |
| Root lockfile preservation | `shasum -a 256 package-lock.json` | PASS; unchanged from the pre-implementation value `bb89d1a0017487daa132fa5598e8d9030ad22a0723349614b1262c5ec7cb9f9f` |

The DEMAT tests cover one day before and both sides of the 92-day yellow and 31-day red notification thresholds. Currency tests use `Decimal` and verify `ROUND_HALF_EVEN`. Identity and authorization tests cover signed MFA assurance, claim normalization, role, tenant, and classification denials. Planning tests cover happy paths, invalid periods, invalid transitions, and four-eyes approval.

## Explicitly non-green or externally blocked gates

1. Full-repository `npm run lint`: FAIL, 475 inherited findings (390 errors and 85 warnings), dominated by legacy `no-explicit-any`, CommonJS import, and hook-dependency findings. The new foundation-only lint scope passes. The implementation does not weaken lint rules or mechanically rewrite unrelated legacy API routes.
2. Container image build: NOT RUN because the local Docker daemon did not respond. The Compose model validates, and the Python environment installs and passes `pip check`, compilation, and tests outside Docker.
3. Production OIDC exchange: REQUIRES INSTITUTION ENVIRONMENT. JWT/JWKS validation is implemented, but validation against the real issuer, MFA policy, and institutional claims needs an IAM test tenant and certificates.
4. Production PostgreSQL/PostGIS migration: REQUIRES INSTITUTION ENVIRONMENT. Migration reversibility is proven with an isolated database; PostgreSQL execution, backup/restore, and performance evidence belong to the deployment acceptance environment.
5. SPYS browser UI: BLOCKED BY ADR-001. The specification mandates Angular while the target repository mandates Next.js/React. Phase 1 therefore provides schemas, server-side controls, APIs, and deployment boundaries only; no unapproved SPYS UI was created.

## Honest boundary

Phase 1 establishes the secure backend and contract foundation without breaking the existing Next.js API surface. It does not claim that the legacy OSIRIS routes have all been migrated to the new OIDC, policy, audit, and Zod enforcement path. That incremental migration remains explicitly tracked in the roadmap and traceability matrix so production accreditation cannot mistake a compatibility-preserved legacy route for a compliant route.
