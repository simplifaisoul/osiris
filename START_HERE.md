# Start Here — OSIRIS World-State Build Pack

This pack is designed to be copied into the root of a fork of:

- https://github.com/simplifaisoul/osiris

Files:

- `AGENTS.md` — standing instructions for Codex and other coding agents.
- `PROJECT_SPEC.md` — product and architecture specification.
- `BUILD_GUIDE_CODEX.md` — phased implementation guide with acceptance criteria.
- `CODEX_PROMPTS.md` — copy-paste prompts for Codex CLI.

## Recommended first session

```bash
git clone https://github.com/simplifaisoul/osiris.git osiris-worldstate
cd osiris-worldstate
git remote rename origin upstream
git checkout -b worldstate/bootstrap
```

Copy this documentation pack into the repository root, then run:

```bash
codex
```

Use this as the first prompt:

```text
Read AGENTS.md, PROJECT_SPEC.md, BUILD_GUIDE_CODEX.md, and CODEX_PROMPTS.md.

Do not modify files yet.

Inspect the current repository and compare it with Phase 0 and Phase 1 of the build guide. Report:
1. the existing architecture and data routes;
2. anything in the documentation that no longer matches the repository;
3. the smallest safe implementation plan for Phase 1;
4. the files you expect to create or modify;
5. the tests and verification commands you will use.

Preserve all existing OSIRIS features and data routes. Wait for my next instruction after producing the plan.
```

After reviewing the plan, use the Phase 1 prompt in `CODEX_PROMPTS.md`.

## Working method

Use one branch per phase:

```text
worldstate/bootstrap
worldstate/raw-ingestion
worldstate/compatibility-api
worldstate/agriculture
worldstate/market-anomalies
worldstate/evidence-graph
worldstate/telegram
```

At the end of each phase:

```bash
npm test
npm run lint
npm run build
```

Also run the collector-specific tests documented in `BUILD_GUIDE_CODEX.md`.

Use Codex CLI `/review` before committing. Create a Git checkpoint before and after each substantial task.

## First delivery target

The first useful milestone is deliberately modest:

1. Existing OSIRIS still works unchanged from the user’s perspective.
2. PostgreSQL/PostGIS runs locally through Docker Compose.
3. A standalone TypeScript collector stores complete raw USGS earthquake responses.
4. Normalised earthquake rows are derived from the stored raw response.
5. `/api/earthquakes` can be switched between the original live adapter and the database-backed adapter.
6. Tests prove that the database-backed response remains compatible with the existing OSIRIS map.

Do not implement market predictions, graph inference or Telegram in the first milestone.
