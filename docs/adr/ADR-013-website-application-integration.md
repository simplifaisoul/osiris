# ADR-013 — How the KAM Multi-INT platform integrates with the host website

- Status: Accepted
- Date: 2026-07-19
- Feature areas: F-015 (COP UI), F-026 (integrations), F-027 (identity/auth)
- Related: ADR-002 (institution IAM), ADR-003 (network separation), ADR-012 (connector SDK)

> **Naming note.** The originating request asked for this decision to be recorded
> "as ADR-002". `ADR-002-institution-iam.md` already exists and records the
> institution-IAM decision; overwriting it would destroy an accepted record. This
> decision is therefore filed as ADR-013 and cross-references ADR-002.

## Context

The brief posed four possible meanings for "embed the application within the
website":

- **A** — Deploy KAM Multi-INT as microservices reached through the website's
  navigation, sharing one authenticated session (API routes + shared auth).
- **B** — Embed intelligence modules as iframes / web components inside existing
  website pages.
- **C** — Migrate the entire website into the KAM Next.js app as one unified app.
- **D** — Expose KAM backend APIs to the website through a separate API Gateway,
  keeping them as two apps.

## Decision

**Adopt Option A.** Two facts about the established architecture drive this:

1. **The website and the KAM front end are already one Next.js application**
   (`osiris`, the `src/` tree). There is no separate marketing site to migrate,
   so the *outcome* Option C describes is already true at the presentation layer.
2. **Backend intelligence capabilities are separate microservices**
   (`foundation-api`, `ingestion`, and the planned fusion/analytics/AI/… set).
   The Next.js app reaches them through its own server-side API routes acting as
   a **Backend-For-Frontend (BFF)** — e.g. `/api/ready` → `FOUNDATION_API_URL`,
   `/api/connectors` → `INGESTION_API_URL`. Those routes stamp correlation IDs,
   apply the structured error envelope, and are the single seam where the browser
   meets the backend.

Authentication is shared through the Institution IAM (OIDC/OAuth2/JWT, ADR-002):
one login yields one session that both the website surface and the backend
services honour. The browser never calls a backend service directly; the BFF and
NetworkPolicies (ADR-003) keep backends unreachable from the public internet.

## Why not the others

- **B (iframes):** breaks a single security context, complicates CSP and the
  shared session, and fragments the common operational picture. Rejected.
- **C (migrate website in):** already satisfied at the UI layer; stated as a task
  it is a no-op and mislabels the backend integration question. Rejected as the
  framing.
- **D (separate API Gateway):** the Next.js BFF already performs the gateway role
  (routing, auth propagation, error normalization) without a second network hop
  or a second component to secure and operate. A dedicated gateway may be revisited
  if non-web clients (e.g. SPYS/MYS/KAM-BAKS system integrations, F-026) need direct
  API access; that is an ingress concern, not a website-embedding concern.

## Consequences

- The website's navigation gains KAM capabilities as it gains BFF routes; no
  iframe or cross-origin plumbing is introduced.
- The public Ingress exposes only the web app; `foundation-api` and `ingestion`
  stay cluster-internal (see the production manual, Parts 9–10).
- Backend services can scale, restart, or move without any change to the website,
  because the BFF addresses them by stable Service name.
