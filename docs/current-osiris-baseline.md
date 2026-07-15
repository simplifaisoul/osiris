# Current OSIRIS baseline

This is the Phase 0 snapshot taken before World-State runtime work. It records the repository at commit `f3534cde4ec3bec9b6a87bfd154ee15ea4aa97e0` on 2026-07-15.

## Repository and toolchain

| Item | Baseline |
|---|---|
| Source branch | `master` |
| Baseline commit | `f3534cde4ec3bec9b6a87bfd154ee15ea4aa97e0` |
| Phase implementation branch | `agent/worldstate-infrastructure`, created from the baseline commit |
| Fork remote | `origin` -> `https://github.com/DaveWibs/osirisP.git` |
| Source remote | `upstream` -> `https://github.com/simplifaisoul/osiris.git` |
| Upstream relationship | `master` and fetched `upstream/master` were identical at the baseline (`0` ahead, `0` behind) |
| Local Node.js | `v24.18.0` |
| Local npm | `11.16.0` |
| Lockfile | npm `package-lock.json`, lockfile version 3 |
| Container Node.js | `node:22-alpine` in all three Dockerfile stages |
| Declared Node engine | None |
| Application | Next.js 16.2.6, React 19.2.4, TypeScript 5, MapLibre GL 5.24.0 |

The existing root scripts are:

