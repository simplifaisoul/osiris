# World-State development environment

This guide covers the Phase 1 persistence overlay in `docker-compose.worldstate.yml` and the database-backed `/api/earthquakes` compatibility path. The overlay provides PostGIS, a one-shot migration service, the standalone USGS collector and an archive write preflight. The dashboard can remain a separate live-only stack or share a Compose project and internal network with the overlay.

The collector archives each complete HTTP response before parsing it, then writes current USGS observation and seismic snapshots with collection-run provenance. `/api/earthquakes` selects live USGS, the latest complete database snapshot, or a freshness-aware live fallback. Both dashboard earthquake consumers call that same-origin route; no browser component contacts the USGS feed directly.

Run commands from the repository root and record their actual output when verifying a change. Never record or paste the fully rendered Compose configuration: it contains the database password. Use the quiet and selector commands shown below.

## Configuration

Docker Compose reads `.env` automatically. The development defaults are usable on a loopback-only database port, but set unique credentials before exposing PostgreSQL anywhere else.

Relevant variables are:

| Variable | Development default | Purpose |
|---|---|---|
| `POSTGRES_DB` | `osiris_worldstate` | Database created by Postgres |
| `POSTGRES_USER` | `osiris` | Database role |
| `POSTGRES_PASSWORD` | `osiris-local-dev` | Local-only development password |
| `POSTGRES_PORT` | `5432` | Host loopback port mapped to container port 5432 |
| `DATABASE_URL` | Host URL matching the defaults above | Direct host-tool and host-run OSIRIS URL; Compose services use discrete settings internally |
| `EARTHQUAKE_DATA_MODE` | `live` | Compatibility source: `live`, `database` or `database_with_live_fallback` |
| `EARTHQUAKE_DATABASE_MAX_AGE_MS` | `900000` | Maximum age of both the received response and USGS-generated timestamp before a database snapshot is stale |
| `WORLDSTATE_DB_DATA` | `worldstate-db-data` | Docker volume name or absolute mounted host path for PostgreSQL data |
| `RAW_ARCHIVE_HOST_PATH` | `./archive` | Host path mounted into the collector for raw response archives |
| `RAW_ARCHIVE_PATH` | `/archive` | Archive path inside the collector and archive-check containers |
| `OSIRIS_BASE_URL` | `http://host.docker.internal:3000` in the environment template | Reserved for collector-to-OSIRIS integration |
| `COLLECT_INTERVAL_MS` | `300000` | Delay after one attempt cycle completes before the next begins |
| `COLLECT_ON_STARTUP` | `1` | Run once when the collector starts |
| `COLLECTOR_SOURCE` | `usgs-earthquakes` | Active collector source for this container: `usgs-earthquakes`, `gdacs-disasters`, `nasa-firms-viirs`, `nasa-firms-modis`, `nasa-eonet-volcanoes`, `nasa-eonet-weather`, `noaa-nws-alerts`, `noaa-swpc-planetary-k-index`, `noaa-swpc-alerts` or `noaa-swpc-xray-flares` |
| `MAX_FETCH_ATTEMPTS` | `3` | Bounded transient-attempt count; every HTTP response gets its own run/archive |
| `MAX_RESPONSE_BYTES` | `26214400` | Maximum response body size before collection fails closed |
| `REQUEST_TIMEOUT_MS` | `10000` | Timeout covering response headers and body |
| `RETRY_BASE_MS` | `500` | Exponential-retry base delay before bounded jitter |
| `STALE_RUN_AFTER_MS` | `900000` | Age after which interrupted `running` rows are recovered as failed |
| `DB_CONNECTION_TIMEOUT_MS` | `5000` | Maximum database connection wait |
| `DB_QUERY_TIMEOUT_MS` | `15000` | Maximum client-side wait for each database query |
| `DB_STATEMENT_TIMEOUT_MS` | `15000` | PostgreSQL statement timeout for collector connections |
| `DB_LOCK_TIMEOUT_MS` | `5000` | PostgreSQL lock wait timeout for collector connections |
| `MIGRATION_DB_CONNECT_TIMEOUT_SECONDS` | `10` | One-shot migration connection timeout, in seconds |
| `MIGRATION_DB_STATEMENT_TIMEOUT_MS` | `120000` | PostgreSQL statement timeout for migrations |
| `MIGRATION_DB_LOCK_TIMEOUT_MS` | `15000` | PostgreSQL lock wait timeout for migrations |
| `COLLECTOR_UID`, `COLLECTOR_GID` | `1000`, `1000` | Non-root identity used for the collector and archive probe |
| `COLLECTOR_HEALTH_PORT` | `4001` | Loopback host port for `/health` |
| `USGS_EARTHQUAKE_URL` | Official USGS M2.5 day GeoJSON feed | HTTPS endpoint for the USGS collector; credentials are rejected |
| `GDACS_RSS_URL` | `https://www.gdacs.org/xml/rss.xml` | HTTPS endpoint for the GDACS disaster RSS collector; credentials are rejected |
| `FIRMS_VIIRS_URL` | Official NASA FIRMS Suomi NPP VIIRS global 24h CSV | HTTPS endpoint for the FIRMS VIIRS collector; credentials are rejected |
| `FIRMS_MODIS_URL` | Official NASA FIRMS MODIS global 24h CSV | HTTPS endpoint for the FIRMS MODIS collector; credentials are rejected |
| `EONET_VOLCANOES_URL` | Official NASA EONET open volcano events query | HTTPS endpoint for the EONET volcano collector; credentials are rejected |
| `EONET_WEATHER_URL` | Official NASA EONET open events query | HTTPS endpoint for the EONET weather collector; credentials are rejected |
| `NWS_ALERTS_URL` | Official NOAA/NWS active alerts GeoJSON query | HTTPS endpoint for the NWS alerts collector; credentials are rejected |
| `SWPC_KP_URL` | Official NOAA SWPC planetary K-index 1-minute JSON | HTTPS endpoint for the SWPC Kp collector; credentials are rejected |
| `SWPC_ALERTS_URL` | Official NOAA SWPC alerts product JSON | HTTPS endpoint for the SWPC alerts collector; credentials are rejected |
| `SWPC_XRAY_FLARES_URL` | Official NOAA SWPC GOES primary X-ray flares latest JSON | HTTPS endpoint for the SWPC X-ray flare collector; credentials are rejected |

