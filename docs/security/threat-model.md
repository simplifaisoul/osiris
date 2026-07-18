# Phase 1 Threat Model

## Assets

Institution identity claims; classified planning records; common objects and provenance; audit integrity key; database credentials; report/document metadata; availability of planning workflows.

## Trust boundaries

1. Browser to Next.js web tier.
2. Web tier to foundation API.
3. Foundation API to Institution IAM/JWKS.
4. Foundation API to PostgreSQL.
5. Service to OpenBao/KMS-projected secret files.
6. Connected ingestion zone to public sources; absent in SPYS air-gap profile.

## Primary threats and controls

| Threat | Control | Verification |
|---|---|---|
| Forged/replayed identity | JWT signature, issuer, audience, exp/iat, narrow algorithms, clock skew | IAM unit/integration test with valid, expired, wrong-audience tokens |
| IDOR/cross-tenant access | Principal tenant enforcement on every repository operation | Cross-tenant negative tests |
| Excess classification access | Server-side clearance ordering; admin override audited | Classification negative tests |
| Workflow bypass | Explicit state machine, four-eyes approval, DB constraints | Transition and same-creator rejection tests |
| Financial rounding error | Python `Decimal`, fixed scale, ROUND_HALF_EVEN | Boundary/unit tests |
| Audit deletion/tamper | Append-only permissions, HMAC hash chain, PostgreSQL writer serialization, SIEM forward | Tamper test and scheduled verification |
| Secret disclosure | Mounted files, no values in source/env examples/logs | secret scan; container inspection |
| General internet path from SPYS | fail-closed profile plus default-deny NetworkPolicy | denied egress acceptance test |
| Malformed/untrusted input | Pydantic and Zod schemas, `extra=forbid`, structured errors | happy/error test per endpoint |
| XSS/script injection | per-request CSP nonce, no `unsafe-eval`, React escaping | browser CSP test |
| Synthetic data confusion | source/type consistency validation and visible `SENTETİK` label | seed scan and schema negative test |

## Residual risks

Institution JWKS availability, secret projection mechanism and SIEM endpoint are external dependencies. SPYS UI choice is blocked by ADR-001. Existing legacy Next.js routes still require systematic schema/auth migration in the continuing foundation hardening backlog; they are not silently represented as compliant.