| Script | Command |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `eslint` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:live` | `RUN_LIVE_TESTS=1 vitest run` |

The current `docker-compose.yml` runs the Next.js application, an Nginx cache and the separate Express intelligence service. It also expects an external `umami_default` network. The application has no database, migrations, durable collector or raw archive at this commit.

## Verification results

These results are for the baseline commit and should be treated as the pre-existing comparison point.

| Check | Result |
|---|---|
| `npm ci` | Passed. |
| `npm test` | Passed: 1 test file, 10 tests discovered, 9 passed and 1 opt-in live test skipped. The only test file is `src/app/api/cctv/utah.test.ts`. Vite also prints its CJS Node API deprecation warning. |
| `npm run build` | Passed. This is not a clean type-safety result: `next.config.ts` sets `typescript.ignoreBuildErrors: true`. |
| `npx tsc --noEmit --incremental false` | Failed with TS2769 at `src/app/page.tsx:956`: `theme` is passed to `OsintPanel`, but `OsintPanelProps` does not declare it. |
| `npm run lint` | Failed with 474 findings: 389 errors and 85 warnings. |
| `npm audit --json` | 7 vulnerable dependency entries: 5 moderate, 1 high and 1 critical. The critical development-path entry is Vitest; Vite and related development packages account for the other development findings. |
| `npm audit --omit=dev --json` | 2 moderate production entries, `next` through its bundled vulnerable `postcss` version and `postcss` itself. |
| Local smoke check | `/api/health` and `/api/earthquakes` each returned HTTP 200 when the baseline application was run locally. |

No new World-State failure should be hidden inside these known baseline failures.

## API route inventory

There are 52 Next.js route handlers under `src/app/api`.

### Analysis and briefing (4)

- `/api/ai/analyze`
- `/api/ai/briefing`
- `/api/ai/overview`
- `/api/region-dossier`

### Entity, risk and recon services (4)

- `/api/country-risk`
- `/api/entity/expand`
- `/api/scanner`
- `/api/sentinel`

### Situational and map feeds (23)

- `/api/air-quality`
- `/api/cctv`
- `/api/cctv/stream-status`
- `/api/conflicts`
- `/api/crypto`
- `/api/cyber-attacks`
- `/api/cyber-threats`
- `/api/earthquakes`
- `/api/fires`
- `/api/flights`
- `/api/frontlines`
- `/api/gdelt`
- `/api/infrastructure`
- `/api/live-news`
- `/api/malware`
- `/api/maritime`
- `/api/markets`
- `/api/news`
- `/api/radar`
- `/api/satellites`
- `/api/scm-suppliers`
- `/api/space-weather`
- `/api/weather`

### OSINT lookups (14)

- `/api/osint/bgp`
- `/api/osint/certs`
- `/api/osint/cve`
- `/api/osint/dns`
- `/api/osint/github`
- `/api/osint/ip`
- `/api/osint/leaks`
- `/api/osint/mac`
- `/api/osint/phone`
- `/api/osint/sanctions`
- `/api/osint/shodan`
- `/api/osint/sweep`
- `/api/osint/threats`
- `/api/osint/whois`

### Platform and integration (5)

- `/api/geo`
- `/api/github-webhook`
- `/api/health`
- `/api/proxy-tiles`
- `/api/stats`

### SDK (2)

- `/api/sdk/ingest`
- `/api/sdk/stream`

## Map layers and consumers

`LayerPanel` exposes 25 toggles in nine groups. `page.tsx` owns the shared in-memory data object and layer state; `OsirisMap` converts those arrays to GeoJSON and renders them. The fields below are the fields the renderer actually reads, not every field returned by each endpoint.

| Panel group | Toggle keys and labels | Producer/input | Map-consumed fields |
|---|---|---|---|
| SDK | `sdk_sea` (Maritime Lines) | `/data/submarine-cables.json`; the page also derives `sdk_entities` from flights, vessels, earthquakes, GDELT and news for counts/fusion | Cable `geometry`; `properties.name`, `landing_points`, `color` and remaining properties. `sdk_air` and `sdk_naval` affect state but currently add no map links. |
| Aviation | `flights` (Commercial), `private`, `jets`, `military` | `/api/flights` -> `commercial_flights`, `private_flights`, `private_jets`, `military_flights` | `lat`, `lng`, `callsign`, `heading`, `alt`, `model`, `speed_knots`, `registration`, `icao24` |
| Maritime | `maritime` | `/api/maritime`, remapped by `page.tsx` to `maritime_ports`, `maritime_chokepoints`, `maritime_ships` | Ports: `lat`, `lng`, `name`, `country`, `type`, `volume`, `fleet`, `rank`; chokepoints: `lat`, `lng`, `name`, `traffic`, `risk`; ships: `lat`, `lng`, `name`/`mmsi`, `type`, `speed`, `heading`, `destination`, `flag` |
| Space | `satellites`, `sat_comms`, `sat_military`, `sat_navigation`, `sat_earth`, `sat_science` | `/api/satellites` -> `satellites`; category toggles filter the same array | `lat`, `lng`, `name`, `color`, `mission`, `alt`, `noradId`, `category` (`comms`, `military`, `navigation`, `earth_obs`, `science`) |
| Surveillance | `cctv`, `live_news`, `news_intel` | `/api/cctv` -> `cameras`; `/api/live-news` -> `live_feeds`; `/api/news` -> `news` | CCTV: `lat`, `lng`, `id`, `name`, `city`, `country`, `source`, feed/stream/external URLs; live feeds: `lat`, `lng`, `name`, `city`, `country`, `url`, `category`, `embed_allowed`; news: `coords`, `title`, `source`, `risk_score`, `link` |
| Natural hazards | `earthquakes`, `fires`, `weather` | Direct USGS fetch in `page.tsx`; `/api/fires` -> `fires`; `/api/weather` -> `weather_events` | Earthquakes: `id`, `lat`, `lng`, `magnitude`, `place`, `depth`, `source`; fires: `lat`, `lng`, `brightness`; weather: `lat`, `lng`, `title`, `type`, `icon`, `severity`, `source`, `id` |
| Threats and intel | `infrastructure`, `global_incidents`, `gps_jamming` | `/api/infrastructure`; `/api/gdelt`; `gps_jamming` is returned with `/api/flights` | Infrastructure: `lat`, `lng`, `name`, `city`, `country`, `status`, `reactors`, `capacityMW`, `owner`; incidents: `lat`, `lng`, `name`; jamming: `lat`, `lng`, `severity` |
| Network intel | `malware`, `cyber_attacks` | `/api/malware` -> `malware_threats`; `/api/cyber-attacks` -> `cyber_attacks` | Malware: `lat`, `lng`, `ip`, `malware`, `status`, `threat_type`, `country`; attacks: source/destination coordinates plus `malware`, `action`, `target_ip`, `target_country`, `port`, `severity`, `status` |
| Display | `day_night`, `terrain_3d` | Computed solar terminator; OpenFreeMap building tiles | No feed fields; the terrain renderer reads vector-tile `render_height` and `render_min_height`. |

Six additional flags exist in the initial `activeLayers` state but are not exposed in `LayerPanel`: `balloons`, `radiation`, `war_alerts`, `cables`, `sdk_air` and `sdk_naval`. The map has balloon and radiation renderers, but the requested `/api/balloons` and `/api/radiation` routes do not exist. `OsirisMap` also fetches `/api/conflicts` independently and checks an undeclared `conflict_zones` flag; its default expression makes that layer visible.

Other important consumers of the shared data are:

- `IntelFeed` reads `data.news`.
- `LiveAlerts` reads news and the five most recent earthquakes.
- `MarketsPanel` reads `data.markets`; `ScmPanel` reads supply-chain suppliers, maritime ports/chokepoints and market SCM alerts.
- The SDK fusion effect in `page.tsx` also turns earthquakes, GDELT, news, flights and ships into derived entities.
- `GlobalStatusBar` does not use the shared earthquake result; it separately fetches the same USGS feed and separately calls CoinGecko.

## Six current data paths

1. **Earthquakes:** `/api/earthquakes` fetches the official USGS `2.5_day.geojson` feed and maps it to the dashboard contract. However, both the main loader in `page.tsx` and `GlobalStatusBar` fetch USGS directly, bypassing the route. A database mode added only inside the route would therefore not reach either consumer.
2. **Flights:** `/api/flights` combines OpenSky with airplanes.live and adsb.lol military, privacy and emergency feeds. It uses regional point-feed fallbacks when OpenSky is unavailable, classifies results into four flight arrays, returns GPS-jamming zones, caches successful responses and can serve stale cache on failure.
3. **Fires:** `/api/fires` tries NASA FIRMS VIIRS and then MODIS global 24-hour CSV data, then appends open NASA EONET volcano events.
4. **Maritime:** `/api/maritime` combines curated static ports and chokepoints with an in-process AISStream WebSocket cache when `AIS_API_KEY` is present. Vessel state is neither persisted nor shared across application processes/restarts.
5. **Markets:** `/api/markets` fetches point-in-time Yahoo Finance chart/quote data, uses CoinGecko as the cryptocurrency fallback and derives SCM alerts by calling the local maritime route. It does not retain historical bars.
6. **News:** `/api/news` scrapes a hard-coded set of Telegram public preview pages and falls back to BBC, Al Jazeera and GDACS RSS. `/api/live-news` is a separate static catalogue of broadcast links. No news history is persisted.

## Environment variables at the baseline

Variables read directly by application or companion-service code are:

| Variable | Consumer |
|---|---|
| `SCANNER_URL`, `SCANNER_KEY` | Scanner proxy |
| `GEMINI_API_KEY_1` through `GEMINI_API_KEY_8` | AI analysis, briefing and overview routes |
| `INTEL_URL` | Entity expansion route; defaults differ by `NODE_ENV` |
| `NODE_ENV` | Next.js/runtime behaviour and entity-service default |
| `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | OpenSky OAuth client |
| `AIS_API_KEY` | AISStream connection |
| `GITHUB_WEBHOOK_SECRET`, `GITHUB_WEBHOOK_FORWARD_URL` | GitHub webhook route |
| `SDK_INGEST_KEY` | SDK ingest authentication; the endpoint is disabled when unset |
| `UMAMI_WEBSITE_ID` | Middleware analytics injection, with a hard-coded fallback ID |
| `INTEL_PORT` | Express intelligence service, default 4000 |
| `RUN_LIVE_TESTS` | Opts the UDOT integration test into live network access |

