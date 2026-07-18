# ADR-002: Institution IAM Is the Sole Identity Authority

- Status: ACCEPTED
- Date: 2026-07-18

## Decision

SPYS does not create or store users, passwords, MFA secrets or lockout counters. It validates short-lived JWTs issued by the Institution IAM and maps signed claims to local RBAC/ABAC policy. Issuer, JWKS URL and audience are mandatory in production. The API requires signed MFA assurance (`amr` or an institution-configured `acr`) and a signed device claim. Session timeout, MFA execution and failed-login lockout remain Institution IAM responsibilities; application authorization remains server-side.

## Consequences

Local development may disable auth only when `ENVIRONMENT` is development/test/training; the synthetic principal is visibly named and cannot be enabled in production. No token is logged.
