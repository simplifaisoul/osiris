from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings


router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Process liveness only. Never touches connectors or the network."""
    return {
        "status": "operational",
        "service": "kam-ingestion",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ready")
async def ready(request: Request, settings: Settings = Depends(get_settings)) -> JSONResponse:
    """Readiness: the manifest registry must have loaded and validated cleanly.

    Returns 503 until connectors are loaded so traffic is withheld from a Pod
    whose configuration failed to parse.
    """
    checks: dict[str, dict[str, str]] = {}

    runner = getattr(request.app.state, "runner", None)
    if runner is not None and runner.ids:
        checks["connector_registry"] = {
            "status": "ready",
            "connectors": str(len(runner.ids)),
        }
    else:
        checks["connector_registry"] = {"status": "unavailable"}

    checks["deployment_profile"] = {"status": "ready", "profile": settings.deployment_profile}

    is_ready = all(check["status"] == "ready" for check in checks.values())
    return JSONResponse(
        status_code=200 if is_ready else 503,
        content={
            "status": "ready" if is_ready else "not_ready",
            "service": "kam-ingestion",
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