Deployment also consumes `OSIRIS_PORT` in Compose and sets `PORT`, `HOSTNAME` and `NODE_OPTIONS`. The baseline `.env.example` is inaccurate: it says only scanner variables are consumed, labels used OpenSky and AIS variables as future-only, and omits most variables above. Conversely, `FIRMS_API_KEY`, `N2YO_API_KEY` and `OSIRIS_TELEGRAM_CHANNELS` are documented there but are not read by baseline code.

## Known drift and constraints

- At audit time the supplied guardrail documents were under `mds/`, although their instructions assumed repository-root paths; the broad `AGENTS.md` ignore rule also silently ignored `mds/AGENTS.md`. Bootstrap work promotes these files to the root and adjusts ignore rules.
- `BUILD_GUIDE_CODEX.md` describes a simpler OSIRIS/collector/PostGIS stack. The live fork already has application, cache and intelligence services plus its Umami network dependency; the World-State Compose overlay must preserve those services rather than replace them.
- The production build suppresses TypeScript errors, and standalone `tsc` currently fails.
- Lint, audit and test coverage are materially below a clean baseline. Only the CCTV Utah parser is tested.
- Earthquake route compatibility work must change both direct-USGS browser consumers, not only `/api/earthquakes`.
- Layer state and panel exposure have diverged, including missing balloon/radiation routes and undeclared map flags.
- The `.env.example` claims do not match actual environment reads, and `OSIRIS_TELEGRAM_CHANNELS` does not override the hard-coded channel list.
- Phase numbering diverges after Phase 2 between `PROJECT_SPEC.md` and `BUILD_GUIDE_CODEX.md`; implementation should use the build guide as the sequencing authority and the project specification for product requirements.
- The proposed Phase 1 catalogue fields do not yet encode the specification's provenance classification explicitly.
- Recovery of stale `running` collection runs, filesystem/database orphan reconciliation and provider-revision immutability need explicit policy before they are relied on operationally.
