# OSIRIS — Strix backend

A small, authenticated HTTP wrapper around [Strix](https://github.com/usestrix/strix),
the open-source **autonomous AI penetration-testing agent**. OSIRIS's Next.js app
talks to this service exactly like it talks to the RECON scanner backend
(`SCANNER_URL` / `SCANNER_KEY`): OSIRIS never runs Strix itself (Strix needs
Docker + Python + an LLM key + several GB of RAM), it just proxies to this service.

> ⚠️ **Authorized use only.** Strix actively exploits vulnerabilities — it fires
> real SQLi / SSRF / RCE / XSS payloads and proves them with working PoCs. Run
> this service **private** (localhost / your own trusted network), never on the
> public internet, and only ever point it at **targets you own or are explicitly
> authorized to test.** You are responsible for using it legally and ethically.

## What it exposes

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health` | Readiness + whether the LLM is configured. |
| `POST` | `/pentest` | Start a pentest job. Body: `{ "target": "...", "mode": "quick"\|"standard", "instruction": "..."? }`. Returns `{ job_id, status }` (async). |
| `GET`  | `/pentest/{job_id}` | Poll job status; returns findings + report artifacts when done. |

Every request must send header `X-OSIRIS-KEY: <OSIRIS_KEY>`. Jobs run asynchronously
(Strix runs take minutes to hours); each job runs in an isolated working directory
so its `strix_runs/<name>` output is captured per job.

## Run it (self-hosted, recommended — "full power", free, private)

Requires **Docker** (Docker Desktop + WSL2 on Windows). Strix launches its own
sandbox containers via the host Docker daemon, which is why the compose file
mounts the Docker socket.

```bash
cd strix-backend
cp .env.example .env
#  edit .env:  set OSIRIS_KEY (openssl rand -hex 32), STRIX_LLM, LLM_API_KEY
docker compose up -d --build
curl -s http://127.0.0.1:8700/health | jq
```

Then in the OSIRIS `.env` set:

```
STRIX_URL=http://127.0.0.1:8700
STRIX_KEY=<the same value as OSIRIS_KEY above>
OPERATOR_KEY=<a separate secret you type into the OSIRIS Strix panel>
```

### Try it against a target you own

```bash
# stand up a deliberately-vulnerable app you own, e.g. OWASP Juice Shop:
docker run --rm -d -p 3001:3000 bkimminich/juice-shop

curl -s -X POST http://127.0.0.1:8700/pentest \
  -H "X-OSIRIS-KEY: $OSIRIS_KEY" -H 'content-type: application/json' \
  -d '{"target":"http://host.docker.internal:3001","mode":"quick"}'
# -> {"job_id":"...","status":"queued"}

curl -s http://127.0.0.1:8700/pentest/<job_id> -H "X-OSIRIS-KEY: $OSIRIS_KEY" | jq
```

## Alternative: Strix Cloud API (no self-hosting)

Strix also offers a hosted REST API at `app.strix.ai` (organization-scoped token,
start/poll/report/webhooks). If you'd rather not run Docker locally, you can point
OSIRIS's `STRIX_URL`/`STRIX_KEY` at a thin adapter for that API instead — the
OSIRIS side is unchanged. Self-hosting (above) is the recommended path for full
capability with no per-run cost beyond your own LLM usage.

## Environment variables

See [`.env.example`](.env.example). Key ones: `OSIRIS_KEY` (shared secret, must
equal OSIRIS's `STRIX_KEY`), `STRIX_LLM`, `LLM_API_KEY`, `MAX_CONCURRENT_JOBS`,
`JOB_TIMEOUT`.
