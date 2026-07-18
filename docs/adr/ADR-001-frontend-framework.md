# ADR-001: SPYS Frontend Framework

- Status: **DECISION REQUIRED - implementation blocked**
- Record finalized: 2026-07-18
- Decision authority: Institution

## Context

SPYS §3.2.3.14 mandates HTML5, CSS3, JavaScript and Angular. The target repository is Next.js 16.2.6, React 19.2.4 and strict TypeScript. Silently replacing Angular would violate the binding specification; introducing a second framework changes operations and supply-chain scope.

## Options

1. **Angular micro-frontend:** self-contained `apps/spys-angular`, institution-approved Angular version and lockfile; shared OpenAPI/contracts; mounted below `/spys`. Highest literal compliance, higher operational and skills cost.
2. **Next.js module with exact SPYS UX:** `apps/web/src/app/spys`; one frontend runtime and design system; requires a written Institution waiver/approval for §3.2.3.14.

## Applied decision

- OSIRIS remains Next.js/React.
- Phase 1 may implement SPYS schemas, APIs and business rules.
- **No SPYS UI code may be written until the Institution selects Option 1 or approves Option 2 in writing.**
- The approval reference must be recorded in this ADR before its status can change to `ACCEPTED`.

## Consequences

The backend is UI-neutral and OpenAPI-first. This document is complete, but the framework decision is intentionally not fabricated.