Do not commit `.env`. The bind mount deliberately refuses to auto-create a root-owned directory. Create and permission the host archive before starting the overlay:

```bash
install -d -m 0750 archive
sudo chown 1000:1000 archive
```

Replace `1000:1000` with the `COLLECTOR_UID` and `COLLECTOR_GID` values from `.env` when customized; Compose does not export `.env` into the current shell. Omit `sudo chown` when the directory already has the required numeric owner. The configured user must be able to write it. The archive preflight and collector use the same non-root identity. Both always bind-mount host `./archive`; `RAW_ARCHIVE_PATH` changes only the path inside their containers. A missing or unwritable directory stops startup before the collector runs. Single-quote `.env` passwords containing `$` or `#` so Compose preserves them literally.

`live` is the backward-compatible default and never creates a PostgreSQL pool. `database` never contacts USGS and returns `503` when the latest complete snapshot is missing, inconsistent or stale. `database_with_live_fallback` uses a fresh complete snapshot, including a valid zero-record snapshot, and otherwise logs a sanitized fallback reason before fetching USGS. A snapshot is complete only when it belongs to the latest non-legacy successful run and its normalised row count matches that run's `record_count`.

Successful response JSON keeps the original OSIRIS contract. Diagnostic headers report the selected mode/source, database response and upstream timestamps, staleness and fallback reason without exposing connection details.

## Start

First validate the rendered Compose model:

```bash
docker compose -f docker-compose.worldstate.yml config --quiet
docker compose -f docker-compose.worldstate.yml config --services
docker compose -f docker-compose.worldstate.yml config --volumes
```

Do not use unfiltered `docker compose ... config` in logs or verification notes because its rendered environment includes credentials.

Start the complete World-State overlay for collection or host-run OSIRIS development:

```bash
docker compose -f docker-compose.worldstate.yml up -d collector
docker compose -f docker-compose.worldstate.yml ps
```

Compose verifies archive access, starts PostGIS, applies migrations once, then starts the non-root collector. The database and collector health endpoint publish only on `127.0.0.1`. Inspect status without resetting data:

```bash
docker compose -f docker-compose.worldstate.yml logs db
docker compose -f docker-compose.worldstate.yml logs collector
curl --fail http://127.0.0.1:4001/health
```

The existing dashboard, Nginx cache and intelligence service can still be started independently in the default live mode:

```bash
docker compose -f docker-compose.yml up -d
```

Starting or stopping one Compose file does not implicitly start or stop the other. A host-run `npm run dev` can use database modes through the loopback `DATABASE_URL` after the overlay is healthy.

For a database-backed dashboard container, stop any separately running `osiris` container and combine the Compose models so the dashboard can resolve the internal `db` hostname without exposing PostgreSQL beyond loopback:

```bash
docker compose -f docker-compose.yml -f docker-compose.worldstate.yml \
  up -d osiris collector
```

The root Compose model injects `WORLDSTATE_PG*` values into the server-only Next.js runtime. These discrete settings take precedence over the host-oriented `DATABASE_URL` inside the container and preserve passwords without URL interpolation. Set `EARTHQUAKE_DATA_MODE=database_with_live_fallback` in `.env` for the recommended persisted mode. Use both `-f` arguments for subsequent `ps`, `logs` and `down` commands so Compose addresses the same combined project.

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

