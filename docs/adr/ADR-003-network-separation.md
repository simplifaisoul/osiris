# ADR-003: Connected OSIRIS and Air-Gapped SPYS Profiles

- Status: ACCEPTED
- Date: 2026-07-18

## Decision

Two deployment profiles are explicit. `OSIRIS_CONNECTED` permits only configured public connector egress. `SPYS_AIRGAP` is the default, rejects `PUBLIC_CONNECTORS_ENABLED=true`, uses a default-deny Kubernetes NetworkPolicy and has no general internet egress. Data transfer into SPYS requires a separately approved offline/controlled-ingest procedure.

## Consequences

No runtime heuristic may silently switch profiles. Public feeds are not an SPYS dependency.

