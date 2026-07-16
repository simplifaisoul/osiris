# Self-Hosting OSIRIS with Docker

OSIRIS ships as a self-contained Next.js standalone build. This guide covers
running it with Docker / Docker Compose, deploying it as a [CasaOS](https://casaos.io)
app, and configuring the optional API keys.

> **TL;DR:** OSIRIS runs fully **without any API keys**. All core feeds
> (aviation, satellites, fires, earthquakes, weather, news, CVEs) use public
> keyless sources. Keys only matter for the optional RECON scanner backend and
> for raising rate limits on a few feeds.

---

## 1. Docker Compose (recommended)

```bash
git clone https://github.com/DaveWibs/osirisP.git
cd osirisP

# optional: configure keys / scanner backend
cp .env.example .env         # then edit .env

docker compose up -d
```

Open <http://localhost:3000>.

What the compose file does:

- **`image:` + `build:`** — `image:` points at a prebuilt registry image; the
  `build:` block is a fallback. `docker compose up -d` uses the registry image
  if it's available locally or pullable, otherwise builds from the local
  `Dockerfile`. Run `docker compose pull` to fetch the latest published image.
- **`env_file: .env` (`required: false`)** — if a `.env` file exists its
  values are injected into the container; if it's missing, OSIRIS still starts
  with the keyless feeds.
- **`ports: ${OSIRIS_PORT:-3000}:3000`** — the web UI. The container always
  listens on 3000; the published **host** port is `OSIRIS_PORT` (default
  `3000`). Set `OSIRIS_PORT` in `.env` to remap it, e.g. `OSIRIS_PORT=3005`
  when 3000 is already in use — no need to edit the compose file.
- **`restart: unless-stopped`** — survives reboots.

Common commands:

```bash
docker compose pull             # fetch latest published image
docker compose logs -f          # follow logs
docker compose up -d --build    # rebuild locally after pulling new code
docker compose down             # stop & remove
```

### Database-backed earthquake mode

The standard stack defaults to `EARTHQUAKE_DATA_MODE=live` and never opens a
database connection. The optional World-State overlay archives USGS responses,
normalises the latest complete feed in PostGIS and exposes it through the same
`/api/earthquakes` contract.

Create the archive with the ownership described in
[`docs/worldstate-development.md`](docs/worldstate-development.md), set the
recommended mode in `.env`, and start both Compose files as one project:

```env
EARTHQUAKE_DATA_MODE=database_with_live_fallback
EARTHQUAKE_DATABASE_MAX_AGE_MS=900000
```

```bash
docker compose -f docker-compose.yml -f docker-compose.worldstate.yml \
  up -d osiris collector
```

Combining the files lets the server-only OSIRIS route reach `db` over the
internal Compose network. PostgreSQL remains published only on host loopback.
Do not point a container at the template's `127.0.0.1` `DATABASE_URL`; that URL
is for host-run development tools. The root Compose file injects discrete
`WORLDSTATE_PG*` settings for the internal connection.

`database` refuses missing, inconsistent or stale snapshots and never contacts
USGS. `database_with_live_fallback` logs a sanitized reason and uses live USGS
when the persisted snapshot cannot be used. A successful zero-record database
snapshot remains a valid empty response.

### Pull the prebuilt image from GHCR

A prebuilt multi-arch-friendly image is published to the GitHub Container
Registry, so you can run OSIRIS without building anything:

```bash
docker pull ghcr.io/aiacos/osiris:latest      # or a pinned tag, e.g. :0.1.0
docker run -d --name osiris \
  -p 3005:3000 --env-file .env --restart unless-stopped \
  ghcr.io/aiacos/osiris:latest
```

> If the package is **private**, authenticate first with a GitHub token that
> has `read:packages`:
> `echo $TOKEN | docker login ghcr.io -u <github-user> --password-stdin`.
> Make it public from the package's **Settings → Danger Zone → Change
> visibility** to allow anonymous pulls.

### Plain `docker run`

```bash
docker build -t osiris:latest .
docker run -d --name osiris -p 3000:3000 --env-file .env --restart unless-stopped osiris:latest
```

### Image details

Multi-stage build on `node:22-alpine`, runs as a non-root user (`nextjs`,
uid 1001), serves Next.js standalone via `node server.js` on port 3000.
Final image is ~220 MB. Build excludes `node_modules`, `.next`, `.git` and the
repo's large `*.diff` artifacts via `.dockerignore`.

---

## 2. CasaOS

The compose file includes an `x-casaos:` metadata block (title, description,
icon, port map, env descriptions) that plain Docker Compose ignores but CasaOS
reads.

**Install:**

1. On the CasaOS host, clone the repo somewhere persistent (e.g.
   `/DATA/AppData/osiris`).
2. CasaOS dashboard → **`+`** → **Install a customized app** → paste the
   contents of `docker-compose.yml`.
   *(or simply run `docker compose up -d` from the cloned directory).*
3. OSIRIS appears on the dashboard with its icon, reachable on host port
   `3000` (or whatever `OSIRIS_PORT` you set in `.env`).

The app icon is the gold Eye-of-Horus mark in
`public/casaos-icon.png` (512×512 PNG), referenced by the `icon:` URL in the
metadata.

> CasaOS stores imported compose files under `/var/lib/casaos/apps/`, so a
> relative `build:` context may not resolve there. If importing the YAML
> directly, either build/tag `osiris:latest` first
> (`docker build -t osiris:latest /path/to/osiris`) or set `image:` to a
> prebuilt registry image.

---

## 3. API keys & data sources

Copy `.env.example` to `.env` and fill in only what you need.

### What the code actually reads today

| Variable | Purpose | Required for |
|----------|---------|--------------|
| `SCANNER_URL` | RECON scanner backend base URL (e.g. `http://scanner:7700`) | RECON toolkit (quick/ssl/headers/rdns/subdomains/tech/whois/geoloc/vuln) |
| `SCANNER_KEY` | Shared secret; **must equal the backend's `OSIRIS_KEY`** | RECON toolkit |

Without `SCANNER_URL`/`SCANNER_KEY` the RECON endpoints return `503` and the
rest of OSIRIS works normally. Generate a key with `openssl rand -hex 32`.

### Optional keys (reserved / for higher rate limits)

These are documented for completeness and forward-compatibility. The current
data routes use **keyless** public feeds, so these are not consumed yet — set
them only if you extend the relevant route or hit rate limits.

| Variable | Service | How to get it (all free) |
|----------|---------|--------------------------|
| `FIRMS_API_KEY` | NASA FIRMS active fires | Enter an email at <https://firms.modaps.eosdis.nasa.gov/api/map_key/> — the `MAP_KEY` is emailed instantly. Limit 5000 req / 10 min. |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | OpenSky aviation | Create an account at <https://opensky-network.org/>, open **Account → API client**, create a client and copy id/secret. **OAuth2 only since March 2025** (username/password auth removed). |
| `N2YO_API_KEY` | N2YO satellites | Register at <https://www.n2yo.com/login/register/>, then **Profile → generate API key**. Limit 1000 req / hour; key can't be regenerated. |
| `AIS_API_KEY` | aisstream.io maritime | Sign up at <https://aisstream.io/>, create a key on the **API Keys** page. Used over `wss://stream.aisstream.io/v0/stream`. |

> Keep `.env` out of version control — it is already in `.gitignore`. Only
> `.env.example` (no secrets) is committed.

### Optional runtime overrides

| Variable | Purpose | Default |
|----------|---------|---------|
| `OSIRIS_TELEGRAM_CHANNELS` | Comma-separated list of public Telegram channel usernames (no `@`) to scrape for the **Telegram OSINT** map layer. Overrides the curated default set. | `osintdefender,insiderpaper,aljazeeraenglish,nexta_live,war_monitor` |
| `OSIRIS_PORT` | Host port the compose file publishes (container itself always listens on 3000). | `3000` |
| `EARTHQUAKE_DATA_MODE` | `live`, `database`, or freshness-aware `database_with_live_fallback`. | `live` |
| `EARTHQUAKE_DATABASE_MAX_AGE_MS` | Maximum database response/provider timestamp age before it is stale. | `900000` |

### Keyless sources (no configuration needed)

Aviation → `adsb.lol` · Satellites → `celestrak.org` (TLE) · Fires →
NASA FIRMS open-data CSV · Earthquakes → USGS · Weather → NASA EONET · Space
weather → NOAA SWPC · CVEs → NVD · News → public RSS / HLS streams · CCTV →
public traffic-authority feeds · Crypto (BTC) → `blockstream.info` · Crypto
(ETH) → `eth.blockscout.com` ([Blockscout](https://github.com/blockscout/blockscout)
open-source explorer) · OFAC SDN sanctions → [OpenSanctions](https://www.opensanctions.org)
mirror (CC-BY 4.0) · Telegram OSINT → public `t.me/s/<channel>` web preview.
