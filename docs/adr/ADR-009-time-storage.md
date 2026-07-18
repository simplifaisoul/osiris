# ADR-009: Audit Time Storage and Display

- Status: ACCEPTED
- Date: 2026-07-18

## Decision

Audit timestamps are stored as timezone-aware UTC instants. The immutable record also stores the display timezone name. User-facing SPYS views render `Europe/Istanbul` (GMT+3 at current rules) from the UTC instant. Offset-only storage is prohibited because it loses timezone-rule provenance.

