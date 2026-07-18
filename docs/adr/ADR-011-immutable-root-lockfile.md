# ADR-011: Immutable Root package-lock.json

- Status: ACCEPTED BY USER CONSTRAINT
- Date: 2026-07-18

## Context

The target instruction requires both package additions and exact preservation of the existing root `package-lock.json`. Adding a root npm dependency necessarily changes lockfile root metadata and conflicts with the stronger exact-preservation constraint.

## Decision

The root lockfile is byte-for-byte immutable. Root `package.json` receives scripts only. Phase 1 backend dependencies live in the independently pinned Python service. New TypeScript contracts use Zod 4.4.3 already present in the existing lock graph; Docker/standalone build is an acceptance gate. Making Zod a direct production dependency requires separate permission to update the lockfile.

Baseline SHA-256: `bb89d1a0017487daa132fa5598e8d9030ad22a0723349614b1262c5ec7cb9f9f`.