To avoid URL-encoding a password with reserved characters, pass the standard discrete libpq variables instead:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=osiris_worldstate \
PGUSER=osiris PGPASSWORD='replace-with-a-strong-password' \
db/scripts/migrate.sh
```

## Collector commands

Install the collector package from its lockfile and run its offline checks independently of the Next.js application:

```bash
npm ci --prefix collector
npm --prefix collector test
npm --prefix collector run lint
npm --prefix collector run typecheck
npm --prefix collector run build
```

Against a migrated development database, ingest the committed USGS fixture without contacting the provider:

```bash
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate \
RAW_ARCHIVE_PATH="$(pwd)/archive" \
npm --prefix collector run ingest:fixture -- usgs-earthquakes
```

Run that command twice to verify replay. The deterministic fixture uses the same response timestamp and bytes, so the second run verifies the existing immutable archive and does not duplicate provider events. Continuous live collection should be run through Compose; direct one-shot live collection is available with the same two environment variables through `npm --prefix collector run collect:usgs`.

GDACS disaster RSS capture is the first Phase 2 source-expansion adapter. It uses the same raw-archive and `collection_runs` path, records the source in `source_catalogue`, stores normalised rows in `disaster_events`, and remains opt-in so the default collector behaviour is unchanged:

```bash
COLLECTOR_SOURCE=gdacs-disasters \
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate \
RAW_ARCHIVE_PATH="$(pwd)/archive" \
npm --prefix collector run ingest:fixture -- gdacs-disasters
```

Run a one-shot live GDACS collection only when the migrated database and archive path are ready:

```bash
COLLECTOR_SOURCE=gdacs-disasters \
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate \
RAW_ARCHIVE_PATH="$(pwd)/archive" \
npm --prefix collector run collect:gdacs
```

NASA FIRMS and EONET are captured as a slightly larger Phase 2 fire slice because the existing `/api/fires` route already combines FIRMS active-fire detections with EONET volcano events. FIRMS detections are stored in `active_fire_detections` with `observed` provenance; EONET volcanoes are stored in `disaster_events` with `reported` provenance. The OSIRIS `/api/fires` live route remains unchanged.

```bash
COLLECTOR_SOURCE=nasa-firms-viirs \
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate \
RAW_ARCHIVE_PATH="$(pwd)/archive" \
npm --prefix collector run ingest:fixture -- nasa-firms-viirs

COLLECTOR_SOURCE=nasa-eonet-volcanoes \
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate \
RAW_ARCHIVE_PATH="$(pwd)/archive" \
npm --prefix collector run ingest:fixture -- nasa-eonet-volcanoes
```

NOAA SWPC space-weather capture follows the same opt-in pattern and preserves the three upstream feeds behind `/api/space-weather`: planetary Kp, SWPC alert products and latest GOES X-ray flares. Normalised rows go into `space_weather_observations`; the live OSIRIS route continues to serve the current API shape.

```bash
COLLECTOR_SOURCE=noaa-swpc-planetary-k-index \
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate \
RAW_ARCHIVE_PATH="$(pwd)/archive" \
npm --prefix collector run ingest:fixture -- noaa-swpc-planetary-k-index

COLLECTOR_SOURCE=noaa-swpc-alerts \
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate \
RAW_ARCHIVE_PATH="$(pwd)/archive" \
npm --prefix collector run ingest:fixture -- noaa-swpc-alerts

COLLECTOR_SOURCE=noaa-swpc-xray-flares \
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate \
RAW_ARCHIVE_PATH="$(pwd)/archive" \
npm --prefix collector run ingest:fixture -- noaa-swpc-xray-flares
```

Weather capture preserves the remaining live weather-layer feeds not already covered by GDACS, FIRMS or USGS: NASA EONET open weather/anomaly events and NOAA/NWS active alerts. Normalised rows go into `weather_events`; NWS polygons are reduced to a representative point for the current map contract while the full GeoJSON feature remains archived in `raw_observations`.

```bash
COLLECTOR_SOURCE=nasa-eonet-weather \
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate \
RAW_ARCHIVE_PATH="$(pwd)/archive" \
npm --prefix collector run ingest:fixture -- nasa-eonet-weather

