"""
OSIRIS — Strix backend service.

A thin, authenticated HTTP wrapper around the Strix autonomous-pentesting CLI
(github.com/usestrix/strix). OSIRIS's Next.js app proxies to this service the
same way it proxies to the RECON scanner backend (SCANNER_URL/SCANNER_KEY).

Design notes:
  * Strix runs are long (minutes to hours) and must not block an HTTP request,
    so /pentest starts an async job and returns a job_id; /pentest/{id} polls.
  * Every request must carry `X-OSIRIS-KEY == OSIRIS_KEY`. This service must
    NEVER be exposed to the public internet directly — OSIRIS is the only
    intended caller, and OSIRIS itself gates the feature behind an operator key.
  * Each job runs in its own working directory so Strix's `strix_runs/<name>`
    output is trivially isolated and locatable per job.
  * Only test targets you own or are explicitly authorized to test.
"""

from __future__ import annotations

import asyncio
import hmac
import os
import shutil
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ── Config (all from environment) ──
OSIRIS_KEY = os.environ.get("OSIRIS_KEY", "").strip()
STRIX_LLM = os.environ.get("STRIX_LLM", "").strip()
LLM_API_KEY = os.environ.get("LLM_API_KEY", "").strip()
MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "2"))
JOB_TIMEOUT = int(os.environ.get("JOB_TIMEOUT", "3600"))  # seconds, hard kill
STRIX_BIN = os.environ.get("STRIX_BIN", "strix")
MAX_STDOUT_CHARS = 200_000  # cap what we retain/return per job

VALID_MODES = {"quick", "standard"}

app = FastAPI(title="OSIRIS Strix Backend", version="1.0.0")

_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)


@dataclass
class Job:
    id: str
    target: str
    mode: str
    status: str = "queued"  # queued | running | completed | failed | timeout | vulnerabilities_found
    exit_code: Optional[int] = None
    started_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None
    stdout_tail: str = ""
    error: Optional[str] = None
    reports: list[dict[str, Any]] = field(default_factory=list)
    workdir: Optional[str] = None

    def public(self) -> dict[str, Any]:
        return {
            "job_id": self.id,
            "target": self.target,
            "mode": self.mode,
            "status": self.status,
            "exit_code": self.exit_code,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_sec": (self.finished_at - self.started_at) if self.finished_at else (time.time() - self.started_at),
            "stdout_tail": self.stdout_tail,
            "error": self.error,
            "reports": self.reports,
        }


JOBS: dict[str, Job] = {}


def _require_auth(provided: Optional[str]) -> None:
    if not OSIRIS_KEY:
        # Fail closed: without a configured key the service refuses everything.
        raise HTTPException(status_code=503, detail="Backend not configured (OSIRIS_KEY unset).")
    if not provided or not hmac.compare_digest(provided, OSIRIS_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing X-OSIRIS-KEY.")


def _audit(job: Job, event: str) -> None:
    # Structured audit line — every target/operator action is logged.
    print(
        f"[STRIX-AUDIT] ts={int(time.time())} event={event} "
        f"job={job.id} target={job.target!r} mode={job.mode} status={job.status}",
        flush=True,
    )


def _collect_reports(run_root: Path) -> list[dict[str, Any]]:
    """Gather any report artifacts Strix wrote under the job's strix_runs dir."""
    reports: list[dict[str, Any]] = []
    if not run_root.exists():
        return reports
    for path in sorted(run_root.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".md", ".json", ".txt", ".html"}:
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001
            content = f"<unreadable: {exc}>"
        reports.append(
            {
                "name": path.name,
                "relative_path": str(path.relative_to(run_root)),
                "size": path.stat().st_size,
                "content": content[:MAX_STDOUT_CHARS],
                "truncated": len(content) > MAX_STDOUT_CHARS,
            }
        )
    return reports


async def _run_job(job: Job, instruction: Optional[str]) -> None:
    async with _semaphore:
        job.status = "running"
        _audit(job, "start")
        workdir = tempfile.mkdtemp(prefix=f"strix_{job.id}_")
        job.workdir = workdir

        cmd = [STRIX_BIN, "--target", job.target, "--non-interactive", "--scan-mode", job.mode]
        if instruction:
            cmd += ["--instruction", instruction]

        env = os.environ.copy()
        # STRIX_LLM / LLM_API_KEY are already in the process env; keep as-is.

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=workdir,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            try:
                stdout_bytes, _ = await asyncio.wait_for(proc.communicate(), timeout=JOB_TIMEOUT)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                job.status = "timeout"
                job.error = f"Job exceeded JOB_TIMEOUT ({JOB_TIMEOUT}s) and was killed."
                job.finished_at = time.time()
                _audit(job, "timeout")
                return

            out = stdout_bytes.decode("utf-8", errors="replace") if stdout_bytes else ""
            job.stdout_tail = out[-MAX_STDOUT_CHARS:]
            job.exit_code = proc.returncode
            job.reports = _collect_reports(Path(workdir) / "strix_runs")

            # Strix exits non-zero when it finds vulnerabilities (CI semantics).
            if proc.returncode == 0:
                job.status = "completed"
            elif proc.returncode is not None and proc.returncode > 0:
                job.status = "vulnerabilities_found"
            else:
                job.status = "failed"
            job.finished_at = time.time()
            _audit(job, "finish")
        except FileNotFoundError:
            job.status = "failed"
            job.error = f"Strix binary '{STRIX_BIN}' not found in the container/PATH."
            job.finished_at = time.time()
            _audit(job, "error")
        except Exception as exc:  # noqa: BLE001
            job.status = "failed"
            job.error = str(exc)
            job.finished_at = time.time()
            _audit(job, "error")
        finally:
            # Retain reports we already read into memory; drop the temp dir.
            if job.workdir:
                shutil.rmtree(job.workdir, ignore_errors=True)
                job.workdir = None


class PentestRequest(BaseModel):
    target: str = Field(..., min_length=1, max_length=2048)
    mode: str = "quick"
    instruction: Optional[str] = Field(default=None, max_length=8000)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "osiris-strix-backend",
        "configured": bool(OSIRIS_KEY),
        "llm_configured": bool(STRIX_LLM and LLM_API_KEY),
        "strix_llm": STRIX_LLM or None,
        "active_jobs": sum(1 for j in JOBS.values() if j.status in {"queued", "running"}),
        "max_concurrent": MAX_CONCURRENT_JOBS,
    }


@app.post("/pentest")
async def start_pentest(
    body: PentestRequest,
    x_osiris_key: Optional[str] = Header(default=None),
) -> JSONResponse:
    _require_auth(x_osiris_key)

    if not (STRIX_LLM and LLM_API_KEY):
        raise HTTPException(status_code=503, detail="LLM not configured (set STRIX_LLM and LLM_API_KEY).")

    mode = body.mode.strip().lower()
    if mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {sorted(VALID_MODES)}.")

    target = body.target.strip()
    if not target:
        raise HTTPException(status_code=400, detail="target is required.")

    job = Job(id=uuid.uuid4().hex, target=target, mode=mode)
    JOBS[job.id] = job
    asyncio.create_task(_run_job(job, body.instruction))
    return JSONResponse({"job_id": job.id, "status": job.status}, status_code=202)


@app.get("/pentest/{job_id}")
async def get_pentest(
    job_id: str,
    x_osiris_key: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    _require_auth(x_osiris_key)
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job_id.")
    return job.public()
