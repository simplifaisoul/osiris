# World-State development environment

This guide covers the Phase 1 persistence overlay in `docker-compose.worldstate.yml`. It is intentionally separate from the existing OSIRIS stack in `docker-compose.yml`: the overlay currently provides PostGIS, a one-shot migration service and a profile-gated archive write check. It does **not** yet claim that the collector exists or that any verification command below has passed.

Run commands from the repository root and record their actual output when verifying a change.

## Configuration

Docker Compose reads `.env` automatically. The development defaults are usable on a loopback-only database port, but set unique credentials before exposing PostgreSQL anywhere else.

Relevant variables are:

| Variable | Development default | Purpose |
|---|---|---|
| `POSTGRES_DB` | `osiris_worldstate` | Database created by Postgres |
| `POSTGRES_USER` | `osiris` | Database role |
| `POSTGRES_PASSWORD` | `osiris-local-dev` | Local-only development password |
| `POSTGRES_PORT` | `5432` | Host loopback port mapped to container port 5432 |
| `DATABASE_URL` | Host URL matching the defaults above | Direct host-tool URL; Compose builds its internal `db` URL from `POSTGRES_*` |
| `RAW_ARCHIVE_PATH` | `/archive` | Archive path inside the archive check and, later, collector container |
| `OSIRIS_BASE_URL` | `http://host.docker.internal:3000` in the environment template | Reserved for collector-to-OSIRIS integration |

Do not commit `.env`. Create the host archive directory before running the tools profile:

```bash
mkdir -p archive
```

The current archive check always bind-mounts host `./archive`; `RAW_ARCHIVE_PATH` changes its path inside the container.

## Start

First validate the rendered Compose model:

```bash
docker compose -f docker-compose.worldstate.yml config
```

Start PostGIS:

```bash
docker compose -f docker-compose.worldstate.yml up -d db
docker compose -f docker-compose.worldstate.yml ps
```

The `db` service has a health check and publishes PostgreSQL only on `127.0.0.1`. If it does not become healthy, inspect it without resetting data:

```bash
docker compose -f docker-compose.worldstate.yml logs db
```

The existing dashboard, Nginx cache and intelligence service remain in their original Compose project and can be started independently:

```bash
docker compose -f docker-compose.yml up -d
```

Starting or stopping one Compose file does not implicitly start or stop the other.

## Apply migrations

The preferred containerised command waits for a healthy database and runs the ordered SQL files through `db/scripts/migrate.sh`:

```bash
docker compose -f docker-compose.worldstate.yml run --rm migrate
```

Run it a second time when checking migration idempotence:

```bash
docker compose -f docker-compose.worldstate.yml run --rm migrate
```

For a database reachable from the host, the same runner can be invoked directly with an explicit connection string:

```bash
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate db/scripts/migrate.sh
```

Change that URL when `.env` overrides the defaults. Never paste production credentials into shell history or verification notes.

## Verify

Check that the host archive bind is writable from the container path:

```bash
docker compose -f docker-compose.worldstate.yml --profile tools run --rm archive-check
```

This check creates and removes only a short-lived probe inside `./archive`; it does not validate raw-response compression or collector behaviour.

Run the clean-database migration verifier without `DATABASE_URL`:

```bash
db/scripts/verify-clean-database.sh
```

The verifier creates a uniquely named temporary PostGIS container and disposable named volume, mounts `db/` read-only, applies migrations twice, runs SQL assertions and removes the temporary container, network and volume on exit. It never connects to the development database. `POSTGIS_IMAGE=postgis/postgis:<tag>` may be set to override its default image.

Then run the existing application checks so infrastructure work is compared with the recorded baseline:

```bash
npm test
npm run lint
npm run build
npx tsc --noEmit --incremental false
```

Expected baseline failures are documented in `docs/current-osiris-baseline.md`; record the new command output rather than describing a pre-existing failure as fixed. Collector test, lint, build and fixture-ingest commands should be added here only when the collector package and scripts exist.

A complete Phase 1 verification record should eventually include:

- Compose configuration validation and healthy PostGIS startup from an empty volume;
- clean and repeated migration runs;
- PostGIS extension, migration-history, table, constraint and index checks;
- archive write, gzip integrity and SHA-256 checks;
- fixture replay without duplicate events and a changed-event update;
- root and collector tests, lint, type-check and builds;
- restart persistence; and
- manual earthquake map checks in every supported data mode.

This list is a checklist, not a statement that those checks have passed.

## Stop or reset

To stop the World-State overlay while preserving its database volume:

```bash
docker compose -f docker-compose.worldstate.yml down
```

To reset the current World-State development database to an empty volume:

```bash
docker compose -f docker-compose.worldstate.yml down -v
```

**Destructive:** at the current revision, `down -v` deletes the selected `osiris-worldstate` project's `worldstate-db-data` volume and all database contents in it. It does not delete the original OSIRIS project's Nginx volume, and it does not delete the bind-mounted host `./archive` directory. Confirm the rendered project and volume names with `docker compose -f docker-compose.worldstate.yml config` and `docker volume ls` before running it if other Compose project names or overrides are in use.

After a reset, recreate and migrate the database explicitly:

```bash
docker compose -f docker-compose.worldstate.yml up -d db
docker compose -f docker-compose.worldstate.yml run --rm migrate
```

Raw archives are deliberately outside the database reset. Reconciliation of archive files with database rows must be handled explicitly; do not manually delete archive evidence as part of a routine database reset.
