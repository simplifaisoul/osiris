# ADR-012 — Manifest-driven, transport-agnostic connector SDK

- Status: Accepted
- Date: 2026-07-19
- Feature areas: F-002 (Connector SDK), supports F-003–F-014 data domains
- Related: ADR-003 (network separation), ADR-006 (polyglot stores)

## Context

OSIRIS §5/§23 require a connector framework covering ≥60 sources with a uniform
manifest, health/state model, retry, circuit breaker, pagination, checkpoint,
dedup, raw retention, Common Object Model mapping, licence/usage basis, and an
explicit `CONFIGURATION_REQUIRED` state when credentials are absent. SPYS
(ADR-003) additionally requires that public connectors are inert in the
air-gapped profile.

## Decision

1. **Manifests are the source of truth.** Each connector is declared by a YAML
   manifest validated by both a JSON Schema
   (`packages/contracts/schemas/connector-manifest.schema.json`) and a Pydantic
   model. The JSON Schema is the language-neutral contract shared with the
   TypeScript client.
2. **State is resolved, never asserted.** A single `resolve_state` function maps
   runtime signals to one of eight states with fixed precedence. Configuration
   and operator intent dominate transient health, so a connector missing a secret
   can never be presented as `ACTIVE` — it is `CONFIGURATION_REQUIRED`.
3. **The SDK is transport-agnostic.** Connectors implement only `fetch`;
   normalization, provenance stamping, synthetic labelling, and content hashing
   are handled by the base class. Downstream delivery is a `Sink` protocol, so
   Kafka and object-store transports (remaining Phase 2 scope) plug in without
   touching connector code. The default in-memory dedup/checkpoint stores are
   swapped for Postgres/Redis behind the same interfaces.
4. **Air-gap gating is defence in depth.** A `requires_public_network` manifest
   flag plus the `SPYS_AIRGAP` profile disables public connectors at the
   application layer, complementing the default-deny NetworkPolicy egress.
5. **Synthetic data is force-labelled.** Any synthetic run sets
   `source_type=SYNTHETIC`, `is_synthetic=true`, and a visible `SENTETİK` marker,
   matching the foundation Common Object contract.

## Consequences

- Adding a connector is a manifest plus a small `fetch` implementation; the
  contract, state model, and safety rails are inherited.
- The shipped set is 12 real manifests; reaching the ≥60 catalogue, plus wiring
  the Kafka/object-store sinks and the durable dedup/checkpoint stores, is the
  remaining Phase 2 work tracked in the roadmap. This is stated openly rather
  than represented as complete.
- Because state is resolved from signals, connector health in the UI cannot drift
  from reality: an unconfigured or air-gap-disabled source is always shown as
  such.
