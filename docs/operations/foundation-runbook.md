# Foundation Service Runbook

## Required secrets

Create dedicated files through the Institution secret manager:

- PostgreSQL password: minimum 32 random characters, mounted at `/run/secrets/postgres_password`.
- Audit HMAC key: minimum 32 random bytes, mounted at `/run/secrets/audit_hmac_key`.

Never commit either file. Production auth additionally requires `OIDC_ISSUER`, `OIDC_JWKS_URL` and `OIDC_AUDIENCE`. Configure Institution IAM to emit the accepted MFA `amr` or `acr` value and the claim named by `OIDC_DEVICE_CLAIM`; readiness stays fail-closed when security prerequisites are absent.

## Local test

```bash
cd services/api
python3 -m venv .venv
.venv/bin/pip install -e '.[test]'
.venv/bin/pytest
```

## Migration

```bash
cd services/api
.venv/bin/alembic upgrade head
.venv/bin/alembic downgrade -1
```

Run downgrade only in an approved non-production recovery rehearsal or under a change record. It removes Phase 1 tables and their data.

## Compose

```bash
docker compose \
  -f docker-compose.yml \
  -f infra/docker/docker-compose.foundation.yml \
  -f infra/docker/docker-compose.institution-network.yml \
  up -d --build
```

The foundation Compose overlay is the fail-closed SPYS profile: both its default application network and foundation network are internal, so legacy OSIRIS routes cannot bypass the air gap by calling public feeds. Institution IAM must be attached through an approved internal network overlay or service-mesh path. Use the root Compose file without this overlay for the existing connected OSIRIS profile. Verify `/health` for process liveness and `/ready` for database/security prerequisites. Do not route traffic when `/ready` returns 503.

The Kubernetes HPA requires the institution cluster metrics API. Replace the fail-closed `registry.invalid` image reference in an approved environment overlay; do not edit the reusable base with registry credentials.

Use `docs/deployment/KAM-DEPLOYMENT-GUIDE.md` for the complete secret, IAM, migration, TLS, verification, backup, and rollback procedure.

## Audit verification

An authorized `kam.auditor` calls `/v1/audit/verify`. A false result is a security incident: stop mutating traffic, preserve database/storage snapshots, notify the SIEM/SOC owner and begin the approved chain-of-custody procedure.