COLLECTOR_SOURCE=noaa-nws-alerts \
DATABASE_URL=postgresql://osiris:osiris-local-dev@127.0.0.1:5432/osiris_worldstate \
RAW_ARCHIVE_PATH="$(pwd)/archive" \
npm --prefix collector run ingest:fixture -- noaa-nws-alerts
```

Live boundary tests are opt-in only:

```bash
npm --prefix collector run test:live
```

That script sets `RUN_LIVE_TESTS=1`; the default `npm --prefix collector test` suite performs no provider network calls.

## Verify

Check that the host archive bind is writable from the container path:

```bash
docker compose -f docker-compose.worldstate.yml run --rm archive-check
```

This check creates and removes only a short-lived probe inside `./archive` as the configured collector UID/GID. Collector unit tests separately validate raw-response compression, hashing, atomic publication and byte-for-byte decompression.

Run the clean-database migration verifier without `DATABASE_URL`:

```bash
db/scripts/verify-clean-database.sh
```

The verifier creates a uniquely named temporary PostGIS container and disposable named volume, mounts `db/` read-only, applies migrations twice, runs SQL assertions, runs the collector's replay/update integration tests, verifies exact latest-feed membership through the Next.js database adapter, restarts PostGIS to check persistence, and removes the temporary container, network and volume on exit. It never connects to the development database. Run `npm ci` and `npm ci --prefix collector` first. `POSTGIS_IMAGE=postgis/postgis:<tag>` and `POSTGIS_PLATFORM=<platform>` may be set to override its pinned defaults.

The [official `postgis/postgis` image](https://github.com/postgis/docker-postgis#versions) supports AMD64 only. The overlay declares `linux/amd64` explicitly: AMD64 hosts run it natively, while ARM64 hosts need [Docker/QEMU x86_64 emulation](https://docs.docker.com/build/building/multi-platform/#qemu) and should expect lower database performance. On standalone ARM64 Linux, install binfmt/QEMU support before startup; the overlay does not claim native ARM64 database support.

If Docker is installed but the current user cannot access its daemon, the verifier exits during preflight before creating any resource.

Then run the existing application checks so infrastructure work is compared with the recorded baseline:

```bash
npm test
npm run lint
npm run build
npx tsc --noEmit --incremental false
```

Expected baseline failures are documented in `docs/current-osiris-baseline.md`; record the new command output rather than describing a pre-existing failure as fixed.

A complete Phase 1 verification record includes:

- Compose configuration validation and healthy PostGIS startup from an empty volume;
- clean and repeated migration runs;
- PostGIS extension, migration-history, table, constraint and index checks;
- archive write, gzip integrity and SHA-256 checks;
- fixture replay without duplicate events and a changed-event update;
- root and collector tests, lint, type-check and builds;
- restart persistence; and
- manual earthquake map, alert and ticker checks in every supported data mode;
- a browser-network check confirming earthquake consumers call only `/api/earthquakes`; and
- collector-down/stale and valid-empty-snapshot fallback checks.

The committed fixture carries a fixed provider-generated timestamp. It is intentionally stale under normal wall-clock time, so use live collector data for a fresh database-mode manual check; fixture ingestion remains appropriate for deterministic contract and replay verification.

## Current storage limitations

- Databases upgraded from migrations 0001-0006 may contain collection runs that predate exact request/error provenance. Migration 0007 preserves those rows without inventing values and marks them `legacy_provenance_incomplete = true`; every new run is subject to the stronger timestamp and terminal-state constraints.
- `raw_observations` and `seismic_events` retain the latest row per provider event rather than immutable provider revisions. The compatibility query reconstructs exact membership of the latest complete feed from `last_seen_at`; older complete feed bodies remain recoverable from the immutable archive, but provider revisions are not yet indexed as separate rows.
- Filesystem publication and database commits cannot be one atomic operation. A database outage after archive publication can leave an orphan archive; never delete it automatically. Reconciliation is a later operational feature.
- Stale `running` rows are recovered after `STALE_RUN_AFTER_MS`; archive/database orphan reconciliation remains explicit.

## Stop or reset

To stop the World-State overlay while preserving its database volume:

```bash
docker compose -f docker-compose.worldstate.yml down
```

To reset the current World-State development database to an empty volume:

```bash
docker compose -f docker-compose.worldstate.yml down -v
```

**Destructive:** at the current revision, `down -v` deletes the selected `osiris-worldstate` project's `worldstate-db-data` volume and all database contents in it. It does not delete the original OSIRIS project's Nginx volume, and it does not delete the bind-mounted host `./archive` directory. Confirm the project with `docker compose ls` and inspect candidate volumes with `docker volume ls` before running it if other Compose project names or overrides are in use. Do not print the full rendered Compose model to do this.

After a reset, recreate and migrate the database explicitly:

```bash
docker compose -f docker-compose.worldstate.yml up -d db
docker compose -f docker-compose.worldstate.yml run --rm migrate
```

Raw archives are deliberately outside the database reset. Reconciliation of archive files with database rows must be handled explicitly; do not manually delete archive evidence as part of a routine database reset.
